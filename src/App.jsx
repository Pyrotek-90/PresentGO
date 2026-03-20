import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import ProtectedRoute from './components/ProtectedRoute'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Library from './pages/Library'
import SetEditor from './pages/SetEditor'
import PresentMode from './pages/PresentMode'
import Controller from './pages/Controller'
import ContentLibrary from './pages/ContentLibrary'
import Settings from './pages/Settings'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/auth" element={<Auth />} />

            {/* Present display window — no chrome, no auth guard needed
                (opened programmatically, token passed via sessionStorage) */}
            <Route path="/present/:setId" element={<PresentMode />} />

            {/* Protected app routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/library" element={<Library />} />
              <Route path="/sets/:setId" element={<SetEditor />} />
              <Route path="/sets/:setId/control" element={<Controller />} />
              <Route path="/media" element={<ContentLibrary />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
