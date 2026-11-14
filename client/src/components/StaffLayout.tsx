import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { roleLabel } from '../labels'
import { useServerOnline } from '../online'
import { ConnectionBanner, DemoBanner } from './ui'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 font-semibold ${isActive ? 'bg-white text-navy' : 'text-white hover:bg-white/10'}`

export function StaffLayout() {
  const online = useServerOnline()
  const { user, logout } = useAuth()

  useEffect(() => {
    const id = window.setInterval(() => {
      api('/api/auth/session').catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) return
      })
    }, 60_000)
    return () => window.clearInterval(id)
  }, [user])

  if (!user) return null

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <ConnectionBanner online={online} />
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-sm text-white/70">CNMI Nutrition Assistance Program</p>
            <p className="text-2xl font-semibold">Queue desk</p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Staff">
            {user.role !== 'receptionist' && <NavLink to="/staff/queue" className={linkClass}>My queue</NavLink>}
            {user.role !== 'receptionist' && <NavLink to="/staff/history" className={linkClass}>History</NavLink>}
            {user.role !== 'caseworker' && <NavLink to="/staff/check-in" className={linkClass}>Check in</NavLink>}
            {user.role === 'supervisor' && <NavLink to="/staff/admin" className={linkClass}>Administration</NavLink>}
          </nav>
          <div className="text-right">
            <p className="font-semibold">{user.fullName}</p>
            <p className="text-sm text-white/75">{roleLabel(user.role)}</p>
            <button type="button" className="mt-2 rounded-lg bg-white/10 px-3 py-2 font-semibold hover:bg-white/20" onClick={() => { void logout() }}>
              Log out
            </button>
          </div>
        </div>
        <div className="h-1 bg-gold" />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-sm text-muted">
        <a className="font-semibold text-navy underline" href="/paper">Paper sign-in fallback</a>
      </footer>
    </div>
  )
}
