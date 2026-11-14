import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth, RequireAuth, RequireRole } from './auth'
import { StaffLayout } from './components/StaffLayout'
import { homeFor } from './labels'
import { AdminPage } from './pages/AdminPage'
import { DashboardPage } from './pages/DashboardPage'
import { HistoryPage } from './pages/HistoryPage'
import { KioskPage } from './pages/KioskPage'
import { LoginPage } from './pages/LoginPage'
import { PaperPage } from './pages/PaperPage'
import { StaffCheckInPage } from './pages/StaffCheckInPage'
import { TvPage } from './pages/TvPage'

function StaffHome() {
  const { user } = useAuth()
  if (!user) return null
  return <Navigate to={homeFor(user.role)} replace />
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/kiosk" replace />} />
      <Route path="/kiosk" element={<KioskPage />} />
      <Route path="/tv" element={<TvPage />} />
      <Route path="/paper" element={<PaperPage />} />
      <Route path="/staff/login" element={<LoginPage />} />
      <Route path="/staff" element={<RequireAuth><StaffLayout /></RequireAuth>}>
        <Route index element={<StaffHome />} />
        <Route path="queue" element={<DashboardPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="check-in" element={<RequireRole roles={['receptionist', 'supervisor']}><StaffCheckInPage /></RequireRole>} />
        <Route path="admin" element={<RequireRole roles={['supervisor']}><AdminPage /></RequireRole>} />
      </Route>
      <Route path="*" element={<Navigate to="/kiosk" replace />} />
    </Routes>
  )
}
