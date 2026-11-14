import fs from 'node:fs'
import path from 'node:path'
import { setContext } from './context.ts'
import { ensureDataDirs, loadConfig } from './config.ts'
import { int, migrate, openDatabase } from './db.ts'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './demoAccounts.ts'
import { writeDailyLog } from './logs.ts'
import { nameKey } from './names.ts'
import { hashPassword } from './passwords.ts'
import { roleLabel } from './labels.ts'
import { localDate, localDayUtcRange, nowIso } from './time.ts'
import type { Reason } from './types.ts'

type SeedStatus = 'waiting' | 'missed' | 'completed'

type SeedVisit = {
  fullName: string
  username: string
  reason: Reason
  status: SeedStatus
  minutesAgo: number
}

const VISITS: SeedVisit[] = [
  { fullName: 'John Dela Cruz', username: 'maria.reyes', reason: 'renewal', status: 'waiting', minutesAgo: 12 },
  { fullName: 'Angela Muna', username: 'maria.reyes', reason: 'document_submission', status: 'waiting', minutesAgo: 28 },
  { fullName: 'Carlos Borja', username: 'david.santos', reason: 'new_application', status: 'waiting', minutesAgo: 18 },
  { fullName: 'Helen Cruz', username: 'david.santos', reason: 'renewal', status: 'waiting', minutesAgo: 40 },
  { fullName: 'Michael Torres', username: 'anna.cruz', reason: 'other', status: 'waiting', minutesAgo: 9 },
  { fullName: 'Rita Aguon', username: 'luis.cabrera', reason: 'document_submission', status: 'waiting', minutesAgo: 22 },
  { fullName: 'Frank Cepeda', username: 'grace.mendiola', reason: 'renewal', status: 'waiting', minutesAgo: 33 },
  { fullName: 'Naomi Cruz', username: 'peter.ada', reason: 'new_application', status: 'waiting', minutesAgo: 15 },
  { fullName: 'Patrick Santos', username: 'sofia.delacruz', reason: 'new_application', status: 'waiting', minutesAgo: 51 },
  { fullName: 'Irene Camacho', username: 'daniel.pangelinan', reason: 'renewal', status: 'waiting', minutesAgo: 7 },
  { fullName: 'Eric Sablan', username: 'elena.guerrero', reason: 'renewal', status: 'missed', minutesAgo: 70 },
  { fullName: 'Paula Reyes', username: 'mark.camacho', reason: 'document_submission', status: 'missed', minutesAgo: 64 },
  { fullName: 'Thomas Diaz', username: 'maria.reyes', reason: 'new_application', status: 'completed', minutesAgo: 150 },
  { fullName: 'Gina Pangelinan', username: 'david.santos', reason: 'renewal', status: 'completed', minutesAgo: 140 },
  { fullName: 'Oscar Camacho', username: 'anna.cruz', reason: 'document_submission', status: 'completed', minutesAgo: 130 },
  { fullName: 'Lydia Quinata', username: 'luis.cabrera', reason: 'renewal', status: 'completed', minutesAgo: 120 },
  { fullName: 'Ben Castro', username: 'grace.mendiola', reason: 'new_application', status: 'completed', minutesAgo: 110 },
  { fullName: 'Sara Indalecio', username: 'peter.ada', reason: 'document_submission', status: 'completed', minutesAgo: 100 },
  { fullName: 'Victor Guerrero', username: 'elena.guerrero', reason: 'other', status: 'completed', minutesAgo: 95 },
  { fullName: 'Nina Camacho', username: 'mark.camacho', reason: 'renewal', status: 'completed', minutesAgo: 90 },
]

function earlierToday(minutesAgo: number, sequence: number): string {
  const start = Date.parse(localDayUtcRange(localDate()).start) + 1000 + sequence * 1000
  return new Date(Math.max(Date.now() - minutesAgo * 60_000, start)).toISOString()
}

function after(iso: string, plusMs: number): string {
  const earliest = Date.parse(iso) + 1000
  const target = Math.min(Date.now() - 500, Date.parse(iso) + plusMs)
  return new Date(Math.max(target, earliest)).toISOString()
}

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== '1') {
  console.error('Refusing to load demonstration accounts when NODE_ENV=production.')
  console.error('A real deployment needs its own accounts, a security review, and a privacy review.')
  process.exit(1)
}

const config = loadConfig()
ensureDataDirs(config)
const db = openDatabase(config.dbPath)
migrate(db)
setContext({ db, config, io: null })

