import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import type { Server as HttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, describe, test } from 'node:test'
import { io as ioClient, type Socket } from 'socket.io-client'
import { createApp, type RunningApp } from './app.ts'
import { backupDatabase } from './backup.ts'
import { loadConfig } from './config.ts'
import { getDb } from './context.ts'
import { int, str } from './db.ts'
import { hashPassword } from './passwords.ts'
import { clearRateLimits } from './rateLimit.ts'
import { formatStamp, localDate, localDayUtcRange, nowIso } from './time.ts'

const PASSWORD = 'NapDemo!2026'
const WORKERS = [
  ['maria.reyes', 'Maria Reyes'],
  ['david.santos', 'David Santos'],
  ['anna.cruz', 'Anna Cruz'],
  ['luis.cabrera', 'Luis Cabrera'],
  ['grace.mendiola', 'Grace Mendiola'],
  ['peter.ada', 'Peter Ada'],
  ['elena.guerrero', 'Elena Guerrero'],
  ['mark.camacho', 'Mark Camacho'],
  ['sofia.delacruz', 'Sofia Dela Cruz'],
  ['daniel.pangelinan', 'Daniel Pangelinan'],
] as const

type Session = { cookie: string; csrf: string; id: number }
type Visit = { id: number; version: number; fullName: string; status: string; caseworkerName: string }
type Announce = { entryId: number; visitorName: string; caseworkerName: string; nonce: string }

let temp = ''
let base = ''
let running: RunningApp
const sessions = new Map<string, Session>()

async function listen(server: HttpServer): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('The test server did not bind a port.')
  return `http://127.0.0.1:${address.port}`
}

async function closeRunning(app: RunningApp): Promise<void> {
  app.io.close()
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2000)
    app.server.close(() => {
      clearTimeout(timer)
      resolve()
    })
  })
  app.db.close()
}

async function login(username: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  })
  const body = await response.json() as { csrfToken?: string; user?: { id: number }; error?: string }
  assert.equal(response.status, 200, body.error)
  const cookie = response.headers.getSetCookie().map((item) => item.split(';')[0]).find((item) => item?.startsWith('nap_session='))
  assert.ok(cookie)
  assert.ok(body.csrfToken)
  assert.ok(body.user)
  return { cookie, csrf: body.csrfToken, id: body.user.id }
}

