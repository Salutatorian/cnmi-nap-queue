import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, setCsrf, setUnauthorizedHandler } from './api'
import { homeFor } from './labels'
import type { Role, StaffUser } from './types'

type SessionPayload = {
  user: StaffUser
  csrfToken: string
  sessionTimeoutMinutes: number
}

type AuthState = {
  user: StaffUser | null
  ready: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null)
  const [ready, setReady] = useState(false)

  const refresh = async () => {
    const data = await api<SessionPayload>('/api/auth/me')
    setCsrf(data.csrfToken)
    setUser(data.user)
  }

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setCsrf('')
      setUser(null)
    })
    refresh()
      .catch(() => {
        setCsrf('')
        setUser(null)
      })
      .finally(() => setReady(true))
  }, [])

  const value = useMemo<AuthState>(() => ({
    user,
    ready,
    refresh,
    login: async (username, password) => {
      const data = await api<SessionPayload>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      setCsrf(data.csrfToken)
      setUser(data.user)
    },
    logout: async () => {
      await api('/api/auth/logout', { method: 'POST', body: '{}' })
      setCsrf('')
      setUser(null)
    },
  }), [user, ready])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is missing')
  return value
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <p className="p-8 text-lg">Checking your session…</p>
  if (!user) return <Navigate to="/staff/login" replace state={{ from: location.pathname }} />
  return children
}

export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, ready } = useAuth()
  if (!ready) return <p className="p-8 text-lg">Checking your session…</p>
  if (!user) return <Navigate to="/staff/login" replace />
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return children
}
