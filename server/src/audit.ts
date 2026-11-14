import { getDb } from './context.ts'
import { nowIso } from './time.ts'

export function recordAudit(input: {
  actorId: number | null
  action: string
  targetType?: string | null
  targetId?: string | number | null
  detail?: unknown
  ip?: string | null
}): void {
  getDb()
    .prepare(`
      INSERT INTO audit_events (actor_id, action, target_type, target_id, detail, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      input.actorId,
      input.action,
      input.targetType ?? null,
      input.targetId == null ? null : String(input.targetId),
      input.detail === undefined ? null : JSON.stringify(input.detail),
      input.ip ?? null,
      nowIso(),
    )
}
