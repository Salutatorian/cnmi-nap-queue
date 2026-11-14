import type { Express, Request } from 'express'
import {
  createAccount,
  listAvailableCaseworkers,
  listCheckInCaseworkers,
  listStaff,
  resetPassword,
  setAvailability,
  setDisabled,
} from './accounts.ts'
import { logoutAccount, loginAccount, readSession, requireAuth } from './auth.ts'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './demoAccounts.ts'
import { recordAudit } from './audit.ts'
import { clientIp, clearCookieOptions, isLoopback, parseId, readCookie, requireRoles, route, sessionCookieOptions, SESSION_COOKIE, staffFrom } from './http.ts'
import { exportDailyLogs, writeDailyLog } from './logs.ts'
import { publishBoard, publishSettings, publishWorkers } from './publish.ts'
import {
  callVisitor,
  cancelVisit,
  checkIn,
  completeVisitor,
  correctCheckIn,
  listBoard,
  listMyQueue,
  missVisitor,
  queueCounts,
  recallVisitor,
  reassignVisitor,
  returnVisitor,
} from './queueService.ts'
import { assertWithinLimit } from './rateLimit.ts'
import { dailyCounts, listActiveQueues, listAudit, listHistory } from './reports.ts'
import { getSetting, officeSettings, saveOfficeSettings, publicSettings, sessionTimeoutMinutes } from './settings.ts'
import { assertLocalDate, formatStamp, localDate, nowIso } from './time.ts'
import type { Actor } from './types.ts'
import {
  availabilitySchema,
  cancelSchema,
  checkInSchema,
  correctSchema,
  createAccountSchema,
  disabledSchema,
  loginSchema,
  parseBody,
  passwordResetSchema,
  reassignSchema,
  settingsSchema,
  staffCheckInSchema,
  versionSchema,
} from './validate.ts'

function actorFrom(req: Request): Actor {
  return { user: staffFrom(req), ip: clientIp(req) }
}

function historyDate(value: unknown): string {
  if (typeof value === 'string' && value) return assertLocalDate(value)
  return localDate()
}

