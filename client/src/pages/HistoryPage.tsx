import { useEffect, useState } from 'react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { fieldClass, primaryButton, quietButton, StatusPill } from '../components/ui'
import { reasonLabel } from '../labels'
import { formatWhenFull, todayInputValue } from '../time'
import type { HistoryVisit, StaffRecord } from '../types'

export function HistoryPage() {
  const { user } = useAuth()
  const [date, setDate] = useState(todayInputValue)
  const [query, setQuery] = useState('')
  const [caseworkerId, setCaseworkerId] = useState('')
  const [staff, setStaff] = useState<StaffRecord[]>([])
  const [visits, setVisits] = useState<HistoryVisit[]>([])
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    document.title = 'History — CNMI NAP Queue'
    if (user?.role === 'supervisor') {
      api<{ staff: StaffRecord[] }>('/api/admin/staff').then((data) => {
        setStaff(data.staff.filter((person) => person.role === 'caseworker'))
      }).catch(() => undefined)
    }
  }, [user?.role])

  useEffect(() => {
    const params = new URLSearchParams({ date })
    if (query.trim()) params.set('q', query.trim())
    if (user?.role === 'supervisor' && caseworkerId) params.set('caseworkerId', caseworkerId)
    api<{ visits: HistoryVisit[] }>(`/api/history?${params.toString()}`)
      .then((data) => {
        setVisits(data.visits)
        setError('')
      })
      .catch((caught: unknown) => {
        setError(caught instanceof ApiError ? caught.message : 'History could not be loaded.')
      })
  }, [date, query, caseworkerId, user?.role, reloadKey])

  const canDownload = user?.role === 'caseworker' || caseworkerId !== ''
  const logParams = new URLSearchParams({ date })
  if (caseworkerId) logParams.set('caseworkerId', caseworkerId)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Visitor history</h1>
          <p className="text-muted">Dates use Saipan time. Completed visits stay in the record.</p>
        </div>
        {canDownload ? (
          <a className={quietButton} href={`/api/me/log?${logParams.toString()}`}>Download daily log</a>
        ) : (
          <p className="text-sm text-muted">Choose a caseworker to download that log.</p>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="font-semibold">Date</span>
          <input className={fieldClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label className="block">
          <span className="font-semibold">Name</span>
          <input className={fieldClass} value={query} placeholder="Search by name" onChange={(event) => setQuery(event.target.value)} />
        </label>
        {user?.role === 'supervisor' && (
          <label className="block">
            <span className="font-semibold">Caseworker</span>
            <select className={fieldClass} value={caseworkerId} onChange={(event) => setCaseworkerId(event.target.value)}>
              <option value="">All caseworkers</option>
              {staff.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
            </select>
          </label>
        )}
      </div>
      {error && <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-bad">{error}</p>}
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
        <table className="w-full min-w-[720px] text-left">
          <thead className="bg-paper text-sm text-muted">
            <tr>
              <th className="px-4 py-3">Visitor</th>
              <th className="px-4 py-3">Caseworker</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Checked in</th>
              <th className="px-4 py-3">Called</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {visits.length === 0 ? (
              <tr><td className="px-4 py-6 text-muted" colSpan={6}>No visits for this search.</td></tr>
            ) : visits.map((visit) => (
              <tr key={visit.id} className="border-t border-line">
                <td className="px-4 py-3 font-semibold">{visit.fullName}</td>
                <td className="px-4 py-3">{visit.caseworkerName}</td>
                <td className="px-4 py-3">{reasonLabel(visit.reason)}</td>
                <td className="px-4 py-3">{formatWhenFull(visit.checkedInAt)}</td>
                <td className="px-4 py-3">{visit.calledAt ? formatWhenFull(visit.calledAt) : '—'}</td>
                <td className="px-4 py-3"><StatusPill status={visit.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className={primaryButton} onClick={() => setReloadKey((current) => current + 1)}>Refresh</button>
    </div>
  )
}