const existing = db.prepare('SELECT COUNT(*) AS n FROM caseworkers').get()
if (existing && int(existing, 'n') > 0) {
  console.log('The database already has accounts. Delete data/nap.sqlite to seed again.')
  db.close()
  process.exit(0)
}

const passwordHash = await hashPassword(DEMO_PASSWORD)
const now = nowIso()
const ids = new Map<string, number>()

for (const account of DEMO_ACCOUNTS) {
  const result = db
    .prepare(`
      INSERT INTO caseworkers (username, password_hash, full_name, role, availability, disabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `)
    .run(account.username, passwordHash, account.fullName, account.role, account.availability, now, now)
  ids.set(account.username, result.lastInsertRowid)
}

VISITS.forEach((visit, index) => {
  const caseworkerId = ids.get(visit.username)
  if (!caseworkerId) throw new Error(`Missing caseworker ${visit.username}`)
  const checkedInAt = earlierToday(visit.minutesAgo, index)
  const calledAt = visit.status === 'waiting' ? null : after(checkedInAt, 8 * 60_000)
  const completedAt = visit.status === 'completed' ? after(calledAt ?? checkedInAt, 18 * 60_000) : null
  const key = nameKey(visit.fullName)
  const check = db
    .prepare(`
      INSERT INTO check_ins (
        full_name, name_key, caseworker_id, reason, checked_in_at, source, override_unavailable, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, 'kiosk', 0, NULL, ?)
    `)
    .run(visit.fullName, key, caseworkerId, visit.reason, checkedInAt, checkedInAt)
  const queue = db
    .prepare(`
      INSERT INTO queue_entries (check_in_id, caseworker_id, name_key, status, called_at, completed_at, version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `)
    .run(check.lastInsertRowid, caseworkerId, key, visit.status, calledAt, completedAt, completedAt ?? calledAt ?? checkedInAt)
  db.prepare(`
    INSERT INTO queue_events (queue_entry_id, action, actor_id, from_status, to_status, note, created_at)
    VALUES (?, 'check_in', NULL, NULL, 'waiting', NULL, ?)
  `).run(queue.lastInsertRowid, checkedInAt)
  if (calledAt) {
    db.prepare(`
      INSERT INTO queue_events (queue_entry_id, action, actor_id, from_status, to_status, note, created_at)
      VALUES (?, 'call', ?, 'waiting', 'calling', NULL, ?)
    `).run(queue.lastInsertRowid, caseworkerId, calledAt)
  }
  if (visit.status === 'missed' && calledAt) {
    db.prepare(`
      INSERT INTO queue_events (queue_entry_id, action, actor_id, from_status, to_status, note, created_at)
      VALUES (?, 'missed', ?, 'calling', 'missed', NULL, ?)
    `).run(queue.lastInsertRowid, caseworkerId, after(calledAt, 2 * 60_000))
  }
  if (visit.status === 'completed' && completedAt) {
    db.prepare(`
      INSERT INTO queue_events (queue_entry_id, action, actor_id, from_status, to_status, note, created_at)
      VALUES (?, 'done', ?, 'calling', 'completed', NULL, ?)
    `).run(queue.lastInsertRowid, caseworkerId, completedAt)
  }
})

const today = localDate()
for (const account of DEMO_ACCOUNTS) {
  if (account.role !== 'caseworker') continue
  const id = ids.get(account.username)
  if (id) writeDailyLog(id, today)
}

const lines = [
  'CNMI NAP Queue — fictional demonstration accounts',
  'These are not real staff and must not be used for a real program.',
  `Shared password: ${DEMO_PASSWORD}`,
  '',
  'Username                 Role            Name',
]
for (const account of DEMO_ACCOUNTS) {
  lines.push(
    `${account.username.padEnd(24)} ${roleLabel(account.role).padEnd(15)} ${account.fullName}`,
  )
}
lines.push('')
const credentialsPath = path.join(config.dataDir, 'demo-credentials.txt')
fs.writeFileSync(credentialsPath, lines.join('\n'), { encoding: 'utf8' })

const stored = db.prepare('SELECT COUNT(*) AS n FROM check_ins').get()
console.log(`Seeded ${DEMO_ACCOUNTS.length} fictional staff accounts and ${stored ? int(stored, 'n') : 0} visits.`)
console.log(`Demonstration password: ${DEMO_PASSWORD}`)
console.log(`Credentials file: ${credentialsPath}`)
console.log('Logging in does not mark a caseworker available. Availability is changed from the dashboard.')
db.close()
