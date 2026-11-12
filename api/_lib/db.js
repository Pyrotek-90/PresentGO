// A Supabase client that acts as the signed-in caller (their access token), so row-level
// security decides what they can read and change — the same rules as in the apps.
import { createClient } from '@supabase/supabase-js'
import { supabaseEnv } from './auth.js'

export function userDb(req) {
  const { url, anon } = supabaseEnv()
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
