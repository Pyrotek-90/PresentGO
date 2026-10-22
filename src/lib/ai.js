import { supabase } from './supabase'

// Calls one of the AI functions (/api/cleanup-lyrics, translate-lyrics, song-details,
// worship-note) with the signed-in person's login, so the server can check the team's plan.
export async function aiFetch(path, body) {
  let token = null
  try { token = (await supabase.auth.getSession()).data.session?.access_token || null } catch { /* signed out */ }
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}
