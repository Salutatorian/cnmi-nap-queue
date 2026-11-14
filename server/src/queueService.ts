import { recordAudit } from './audit.ts'
import { getDb } from './context.ts'
import { int, isConstraint, str, strOrNull, type Row } from './db.ts'
import { HttpError } from './errors.ts'
import { refreshDailyLog } from './logs.ts'
import { nameKey, parsePersonName } from './names.ts'
import { localDate, nowIso } from './time.ts'
import { randomNonce } from './tokens.ts'
import {
  isAvailability,
  isQueueStatus,
  isReason,
  type Actor,
  type QueueStatus,
  type Reason,
  type StaffUser,
} from './types.ts'

export type QueueItem = {
  id: number
  version: number
  checkInId: number
  fullName: string
  reason: Reason
  status: 'waiting' | 'calling' | 'missed'
  checkedInAt: string
  calledAt: string | null
  caseworkerId: number
  caseworkerName: string
}

export type BoardState = {
  cards: {
    entryId: number
    visitorName: string
    caseworkerName: string
    calledAt: string
  }[]
  onDuty: { fullName: string; availability: 'available' | 'busy' }[]
}

export type CallNotice = {
  entryId: number
  caseworkerId: number
  checkedInAt: string
  visitorName: string
  caseworkerName: string
  calledAt: string
  nonce: string
}

type Entry = {
  id: number
  version: number
  status: QueueStatus
  caseworkerId: number
  caseworkerName: string
  nameKey: string
  checkInId: number
  fullName: string
  reason: Reason
  checkedInAt: string
  calledAt: string | null
  completedAt: string | null
}

function mapEntry(row: Row): Entry {
  const status = str(row, 'status')
  const reason = str(row, 'reason')
  if (!isQueueStatus(status) || !isReason(reason)) throw new Error('Stored visit data is invalid.')
  return {
    id: int(row, 'id'),
    version: int(row, 'version'),
    status,
    caseworkerId: int(row, 'caseworker_id'),
    caseworkerName: str(row, 'caseworker_name'),
    nameKey: str(row, 'name_key'),
    checkInId: int(row, 'check_in_id'),
    fullName: str(row, 'full_name'),
    reason,
    checkedInAt: str(row, 'checked_in_at'),
    calledAt: strOrNull(row, 'called_at'),
    completedAt: strOrNull(row, 'completed_at'),
  }
}

const ENTRY_SQL = `
  SELECT q.id, q.version, q.status, q.caseworker_id, q.name_key, q.called_at, q.completed_at, q.check_in_id,
         ci.full_name, ci.reason, ci.checked_in_at, c.full_name AS caseworker_name
  FROM queue_entries q
  JOIN check_ins ci ON ci.id = q.check_in_id
  JOIN caseworkers c ON c.id = q.caseworker_id
`

function findEntry(entryId: number): Entry | undefined {
  const row = getDb().prepare(`${ENTRY_SQL} WHERE q.id = ?`).get(entryId)
  return row ? mapEntry(row) : undefined
}

function findEntryByCheckIn(checkInId: number): Entry | undefined {
  const row = getDb().prepare(`${ENTRY_SQL} WHERE q.check_in_id = ?`).get(checkInId)
  return row ? mapEntry(row) : undefined
}

function mustGetForActor(entryId: number, actor: StaffUser): Entry {
  const entry = findEntry(entryId)
  if (!entry || (actor.role !== 'supervisor' && (actor.role !== 'caseworker' || actor.id !== entry.caseworkerId))) {
    throw new HttpError(404, 'That visit was not found in your queue.')
  }
  return entry
}

