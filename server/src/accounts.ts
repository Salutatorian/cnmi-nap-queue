import { recordAudit } from './audit.ts'
import { getDb } from './context.ts'
import { int, isConstraint, str } from './db.ts'
import { HttpError } from './errors.ts'
import { parsePersonName } from './names.ts'
import { hashPassword } from './passwords.ts'
import { revokeSessionsFor } from './auth.ts'
import { nowIso } from './time.ts'
import {
  isAvailability,
  isRole,
  type Actor,
  type Availability,
  type Role,
  type StaffUser,
} from './types.ts'

export type StaffRecord = StaffUser & { disabled: boolean }

function mapStaff(row: Parameters<typeof str>[0]): StaffRecord {
  const role = str(row, 'role')
  const availability = str(row, 'availability')
  if (!isRole(role) || !isAvailability(availability)) throw new Error('Stored account data is invalid.')
  return {
    id: int(row, 'id'),
    username: str(row, 'username'),
    fullName: str(row, 'full_name'),
    role,
    availability,
    disabled: int(row, 'disabled') === 1,
  }
}

const STAFF_COLUMNS = 'id, username, full_name, role, availability, disabled'

export function listStaff(): StaffRecord[] {
  return getDb()
    .prepare(`SELECT ${STAFF_COLUMNS} FROM caseworkers ORDER BY role, full_name`)
    .all()
    .map(mapStaff)
}

export function listAvailableCaseworkers(): { id: number; fullName: string }[] {
  return getDb()
    .prepare(`
      SELECT id, full_name
      FROM caseworkers
      WHERE role = 'caseworker' AND disabled = 0 AND availability = 'available'
      ORDER BY full_name
    `)
    .all()
    .map((row) => ({ id: int(row, 'id'), fullName: str(row, 'full_name') }))
}

export function listCheckInCaseworkers(): { id: number; fullName: string; availability: Availability }[] {
  return getDb()
    .prepare(`
      SELECT id, full_name, availability
      FROM caseworkers
      WHERE role = 'caseworker' AND disabled = 0
      ORDER BY CASE availability WHEN 'available' THEN 0 ELSE 1 END, full_name
    `)
    .all()
    .map((row) => {
      const availability = str(row, 'availability')
      if (!isAvailability(availability)) throw new Error('Stored account data is invalid.')
      return { id: int(row, 'id'), fullName: str(row, 'full_name'), availability }
    })
}

export async function createAccount(
  actor: Actor,
  input: { username: string; password: string; fullName: string; role: Role },
): Promise<StaffRecord> {
  const fullName = parsePersonName(input.fullName)
  const now = nowIso()
  const passwordHash = await hashPassword(input.password)
  try {
    const result = getDb()
      .prepare(`
        INSERT INTO caseworkers (username, password_hash, full_name, role, availability, disabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'offline', 0, ?, ?)
      `)
      .run(input.username, passwordHash, fullName, input.role, now, now)
    recordAudit({
      actorId: actor.user.id,
      action: 'caseworker_create',
      targetType: 'caseworker',
      targetId: result.lastInsertRowid,
      detail: { username: input.username, role: input.role },
      ip: actor.ip,
    })
    const created = getDb().prepare(`SELECT ${STAFF_COLUMNS} FROM caseworkers WHERE id = ?`).get(result.lastInsertRowid)
    if (!created) throw new HttpError(500, 'The account could not be created.')
    return mapStaff(created)
  } catch (error) {
    if (isConstraint(error)) throw new HttpError(409, 'That username is already in use.')
    throw error
  }
}

export function setAvailability(actor: Actor, caseworkerId: number, availability: Availability): StaffUser {
  if (actor.user.role !== 'supervisor' && actor.user.id !== caseworkerId) {
    throw new HttpError(403, 'You do not have permission for that action.')
  }
  const existing = getDb().prepare(`SELECT ${STAFF_COLUMNS} FROM caseworkers WHERE id = ?`).get(caseworkerId)
  if (!existing) throw new HttpError(404, 'That account was not found.')
  const staff = mapStaff(existing)
  if (staff.disabled) throw new HttpError(409, 'This account is disabled.')
  const now = nowIso()
  getDb()
    .prepare('UPDATE caseworkers SET availability = ?, updated_at = ? WHERE id = ?')
    .run(availability, now, caseworkerId)
  recordAudit({
    actorId: actor.user.id,
    action: 'availability_change',
    targetType: 'caseworker',
    targetId: caseworkerId,
    detail: { from: staff.availability, to: availability },
    ip: actor.ip,
  })
  return { ...staff, availability }
}

export function setDisabled(actor: Actor, caseworkerId: number, disabled: boolean): { staff: StaffRecord; waiting: number } {
  if (actor.user.id === caseworkerId) throw new HttpError(409, 'Ask another supervisor to change your own account.')
  const existing = getDb().prepare(`SELECT ${STAFF_COLUMNS} FROM caseworkers WHERE id = ?`).get(caseworkerId)
  if (!existing) throw new HttpError(404, 'That account was not found.')
  const staff = mapStaff(existing)
  if (disabled && staff.role === 'supervisor' && !staff.disabled) {
    const others = getDb()
      .prepare(`SELECT COUNT(*) AS n FROM caseworkers WHERE role = 'supervisor' AND disabled = 0 AND id <> ?`)
      .get(caseworkerId)
    if (!others || int(others, 'n') < 1) throw new HttpError(409, 'Keep at least one active supervisor account.')
  }
  const now = nowIso()
  getDb().transaction(() => {
    getDb()
      .prepare(`
        UPDATE caseworkers
        SET disabled = ?, availability = CASE WHEN ? = 1 THEN 'offline' ELSE availability END, updated_at = ?
        WHERE id = ?
      `)
      .run(disabled ? 1 : 0, disabled ? 1 : 0, now, caseworkerId)
    if (disabled) revokeSessionsFor(caseworkerId)
    recordAudit({
      actorId: actor.user.id,
      action: disabled ? 'caseworker_disable' : 'caseworker_enable',
      targetType: 'caseworker',
      targetId: caseworkerId,
      detail: { username: staff.username },
      ip: actor.ip,
    })
  })
  const waitingRow = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM queue_entries WHERE caseworker_id = ? AND status IN ('waiting', 'calling', 'missed')`)
    .get(caseworkerId)
  const updated = getDb().prepare(`SELECT ${STAFF_COLUMNS} FROM caseworkers WHERE id = ?`).get(caseworkerId)
  if (!updated) throw new HttpError(404, 'That account was not found.')
  return { staff: mapStaff(updated), waiting: waitingRow ? int(waitingRow, 'n') : 0 }
}

export async function resetPassword(actor: Actor, caseworkerId: number, password: string): Promise<void> {
  const existing = getDb().prepare('SELECT id, username FROM caseworkers WHERE id = ?').get(caseworkerId)
  if (!existing) throw new HttpError(404, 'That account was not found.')
  const passwordHash = await hashPassword(password)
  getDb().transaction(() => {
    getDb().prepare('UPDATE caseworkers SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, nowIso(), caseworkerId)
    revokeSessionsFor(caseworkerId)
    recordAudit({
      actorId: actor.user.id,
      action: 'password_reset',
      targetType: 'caseworker',
      targetId: caseworkerId,
      detail: { username: str(existing, 'username') },
      ip: actor.ip,
    })
  })
}
