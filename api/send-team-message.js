// Emails a message from the worship leader to team members who don't have a StaffList account yet
// (members with an account get it in the app). Uses Resend like send-invites.
// The caller's own Supabase login is used for the database read, so row-level security limits it to their team.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const resendKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!resendKey || !from) return res.status(501).json({ error: 'not_configured' })
  if (!url || !anon) return res.status(500).json({ error: 'server' })

  const auth = req.headers.authorization || ''
  if (!/^Bearer\s+\S+/.test(auth)) return res.status(401).json({ error: 'auth' })
  const ids = (req.body?.ids || []).filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100)
  const subject = String(req.body?.subject || '').trim().slice(0, 150)
  const message = String(req.body?.message || '').trim().slice(0, 2000)
  if (!ids.length || !message) return res.status(400).json({ error: 'bad_request' })

  const sb = (path, init = {}) => fetch(`${url}${path}`, {
    ...init, headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(10000),
  })

  try {
    const who = await sb('/auth/v1/user')
    if (!who.ok) return res.status(401).json({ error: 'auth' })
    const user = await who.json()
    const leader = user.user_metadata?.full_name || (user.email || '').split('@')[0] || 'Your worship leader'

    const r = await sb(`/rest/v1/team_members?id=in.(${ids.join(',')})&select=id,name,email`)
    if (!r.ok) return res.status(502).json({ error: 'load' })
    const rows = await r.json()

    const sent = [], noEmail = [], failed = []
    for (const m of rows) {
      if (!m.email) { noEmail.push(m.id); continue }
      const first = (m.name || '').split(/\s+/)[0] || 'there'
      const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <p style="margin:0 0 16px;font-size:16px">Hi ${esc(first)},</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;white-space:pre-wrap">${esc(message)}</p>
    <p style="margin:20px 0 0;font-size:12px;color:#a1a1aa">From ${esc(leader)} via StaffList. Reply to this email to reach ${esc(leader)}.</p>
  </div></body></html>`
      const mail = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [m.email], subject: subject || `Message from ${leader}`, html, text: `Hi ${first},\n\n${message}\n\n— ${leader}`, ...(user.email ? { reply_to: user.email } : {}) }),
        signal: AbortSignal.timeout(10000),
      })
      if (!mail.ok) { console.error('resend', mail.status, await mail.text().catch(() => '')); failed.push(m.id); continue }
      sent.push(m.id)
    }
    return res.status(200).json({ sent, noEmail, failed })
  } catch (err) {
    console.error('send-team-message error:', err)
    return res.status(502).json({ error: 'send' })
  }
}
