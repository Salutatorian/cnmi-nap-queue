import type { QueueStatus } from '../types'
import { statusLabel } from '../labels'

export function DemoBanner({ light = false }: { light?: boolean }) {
  return (
    <p className={light
      ? 'bg-amber-200/15 px-4 py-2 text-center text-sm font-medium text-amber-100'
      : 'bg-warn-soft px-4 py-2 text-center text-sm font-semibold text-warn sm:text-base'}>
      Demonstration only. Fictional data. Not an official CNMI government system.
    </p>
  )
}

export function ConnectionBanner({ online }: { online: boolean }) {
  if (online) return null
  return (
    <p role="status" className="bg-bad px-4 py-3 text-center text-lg font-semibold text-white">
      The queue server is unreachable. Use the paper sign-in clipboard until the connection returns.
    </p>
  )
}

const STATUS_CLASS: Record<QueueStatus, string> = {
  waiting: 'bg-paper text-navy ring-line',
  calling: 'bg-good-soft text-good ring-good',
  missed: 'bg-warn-soft text-warn ring-warn',
  completed: 'bg-white text-muted ring-line',
  cancelled: 'bg-bad-soft text-bad ring-bad',
}

export function StatusPill({ status, sized = false }: { status: QueueStatus; sized?: boolean }) {
  const shape = sized
    ? 'inline-flex h-14 shrink-0 items-center justify-center rounded-xl px-4 text-lg font-semibold ring-1'
    : 'inline-flex rounded-full px-3 py-1 text-sm font-semibold ring-1'
  return (
    <span className={`${shape} ${STATUS_CLASS[status]}`}>
      {statusLabel(status)}
    </span>
  )
}

export const rowAction = 'inline-flex h-14 shrink-0 items-center justify-center rounded-xl px-4 text-lg font-semibold disabled:cursor-not-allowed disabled:opacity-50'
export const primaryButton = 'inline-flex min-h-14 items-center justify-center rounded-xl bg-navy px-5 py-3 text-lg font-semibold text-white hover:bg-navy-2 disabled:cursor-not-allowed disabled:opacity-50'
export const rowPrimaryButton = `${rowAction} bg-navy text-white hover:bg-navy-2`
export const rowGoodButton = `${rowAction} bg-good text-white`
export const rowWarnButton = `${rowAction} bg-warn text-white`
export const rowQuietButton = `${rowAction} bg-white text-navy ring-1 ring-line hover:bg-paper`
export const quietButton = 'inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-4 py-2 font-semibold text-navy ring-1 ring-line hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50'
export const goodButton = 'inline-flex min-h-12 items-center justify-center rounded-xl bg-good px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
export const warnButton = 'inline-flex min-h-12 items-center justify-center rounded-xl bg-warn px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
export const fieldClass = 'w-full rounded-xl border border-line bg-white px-4 py-3 text-lg'
