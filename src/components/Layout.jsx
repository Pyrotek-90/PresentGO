import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { LayoutList, Library, LogOut, Menu, X, Tv, FolderOpen, Settings, Sun, Moon, User, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

const navItems = [
  { to: '/',        label: 'Sets',            icon: LayoutList },
  { to: '/library', label: 'Song Library',    icon: Library    },
  { to: '/media',   label: 'Content Library', icon: FolderOpen },
]

export default function Layout({ children }) {
  const { user, signOut } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef(null)

  const handleSignOut = async () => {
    setProfileOpen(false)
    await signOut()
    navigate('/auth')
  }

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Account'

  return (
    <div className="flex h-full flex-col">
      {/* Top nav */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <Tv className="text-accent" size={22} />
          <span className="text-lg font-semibold tracking-tight text-primary">PresentGO</span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === to
                  ? 'bg-accent/20 text-accent-light'
                  : 'text-muted hover:text-primary hover:bg-card'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Profile dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(o => !o)}
              className="btn-ghost flex items-center gap-2 text-sm px-3 py-2"
            >
              <div className="w-7 h-7 rounded-full bg-accent/20 text-accent-light flex items-center justify-center text-xs font-semibold">
                {displayName[0]?.toUpperCase()}
              </div>
              <span className="hidden md:block text-sm text-primary max-w-[140px] truncate">{displayName}</span>
              <ChevronDown size={14} className={`text-muted transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                {/* User info */}
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-medium text-primary truncate">{displayName}</p>
                  <p className="text-xs text-muted truncate">{user?.email}</p>
                </div>

                {/* Theme toggle */}
                <button
                  onClick={toggleTheme}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-muted hover:text-primary hover:bg-surface transition-colors"
                >
                  {isDark ? <Sun size={15} /> : <Moon size={15} />}
                  {isDark ? 'Light Mode' : 'Dark Mode'}
                </button>

                {/* Settings link */}
                <Link
                  to="/settings"
                  onClick={() => setProfileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    location.pathname === '/settings'
                      ? 'text-accent-light bg-accent/10'
                      : 'text-muted hover:text-primary hover:bg-surface'
                  }`}
                >
                  <Settings size={15} />
                  Settings
                </Link>

                {/* Sign out */}
                <div className="border-t border-border">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-muted hover:text-primary hover:bg-surface transition-colors"
                  >
                    <LogOut size={15} />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden btn-ghost p-2"
            onClick={() => setMenuOpen(o => !o)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {menuOpen && (
        <nav className="md:hidden bg-surface border-b border-border px-4 py-2 flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === to
                  ? 'bg-accent/20 text-accent-light'
                  : 'text-muted hover:text-primary hover:bg-card'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
          {/* Mobile profile section */}
          <div className="border-t border-border mt-1 pt-1">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:text-primary hover:bg-card transition-colors"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </button>
            <Link
              to="/settings"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:text-primary hover:bg-card transition-colors"
            >
              <Settings size={16} />
              Settings
            </Link>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:text-primary hover:bg-card transition-colors"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </nav>
      )}

      {/* Page content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
