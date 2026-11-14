import type { NextFunction, Request, Response } from 'express'
import { recordAudit } from './audit.ts'
import { getDb } from './context.ts'
import { int, str, strOrNull, type Row } from './db.ts'
import { HttpError } from './errors.ts'
import { SESSION_COOKIE, clearCookieOptions, readCookie } from './http.ts'
import { verifyPassword } from './passwords.ts'
import { assertLoginAllowed, clearLoginFailures, loginKey, recordLoginFailure } from './rateLimit.ts'
import { sessionTimeoutMinutes } from './settings.ts'
import { nowIso } from './time.ts'
import { hashToken, randomToken, tokensMatch } from './tokens.ts'
import { isAvailability, isRole, type StaffUser } from './types.ts'

const ABSOLUTE_SESSION_MS = 12 * 60 * 60 * 1000

export type SessionResult = {
  user: StaffUser
  csrfToken: string
}

function mapUser(row: Row): StaffUser {
  const role = str(row, 'role')
  const availability = str(row, 'availability')
  if (!isRole(role) || !isAvailability(availability)) throw new Error('Stored account data is invalid.')
  return {
    id: int(row, 'user_id'),
    username: str(row, 'username'),
    fullName: str(row, 'full_name'),
    role,
    availability,
  }
}

export function readSession(token: string, touch: boolean): SessionResult | undefined {
  const row = getDb()
    .prepare(`
      SELECT s.id AS session_id, s.csrf_token, s.last_seen_at, s.expires_at, s.revoked_at,
             c.id AS user_id, c.username, c.full_name, c.role, c.availability, c.disabled
      FROM sessions s
      JOIN caseworkers c ON c.id = s.caseworker_id
      WHERE s.token_hash = ?
    `)
    .get(hashToken(token))
  if (!row) return undefined
  if (strOrNull(row, 'revoked_at') || int(row, 'disabled') === 1) return undefined
  const now = Date.now()
  if (Date.parse(str(row, 'expires_at')) <= now) {
    revokeSessionById(int(row, 'session_id'))
    return undefined
  }
  const idleMs = sessionTimeoutMinutes() * 60 * 1000
  if (now - Date.parse(str(row, 'last_seen_at')) > idleMs) {
    revokeSessionById(int(row, 'session_id'))
    return undefined
  }
  if (touch) {
    getDb().prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(new Date(now).toISOString(), int(row, 'session_id'))
  }
  return { user: mapUser(row), csrfToken: str(row, 'csrf_token') }
}

function revokeSessionById(sessionId: number): void {
  getDb().prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(nowIso(), sessionId)
}

export function revokeSessionsFor(caseworkerId: number): void {
  getDb()
    .prepare('UPDATE sessions SET revoked_at = ? WHERE caseworker_id = ? AND revoked_at IS NULL')
    .run(nowIso(), caseworkerId)
}

export async function loginAccount(username: string, password: string, ip: string): Promise<{ token: string; csrfToken: string; user: StaffUser }> {
  const key = loginKey(ip, username)
  assertLoginAllowed(key)
  const row = getDb()
    .prepare(`
      SELECT id AS user_id, username, password_hash, full_name, role, availability, disabled
      FROM caseworkers
      WHERE username = ?
    `)
    .get(username.trim().toLowerCase())
  const passwordHash = row ? str(row, 'password_hash') : null
  const disabled = row ? int(row, 'disabled') === 1 : false
  const valid = await verifyPassword(password, passwordHash)
  if (!row || !valid || disabled) {
    recordLoginFailure(key)
    recordAudit({
      actorId: row ? int(row, 'user_id') : null,
      action: 'login_failure',
      targetType: 'caseworker',
      targetId: row ? int(row, 'user_id') : null,
      detail: { username: username.trim().toLowerCase() },
      ip,
    })
    throw new HttpError(401, 'The username or password is not correct.')
  }
  clearLoginFailures(key)
  const token = randomToken()
  const csrfToken = randomToken()
  const now = nowIso()
  const expires = new Date(Date.now() + ABSOLUTE_SESSION_MS).toISOString()
  getDb()
    .prepare('DELETE FROM sessions WHERE expires_at < ?')
    .run(now)
  getDb()
    .prepare(`
      INSERT INTO sessions (token_hash, csrf_token, caseworker_id, created_at, last_seen_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(hashToken(token), csrfToken, int(row, 'user_id'), now, now, expires)
  const user = mapUser(row)
  recordAudit({ actorId: user.id, action: 'login_success', targetType: 'caseworker', targetId: user.id, ip })
  return { token, csrfToken, user }
}

export function logoutAccount(token: string | undefined, actorId: number | null, ip: string): void {
  if (token) {
    getDb().prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(nowIso(), hashToken(token))
  }
  recordAudit({ actorId, action: 'logout', targetType: 'caseworker', targetId: actorId, ip })
}

export function assertCsrf(req: Request, csrfToken: string): void {
  const header = req.get('x-csrf-token') ?? ''
  if (!tokensMatch(header, csrfToken)) {
    throw new HttpError(403, 'The form expired. Refresh the page and try again.')
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = readCookie(req.get('cookie'), SESSION_COOKIE)
    if (!token) {
      res.status(401).json({ error: 'Sign in required.' })
      return
    }
    const session = readSession(token, true)
    if (!session) {
      res.clearCookie(SESSION_COOKIE, clearCookieOptions(req))
      res.status(401).json({ error: 'Sign in required.' })
      return
    }
    const method = req.method.toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') assertCsrf(req, session.csrfToken)
    req.staff = session.user
    req.sessionCsrf = session.csrfToken
    next()
  } catch (error) {
    next(error)
  }
}
