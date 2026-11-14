import { getDb } from './context.ts'
import { int, str, strOrNull, type Row } from './db.ts'
import { localDayUtcRange } from './time.ts'
import { isQueueStatus, isReason, type QueueStatus, type Reason } from './types.ts'

export type HistoryVisit = {
  id: number
  version: number
  checkInId: number
  fullName: string
  reason: Reason
  status: QueueStatus
  checkedInAt: string
  calledAt: string | null
  completedAt: string | null
  caseworkerId: number
  caseworkerName: string
}

function mapVisit(row: Row): HistoryVisit {
  const reason = str(row, 'reason')
  const status = str(row, 'status')
  if (!isReason(reason) || !isQueueStatus(status)) throw new Error('Stored visit data is invalid.')
  return {
    id: int(row, 'id'),
    version: int(row, 'version'),
    checkInId: int(row, 'check_in_id'),
    fullName: str(row, 'full_name'),
    reason,
    status,
    checkedInAt: str(row, 'checked_in_at'),
    calledAt: strOrNull(row, 'called_at'),
    completedAt: strOrNull(row, 'completed_at'),
    caseworkerId: int(row, 'caseworker_id'),
    caseworkerName: str(row, 'caseworker_name'),
  }
}

const VISIT_SQL = `
  SELECT q.id, q.version, q.status, q.called_at, q.completed_at, q.check_in_id,
         ci.full_name, ci.reason, ci.checked_in_at,
         c.id AS caseworker_id, c.full_name AS caseworker_name
  FROM queue_entries q
  JOIN check_ins ci ON ci.id = q.check_in_id
  JOIN caseworkers c ON c.id = q.caseworker_id
`

export function listHistory(input: { date: string; query: string; caseworkerId: number | null }): HistoryVisit[] {
  const range = localDayUtcRange(input.date)
  const query = input.query.trim().slice(0, 80).replace(/[\\%_]/g, '')
  return getDb()
    .prepare(`
      ${VISIT_SQL}
      WHERE ci.checked_in_at >= ? AND ci.checked_in_at < ?
        AND (? = 0 OR q.caseworker_id = ?)
        AND (? = '' OR ci.full_name LIKE ?)
      ORDER BY ci.checked_in_at DESC, q.id DESC
      LIMIT 300
    `)
    .all(range.start, range.end, input.caseworkerId ?? 0, input.caseworkerId ?? 0, query, `%${query}%`)
    .map(mapVisit)
}

export function listActiveQueues(): HistoryVisit[] {
  return getDb()
    .prepare(`
      ${VISIT_SQL}
      WHERE q.status IN ('waiting', 'calling', 'missed')
      ORDER BY c.full_name ASC,
               CASE q.status WHEN 'calling' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END,
               ci.checked_in_at ASC
    `)
    .all()
    .map(mapVisit)
}

export type DailyCount = {
  caseworkerId: number
  fullName: string
  completed: number
  missed: number
  waiting: number
  calling: number
  cancelled: number
  total: number
}

export function dailyCounts(date: string): DailyCount[] {
  const range = localDayUtcRange(date)
  return getDb()
    .prepare(`
      SELECT c.id, c.full_name,
        COALESCE(SUM(CASE WHEN q.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
        COALESCE(SUM(CASE WHEN q.status = 'missed' THEN 1 ELSE 0 END), 0) AS missed,
        COALESCE(SUM(CASE WHEN q.status = 'waiting' THEN 1 ELSE 0 END), 0) AS waiting,
        COALESCE(SUM(CASE WHEN q.status = 'calling' THEN 1 ELSE 0 END), 0) AS calling,
        COALESCE(SUM(CASE WHEN q.status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled,
        COUNT(q.id) AS total
      FROM caseworkers c
      LEFT JOIN check_ins ci
        ON ci.caseworker_id = c.id AND ci.checked_in_at >= ? AND ci.checked_in_at < ?
      LEFT JOIN queue_entries q ON q.check_in_id = ci.id
      WHERE c.role = 'caseworker'
      GROUP BY c.id
      ORDER BY c.full_name
    `)
    .all(range.start, range.end)
    .map((row) => ({
      caseworkerId: int(row, 'id'),
      fullName: str(row, 'full_name'),
      completed: int(row, 'completed'),
      missed: int(row, 'missed'),
      waiting: int(row, 'waiting'),
      calling: int(row, 'calling'),
      cancelled: int(row, 'cancelled'),
      total: int(row, 'total'),
    }))
}

export type AuditRow = {
  id: number
  action: string
  actorName: string | null
  targetType: string | null
  targetId: string | null
  detail: string | null
  ip: string | null
  createdAt: string
}

export function listAudit(limit: number): AuditRow[] {
  const capped = Math.min(Math.max(Math.trunc(limit), 1), 200)
  return getDb()
    .prepare(`
      SELECT a.id, a.action, a.target_type, a.target_id, a.detail, a.ip, a.created_at, c.full_name AS actor_name
      FROM audit_events a
      LEFT JOIN caseworkers c ON c.id = a.actor_id
      ORDER BY a.id DESC
      LIMIT ?
    `)
    .all(capped)
    .map((row) => ({
      id: int(row, 'id'),
      action: str(row, 'action'),
      actorName: strOrNull(row, 'actor_name'),
      targetType: strOrNull(row, 'target_type'),
      targetId: strOrNull(row, 'target_id'),
      detail: strOrNull(row, 'detail'),
      ip: strOrNull(row, 'ip'),
      createdAt: str(row, 'created_at'),
    }))
}