function insertEvent(entryId: number, action: string, actorId: number | null, fromStatus: string | null, toStatus: string | null, note: string | null): void {
  getDb()
    .prepare(`
      INSERT INTO queue_events (queue_entry_id, action, actor_id, from_status, to_status, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(entryId, action, actorId, fromStatus, toStatus, note, nowIso())
}

function safeLog(caseworkerId: number, checkedInAt: string): void {
  try {
    refreshDailyLog(caseworkerId, localDate(checkedInAt))
  } catch (error) {
    console.error('Daily log update failed.', error)
  }
}

function toNotice(entry: Entry, calledAt: string): CallNotice {
  return {
    entryId: entry.id,
    caseworkerId: entry.caseworkerId,
    checkedInAt: entry.checkedInAt,
    visitorName: entry.fullName,
    caseworkerName: entry.caseworkerName,
    calledAt,
    nonce: randomNonce(),
  }
}

function bump(entry: Entry, expectedVersion: number, nextStatus: QueueStatus, calledAt: string | null, completedAt: string | null): void {
  let result: { changes: number }
  try {
    result = getDb()
      .prepare(`
        UPDATE queue_entries
        SET status = ?, called_at = ?, completed_at = ?, updated_at = ?, version = version + 1
        WHERE id = ? AND version = ? AND status = ?
      `)
      .run(nextStatus, calledAt, completedAt, nowIso(), entry.id, expectedVersion, entry.status)
  } catch (error) {
    if (isConstraint(error)) throw new HttpError(409, 'Finish the current call before calling another visitor.')
    throw error
  }
  if (result.changes !== 1) throw new HttpError(409, 'That visit changed. Refresh and try again.')
}

export function checkIn(input: {
  fullName: string
  caseworkerId: number
  reason: Reason
  source: 'kiosk' | 'staff'
  actor: Actor | null
  override: boolean
  ip: string | null
}): { queueId: number; fullName: string; caseworkerName: string } {
  const fullName = parsePersonName(input.fullName)
  const key = nameKey(fullName)
  const created = getDb().transaction(() => {
    const worker = getDb()
      .prepare('SELECT id, full_name, role, availability, disabled FROM caseworkers WHERE id = ?')
      .get(input.caseworkerId)
    if (!worker || str(worker, 'role') !== 'caseworker' || int(worker, 'disabled') === 1) {
      throw new HttpError(400, 'Choose an available caseworker.')
    }
    const availability = str(worker, 'availability')
    let usedOverride = false
    if (availability !== 'available') {
      const allowed = input.actor && (input.actor.user.role === 'supervisor' || input.actor.user.role === 'receptionist')
      if (!input.override || !allowed) {
        throw new HttpError(409, 'That caseworker is not available. Please choose another, or ask the receptionist for help.')
      }
      usedOverride = true
    }
    const now = nowIso()
    try {
      const check = getDb()
        .prepare(`
          INSERT INTO check_ins (
            full_name, name_key, caseworker_id, reason, checked_in_at, source, override_unavailable, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(fullName, key, input.caseworkerId, input.reason, now, input.source, usedOverride ? 1 : 0, input.actor?.user.id ?? null, now)
      const queue = getDb()
        .prepare(`
          INSERT INTO queue_entries (check_in_id, caseworker_id, name_key, status, version, updated_at)
          VALUES (?, ?, ?, 'waiting', 1, ?)
        `)
        .run(check.lastInsertRowid, input.caseworkerId, key, now)
      insertEvent(queue.lastInsertRowid, 'check_in', input.actor?.user.id ?? null, null, 'waiting', null)
      recordAudit({
        actorId: input.actor?.user.id ?? null,
        action: usedOverride ? 'check_in_override' : 'check_in',
        targetType: 'queue_entry',
        targetId: queue.lastInsertRowid,
        detail: { fullName, caseworkerId: input.caseworkerId, reason: input.reason, source: input.source },
        ip: input.ip,
      })
      return {
        queueId: queue.lastInsertRowid,
        fullName,
        caseworkerName: str(worker, 'full_name'),
        caseworkerId: input.caseworkerId,
        checkedInAt: now,
      }
    } catch (error) {
      if (isConstraint(error)) throw new HttpError(409, 'This name is already waiting for that caseworker.')
      throw error
    }
  })
  safeLog(created.caseworkerId, created.checkedInAt)
  return { queueId: created.queueId, fullName: created.fullName, caseworkerName: created.caseworkerName }
}

