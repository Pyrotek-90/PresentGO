import { buildIcs } from '../../src/lib/ics.js'

export default async function handler(req, res) {
  const token = String(req.query.token || '').replace(/\.ics$/i, '')
  if (!/^[a-f0-9]{32,64}$/.test(token)) return res.status(404).send('Not found')

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) return res.status(500).send('Calendar feed is not configured')

  try {
    const r = await fetch(`${url}/rest/v1/rpc/calendar_feed`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return res.status(502).send('Could not load sets')
    const sets = await r.json()
    if (!Array.isArray(sets)) return res.status(404).send('Not found')

    const host = req.headers['x-forwarded-host'] || req.headers.host
    const baseUrl = host ? `https://${host}` : ''
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'inline; filename="presentgo.ics"')
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).send(buildIcs(sets, { baseUrl, calendarName: 'PresentGO Sets' }))
  } catch (err) {
    console.error('calendar feed error:', err)
    return res.status(502).send('Could not load sets')
  }
}