async function send(method: string, urlPath: string, session?: Session, body?: unknown, csrf = true) {
  const headers = new Headers()
  if (body !== undefined) headers.set('content-type', 'application/json')
  if (session) {
    headers.set('cookie', session.cookie)
    if (csrf) headers.set('x-csrf-token', session.csrf)
  }
  const response = await fetch(`${base}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let parsed: Record<string, unknown> = {}
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>
    } catch {
      parsed = {}
    }
  }
  return { status: response.status, body: parsed, text }
}

async function checkIn(fullName: string, caseworkerId: number) {
  return send('POST', '/api/public/check-in', undefined, {
    fullName,
    caseworkerId,
    reason: 'renewal',
  })
}

async function queueOf(session: Session): Promise<{ waiting: number; visits: Visit[] }> {
  const response = await send('GET', '/api/queue', session)
  assert.equal(response.status, 200)
  return response.body as { waiting: number; visits: Visit[] }
}

function connectTv(): Promise<{ socket: Socket; announcements: Announce[]; boards: { cards: { visitorName: string }[] }[] }> {
  const announcements: Announce[] = []
  const boards: { cards: { visitorName: string }[] }[] = []
  const socket = ioClient(base, {
    autoConnect: false,
    transports: ['websocket'],
    reconnection: false,
    auth: { screen: 'tv' },
  })
  socket.on('board:announce', (item: Announce) => announcements.push(item))
  socket.on('board:state', (state: { cards: { visitorName: string }[] }) => boards.push(state))
  socket.connect()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TV socket did not connect.')), 4000)
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve({ socket, announcements, boards })
    })
    socket.once('connect_error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function waitFor(check: () => boolean, label: string): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > 5000) throw new Error(`Timed out waiting for ${label}.`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

test('timestamps are stored in UTC and shown in Pacific/Saipan', () => {
  assert.equal(formatStamp('2026-10-30T02:00:00.000Z'), '2026-10-30 12:00:00')
  assert.equal(formatStamp('2026-10-29T14:00:00.000Z'), '2026-10-30 00:00:00')
  const range = localDayUtcRange('2026-10-30')
  assert.equal(range.start, '2026-10-29T14:00:00.000Z')
  assert.equal(range.end, '2026-10-30T14:00:00.000Z')
})

describe('queue workflow', { concurrency: 1 }, () => {
  before(async () => {
    process.env.ARGON2_MEMORY_COST = '4096'
    process.env.ARGON2_TIME_COST = '1'
    process.env.HTTPS_CERT = ''
    process.env.HTTPS_KEY = ''
    temp = await mkdtemp(path.join(tmpdir(), 'nap-queue-'))
    process.env.DATA_DIR = temp
    running = await createApp(loadConfig())
    base = await listen(running.server)
    const passwordHash = await hashPassword(PASSWORD)
    const now = nowIso()
    const insert = getDb().prepare(`
      INSERT INTO caseworkers (username, password_hash, full_name, role, availability, disabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'available', 0, ?, ?)
    `)
    for (const [username, fullName] of WORKERS) insert.run(username, passwordHash, fullName, 'caseworker', now, now)
    insert.run('patricia.sannicolas', passwordHash, 'Patricia San Nicolas', 'supervisor', now, now)
    insert.run('linda.tenorio', passwordHash, 'Linda Tenorio', 'receptionist', now, now)
    for (const username of [...WORKERS.map(([name]) => name), 'patricia.sannicolas', 'linda.tenorio']) {
      sessions.set(username, await login(username))
    }
  })

  after(async () => {
    await closeRunning(running)
    await rm(temp, { recursive: true, force: true })
  })

  beforeEach(() => {
    clearRateLimits()
    const db = getDb()
    db.exec('DELETE FROM queue_events')
    db.exec('DELETE FROM queue_entries')
    db.exec('DELETE FROM check_ins')
    db.exec(`UPDATE caseworkers SET availability = 'available', disabled = 0 WHERE role = 'caseworker'`)
  })

  test('a visitor check-in is called, shown on the TV, completed, and kept in history and the daily log', async () => {
    const maria = sessions.get('maria.reyes')
    if (!maria) throw new Error('Missing Maria')
    const tv = await connectTv()
    try {
      const created = await checkIn('John Dela Cruz', maria.id)
      assert.equal(created.status, 201)
      const waiting = await queueOf(maria)
      assert.equal(waiting.waiting, 1)
      assert.equal(waiting.visits[0]?.fullName, 'John Dela Cruz')
      assert.equal(waiting.visits[0]?.status, 'waiting')

      const called = await send('POST', `/api/queue/${waiting.visits[0]?.id}/call`, maria, { version: waiting.visits[0]?.version })
      assert.equal(called.status, 200)
      await waitFor(() => tv.announcements.some((item) => item.visitorName === 'John Dela Cruz'), 'call announcement')
      const board = await send('GET', '/api/public/board')
      const cards = board.body.cards as { visitorName: string; caseworkerName: string }[]
      assert.equal(cards.some((card) => card.visitorName === 'John Dela Cruz' && card.caseworkerName === 'Maria Reyes'), true)

      const recalled = await send('POST', `/api/queue/${waiting.visits[0]?.id}/recall`, maria, { version: 2 })
      assert.equal(recalled.status, 200)
      await waitFor(() => tv.announcements.filter((item) => item.visitorName === 'John Dela Cruz').length >= 2, 'recall announcement')

      const done = await send('POST', `/api/queue/${waiting.visits[0]?.id}/done`, maria, { version: 3 })
      assert.equal(done.status, 200)
      const afterDone = await send('GET', '/api/public/board')
      const remaining = afterDone.body.cards as { visitorName: string }[]
      assert.equal(remaining.some((card) => card.visitorName === 'John Dela Cruz'), false)

      const again = await checkIn('John Dela Cruz', maria.id)
      assert.equal(again.status, 201, 'a completed visitor can check in again')

      const history = await send('GET', `/api/history?date=${localDate()}&q=John`, maria)
      const visits = history.body.visits as { fullName: string; status: string }[]
      assert.equal(visits.some((visit) => visit.fullName === 'John Dela Cruz' && visit.status === 'completed'), true)
      const stored = getDb().prepare(`
        SELECT q.status FROM queue_entries q
        JOIN check_ins ci ON ci.id = q.check_in_id
        WHERE ci.full_name = 'John Dela Cruz' AND q.status = 'completed'
      `).get()
      assert.ok(stored)

      const log = await send('GET', `/api/me/log?date=${localDate()}`, maria)
      assert.equal(log.status, 200)
      assert.match(log.text, /John Dela Cruz/)
      assert.match(log.text, /Check-in: /)
      assert.match(log.text, /Called: /)
      assert.match(log.text, /Completed: /)
      assert.match(log.text, /Final status: Completed/)
      const logFile = path.join(temp, 'logs', 'Maria_Reyes', `${localDate()}.txt`)
      assert.equal(existsSync(logFile), true)
      assert.match(readFileSync(logFile, 'utf8'), /Final status: Completed/)
    } finally {
      tv.socket.close()
    }
  })

  test('done does not call the next visitor', async () => {
    const maria = sessions.get('maria.reyes')
    if (!maria) throw new Error('Missing Maria')
    assert.equal((await checkIn('First Visitor', maria.id)).status, 201)
    assert.equal((await checkIn('Second Visitor', maria.id)).status, 201)
    const queue = await queueOf(maria)
    const first = queue.visits.find((visit) => visit.fullName === 'First Visitor')
    const second = queue.visits.find((visit) => visit.fullName === 'Second Visitor')
    if (!first || !second) throw new Error('Both visitors should be waiting.')
    assert.equal((await send('POST', `/api/queue/${first.id}/call`, maria, { version: first.version })).status, 200)
    assert.equal((await send('POST', `/api/queue/${first.id}/done`, maria, { version: first.version + 1 })).status, 200)
    const afterDone = await queueOf(maria)
    assert.equal(afterDone.visits.some((visit) => visit.fullName === 'Second Visitor' && visit.status === 'waiting'), true)
    const board = await send('GET', '/api/public/board')
    assert.equal((board.body.cards as unknown[]).length, 0)
  })

  test('ten caseworkers can call at the same time without losing announcements', async () => {
    const tv = await connectTv()
    try {
      const names = ['Ana', 'Ben', 'Cora', 'Dan', 'Eva', 'Finn', 'Gia', 'Hugo', 'Ivy', 'Joel']
      const ready: { session: Session; queueId: number; fullName: string }[] = []
      for (const [index, [username]] of WORKERS.entries()) {
        const session = sessions.get(username)
        const fullName = `${names[index]} Camacho`
        if (!session) throw new Error(`Missing ${username}`)
        const created = await checkIn(fullName, session.id)
        assert.equal(created.status, 201, JSON.stringify(created.body))
        ready.push({ session, queueId: Number(created.body.queueId), fullName })
      }
      const results = await Promise.all(ready.map((item) => send('POST', `/api/queue/${item.queueId}/call`, item.session, { version: 1 })))
      assert.deepEqual(results.map((result) => result.status), Array(10).fill(200))
      await waitFor(() => new Set(tv.announcements.map((item) => item.entryId)).size === 10, 'ten announcements')
      const board = await send('GET', '/api/public/board')
      const cards = board.body.cards as { entryId: number; visitorName: string }[]
      assert.equal(cards.length, 10)
      assert.equal(new Set(cards.map((card) => card.entryId)).size, 10)
      for (const item of ready) {
        assert.equal(cards.some((card) => card.visitorName === item.fullName), true)
        assert.equal(tv.announcements.some((announcement) => announcement.visitorName === item.fullName), true)
      }
      const finalBoard = tv.boards.at(-1)
      assert.equal(finalBoard?.cards.length, 10)
    } finally {
      tv.socket.close()
    }
  })

  test('a caseworker cannot call two people or another caseworker queue', async () => {
    const maria = sessions.get('maria.reyes')
    const david = sessions.get('david.santos')
    if (!maria || !david) throw new Error('Missing staff')
    assert.equal((await checkIn('Own Visitor', maria.id)).status, 201)
    assert.equal((await checkIn('Other Visitor', maria.id)).status, 201)
    const queue = await queueOf(maria)
    const [first, second] = queue.visits
    if (!first || !second) throw new Error('Expected two visits')
    assert.equal((await send('POST', `/api/queue/${first.id}/call`, maria, { version: first.version })).status, 200)
    const blocked = await send('POST', `/api/queue/${second.id}/call`, maria, { version: second.version })
    assert.equal(blocked.status, 409)
    const foreign = await send('POST', `/api/queue/${first.id}/done`, david, { version: first.version + 1 })
    assert.equal(foreign.status, 404)
    const noCsrf = await send('POST', `/api/queue/${first.id}/done`, maria, { version: first.version + 1 }, false)
    assert.equal(noCsrf.status, 403)
  })

  test('the public kiosk cannot read staff queues', async () => {
    const queue = await send('GET', '/api/queue')
    assert.equal(queue.status, 401)
    const admin = await send('GET', '/api/admin/staff')
    assert.equal(admin.status, 401)
    const workers = await send('GET', '/api/public/caseworkers')
    assert.equal(workers.text.includes('argon2'), false)
    assert.equal(workers.text.toLowerCase().includes('password'), false)
    const receptionist = sessions.get('linda.tenorio')
    if (!receptionist) throw new Error('Missing receptionist')
    assert.equal((await send('GET', '/api/history', receptionist)).status, 403)
  })

  test('login and a dropped connection do not change availability', async () => {
    getDb().prepare(`UPDATE caseworkers SET availability = 'offline' WHERE username = 'sofia.delacruz'`).run()
    const sofia = await login('sofia.delacruz')
    const me = await send('GET', '/api/auth/me', sofia)
    const user = me.body.user as { availability: string }
    assert.equal(user.availability, 'offline')
    sessions.set('sofia.delacruz', sofia)

    const maria = sessions.get('maria.reyes')
    if (!maria) throw new Error('Missing Maria')
    const socket = ioClient(base, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: false,
      auth: { screen: 'staff' },
      extraHeaders: { cookie: maria.cookie },
    })
    socket.connect()
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Staff socket did not connect.')), 4000)
      socket.once('connect', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    socket.disconnect()
    await new Promise((resolve) => setTimeout(resolve, 50))
    const row = getDb().prepare(`SELECT availability FROM caseworkers WHERE username = 'maria.reyes'`).get()
    assert.ok(row)
    assert.equal(str(row, 'availability'), 'available')
  })

  test('unavailable caseworkers are hidden unless a receptionist overrides', async () => {
    const supervisor = sessions.get('patricia.sannicolas')
    const receptionist = sessions.get('linda.tenorio')
    const grace = sessions.get('grace.mendiola')
    const maria = sessions.get('maria.reyes')
    if (!supervisor || !receptionist || !grace || !maria) throw new Error('Missing staff')
    const changed = await send('PATCH', '/api/me/availability', grace, { availability: 'on_break' })
    assert.equal(changed.status, 200)
    const listed = await send('GET', '/api/public/caseworkers')
    const names = (listed.body.caseworkers as { fullName: string }[]).map((worker) => worker.fullName)
    assert.equal(names.includes('Grace Mendiola'), false)
    const rejected = await checkIn('Hidden Visitor', grace.id)
    assert.equal(rejected.status, 409)
    const override = await send('POST', '/api/staff/check-in', receptionist, {
      fullName: 'Hidden Visitor',
      caseworkerId: grace.id,
      reason: 'document_submission',
      override: true,
    })
    assert.equal(override.status, 201)
    const forbidden = await send('POST', '/api/staff/check-in', maria, {
      fullName: 'Another Visitor',
      caseworkerId: grace.id,
      reason: 'other',
      override: true,
    })
    assert.equal(forbidden.status, 403)
  })

  test('an active duplicate check-in is rejected', async () => {
    const maria = sessions.get('maria.reyes')
    if (!maria) throw new Error('Missing Maria')
    assert.equal((await checkIn('Duplicate Visitor', maria.id)).status, 201)
    const second = await checkIn('Duplicate Visitor', maria.id)
    assert.equal(second.status, 409)
  })

  test('a missed visitor can return to the queue', async () => {
    const maria = sessions.get('maria.reyes')
    if (!maria) throw new Error('Missing Maria')
    const created = await checkIn('Missed Visitor', maria.id)
    const queueId = Number(created.body.queueId)
    assert.equal((await send('POST', `/api/queue/${queueId}/call`, maria, { version: 1 })).status, 200)
    assert.equal((await send('POST', `/api/queue/${queueId}/missed`, maria, { version: 2 })).status, 200)
    const hidden = await send('GET', '/api/public/board')
    assert.equal((hidden.body.cards as unknown[]).length, 0)
    assert.equal((await send('POST', `/api/queue/${queueId}/return`, maria, { version: 3 })).status, 200)
    const queue = await queueOf(maria)
    assert.equal(queue.visits[0]?.status, 'waiting')
    assert.equal((await send('POST', `/api/queue/${queueId}/call`, maria, { version: queue.visits[0]?.version })).status, 200)
  })

  test('a supervisor can reassign and cancel without deleting the record', async () => {
    const maria = sessions.get('maria.reyes')
    const david = sessions.get('david.santos')
    const supervisor = sessions.get('patricia.sannicolas')
    if (!maria || !david || !supervisor) throw new Error('Missing staff')
    const created = await checkIn('Moved Visitor', maria.id)
    const queueId = Number(created.body.queueId)
    const moved = await send('POST', `/api/admin/queue/${queueId}/reassign`, supervisor, {
      caseworkerId: david.id,
      version: 1,
    })
    assert.equal(moved.status, 200)
    assert.equal((await queueOf(maria)).visits.length, 0)
    const davidQueue = await queueOf(david)
    assert.equal(davidQueue.visits[0]?.fullName, 'Moved Visitor')
    const cancelled = await send('POST', `/api/admin/queue/${queueId}/cancel`, supervisor, {
      note: 'Checked in by mistake',
      version: davidQueue.visits[0]?.version,
    })
    assert.equal(cancelled.status, 200)
    assert.equal((await queueOf(david)).visits.length, 0)
    const row = getDb().prepare('SELECT status FROM queue_entries WHERE id = ?').get(queueId)
    assert.ok(row)
    assert.equal(str(row, 'status'), 'cancelled')
    const count = getDb().prepare('SELECT COUNT(*) AS n FROM queue_entries WHERE id = ?').get(queueId)
    assert.equal(count ? int(count, 'n') : 0, 1)
  })

  test('login attempts are rate limited', async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await send('POST', '/api/auth/login', undefined, { username: 'not-a-user', password: 'wrong-password' })
      assert.equal(response.status, 401)
    }
    const locked = await send('POST', '/api/auth/login', undefined, { username: 'not-a-user', password: 'wrong-password' })
    assert.equal(locked.status, 429)
  })

  test('a backup file can be created from the live database', async () => {
    const file = await backupDatabase()
    assert.ok(file)
    assert.equal(existsSync(file), true)
  })

  test('queue state survives a server restart', async () => {
    const maria = sessions.get('maria.reyes')
    if (!maria) throw new Error('Missing Maria')
    assert.equal((await checkIn('Restart Visitor', maria.id)).status, 201)
    await closeRunning(running)
    running = await createApp(loadConfig())
    base = await listen(running.server)
    const queue = await queueOf(maria)
    assert.equal(queue.visits.some((visit) => visit.fullName === 'Restart Visitor'), true)
  })
})
