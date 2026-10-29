import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useChurch } from '../contexts/ChurchContext'
import ChurchSetup from './ChurchSetup'
import Landing from '../pages/Landing'
import { isNativeApp } from '../lib/native'

const Spinner = () => (
  <div className="flex h-full items-center justify-center">
    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
  </div>
)

export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  const church = useChurch()
  const { pathname } = useLocation()

  if (loading) return <Spinner />
  // Signed out: on the web, the site's front door is the landing page (its Log in button opens
  // the sign-in screen). The iPad / iPhone app goes straight to sign-in.
  if (!user) return pathname === '/' && !isNativeApp() ? <Landing /> : <Navigate to="/auth" replace />
  if (church.loading) return <Spinner />
  // Signed in but not part of any church yet: start one, or wait to be added to a team.
  if (!church.legacy && !church.churches.length) return <ChurchSetup />
  return <Outlet />
}
