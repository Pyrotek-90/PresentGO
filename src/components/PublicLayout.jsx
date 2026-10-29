import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Wordmark from './Wordmark'

// Frame for the public pages (landing page and Support). Always dark, the brand look, whatever
// theme the signed-in app uses: the theme colors are pinned to the dark palette inside it.
const DARK = {
  '--color-bg': '#0b0f12',
  '--color-surface': '#11161a',
  '--color-card': '#161d22',
  '--color-border': '#26313a',
  '--color-text': '#f5f5f5',
  '--color-muted': '#9aa8b1',
}

export default function PublicLayout({ children }) {
  const { user } = useAuth()
  return (
    <div style={DARK} className="h-full overflow-y-auto bg-bg text-primary">
      <header className="sticky top-0 z-30 border-b border-border backdrop-blur" style={{ background: 'rgba(11,15,18,0.88)' }}>
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4" aria-label="Main">
          <Link to="/welcome" className="mr-auto rounded-md hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="StaffList home">
            <Wordmark className="text-[24px] sm:text-[28px]" />
          </Link>
          <Link to="/welcome#features" className="hidden md:inline text-sm text-muted hover:text-primary">Features</Link>
          <Link to="/welcome#pricing" className="hidden md:inline text-sm text-muted hover:text-primary">Pricing</Link>
          <Link to="/support" className="text-sm text-muted hover:text-primary">Support</Link>
          {user
            ? <Link to="/" className="btn-primary text-sm !px-4 !py-2">Open StaffList</Link>
            : <Link to="/auth" className="btn-primary text-sm !px-4 !py-2">Log in</Link>}
        </nav>
      </header>

      <main>{children}</main>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row gap-6 sm:items-center">
          <div className="space-y-2 mr-auto">
            <Wordmark tagline className="text-[36px]" />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <Link to="/welcome#features" className="hover:text-primary">Features</Link>
            <Link to="/welcome#pricing" className="hover:text-primary">Pricing</Link>
            <Link to="/support" className="hover:text-primary">Support</Link>
            <Link to="/privacy" className="hover:text-primary">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-primary">Terms of Use</Link>
            <Link to={user ? '/' : '/auth'} className="hover:text-primary">{user ? 'Open StaffList' : 'Log in'}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
