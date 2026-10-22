// Server-side plan check for Pro features (AI tools, emails). Files under api/_lib are not routes.
// Uses the caller's own Supabase login: has_paid_plan() says whether they are on a Pro or
// Ultimate team. Before that database update has been run, the check lets calls through.

export async function checkPaid(req, feature = 'This feature') {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const auth = req.headers.authorization || ''
  if (!url || !anon) return { ok: true }   // not configured: nothing to check against
  if (!/^Bearer\s+\S+/.test(auth)) return { ok: false, status: 401, error: 'Please sign in again to use this.' }
  try {
    const r = await fetch(`${url}/rest/v1/rpc/has_paid_plan`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    })
    if (r.status === 404) return { ok: true }                 // database update not run yet
    if (r.status === 401) return { ok: false, status: 401, error: 'Please sign in again to use this.' }
    if (!r.ok) return { ok: true }                            // don't block on a hiccup
    if ((await r.json()) === true) return { ok: true }
    return { ok: false, status: 402, error: `${feature} is part of Pro. Upgrade your team in Settings → Subscription Plans.` }
  } catch {
    return { ok: true }
  }
}
