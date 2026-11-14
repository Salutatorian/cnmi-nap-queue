import fs from 'node:fs'
import path from 'node:path'
import { getContext, getDb } from './context.ts'
import { int, str, strOrNull } from './db.ts'
import { HttpError } from './errors.ts'
import { reasonLabel, statusLabel } from './labels.ts'
import { caseworkerFolder } from './names.ts'
import { formatStamp, localDayUtcRange, nowIso, TIME_ZONE } from './time.ts'
import { isQueueStatus, isReason, type QueueStatus, type Reason } from './types.ts'

export type LogVisit = {
  fullName: string
  reason: Reason
  status: QueueStatus
  checkedInAt: string
  calledAt: string | null
  completedAt: string | null
}

function visitsFor(caseworkerId: number, date: string): { caseworkerName: string; visits: LogVisit[] } | undefined {
  const worker = getDb().prepare('SELECT full_name FROM caseworkers WHERE id = ?').get(caseworkerId)
  if (!worker) return undefined
  const range = localDayUtcRange(date)
  const visits = getDb()
    .prepare(`
      SELECT ci.full_name, ci.reason, ci.checked_in_at, q.status, q.called_at, q.completed_at
      FROM queue_entries q
      JOIN check_ins ci ON ci.id = q.check_in_id
      WHERE q.caseworker_id = ? AND ci.checked_in_at >= ? AND ci.checked_in_at < ?
      ORDER BY ci.checked_in_at ASC, q.id ASC
    `)
    .all(caseworkerId, range.start, range.end)
    .map((row) => {
      const reason = str(row, 'reason')
      const status = str(row, 'status')
      if (!isReason(reason) || !isQueueStatus(status)) throw new Error('Stored visit data is invalid.')
      return {
        fullName: str(row, 'full_name'),
        reason,
        status,
        checkedInAt: str(row, 'checked_in_at'),
        calledAt: strOrNull(row, 'called_at'),
        completedAt: strOrNull(row, 'completed_at'),
      }
    })
  return { caseworkerName: str(worker, 'full_name'), visits }
}

export function buildDailyLog(caseworkerName: string, date: string, visits: LogVisit[]): string {
  const lines = [
    'CNMI NAP Digital Queue',
    'Daily caseworker log',
    'DEMONSTRATION — not an official government record',
    '',
    `Caseworker: ${caseworkerName}`,
    `Date: ${date}`,
    `Timezone: ${TIME_ZONE}`,
    `Generated: ${formatStamp(nowIso())}`,
    '',
    `Visits: ${visits.length}`,
    '',
  ]
  if (visits.length === 0) {
    lines.push('No visits were recorded for this date.')
    lines.push('')
  }
  visits.forEach((visit, index) => {
    lines.push(`${index + 1}. ${visit.fullName}`)
    lines.push(`   Reason: ${reasonLabel(visit.reason)}`)
    lines.push(`   Check-in: ${formatStamp(visit.checkedInAt)}`)
    lines.push(`   Called: ${visit.calledAt ? formatStamp(visit.calledAt) : '—'}`)
    lines.push(`   Completed: ${visit.completedAt ? formatStamp(visit.completedAt) : '—'}`)
    lines.push(`   Final status: ${statusLabel(visit.status)}`)
    lines.push('')
  })
  return lines.join('\n')
}

function logPath(fullName: string, date: string): string {
  const root = path.resolve(getContext().config.logDir)
  const file = path.resolve(root, caseworkerFolder(fullName), `${date}.txt`)
  const relative = path.relative(root, file)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new HttpError(400, 'That log could not be created.')
  }
  return file
}

export function writeDailyLog(caseworkerId: number, date: string): string {
  const loaded = visitsFor(caseworkerId, date)
  if (!loaded) throw new HttpError(404, 'That account was not found.')
  const text = buildDailyLog(loaded.caseworkerName, date, loaded.visits)
  const file = logPath(loaded.caseworkerName, date)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text, { encoding: 'utf8', mode: 0o600 })
  return text
}

export function refreshDailyLog(caseworkerId: number, date: string): void {
  writeDailyLog(caseworkerId, date)
}

export function exportDailyLogs(date: string): { caseworkerId: number; fullName: string }[] {
  const workers = getDb()
    .prepare(`SELECT id, full_name FROM caseworkers WHERE role = 'caseworker' ORDER BY full_name`)
    .all()
  return workers.map((row) => {
    const caseworkerId = int(row, 'id')
    writeDailyLog(caseworkerId, date)
    return { caseworkerId, fullName: str(row, 'full_name') }
  })
}
