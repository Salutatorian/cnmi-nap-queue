import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../api'
import { fieldClass, goodButton, primaryButton, quietButton, StatusPill, warnButton } from '../components/ui'
import { availabilityLabel, reasonLabel, REASONS, roleLabel } from '../labels'
import { formatWhen, formatWhenFull, todayInputValue } from '../time'
import type {
  AuditEvent,
  Availability,
  DailyCount,
  HistoryVisit,
  OfficeSettings,
  Reason,
  Role,
  StaffRecord,
} from '../types'

type Tab = 'staff' | 'queues' | 'reports' | 'activity' | 'settings'
const TABS: { id: Tab; label: string }[] = [
  { id: 'staff', label: 'Staff' },
  { id: 'queues', label: 'Queues' },
  { id: 'reports', label: 'Reports' },
  { id: 'activity', label: 'Activity' },
  { id: 'settings', label: 'Settings' },
]
const AVAILABILITY: Availability[] = ['available', 'busy', 'on_break', 'offline']

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : 'That action did not go through.'
}

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('staff')

  useEffect(() => {
    document.title = 'Administration — CNMI NAP Queue'
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Administration</h1>
        <p className="text-muted">Supervisor tools for accounts, queues, reports, and the waiting-room display.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`min-h-12 rounded-xl px-4 font-semibold ${tab === item.id ? 'bg-navy text-white' : 'bg-white ring-1 ring-line'}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'staff' && <StaffPanel />}
      {tab === 'queues' && <QueuePanel />}
      {tab === 'reports' && <ReportsPanel />}
      {tab === 'activity' && <ActivityPanel />}
      {tab === 'settings' && <SettingsPanel />}
    </div>
  )
}

function StaffPanel() {
  const [staff, setStaff] = useState<StaffRecord[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('caseworker')
  const [resetFor, setResetFor] = useState<number | null>(null)
  const [nextPassword, setNextPassword] = useState('')

  async function load() {
    const data = await api<{ staff: StaffRecord[] }>('/api/admin/staff')
    setStaff(data.staff)
  }

  useEffect(() => {
    load().catch((caught: unknown) => setError(messageOf(caught)))
  }, [])

  async function addAccount(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api('/api/admin/caseworkers', {
        method: 'POST',
        body: JSON.stringify({ fullName, username, password, role }),
      })
      setFullName('')
      setUsername('')
      setPassword('')
      setNotice('Account created. New accounts start as Offline.')
      await load()
    } catch (caught) {
      setError(messageOf(caught))
    }
  }

  async function toggleDisabled(person: StaffRecord) {
    setError('')
    setNotice('')
    try {
      const result = await api<{ waiting: number }>(`/api/admin/caseworkers/${person.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ disabled: !person.disabled }),
      })
      setNotice(result.waiting > 0
        ? `${person.fullName} still has ${result.waiting} open visit${result.waiting === 1 ? '' : 's'}. Reassign them from Queues.`
        : `${person.fullName} was updated.`)
      await load()
    } catch (caught) {
      setError(messageOf(caught))
    }
  }

  async function changeAvailability(person: StaffRecord, availability: Availability) {
    setError('')
    try {
      await api(`/api/admin/caseworkers/${person.id}/availability`, {
        method: 'PATCH',
        body: JSON.stringify({ availability }),
      })
      await load()
    } catch (caught) {
      setError(messageOf(caught))
    }
  }

  async function resetPassword(person: StaffRecord) {
    setError('')
    setNotice('')
    try {
      await api(`/api/admin/caseworkers/${person.id}/password`, {
        method: 'POST',
        body: JSON.stringify({ password: nextPassword }),
      })
      setResetFor(null)
      setNextPassword('')
      setNotice(`Password updated for ${person.fullName}. Their open sessions were signed out.`)
    } catch (caught) {
      setError(messageOf(caught))
    }
  }

  return (
    <div className="space-y-5">
      <form className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-line md:grid-cols-2" onSubmit={(event) => { void addAccount(event) }}>
        <h2 className="md:col-span-2 text-xl font-semibold">Add an account</h2>
        <p className="md:col-span-2 text-sm text-muted">Choose Supervisor to give someone an admin login. They sign in with the username and password you set here, then use Administration to add more people.</p>
        <input className={fieldClass} placeholder="Full name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
        <input className={fieldClass} placeholder="username" autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} />
        <input className={fieldClass} placeholder="Temporary password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <select className={fieldClass} value={role} onChange={(event) => setRole(event.target.value as Role)}>
          <option value="caseworker">Caseworker</option>
          <option value="receptionist">Receptionist</option>
          <option value="supervisor">Supervisor (admin)</option>
        </select>
        <button type="submit" className={primaryButton}>Add account</button>
      </form>
      {error && <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-bad">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-good-soft px-4 py-3 text-good">{notice}</p>}
      <div className="space-y-3">
        {staff.map((person) => (
          <article key={person.id} className="rounded-2xl bg-white p-4 ring-1 ring-line">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xl font-semibold">{person.fullName}</p>
                <p className="text-sm text-muted">{person.username} · {roleLabel(person.role)} · {person.disabled ? 'Disabled' : 'Active'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  className="min-h-12 rounded-xl border border-line px-3"
                  value={person.availability}
                  disabled={person.disabled}
                  onChange={(event) => { void changeAvailability(person, event.target.value as Availability) }}
                >
                  {AVAILABILITY.map((availability) => (
                    <option key={availability} value={availability}>{availabilityLabel(availability)}</option>
                  ))}
                </select>
                <button type="button" className={person.disabled ? goodButton : warnButton} onClick={() => { void toggleDisabled(person) }}>
                  {person.disabled ? 'Enable' : 'Disable'}
                </button>
                <button type="button" className={quietButton} onClick={() => { setResetFor(person.id); setNextPassword('') }}>Reset password</button>
              </div>
            </div>
            {resetFor === person.id && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input className={`${fieldClass} max-w-sm`} type="password" placeholder="New password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} />
                <button type="button" className={primaryButton} onClick={() => { void resetPassword(person) }}>Save password</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}

function QueuePanel() {
  const [visits, setVisits] = useState<HistoryVisit[]>([])
  const [workers, setWorkers] = useState<StaffRecord[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [targetId, setTargetId] = useState('')
  const [note, setNote] = useState('')
  const [fullName, setFullName] = useState('')
  const [reason, setReason] = useState<Reason | ''>('')
  const [error, setError] = useState('')

  async function load() {
    const [queue, staff] = await Promise.all([
      api<{ visits: HistoryVisit[] }>('/api/admin/queues'),
      api<{ staff: StaffRecord[] }>('/api/admin/staff'),
    ])
    setVisits(queue.visits)
    setWorkers(staff.staff.filter((person) => person.role === 'caseworker' && !person.disabled))
  }

  useEffect(() => {
    load().catch((caught: unknown) => setError(messageOf(caught)))
  }, [])

  const selected = visits.find((visit) => visit.id === selectedId) ?? null

  async function run(action: () => Promise<void>) {
    setError('')
    try {
      await action()
      setNote('')
      await load()
    } catch (caught) {
      setError(messageOf(caught))
      await load().catch(() => undefined)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-2">
        {visits.length === 0 && <p className="text-muted">No one is waiting, being called, or marked missed.</p>}
        {visits.map((visit) => (
          <button
            key={visit.id}
            type="button"
            className={`block w-full rounded-2xl p-4 text-left ring-1 ${visit.id === selectedId ? 'bg-navy text-white ring-navy' : 'bg-white ring-line'}`}
            onClick={() => {
              setSelectedId(visit.id)
              setFullName(visit.fullName)
              setReason(visit.reason)
              setTargetId(String(visit.caseworkerId))
            }}
          >
            <span className="text-xl font-semibold">{visit.fullName}</span>
            <span className="mt-1 block text-sm opacity-80">{visit.caseworkerName} · {reasonLabel(visit.reason)} · {formatWhen(visit.checkedInAt)}</span>
            <span className="mt-2 inline-block"><StatusPill status={visit.status} /></span>
          </button>
        ))}
      </div>
      <aside className="rounded-2xl bg-white p-4 ring-1 ring-line">
        {!selected ? <p className="text-muted">Select a visit to reassign or correct it.</p> : (
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">{selected.fullName}</h2>
            <p className="text-sm text-muted">With {selected.caseworkerName}</p>
            <label className="block text-sm font-semibold">
              Reassign to
              <select className={`${fieldClass} mt-1`} value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.fullName}</option>)}
              </select>
            </label>
            <button type="button" className={primaryButton} onClick={() => {
              void run(() => api(`/api/admin/queue/${selected.id}/reassign`, {
                method: 'POST',
                body: JSON.stringify({ caseworkerId: Number(targetId), version: selected.version }),
              }))
            }}>Reassign</button>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={quietButton} onClick={() => { void run(() => api(`/api/queue/${selected.id}/call`, { method: 'POST', body: JSON.stringify({ version: selected.version }) })) }}>Call</button>
              <button type="button" className={goodButton} onClick={() => { void run(() => api(`/api/queue/${selected.id}/done`, { method: 'POST', body: JSON.stringify({ version: selected.version }) })) }}>Done</button>
              <button type="button" className={warnButton} onClick={() => { void run(() => api(`/api/queue/${selected.id}/missed`, { method: 'POST', body: JSON.stringify({ version: selected.version }) })) }}>Missed</button>
              <button type="button" className={quietButton} onClick={() => { void run(() => api(`/api/queue/${selected.id}/return`, { method: 'POST', body: JSON.stringify({ version: selected.version }) })) }}>Return</button>
            </div>
            <label className="block text-sm font-semibold">
              Corrected name
              <input className={`${fieldClass} mt-1`} value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </label>
            <label className="block text-sm font-semibold">
              Reason
              <select className={`${fieldClass} mt-1`} value={reason} onChange={(event) => setReason(event.target.value as Reason)}>
                {REASONS.map((item) => <option key={item} value={item}>{reasonLabel(item)}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Note
              <input className={`${fieldClass} mt-1`} value={note} placeholder="Why this change is being made" onChange={(event) => setNote(event.target.value)} />
            </label>
            <button type="button" className={quietButton} onClick={() => {
              void run(() => api(`/api/admin/check-ins/${selected.checkInId}`, {
                method: 'PATCH',
                body: JSON.stringify({ fullName, reason, note, version: selected.version }),
              }))
            }}>Save correction</button>
            <button type="button" className={warnButton} onClick={() => {
              void run(async () => {
                await api(`/api/admin/queue/${selected.id}/cancel`, {
                  method: 'POST',
                  body: JSON.stringify({ note, version: selected.version }),
                })
                setSelectedId(null)
              })
            }}>Cancel check-in</button>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-bad">{error}</p>}
      </aside>
    </div>
  )
}

function ReportsPanel() {
  const [date, setDate] = useState(todayInputValue)
  const [counts, setCounts] = useState<DailyCount[]>([])
  const [files, setFiles] = useState<{ caseworkerId: number; fullName: string; url: string }[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ counts: DailyCount[] }>(`/api/admin/reports?date=${date}`)
      .then((data) => setCounts(data.counts))
      .catch((caught: unknown) => setError(messageOf(caught)))
  }, [date])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="font-semibold">Date</span>
          <input className={`${fieldClass} mt-1`} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <button type="button" className={primaryButton} onClick={() => {
          void api<{ files: { caseworkerId: number; fullName: string; url: string }[] }>('/api/admin/logs/export', {
            method: 'POST',
            body: JSON.stringify({ date }),
          }).then((data) => setFiles(data.files)).catch((caught: unknown) => setError(messageOf(caught)))
        }}>Export daily logs</button>
      </div>
      {error && <p className="text-bad">{error}</p>}
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
        <table className="w-full min-w-[680px] text-left">
          <thead className="bg-paper text-sm text-muted">
            <tr>
              <th className="px-4 py-3">Caseworker</th>
              <th className="px-4 py-3">Waiting</th>
              <th className="px-4 py-3">Calling</th>
              <th className="px-4 py-3">Missed</th>
              <th className="px-4 py-3">Completed</th>
              <th className="px-4 py-3">Cancelled</th>
              <th className="px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((row) => (
              <tr key={row.caseworkerId} className="border-t border-line">
                <td className="px-4 py-3 font-semibold">{row.fullName}</td>
                <td className="px-4 py-3">{row.waiting}</td>
                <td className="px-4 py-3">{row.calling}</td>
                <td className="px-4 py-3">{row.missed}</td>
                <td className="px-4 py-3">{row.completed}</td>
                <td className="px-4 py-3">{row.cancelled}</td>
                <td className="px-4 py-3">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((file) => (
            <li key={file.caseworkerId}>
              <a className="font-semibold text-navy underline" href={file.url}>{file.fullName}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ActivityPanel() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ events: AuditEvent[] }>('/api/admin/audit?limit=100')
      .then((data) => setEvents(data.events))
      .catch((caught: unknown) => setError(messageOf(caught)))
  }, [])

  return (
    <div className="space-y-2">
      {error && <p className="text-bad">{error}</p>}
      {events.map((event) => (
        <article key={event.id} className="rounded-xl bg-white px-4 py-3 ring-1 ring-line">
          <p className="font-semibold">{event.action.replaceAll('_', ' ')}</p>
          <p className="text-sm text-muted">{event.actorName ?? 'System'} · {formatWhenFull(event.createdAt)}</p>
          {event.detail && <p className="mt-1 break-words text-sm">{event.detail}</p>}
        </article>
      ))}
    </div>
  )
}

function SettingsPanel() {
  const [settings, setSettings] = useState<OfficeSettings | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api<OfficeSettings>('/api/admin/settings')
      .then(setSettings)
      .catch((caught: unknown) => setError(messageOf(caught)))
  }, [])

  if (!settings) return error ? <p className="text-bad">{error}</p> : <p>Loading settings…</p>

  async function save(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      const saved = await api<OfficeSettings>('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      setSettings(saved)
      setNotice('Settings saved. The waiting-room television picks them up immediately. Audio still needs Enable audio on the TV once after it loads.')
    } catch (caught) {
      setError(messageOf(caught))
    }
  }

  return (
    <form className="max-w-xl space-y-4 rounded-2xl bg-white p-5 ring-1 ring-line" onSubmit={(event) => { void save(event) }}>
      <label className="block">
        <span className="font-semibold">Ping volume ({Math.round(settings.chimeVolume * 100)}%)</span>
        <input className="mt-2 w-full" type="range" min="0" max="1" step="0.05" value={settings.chimeVolume} onChange={(event) => setSettings({ ...settings, chimeVolume: Number(event.target.value) })} />
      </label>
      <label className="block">
        <span className="font-semibold">Green “just called” highlight, in seconds</span>
        <input className={`${fieldClass} mt-1`} type="number" min={5} max={120} value={settings.highlightSeconds} onChange={(event) => setSettings({ ...settings, highlightSeconds: Number(event.target.value) })} />
      </label>
      <label className="block">
        <span className="font-semibold">Staff inactivity timeout, in minutes</span>
        <input className={`${fieldClass} mt-1`} type="number" min={5} max={240} value={settings.sessionTimeoutMinutes} onChange={(event) => setSettings({ ...settings, sessionTimeoutMinutes: Number(event.target.value) })} />
      </label>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="h-5 w-5" checked={settings.demoHintEnabled} onChange={(event) => setSettings({ ...settings, demoHintEnabled: event.target.checked })} />
        <span className="font-semibold">Show demonstration passwords on the server computer’s sign-in page</span>
      </label>
      {error && <p className="text-bad">{error}</p>}
      {notice && <p className="text-good">{notice}</p>}
      <button type="submit" className={primaryButton}>Save settings</button>
    </form>
  )
}
