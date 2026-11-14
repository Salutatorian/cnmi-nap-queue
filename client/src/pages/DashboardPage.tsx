import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { rowGoodButton, rowPrimaryButton, rowQuietButton, rowWarnButton, StatusPill } from '../components/ui'
import { availabilityLabel, reasonLabel } from '../labels'
import { formatWhen } from '../time'
import type { Availability, QueueItem } from '../types'

const AVAILABILITY: Availability[] = ['available', 'busy', 'on_break', 'offline']

type QueueResponse = {
  waiting: number
  calling: number
  missed: number
  visits: QueueItem[]
}

export function DashboardPage() {
  const { user, refresh } = useAuth()
  const [queue, setQueue] = useState<QueueResponse>({ waiting: 0, calling: 0, missed: 0, visits: [] })
  const [error, setError] = useState('')
  const [pending, setPending] = useState('')
  const loadRef = useRef<() => Promise<void>>(async () => {})

  async function load() {
    const data = await api<QueueResponse>('/api/queue')
    setQueue(data)
  }
  loadRef.current = load

  useEffect(() => {
    document.title = 'My queue — CNMI NAP Queue'
    void load().catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'The queue could not be loaded.')
    })
    const socket = io({ auth: { screen: 'staff' }, withCredentials: true, reconnection: true, reconnectionAttempts: Infinity })
    socket.on('queue:changed', () => {
      void loadRef.current().catch(() => undefined)
    })
    return () => {
      socket.close()
    }
  }, [])

  if (!user) return null
  if (user.role === 'receptionist') return <Navigate to="/staff/check-in" replace />

  const calling = queue.visits.find((visit) => visit.status === 'calling')
  const waiting = queue.visits.filter((visit) => visit.status === 'waiting')
  const missed = queue.visits.filter((visit) => visit.status === 'missed')

  async function run(key: string, action: () => Promise<void>) {
    if (pending) return
    setPending(key)
    setError('')
    try {
      await action()
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That action did not go through.')
      await load().catch(() => undefined)
    } finally {
      setPending('')
    }
  }

  async function changeAvailability(availability: Availability) {
    await run(`availability:${availability}`, async () => {
      await api('/api/me/availability', { method: 'PATCH', body: JSON.stringify({ availability }) })
      await refresh()
    })
  }

  function act(visit: QueueItem, action: 'call' | 'recall' | 'done' | 'missed' | 'return') {
    return run(`${action}:${visit.id}`, () => api(`/api/queue/${visit.id}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ version: visit.version }),
    }))
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-5 ring-1 ring-line">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{user.fullName}</h1>
            <p className="mt-1 text-lg">
              <span className="text-4xl font-semibold">{queue.waiting}</span> waiting
              {queue.missed > 0 && <span className="text-muted"> · {queue.missed} missed</span>}
            </p>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-muted">Your availability</p>
            <div className="flex flex-wrap gap-2">
              {AVAILABILITY.map((availability) => (
                <button
                  key={availability}
                  type="button"
                  aria-pressed={user.availability === availability}
                  className={`min-h-12 rounded-xl px-4 font-semibold ${user.availability === availability ? 'bg-navy text-white' : 'bg-paper text-ink ring-1 ring-line'}`}
                  onClick={() => { void changeAvailability(availability) }}
                >
                  {availabilityLabel(availability)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted">Only Available appears on the public check-in screen. Finishing a visit does not call the next person.</p>
        {user.role === 'supervisor' && (
          <p className="mt-2 text-sm text-muted">Open Administration to see every caseworker’s queue.</p>
        )}
      </section>

      {error && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-bad">{error}</p>}

      <section className="rounded-3xl bg-white p-5 ring-1 ring-line">
        <h2 className="text-2xl font-semibold">Now calling</h2>
        {calling ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-4xl font-semibold">{calling.fullName}</p>
              <StatusPill status="calling" />
            </div>
            <p className="mt-2 text-lg text-muted">{reasonLabel(calling.reason)} · Checked in {formatWhen(calling.checkedInAt)}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" className={rowPrimaryButton} disabled={pending !== ''} onClick={() => { void act(calling, 'recall') }}>Recall</button>
              <button type="button" className={rowGoodButton} disabled={pending !== ''} onClick={() => { void act(calling, 'done') }}>Done</button>
              <button type="button" className={rowWarnButton} disabled={pending !== ''} onClick={() => { void act(calling, 'missed') }}>Missed</button>
              <button type="button" className={rowQuietButton} disabled={pending !== ''} onClick={() => { void act(calling, 'return') }}>Return to queue</button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-lg text-muted">Nobody is being called. Choose a visitor when you are ready.</p>
        )}
      </section>

      <VisitList
        title="Waiting"
        visits={waiting}
        empty="No one is waiting."
        actionLabel="Call"
        disabled={pending !== '' || Boolean(calling)}
        onAction={(visit) => { void act(visit, 'call') }}
      />
      <VisitList
        title="Missed"
        visits={missed}
        empty="No missed visitors."
        actionLabel="Call again"
        disabled={pending !== '' || Boolean(calling)}
        onAction={(visit) => { void act(visit, 'call') }}
        extra={(visit) => (
          <>
            <button type="button" className={rowGoodButton} disabled={pending !== ''} onClick={() => { void act(visit, 'done') }}>Done</button>
            <button type="button" className={rowQuietButton} disabled={pending !== ''} onClick={() => { void act(visit, 'return') }}>Return to queue</button>
          </>
        )}
      />
    </div>
  )
}

function VisitList({
  title,
  visits,
  empty,
  actionLabel,
  disabled,
  onAction,
  extra,
}: {
  title: string
  visits: QueueItem[]
  empty: string
  actionLabel: string
  disabled: boolean
  onAction: (visit: QueueItem) => void
  extra?: (visit: QueueItem) => ReactNode
}) {
  return (
    <section>
      <h2 className="text-2xl font-semibold">{title}</h2>
      {visits.length === 0 ? (
        <p className="mt-3 text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {visits.map((visit) => (
            <li key={visit.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-line">
              <div>
                <p className="text-2xl font-semibold">{visit.fullName}</p>
                <p className="text-muted">{reasonLabel(visit.reason)} · Checked in {formatWhen(visit.checkedInAt)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={visit.status} sized />
                <button type="button" className={rowPrimaryButton} disabled={disabled} onClick={() => onAction(visit)}>
                  {actionLabel}
                </button>
                {extra?.(visit)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
