import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isOfflineEnabled, clearOfflineData } from '../lib/offline'
import { downloadForOffline } from '../lib/offlineSync'

const USER_KEY = 'presentgo.cachedUser'
const readCachedUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null } }
const cacheUser = u => { try { u ? localStorage.setItem(USER_KEY, JSON.stringify({ id: u.id, email: u.email, user_metadata: u.user_metadata })) : localStorage.removeItem(USER_KEY) } catch { /* ignore */ } }

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // MOCK MODE — set to true to bypass login during development
    const isMockMode = false
    if (isMockMode) {
      setUser({ id: 'mock-user-id', email: 'demo@presentgo.app' })
      setLoading(false)
      return
    }

    const timeout = setTimeout(() => setLoading(false), 5000)
    const offlineUser = () => (isOfflineEnabled() && !navigator.onLine ? readCachedUser() : null)
    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout)
      const u = session?.user ?? offlineUser()
      if (session?.user) {
        cacheUser(session.user)
        if (isOfflineEnabled() && navigator.onLine) downloadForOffline(session.user.id).catch(() => {})
      }
      setUser(u)
      setLoading(false)
    }).catch(() => { clearTimeout(timeout); setUser(offlineUser()); setLoading(false) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && isOfflineEnabled() && !navigator.onLine) return
      if (session?.user) cacheUser(session.user)
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = (email, password) =>
    supabase.auth.signUp({ email, password })

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // Request Google API scopes needed across the app:
        // - drive.readonly  → import documents / presentations from Drive
        // - photoslibrary.readonly → import images into Loops from Google Photos
        scopes: [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/photoslibrary.readonly',
        ].join(' '),
      },
    })

  const signInWithApple = () =>
    supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: window.location.origin } })

  const signOut = async () => {
    cacheUser(null)
    await clearOfflineData()
    return supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signInWithGoogle, signInWithApple, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