export function registerRoutes(app: Express): void {
  app.get('/api/health', route((_req, res) => {
    res.json({ ok: true, time: formatStamp(nowIso()) })
  }))

  app.get('/api/public/caseworkers', route((_req, res) => {
    res.json({ caseworkers: listAvailableCaseworkers() })
  }))

  app.get('/api/public/board', route((_req, res) => {
    res.json(listBoard())
  }))

  app.get('/api/public/settings', route((_req, res) => {
    res.json(publicSettings())
  }))

  app.get('/api/public/demo-hint', route((req, res) => {
    if (!isLoopback(req) || getSetting('demo_hint_enabled') === '0') {
      res.status(404).json({ error: 'Not found.' })
      return
    }
    res.json({
      password: DEMO_PASSWORD,
      accounts: DEMO_ACCOUNTS.map((account) => ({
        username: account.username,
        fullName: account.fullName,
        role: account.role,
      })),
    })
  }))

  app.post('/api/public/check-in', route((req, res) => {
    assertWithinLimit(
      `checkin:${clientIp(req)}`,
      30,
      60_000,
      'Please wait a moment before checking in again.',
    )
    const body = parseBody(checkInSchema, req.body)
    const visit = checkIn({
      fullName: body.fullName,
      caseworkerId: body.caseworkerId,
      reason: body.reason,
      source: 'kiosk',
      actor: null,
      override: false,
      ip: clientIp(req),
    })
    publishBoard()
    res.status(201).json(visit)
  }))

  app.post('/api/auth/login', route(async (req, res) => {
    const body = parseBody(loginSchema, req.body)
    const result = await loginAccount(body.username, body.password, clientIp(req))
    res.cookie(SESSION_COOKIE, result.token, sessionCookieOptions(req))
    res.json({ user: result.user, csrfToken: result.csrfToken, sessionTimeoutMinutes: sessionTimeoutMinutes() })
  }))

  app.get('/api/auth/session', route((req, res) => {
    const token = readCookie(req.get('cookie'), SESSION_COOKIE)
    const session = token ? readSession(token, false) : undefined
    if (!session) {
      res.status(401).json({ error: 'Sign in required.' })
      return
    }
    res.json({ ok: true, sessionTimeoutMinutes: sessionTimeoutMinutes() })
  }))

  app.get('/api/auth/me', requireAuth, route((req, res) => {
    res.json({ user: staffFrom(req), csrfToken: req.sessionCsrf, sessionTimeoutMinutes: sessionTimeoutMinutes() })
  }))

  app.post('/api/auth/logout', requireAuth, route((req, res) => {
    const staff = staffFrom(req)
    logoutAccount(readCookie(req.get('cookie'), SESSION_COOKIE), staff.id, clientIp(req))
    res.clearCookie(SESSION_COOKIE, clearCookieOptions(req))
    res.json({ ok: true })
  }))

  app.patch('/api/me/availability', requireAuth, route((req, res) => {
    const body = parseBody(availabilitySchema, req.body)
    const user = setAvailability(actorFrom(req), staffFrom(req).id, body.availability)
    publishWorkers()
    res.json({ user })
  }))

  app.get('/api/queue', requireAuth, requireRoles('caseworker', 'supervisor'), route((req, res) => {
    const staff = staffFrom(req)
    res.json({ ...queueCounts(staff.id), visits: listMyQueue(staff.id) })
  }))

  app.post('/api/queue/:id/call', requireAuth, requireRoles('caseworker', 'supervisor'), route((req, res) => {
    const body = parseBody(versionSchema, req.body)
    const notice = callVisitor(actorFrom(req), parseId(req.params.id), body.version)
    publishBoard(notice)
    res.json({ ok: true })
  }))

  app.post('/api/queue/:id/recall', requireAuth, requireRoles('caseworker', 'supervisor'), route((req, res) => {
    const body = parseBody(versionSchema, req.body)
    const notice = recallVisitor(actorFrom(req), parseId(req.params.id), body.version)
    publishBoard(notice)
    res.json({ ok: true })
  }))

  app.post('/api/queue/:id/done', requireAuth, requireRoles('caseworker', 'supervisor'), route((req, res) => {
    const body = parseBody(versionSchema, req.body)
    completeVisitor(actorFrom(req), parseId(req.params.id), body.version)
    publishBoard()
    res.json({ ok: true })
  }))

  app.post('/api/queue/:id/missed', requireAuth, requireRoles('caseworker', 'supervisor'), route((req, res) => {
    const body = parseBody(versionSchema, req.body)
    missVisitor(actorFrom(req), parseId(req.params.id), body.version)
    publishBoard()
    res.json({ ok: true })
  }))

  app.post('/api/queue/:id/return', requireAuth, requireRoles('caseworker', 'supervisor'), route((req, res) => {
    const body = parseBody(versionSchema, req.body)
    returnVisitor(actorFrom(req), parseId(req.params.id), body.version)
    publishBoard()
    res.json({ ok: true })
  }))

  app.get('/api/history', requireAuth, requireRoles('caseworker', 'supervisor'), route((req, res) => {
    const staff = staffFrom(req)
    const date = historyDate(req.query.date)
    const query = typeof req.query.q === 'string' ? req.query.q : ''
    const caseworkerId = staff.role === 'supervisor' && typeof req.query.caseworkerId === 'string' && req.query.caseworkerId
      ? parseId(req.query.caseworkerId)
      : staff.role === 'caseworker'
        ? staff.id
        : null
    res.json({ date, visits: listHistory({ date, query, caseworkerId }) })
  }))

  app.get('/api/me/log', requireAuth, requireRoles('caseworker', 'supervisor'), route((req, res) => {
    const staff = staffFrom(req)
    const date = historyDate(req.query.date)
    const caseworkerId = staff.role === 'supervisor' && typeof req.query.caseworkerId === 'string' && req.query.caseworkerId
      ? parseId(req.query.caseworkerId)
      : staff.id
    if (staff.role === 'caseworker' && caseworkerId !== staff.id) {
      res.status(403).json({ error: 'You do not have permission for that action.' })
      return
    }
    const text = writeDailyLog(caseworkerId, date)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${date}.txt"`)
    res.send(text)
  }))

  app.get('/api/staff/caseworkers', requireAuth, requireRoles('receptionist', 'supervisor'), route((_req, res) => {
    res.json({ caseworkers: listCheckInCaseworkers() })
  }))

  app.post('/api/staff/check-in', requireAuth, requireRoles('receptionist', 'supervisor'), route((req, res) => {
    const body = parseBody(staffCheckInSchema, req.body)
    const visit = checkIn({
      fullName: body.fullName,
      caseworkerId: body.caseworkerId,
      reason: body.reason,
      source: 'staff',
      actor: actorFrom(req),
      override: body.override === true,
      ip: clientIp(req),
    })
    publishBoard()
    res.status(201).json(visit)
  }))

  app.get('/api/admin/staff', requireAuth, requireRoles('supervisor'), route((_req, res) => {
    res.json({ staff: listStaff() })
  }))

  app.post('/api/admin/caseworkers', requireAuth, requireRoles('supervisor'), route(async (req, res) => {
    const body = parseBody(createAccountSchema, req.body)
    const staff = await createAccount(actorFrom(req), body)
    res.status(201).json({ staff })
  }))

  app.patch('/api/admin/caseworkers/:id', requireAuth, requireRoles('supervisor'), route((req, res) => {
    const body = parseBody(disabledSchema, req.body)
    const result = setDisabled(actorFrom(req), parseId(req.params.id), body.disabled)
    publishWorkers()
    res.json(result)
  }))

  app.post('/api/admin/caseworkers/:id/password', requireAuth, requireRoles('supervisor'), route(async (req, res) => {
    const body = parseBody(passwordResetSchema, req.body)
    await resetPassword(actorFrom(req), parseId(req.params.id), body.password)
    res.json({ ok: true })
  }))

  app.patch('/api/admin/caseworkers/:id/availability', requireAuth, requireRoles('supervisor'), route((req, res) => {
    const body = parseBody(availabilitySchema, req.body)
    const user = setAvailability(actorFrom(req), parseId(req.params.id), body.availability)
    publishWorkers()
    res.json({ user })
  }))

  app.get('/api/admin/queues', requireAuth, requireRoles('supervisor'), route((_req, res) => {
    res.json({ visits: listActiveQueues() })
  }))

  app.post('/api/admin/queue/:id/reassign', requireAuth, requireRoles('supervisor'), route((req, res) => {
    const body = parseBody(reassignSchema, req.body)
    reassignVisitor(actorFrom(req), parseId(req.params.id), body.caseworkerId, body.version)
    publishBoard()
    res.json({ ok: true })
  }))

  app.post('/api/admin/queue/:id/cancel', requireAuth, requireRoles('supervisor'), route((req, res) => {
    const body = parseBody(cancelSchema, req.body)
    cancelVisit(actorFrom(req), parseId(req.params.id), body.version, body.note)
    publishBoard()
    res.json({ ok: true })
  }))

  app.patch('/api/admin/check-ins/:id', requireAuth, requireRoles('supervisor'), route((req, res) => {
    const body = parseBody(correctSchema, req.body)
    correctCheckIn(actorFrom(req), parseId(req.params.id), body)
    publishBoard()
    res.json({ ok: true })
  }))

  app.get('/api/admin/reports', requireAuth, requireRoles('supervisor'), route((req, res) => {
    const date = historyDate(req.query.date)
    res.json({ date, counts: dailyCounts(date) })
  }))

  app.get('/api/admin/audit', requireAuth, requireRoles('supervisor'), route((req, res) => {
    const raw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100
    res.json({ events: listAudit(Number.isFinite(raw) ? raw : 100) })
  }))

  app.get('/api/admin/settings', requireAuth, requireRoles('supervisor'), route((_req, res) => {
    res.json(officeSettings())
  }))

  app.put('/api/admin/settings', requireAuth, requireRoles('supervisor'), route((req, res) => {
    const body = parseBody(settingsSchema, req.body)
    saveOfficeSettings(body)
    recordAudit({
      actorId: staffFrom(req).id,
      action: 'settings_update',
      targetType: 'settings',
      detail: body,
      ip: clientIp(req),
    })
    publishSettings()
    res.json(officeSettings())
  }))

  app.post('/api/admin/logs/export', requireAuth, requireRoles('supervisor'), route((req, res) => {
    const date = historyDate(req.body && typeof req.body === 'object' && 'date' in req.body ? req.body.date : undefined)
    const files = exportDailyLogs(date).map((file) => ({
      caseworkerId: file.caseworkerId,
      fullName: file.fullName,
      url: `/api/admin/logs/${file.caseworkerId}/${date}`,
    }))
    recordAudit({
      actorId: staffFrom(req).id,
      action: 'log_export',
      targetType: 'log',
      detail: { date, count: files.length },
      ip: clientIp(req),
    })
    res.json({ date, files })
  }))

  app.get('/api/admin/logs/:id/:date', requireAuth, requireRoles('supervisor'), route((req, res) => {
    const date = assertLocalDate(String(req.params.date))
    const text = writeDailyLog(parseId(req.params.id), date)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${date}.txt"`)
    res.send(text)
  }))
}
