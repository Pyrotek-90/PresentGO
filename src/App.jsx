import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Privacy, Terms } from './pages/Legal'
import { AuthProvider } from './contexts/AuthContext'
import { ChurchProvider } from './contexts/ChurchContext'
import { UpgradeProvider } from './contexts/UpgradeContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Respond from './pages/Respond'
import JoinTeam from './pages/JoinTeam'
import ProtectedRoute from './components/ProtectedRoute'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import SetEditor from './pages/SetEditor'
import PresentMode from './pages/PresentMode'
import Controller from './pages/Controller'
import ContentLibrary from './pages/ContentLibrary'
import Settings from './pages/Settings'
import Calendar from './pages/Calendar'
import Team from './pages/Team'
import GetStarted from './pages/GetStarted'
import CcliReport from './pages/CcliReport'
import Landing from './pages/Landing'
import Support from './pages/Support'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <ChurchProvider>
        <BrowserRouter>
          <UpgradeProvider>
          <Routes>
            {/* Public */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/welcome" element={<Landing />} />
            <Route path="/support" element={<Support />} />

            {/* Present display window — no chrome, no auth guard needed
                (opened programmatically, token passed via sessionStorage) */}
            <Route path="/present/:setId" element={<PresentMode />} />
            <Route path="/respond/:token" element={<Respond />} />
            <Route path="/join/:token" element={<JoinTeam />} />

            {/* Protected app routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/library" element={<Navigate to="/" replace />} />
              <Route path="/sets/:setId" element={<SetEditor />} />
              <Route path="/sets/:setId/control" element={<Controller />} />
              <Route path="/schedule" element={<Calendar />} />
              <Route path="/calendar" element={<Navigate to="/schedule" replace />} />
              <Route path="/team" element={<Team />} />
              <Route path="/media" element={<ContentLibrary />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/get-started" element={<GetStarted />} />
              <Route path="/ccli-report" element={<CcliReport />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </UpgradeProvider>
        </BrowserRouter>
      </ChurchProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
