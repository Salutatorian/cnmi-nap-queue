import { getContext } from './context.ts'
import { listBoard, type CallNotice } from './queueService.ts'
import { publicSettings } from './settings.ts'
import { nowIso } from './time.ts'

export function publishBoard(announce?: CallNotice): void {
  const io = getContext().io
  if (!io) return
  io.to('tv').emit('board:state', listBoard())
  io.to('staff').emit('queue:changed', { at: nowIso() })
  if (!announce) return
  io.to('tv').emit('board:announce', {
    entryId: announce.entryId,
    visitorName: announce.visitorName,
    caseworkerName: announce.caseworkerName,
    calledAt: announce.calledAt,
    nonce: announce.nonce,
  })
}

export function publishWorkers(): void {
  const io = getContext().io
  if (!io) return
  const at = nowIso()
  io.to('kiosk').emit('workers:updated', { at })
  io.to('staff').emit('queue:changed', { at })
}

export function publishSettings(): void {
  const io = getContext().io
  if (!io) return
  io.to('tv').emit('public:settings', publicSettings())
}
