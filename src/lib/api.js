import { supabase } from './supabase.js'

// The StaffList API (/api/v1), shared with the iOS app. Heavy work (reading charts, building
// slides, AI, email, exports) happens there so the web app stays light.
//   api('songs/parse', { json: { text } })
//   api('songs/import-pdf', { body: file, query: { filename } })
// Returns the parsed JSON; throws Error(message) with .status on a failed response.
export async function api(route, { json, body, query, method = 'POST' } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { Authorization: `Bearer ${session?.access_token || ''}` }
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  else if (body) headers['Content-Type'] = 'application/octet-stream'
  const qs = query ? `?${new URLSearchParams(query)}` : ''
  const r = await fetch(`/api/v1/${route}${qs}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : body,
  })
  const out = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(out.error || 'Something went wrong. Try again.'), { status: r.status })
  return out
}
