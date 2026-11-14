import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../api'
import { fieldClass, primaryButton } from '../components/ui'
import { REASONS, availabilityLabel, reasonLabel } from '../labels'
import type { CheckInWorker, Reason } from '../types'

export function StaffCheckInPage() {
  const [workers, setWorkers] = useState<CheckInWorker[]>([])
  const [name, setName] = useState('')
  const [workerId, setWorkerId] = useState<number | null>(null)
  const [reason, setReason] = useState<Reason | null>(null)
  const [override, setOverride] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    document.title = 'Staff check-in — CNMI NAP Queue'
    api<{ caseworkers: CheckInWorker[] }>('/api/staff/caseworkers')
      .then((data) => setWorkers(data.caseworkers))
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Caseworkers could not be loaded.'))
  }, [])

  const selected = workers.find((worker) => worker.id === workerId)
  const needsOverride = selected !== undefined && selected.availability !== 'available'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    if (name.trim().length < 2 || !workerId || !reason) {
      setError('Enter the visitor name, caseworker, and reason.')
      return
    }
    if (needsOverride && !override) {
      setError('This caseworker is not available. Confirm the override to continue.')
      return
    }
    setPending(true)
    setError('')
    setMessage('')
    try {
      const result = await api<{ fullName: string; caseworkerName: string }>('/api/staff/check-in', {
        method: 'POST',
        body: JSON.stringify({ fullName: name, caseworkerId: workerId, reason, override: needsOverride }),
      })
      setName('')
      setWorkerId(null)
      setReason(null)
      setOverride(false)
      setMessage(`${result.fullName} is checked in with ${result.caseworkerName}.`)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Check-in did not go through.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="mx-auto max-w-3xl space-y-5" onSubmit={(event) => { void submit(event) }}>
      <div>
        <h1 className="text-3xl font-semibold">Staff check-in</h1>
        <p className="text-muted">Use this when the kiosk cannot be used, or when a visitor must see a caseworker who is not marked Available. Overrides are saved in the activity log.</p>
      </div>
      <label className="block">
        <span className="font-semibold">Visitor full name</span>
        <input className={`${fieldClass} mt-1`} value={name} autoComplete="off" onChange={(event) => setName(event.target.value)} />
      </label>
      <fieldset>
        <legend className="font-semibold">Caseworker</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {workers.map((worker) => {
            const pressed = worker.id === workerId
            return (
              <button
                key={worker.id}
                type="button"
                aria-pressed={pressed}
                className={`min-h-16 rounded-xl px-4 text-left font-semibold ${pressed ? 'bg-navy text-white' : 'bg-white ring-1 ring-line'}`}
                onClick={() => {
                  setWorkerId(worker.id)
                  setOverride(false)
                }}
              >
                {worker.fullName}
                <span className="mt-1 block text-sm font-medium opacity-80">{availabilityLabel(worker.availability)}</span>
              </button>
            )
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="font-semibold">Reason</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {REASONS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === reason}
              className={`min-h-14 rounded-xl font-semibold ${item === reason ? 'bg-navy text-white' : 'bg-white ring-1 ring-line'}`}
              onClick={() => setReason(item)}
            >
              {reasonLabel(item)}
            </button>
          ))}
        </div>
      </fieldset>
      {needsOverride && (
        <label className="flex items-start gap-3 rounded-xl bg-warn-soft p-4 text-warn">
          <input className="mt-1 h-5 w-5" type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} />
          <span>{selected?.fullName} is {selected ? availabilityLabel(selected.availability).toLowerCase() : 'unavailable'}. Check this box to check the visitor in anyway.</span>
        </label>
      )}
      {error && <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-bad">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-good-soft px-4 py-3 text-good">{message}</p>}
      <button type="submit" className={`${primaryButton} w-full`} disabled={pending}>{pending ? 'Checking in…' : 'Check in'}</button>
    </form>
  )
}
