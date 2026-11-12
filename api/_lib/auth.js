// Who is calling? Both the web app and the iOS app send the user's Supabase access token as
// "Authorization: Bearer <token>". Supabase checks it, so the API never handles passwords.

const cache = new Map()   // token -> { user, until }; avoids re-checking within one warm instance

export function supabaseEnv() {
  return {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    anon: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
  }
}

// Returns { user } or { status, error }.
export async function requireUser(req) {
  const auth = req.headers.authorization || ''
  const token = auth.match(/^Bearer\s+(\S+)$/)?.[1]
  if (!token) return { status: 401, error: 'Please sign in again.' }

  const hit = cache.get(token)
  if (hit && hit.until > Date.now()) return { user: hit.user }

  const { url, anon } = supabaseEnv()
  if (!url || !anon) return { status: 500, error: 'Sign-in is not configured on this server.' }
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    })
    if (r.status === 401 || r.status === 403) return { status: 401, error: 'Please sign in again.' }
    if (!r.ok) return { status: 502, error: 'Could not check your sign-in. Try again.' }
    const user = await r.json()
    if (cache.size > 500) cache.clear()
    cache.set(token, { user, until: Date.now() + 60_000 })
    return { user }
  } catch {
    return { status: 502, error: 'Could not check your sign-in. Try again.' }
  }
}
