import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { DemoBanner } from '../components/ui'
import type { Role } from '../types'

type Hint = {
  password: string
  accounts: { username: string; fullName: string; role: Role }[]
}

export function LoginPage() {
  const { user, ready, login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [hint, setHint] = useState<Hint | null>(null)

  useEffect(() => {
    document.title = 'Staff sign in — CNMI NAP Queue'
    api<Hint>('/api/public/demo-hint').then(setHint).catch(() => setHint(null))
  }, [])

  if (!ready) return <p className="p-8 text-lg">Checking your session…</p>
  if (user) return <Navigate to={user.role === 'receptionist' ? '/staff/check-in' : '/staff/queue'} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      await login(username.trim(), password)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Sign-in did not go through.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto flex max-w-lg flex-col px-4 py-12">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">CNMI Nutrition Assistance Program</p>
        <h1 className="mt-2 text-4xl font-semibold">Staff sign in</h1>
        <p className="mt-2 text-muted">Signing in does not change your availability. Set Available on your queue page when you are ready for visitors.</p>
        <form className="mt-8 space-y-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-line" onSubmit={(event) => { void submit(event) }}>
          <label className="block">
            <span className="font-semibold">Username</span>
            <input className="mt-1 min-h-14 w-full rounded-xl border border-line px-4 text-lg" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label className="block">
            <span className="font-semibold">Password</span>
            <input className="mt-1 min-h-14 w-full rounded-xl border border-line px-4 text-lg" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-bad">{error}</p>}
          <button type="submit" className="min-h-14 w-full rounded-xl bg-navy text-lg font-semibold text-white disabled:opacity-50" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {hint && (
          <details className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-line">
            <summary className="cursor-pointer font-semibold">Demonstration accounts on this computer</summary>
            <p className="mt-3 text-sm text-muted">These fictional accounts are shown only when the sign-in page is opened on the server computer. Turn this off in Administration settings before any real use.</p>
            <p className="mt-2 font-semibold">Password: {hint.password}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {hint.accounts.map((account) => (
                <li key={account.username}>{account.username} — {account.fullName}</li>
              ))}
            </ul>
          </details>
        )}
      </main>
    </div>
  )
}
