import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/Logo'

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
)

const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
    <path d="M13.035 9.91c-.02-2.006 1.638-2.976 1.712-3.023-0.933-1.365-2.384-1.552-2.9-1.572-1.237-.126-2.415.727-3.042.727-.627 0-1.597-.71-2.626-.69-1.352.02-2.6.786-3.296 1.997-1.404 2.44-.361 6.063 1.008 8.044.667.963 1.463 2.045 2.507 2.006 1.006-.04 1.386-.648 2.603-.648 1.217 0 1.558.648 2.625.628 1.083-.02 1.764-.982 2.425-1.948.766-1.116 1.082-2.196 1.1-2.252-.024-.01-2.11-.812-2.116-3.269zM10.99 3.793c.554-.672.928-1.604.826-2.533-.799.033-1.765.532-2.337 1.204-.513.594-.962 1.543-.84 2.452.89.069 1.797-.453 2.351-1.123z"/>
  </svg>
)

export default function Auth() {
  const { signIn, signUp, signInWithGoogle, signInWithApple } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(null)
  const [confirmed, setConfirmed] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (tab === 'login') {
      const { error } = await signIn(email, password)
      if (error) { setError(error.message); setLoading(false); return }
      navigate('/')
    } else {
      const { error } = await signUp(email, password)
      setLoading(false)
      if (error) { setError(error.message); return }
      setConfirmed(true)
    }
  }

  const handleOAuth = async (provider) => {
    setError(null)
    setOauthLoading(provider)
    const fn = provider === 'google' ? signInWithGoogle : signInWithApple
    const { error } = await fn()
    if (error) { setError(error.message); setOauthLoading(null) }
    // On success, Supabase redirects — no need to navigate manually
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center">
            <Logo size={38} color="var(--color-accent)" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold">PresentGO</h1>
            <p className="text-muted text-sm mt-1">Create and display presentations in a breeze.</p>
          </div>
        </div>

        {/* Card */}
        <div className="card space-y-5">
          {/* Tabs */}
          <div className="flex rounded-lg overflow-hidden border border-border">
            {['login', 'register'].map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); setConfirmed(false) }}
                className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
                  tab === t ? 'bg-accent text-white' : 'bg-card text-muted hover:text-[#f5f5f5]'
                }`}
              >
                {t === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* OAuth buttons */}
          <div className="space-y-2">
            <button
              onClick={() => handleOAuth('google')}
              disabled={!!oauthLoading}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              <GoogleIcon />
              {oauthLoading === 'google' ? 'Redirecting…' : 'Continue with Google'}
            </button>
            <button
              onClick={() => handleOAuth('apple')}
              disabled={!!oauthLoading}
              className="w-full flex items-center justify-center gap-3 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white font-medium py-2.5 px-4 rounded-lg border border-border transition-colors disabled:opacity-50"
            >
              <AppleIcon />
              {oauthLoading === 'apple' ? 'Redirecting…' : 'Continue with Apple'}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted">or use email</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {confirmed ? (
            <div className="text-center space-y-2 py-4">
              <p className="text-green-400 font-medium">Check your email!</p>
              <p className="text-muted text-sm">We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.</p>
            </div>
          ) : (
            <form onSubmit={handle} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input
                  className="input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted">
          PresentGO · Presentations on the go
        </p>
      </div>
    </div>
  )
}
