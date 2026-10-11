// Emails team invites (Accept / Decline links) for set assignments, through Resend.
// The caller's own Supabase login is used for every database read and write, so row-level
// security limits it to their own sets. Needs RESEND_API_KEY and EMAIL_FROM in Vercel.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function when(date, time) {
  const d = date ? new Date(`${date}T${time || '12:00'}:00`) : null
  if (!d || isNaN(d)) return ''
  const day = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  return time ? `${day} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : day
}

function emailFor({ member, position, set, link, inviter }) {
  const first = (member.name || '').split(/\s+/)[0] || 'there'
  const whenText = when(set.service_date, set.service_time?.slice(0, 5))
  const where = [set.venue_name, set.location_address].filter(Boolean).join(', ')
  const subject = `Can you serve as ${position.name}${whenText ? ` on ${whenText.split(' at ')[0]}` : ''}?`
  const btn = (href, label, bg) =>
    `<a href="${href}" style="display:inline-block;padding:12px 22px;margin:4px 6px 4px 0;border-radius:8px;background:${bg};color:#fff;font-weight:600;text-decoration:none;font-family:Arial,sans-serif">${label}</a>`
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <p style="margin:0 0 16px;font-size:16px">Hi ${esc(first)},</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5">${esc(inviter)} has asked you to serve as <b>${esc(position.name)}</b> for <b>${esc(set.name)}</b>.</p>
    <table style="margin:0 0 20px;font-size:15px;line-height:1.6">
      ${whenText ? `<tr><td style="color:#71717a;padding-right:12px">When</td><td>${esc(whenText)}</td></tr>` : ''}
      ${where ? `<tr><td style="color:#71717a;padding-right:12px">Where</td><td>${esc(where)}</td></tr>` : ''}
      <tr><td style="color:#71717a;padding-right:12px">Position</td><td>${esc(position.name)}</td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:15px">Can you make it?</p>
    ${btn(`${link}?r=accepted`, 'Accept', '#16a34a')}${btn(`${link}?r=declined`, 'Decline', '#dc2626')}
    <p style="margin:20px 0 0;font-size:12px;color:#a1a1aa">Sent with PresentGO. Reply to this email to reach ${esc(inviter)}.</p>
  </div></body></html>`
  const text = `Hi ${first},\n\n${inviter} has asked you to serve as ${position.name} for ${set.name}.\n${whenText ? `When: ${whenText}\n` : ''}${where ? `Where: ${where}\n` : ''}\nAccept: ${link}?r=accepted\nDecline: ${link}?r=declined\n`
  return { subject, html, text }
}

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
  if (!ids.length) return res.status(400).json({ error: 'no_ids' })

  const sb = (path, init = {}) => fetch(`${url}${path}`, {
    ...init, headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(10000),
  })

  try {
    const who = await sb('/auth/v1/user')
    if (!who.ok) return res.status(401).json({ error: 'auth' })
    const user = await who.json()
    const inviter = user.user_metadata?.full_name || (user.email || '').split('@')[0] || 'Your worship leader'

    const sel = 'id,status,invite_token,set:sets(name,service_date,service_time,venue_name,location_address),member:team_members(name,email),position:positions(name)'
    const r = await sb(`/rest/v1/set_assignments?id=in.(${ids.join(',')})&select=${encodeURIComponent(sel)}`)
    if (!r.ok) return res.status(r.status === 400 ? 409 : 502).json({ error: r.status === 400 ? 'migration_needed' : 'load' })
    const rows = await r.json()

    const host = req.headers['x-forwarded-host'] || req.headers.host
    const base = process.env.APP_URL || (host ? `https://${host}` : '')
    const sent = [], noEmail = [], failed = []

    for (const a of rows) {
      if (!a.invite_token) { failed.push(a.id); continue }
      if (!a.member?.email) { noEmail.push(a.id); continue }
      const { subject, html, text } = emailFor({ member: a.member, position: a.position || { name: 'team member' }, set: a.set || {}, link: `${base}/respond/${a.invite_token}`, inviter })
      const mail = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [a.member.email], subject, html, text, ...(user.email ? { reply_to: user.email } : {}) }),
        signal: AbortSignal.timeout(10000),
      })
      if (!mail.ok) { console.error('resend', mail.status, await mail.text().catch(() => '')); failed.push(a.id); continue }
      sent.push(a.id)
    }

    if (sent.length) {
      // Fresh invites (and re-sends to people who haven't answered) show as waiting for a reply.
      await sb(`/rest/v1/set_assignments?id=in.(${sent.join(',')})&status=in.(draft,invited)`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'invited', invited_at: new Date().toISOString() }),
      })
    }
    return res.status(200).json({ sent, noEmail, failed })
  } catch (err) {
    console.error('send-invites error:', err)
    return res.status(502).json({ error: 'send' })
  }
}
