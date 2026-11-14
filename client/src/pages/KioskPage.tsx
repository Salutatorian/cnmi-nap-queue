import { useEffect, useState, type FormEvent } from 'react'
import { io } from 'socket.io-client'
import { api, ApiError } from '../api'
import { ConnectionBanner, DemoBanner } from '../components/ui'
import { REASONS, reasonLabel } from '../labels'
import { useServerOnline } from '../online'
import type { PublicWorker, Reason } from '../types'

type Confirmation = { fullName: string; caseworkerName: string }

export function KioskPage() {
  const online = useServerOnline()
  const [workers, setWorkers] = useState<PublicWorker[]>([])
  const [name, setName] = useState('')
  const [workerId, setWorkerId] = useState<number | null>(null)
  const [reason, setReason] = useState<Reason | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

  useEffect(() => {
    document.title = 'Check in — CNMI NAP Queue'
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      api<{ caseworkers: PublicWorker[] }>('/api/public/caseworkers')
        .then((data) => {
          if (cancelled) return
          setWorkers(data.caseworkers)
          setWorkerId((current) => data.caseworkers.some((worker) => worker.id === current) ? current : null)
        })
        .catch(() => {
          if (!cancelled) setWorkers([])
        })
    }
    load()
    const timer = window.setInterval(load, 10000)
    const socket = io({ auth: { screen: 'kiosk' }, reconnection: true, reconnectionAttempts: Infinity })
    socket.on('workers:updated', load)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      socket.close()
    }
  }, [])

  useEffect(() => {
    if (!confirmation) return
    const timer = window.setTimeout(() => setConfirmation(null), 5000)
    return () => window.clearTimeout(timer)
  }, [confirmation])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting || confirmation) return
    if (name.trim().length < 2 || !workerId || !reason) {
      setError('Enter your full name, choose your caseworker, and choose a reason.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await api<{ fullName: string; caseworkerName: string }>('/api/public/check-in', {
        method: 'POST',
        body: JSON.stringify({ fullName: name, caseworkerId: workerId, reason }),
      })
      setName('')
      setWorkerId(null)
      setReason(null)
      setConfirmation({ fullName: result.fullName, caseworkerName: result.caseworkerName })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Check-in did not go through. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <ConnectionBanner online={online} />
      <header className="bg-navy px-6 py-6 text-white">
        <p className="text-lg text-white/75">Commonwealth of the Northern Mariana Islands</p>
        <h1 className="text-4xl font-semibold">Nutrition Assistance Program</h1>
        <p className="mt-1 text-2xl">Visitor check-in</p>
        <div className="mt-4 h-1 w-24 bg-gold" />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {confirmation ? (
          <section className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-line" aria-live="polite">
            <p className="text-lg font-semibold text-good">You are checked in</p>
            <h2 className="mt-3 text-5xl font-semibold">{confirmation.fullName}</h2>
            <p className="mt-4 text-2xl">Please wait for {confirmation.caseworkerName} to call you.</p>
            <button type="button" className="mt-8 min-h-16 rounded-xl bg-navy px-8 text-xl font-semibold text-white" onClick={() => setConfirmation(null)}>
              Next visitor
            </button>
          </section>
        ) : (
          <form className="space-y-6" onSubmit={(event) => { void submit(event) }}>
            <label className="block">
              <span className="text-xl font-semibold">Full name</span>
              <input
                className="mt-2 min-h-20 w-full rounded-2xl border border-line bg-white px-5 text-3xl"
                value={name}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <fieldset>
              <legend className="text-xl font-semibold">Your caseworker</legend>
              {workers.length === 0 ? (
                <p className="mt-3 rounded-2xl bg-warn-soft p-5 text-xl text-warn">
                  No caseworkers are marked available right now. Please see the receptionist.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {workers.map((worker) => {
                    const selected = worker.id === workerId
                    return (
                      <button
                        key={worker.id}
                        type="button"
                        aria-pressed={selected}
                        className={`min-h-20 rounded-2xl px-4 text-xl font-semibold ${selected ? 'bg-navy text-white' : 'bg-white text-ink ring-1 ring-line'}`}
                        onClick={() => setWorkerId(worker.id)}
                      >
                        {worker.fullName}
                      </button>
                    )
                  })}
                </div>
              )}
            </fieldset>
            <fieldset>
              <legend className="text-xl font-semibold">Reason for visit</legend>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {REASONS.map((item) => {
                  const selected = item === reason
                  return (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={selected}
                      className={`min-h-20 rounded-2xl px-4 text-xl font-semibold ${selected ? 'bg-navy text-white' : 'bg-white text-ink ring-1 ring-line'}`}
                      onClick={() => setReason(item)}
                    >
                      {reasonLabel(item)}
                    </button>
                  )
                })}
              </div>
            </fieldset>
            {error && <p role="alert" className="rounded-2xl bg-bad-soft px-5 py-4 text-xl text-bad">{error}</p>}
            <button type="submit" className="min-h-24 w-full rounded-2xl bg-good text-3xl font-semibold text-white disabled:opacity-50" disabled={submitting}>
              {submitting ? 'Checking in…' : 'Check in'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