export function queueCounts(caseworkerId: number): { waiting: number; calling: number; missed: number } {
  const row = getDb()
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END), 0) AS waiting,
        COALESCE(SUM(CASE WHEN status = 'calling' THEN 1 ELSE 0 END), 0) AS calling,
        COALESCE(SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END), 0) AS missed
      FROM queue_entries
      WHERE caseworker_id = ?
    `)
    .get(caseworkerId)
  return {
    waiting: row ? int(row, 'waiting') : 0,
    calling: row ? int(row, 'calling') : 0,
    missed: row ? int(row, 'missed') : 0,
  }
}

export function listMyQueue(caseworkerId: number): QueueItem[] {
  return getDb()
    .prepare(`
      ${ENTRY_SQL}
      WHERE q.caseworker_id = ? AND q.status IN ('waiting', 'calling', 'missed')
      ORDER BY CASE q.status WHEN 'calling' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END, ci.checked_in_at ASC
    `)
    .all(caseworkerId)
    .map((row) => {
      const entry = mapEntry(row)
      if (entry.status !== 'waiting' && entry.status !== 'calling' && entry.status !== 'missed') {
        throw new Error('Stored visit data is invalid.')
      }
      return {
        id: entry.id,
        version: entry.version,
        checkInId: entry.checkInId,
        fullName: entry.fullName,
        reason: entry.reason,
        status: entry.status,
        checkedInAt: entry.checkedInAt,
        calledAt: entry.calledAt,
        caseworkerId: entry.caseworkerId,
        caseworkerName: entry.caseworkerName,
      }
    })
}

export function listBoard(): BoardState {
  const cards = getDb()
    .prepare(`
      SELECT q.id AS entry_id, ci.full_name AS visitor_name, c.full_name AS caseworker_name, q.called_at
      FROM queue_entries q
      JOIN check_ins ci ON ci.id = q.check_in_id
      JOIN caseworkers c ON c.id = q.caseworker_id
      WHERE q.status = 'calling'
      ORDER BY q.called_at ASC, c.full_name ASC
    `)
    .all()
    .map((row) => ({
      entryId: int(row, 'entry_id'),
      visitorName: str(row, 'visitor_name'),
      caseworkerName: str(row, 'caseworker_name'),
      calledAt: str(row, 'called_at'),
    }))
  const onDuty = getDb()
    .prepare(`
      SELECT full_name, availability
      FROM caseworkers
      WHERE role = 'caseworker' AND disabled = 0 AND availability IN ('available', 'busy')
      ORDER BY full_name
    `)
    .all()
    .flatMap((row) => {
      const availability = str(row, 'availability')
      if (!isAvailability(availability) || (availability !== 'available' && availability !== 'busy')) return []
      return [{ fullName: str(row, 'full_name'), availability }]
    })
  return { cards, onDuty }
}

export function callVisitor(actor: Actor, entryId: number, expectedVersion: number): CallNotice {
  const notice = getDb().transaction(() => {
    const entry = mustGetForActor(entryId, actor.user)
    if (entry.status !== 'waiting' && entry.status !== 'missed') {
      throw new HttpError(409, 'That visit is no longer waiting.')
    }
    const existing = getDb()
      .prepare(`SELECT id FROM queue_entries WHERE caseworker_id = ? AND status = 'calling'`)
      .get(entry.caseworkerId)
    if (existing) throw new HttpError(409, 'Finish the current call before calling another visitor.')
    const now = nowIso()
    bump(entry, expectedVersion, 'calling', now, entry.completedAt)
    insertEvent(entry.id, 'call', actor.user.id, entry.status, 'calling', null)
    recordAudit({
      actorId: actor.user.id,
      action: 'queue_call',
      targetType: 'queue_entry',
      targetId: entry.id,
      detail: { fullName: entry.fullName, caseworkerId: entry.caseworkerId },
      ip: actor.ip,
    })
    return toNotice(entry, now)
  })
  safeLog(notice.caseworkerId, notice.checkedInAt)
  return notice
}

export function recallVisitor(actor: Actor, entryId: number, expectedVersion: number): CallNotice {
  const notice = getDb().transaction(() => {
    const entry = mustGetForActor(entryId, actor.user)
    if (entry.status !== 'calling') throw new HttpError(409, 'Recall is available while you are calling this visitor.')
    const result = getDb()
      .prepare(`UPDATE queue_entries SET updated_at = ?, version = version + 1 WHERE id = ? AND version = ? AND status = 'calling'`)
      .run(nowIso(), entry.id, expectedVersion)
    if (result.changes !== 1) throw new HttpError(409, 'That visit changed. Refresh and try again.')
    insertEvent(entry.id, 'recall', actor.user.id, 'calling', 'calling', null)
    recordAudit({
      actorId: actor.user.id,
      action: 'queue_recall',
      targetType: 'queue_entry',
      targetId: entry.id,
      detail: { fullName: entry.fullName },
      ip: actor.ip,
    })
    return toNotice(entry, entry.calledAt ?? nowIso())
  })
  safeLog(notice.caseworkerId, notice.checkedInAt)
  return notice
}

export function completeVisitor(actor: Actor, entryId: number, expectedVersion: number): void {
  const entry = getDb().transaction(() => {
    const current = mustGetForActor(entryId, actor.user)
    if (current.status !== 'calling' && current.status !== 'missed') {
      throw new HttpError(409, 'Mark the visitor called before completing the visit.')
    }
    const now = nowIso()
    bump(current, expectedVersion, 'completed', current.calledAt, now)
    insertEvent(current.id, 'done', actor.user.id, current.status, 'completed', null)
    recordAudit({
      actorId: actor.user.id,
      action: 'queue_done',
      targetType: 'queue_entry',
      targetId: current.id,
      detail: { fullName: current.fullName },
      ip: actor.ip,
    })
    return current
  })
  safeLog(entry.caseworkerId, entry.checkedInAt)
}

export function missVisitor(actor: Actor, entryId: number, expectedVersion: number): void {
  const entry = getDb().transaction(() => {
    const current = mustGetForActor(entryId, actor.user)
    if (current.status !== 'calling') throw new HttpError(409, 'Missed is available while you are calling this visitor.')
    bump(current, expectedVersion, 'missed', current.calledAt, null)
    insertEvent(current.id, 'missed', actor.user.id, 'calling', 'missed', null)
    recordAudit({
      actorId: actor.user.id,
      action: 'queue_missed',
      targetType: 'queue_entry',
      targetId: current.id,
      detail: { fullName: current.fullName },
      ip: actor.ip,
    })
    return current
  })
  safeLog(entry.caseworkerId, entry.checkedInAt)
}

export function returnVisitor(actor: Actor, entryId: number, expectedVersion: number): void {
  const entry = getDb().transaction(() => {
    const current = mustGetForActor(entryId, actor.user)
    if (current.status !== 'calling' && current.status !== 'missed') {
      throw new HttpError(409, 'That visit is already in the waiting list.')
    }
    bump(current, expectedVersion, 'waiting', current.calledAt, null)
    insertEvent(current.id, 'return', actor.user.id, current.status, 'waiting', null)
    recordAudit({
      actorId: actor.user.id,
      action: 'queue_return',
      targetType: 'queue_entry',
      targetId: current.id,
      detail: { fullName: current.fullName },
      ip: actor.ip,
    })
    return current
  })
  safeLog(entry.caseworkerId, entry.checkedInAt)
}

export function reassignVisitor(actor: Actor, entryId: number, targetId: number, expectedVersion: number): void {
  if (actor.user.role !== 'supervisor') throw new HttpError(403, 'You do not have permission for that action.')
  const saved = getDb().transaction(() => {
    const entry = findEntry(entryId)
    if (!entry) throw new HttpError(404, 'That visit was not found.')
    if (entry.status !== 'waiting' && entry.status !== 'calling' && entry.status !== 'missed') {
      throw new HttpError(409, 'Only a waiting, calling, or missed visit can be reassigned.')
    }
    if (entry.caseworkerId === targetId) throw new HttpError(400, 'Choose a different caseworker.')
    const target = getDb()
      .prepare(`SELECT id, full_name, role, disabled FROM caseworkers WHERE id = ?`)
      .get(targetId)
    if (!target || str(target, 'role') !== 'caseworker' || int(target, 'disabled') === 1) {
      throw new HttpError(400, 'Choose an active caseworker.')
    }
    const now = nowIso()
    let result: { changes: number }
    try {
      result = getDb()
        .prepare(`
          UPDATE queue_entries
          SET caseworker_id = ?,
              status = CASE WHEN status = 'calling' THEN 'waiting' ELSE status END,
              updated_at = ?,
              version = version + 1
          WHERE id = ? AND version = ? AND status IN ('waiting', 'calling', 'missed')
        `)
        .run(targetId, now, entry.id, expectedVersion)
    } catch (error) {
      if (isConstraint(error)) throw new HttpError(409, 'That caseworker already has this visitor in queue.')
      throw error
    }
    if (result.changes !== 1) throw new HttpError(409, 'That visit changed. Refresh and try again.')
    getDb().prepare('UPDATE check_ins SET caseworker_id = ? WHERE id = ?').run(targetId, entry.checkInId)
    insertEvent(entry.id, 'reassign', actor.user.id, entry.status, entry.status === 'calling' ? 'waiting' : entry.status, `To ${str(target, 'full_name')}`)
    recordAudit({
      actorId: actor.user.id,
      action: 'queue_reassign',
      targetType: 'queue_entry',
      targetId: entry.id,
      detail: { fullName: entry.fullName, fromCaseworkerId: entry.caseworkerId, toCaseworkerId: targetId },
      ip: actor.ip,
    })
    return { fromId: entry.caseworkerId, toId: targetId, checkedInAt: entry.checkedInAt }
  })
  safeLog(saved.fromId, saved.checkedInAt)
  safeLog(saved.toId, saved.checkedInAt)
}

export function correctCheckIn(
  actor: Actor,
  checkInId: number,
  input: { fullName?: string; reason?: Reason; note: string; version: number },
): void {
  if (actor.user.role !== 'supervisor') throw new HttpError(403, 'You do not have permission for that action.')
  const saved = getDb().transaction(() => {
    const entry = findEntryByCheckIn(checkInId)
    if (!entry) throw new HttpError(404, 'That visit was not found.')
    const fullName = input.fullName ? parsePersonName(input.fullName) : entry.fullName
    const reason = input.reason ?? entry.reason
    if (!input.fullName && !input.reason) throw new HttpError(400, 'Change the name or the reason, and add a note.')
    const key = nameKey(fullName)
    try {
      getDb()
        .prepare('UPDATE check_ins SET full_name = ?, name_key = ?, reason = ?, correction_note = ? WHERE id = ?')
        .run(fullName, key, reason, input.note, entry.checkInId)
      const result = getDb()
        .prepare('UPDATE queue_entries SET name_key = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?')
        .run(key, nowIso(), entry.id, input.version)
      if (result.changes !== 1) throw new HttpError(409, 'That visit changed. Refresh and try again.')
    } catch (error) {
      if (error instanceof HttpError) throw error
      if (isConstraint(error)) throw new HttpError(409, 'That caseworker already has this visitor in queue.')
      throw error
    }
    insertEvent(entry.id, 'correct', actor.user.id, entry.status, entry.status, input.note)
    recordAudit({
      actorId: actor.user.id,
      action: 'check_in_correct',
      targetType: 'check_in',
      targetId: entry.checkInId,
      detail: { note: input.note, fullName, reason },
      ip: actor.ip,
    })
    return entry
  })
  safeLog(saved.caseworkerId, saved.checkedInAt)
}

export function cancelVisit(actor: Actor, entryId: number, expectedVersion: number, note: string): void {
  if (actor.user.role !== 'supervisor') throw new HttpError(403, 'You do not have permission for that action.')
  const saved = getDb().transaction(() => {
    const entry = findEntry(entryId)
    if (!entry) throw new HttpError(404, 'That visit was not found.')
    if (entry.status === 'cancelled') throw new HttpError(409, 'That visit is already cancelled.')
    bump(entry, expectedVersion, 'cancelled', entry.calledAt, entry.completedAt)
    getDb().prepare('UPDATE check_ins SET correction_note = ? WHERE id = ?').run(note, entry.checkInId)
    insertEvent(entry.id, 'cancel', actor.user.id, entry.status, 'cancelled', note)
    recordAudit({
      actorId: actor.user.id,
      action: 'queue_cancel',
      targetType: 'queue_entry',
      targetId: entry.id,
      detail: { fullName: entry.fullName, note },
      ip: actor.ip,
    })
    return entry
  })
  safeLog(saved.caseworkerId, saved.checkedInAt)
}
