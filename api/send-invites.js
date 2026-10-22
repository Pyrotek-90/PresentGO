// Emails team invitations and set requests through Resend.
//
//  • { members: [teamMemberId] }   → an invitation to JOIN the team (from the Team page).
//  • { ids: [setAssignmentId] }    → set requests (from the Schedule). Anyone who hasn't joined
//    the team yet gets the join invitation instead, listing the sets they've been asked to serve;
//    they answer those on the join page once they've joined.
//
// Every email carries the team's details (organization, location, contact, welcome) and each
// set's rehearsal.
// The caller's own Supabase login is used for every read and write, so row-level security
// limits it to their own team. Needs RESEND_API_KEY and EMAIL_FROM in Vercel.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const UUID = /^[0-9a-f-]{36}$/i

function when(date, time) {
  const d = date ? new Date(`${date}T${time || '12:00'}:00`) : null
  if (!d || isNaN(d)) return ''
  const day = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  return time ? `${day} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : day
}

const btn = (href, label, bg) =>
  `<a href="${href}" style="display:inline-block;padding:12px 22px;margin:4px 6px 4px 0;border-radius:8px;background:${bg};color:#fff;font-weight:600;text-decoration:none;font-family:Arial,sans-serif">${esc(label)}</a>`
const row = (label, value) => value
  ? `<tr><td style="color:#71717a;padding-right:12px;vertical-align:top">${esc(label)}</td><td>${esc(value)}</td></tr>` : ''
const page = inner => `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">${inner}</div></body></html>`

// Team details as shown in every email.
function teamInfo(team = {}, inviter) {
  const d = team.details || {}
  const contact = [d.contact_name || inviter, d.contact_phone, d.contact_email].filter(Boolean).join(' · ')
  return {
    name: team.name || 'the worship team',
    church: d.church_name || '',
    location: d.location || '',
    welcome: d.welcome || '',
    contact,
    replyTo: d.contact_email || '',
  }
}
const teamLine = t => (t.church ? `${t.name} · ${t.church}` : t.name)
const rehearsalText = set => (set.rehearsal_date ? when(set.rehearsal_date, set.rehearsal_time?.slice(0, 5)) : '')

function setRequestEmail({ member, position, set, link, inviter, team }) {
  const first = (member.name || '').split(/\s+/)[0] || 'there'
  const whenText = when(set.service_date, set.service_time?.slice(0, 5))
  const where = [set.venue_name, set.location_address].filter(Boolean).join(', ') || team.location
  const subject = `Can you serve as ${position.name}${whenText ? ` on ${whenText.split(' at ')[0]}` : ''}?`
  const html = page(`
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#71717a">${esc(teamLine(team))}</p>
    <p style="margin:0 0 16px;font-size:16px">Hi ${esc(first)},</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5">${esc(inviter)} has asked you to serve as <b>${esc(position.name)}</b> for <b>${esc(set.name)}</b>.</p>
    <table style="margin:0 0 20px;font-size:15px;line-height:1.6">
      ${row('When', whenText)}${row('Rehearsal', rehearsalText(set))}${row('Where', where)}${row('Position', position.name)}${row('Contact', team.contact)}
    </table>
    <p style="margin:0 0 8px;font-size:15px">Can you make it?</p>
    ${btn(`${link}?r=accepted`, 'Accept', '#16a34a')}${btn(`${link}?r=declined`, 'Decline', '#dc2626')}
    <p style="margin:20px 0 0;font-size:12px;color:#a1a1aa">Sent with StaffList for ${esc(team.name)}. Reply to this email to reach ${esc(inviter)}.</p>`)
  const text = [
    teamLine(team), '', `Hi ${first},`, '', `${inviter} has asked you to serve as ${position.name} for ${set.name}.`,
    whenText ? `When: ${whenText}` : null, rehearsalText(set) ? `Rehearsal: ${rehearsalText(set)}` : null,
    where ? `Where: ${where}` : null, team.contact ? `Contact: ${team.contact}` : null,
    '', `Accept: ${link}?r=accepted`, `Decline: ${link}?r=declined`,
  ].filter(x => x !== null).join('\n')
  return { subject, html, text }
}

function joinEmail({ member, link, inviter, team, requests }) {
  const first = (member.name || '').split(/\s+/)[0] || 'there'
  const subject = `${inviter} invited you to join ${team.name}`
  const reqHtml = requests.length ? `
    <p style="margin:0 0 6px;font-size:15px">${esc(inviter)} would also like you to serve:</p>
    <ul style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.6">
      ${requests.map(r => `<li><b>${esc(r.set.name)}</b>${r.set.service_date ? ` · ${esc(when(r.set.service_date, r.set.service_time?.slice(0, 5)))}` : ''} · ${esc(r.position)}${rehearsalText(r.set) ? `<br><span style="color:#71717a">Rehearsal: ${esc(rehearsalText(r.set))}</span>` : ''}</li>`).join('')}
    </ul>` : ''
  const html = page(`
    <p style="margin:0 0 16px;font-size:16px">Hi ${esc(first)},</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5">${esc(inviter)} has invited you to join <b>${esc(team.name)}</b>${team.church ? ` at <b>${esc(team.church)}</b>` : ''} on StaffList.</p>
    ${team.welcome ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;padding:12px 14px;background:#f4f4f5;border-radius:8px;white-space:pre-line">${esc(team.welcome)}</p>` : ''}
    <table style="margin:0 0 20px;font-size:15px;line-height:1.6">
      ${row('Team', team.name)}${row('Organization', team.church)}${row('Location', team.location)}${row('Contact', team.contact)}
    </table>
    ${reqHtml}
    ${btn(`${link}?r=accepted`, 'Join the team', '#0e7490')}${btn(`${link}?r=declined`, 'No thanks', '#71717a')}
    <p style="margin:20px 0 0;font-size:13px;color:#52525b;line-height:1.5">Once you join, you'll get set requests by email${requests.length ? ' (and can answer the ones above right away)' : ''}. Sign in to StaffList with this email address to see your sets, charts and lyrics.</p>
    <p style="margin:12px 0 0;font-size:12px;color:#a1a1aa">Sent with StaffList. Reply to this email to reach ${esc(inviter)}.</p>`)
  const text = [
    `Hi ${first},`, '', `${inviter} has invited you to join ${team.name}${team.church ? ` at ${team.church}` : ''} on StaffList.`,
    team.welcome ? `\n${team.welcome}\n` : '',
    team.church ? `Organization: ${team.church}` : null, team.location ? `Location: ${team.location}` : null,
    team.contact ? `Contact: ${team.contact}` : null,
    requests.length ? `\nYou've also been asked to serve:\n${requests.map(r => `- ${r.set.name}${r.set.service_date ? `, ${when(r.set.service_date, r.set.service_time?.slice(0, 5))}` : ''} (${r.position})${rehearsalText(r.set) ? `, rehearsal ${rehearsalText(r.set)}` : ''}`).join('\n')}` : null,
    '', `Join the team: ${link}?r=accepted`, `No thanks: ${link}?r=declined`,
  ].filter(x => x !== null).join('\n')
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
  const ids = (req.body?.ids || []).filter(id => UUID.test(id)).slice(0, 100)
  const memberIds = (req.body?.members || []).filter(id => UUID.test(id)).slice(0, 100)
  if (!ids.length && !memberIds.length) return res.status(400).json({ error: 'no_ids' })

  const sb = (path, init = {}) => fetch(`${url}${path}`, {
    ...init, headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(10000),
  })
  const mail = async (to, { subject, html, text }, replyTo) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) console.error('resend', r.status, await r.text().catch(() => ''))
    return r.ok
  }

  try {
    const who = await sb('/auth/v1/user')
    if (!who.ok) return res.status(401).json({ error: 'auth' })
    const user = await who.json()
    const inviter = user.user_metadata?.full_name || (user.email || '').split('@')[0] || 'Your worship leader'
    const host = req.headers['x-forwarded-host'] || req.headers.host
    const base = process.env.APP_URL || (host ? `https://${host}` : '')

    // Set requests (with join status when the team-invites database update has been run).
    let rows = [], teamsReady = true
    if (ids.length) {
      const setCols = '*'   // includes the rehearsal once that database update has been run
      const full = `id,status,invite_token,set:sets(${setCols}),member:team_members(id,name,email,church_id,join_status,join_token),position:positions(name)`
      let r = await sb(`/rest/v1/set_assignments?id=in.(${ids.join(',')})&select=${encodeURIComponent(full)}`)
      if (r.status === 400) {
        teamsReady = false
        const old = `id,status,invite_token,set:sets(${setCols}),member:team_members(id,name,email),position:positions(name)`
        r = await sb(`/rest/v1/set_assignments?id=in.(${ids.join(',')})&select=${encodeURIComponent(old)}`)
      }
      if (!r.ok) return res.status(r.status === 400 ? 409 : 502).json({ error: r.status === 400 ? 'migration_needed' : 'load' })
      rows = await r.json()
    }

    // People to invite to the team: asked for directly, or scheduled before they've joined.
    const joiners = new Map()   // memberId → { member, requests: [assignment rows] }
    if (memberIds.length) {
      const r = await sb(`/rest/v1/team_members?id=in.(${memberIds.join(',')})&select=id,name,email,church_id,join_status,join_token`)
      if (!r.ok) return res.status(r.status === 400 ? 409 : 502).json({ error: r.status === 400 ? 'migration_needed' : 'load' })
      for (const m of await r.json()) joiners.set(m.id, { member: m, requests: [] })
    }
    const setRequests = []
    for (const a of rows) {
      const m = a.member
      if (teamsReady && m?.join_token && m.join_status !== 'accepted') {
        if (!joiners.has(m.id)) joiners.set(m.id, { member: m, requests: [] })
        joiners.get(m.id).requests.push(a)
      } else setRequests.push(a)
    }

    // Team details for every team involved.
    const churchIds = [...new Set([...rows.map(a => a.member?.church_id), ...[...joiners.values()].map(j => j.member.church_id)].filter(Boolean))]
    const teams = {}
    if (teamsReady && churchIds.length) {
      const r = await sb(`/rest/v1/churches?id=in.(${churchIds.join(',')})&select=id,name,details`)
      if (r.ok) for (const c of await r.json()) teams[c.id] = c
    }
    const infoFor = churchId => teamInfo(teams[churchId], inviter)

    const sent = [], held = [], teamInvites = [], already = [], noEmail = [], failed = []

    for (const a of setRequests) {
      if (!a.invite_token) { failed.push(a.id); continue }
      if (!a.member?.email) { noEmail.push(a.id); continue }
      const team = infoFor(a.member.church_id)
      const ok = await mail(a.member.email, setRequestEmail({
        member: a.member, position: a.position || { name: 'team member' }, set: a.set || {},
        link: `${base}/respond/${a.invite_token}`, inviter, team,
      }), team.replyTo || user.email)
      ;(ok ? sent : failed).push(a.id)
    }

    for (const { member: m, requests } of joiners.values()) {
      if (m.join_status === 'accepted') { already.push(m.id); continue }
      if (!m.email) { noEmail.push(...(requests.length ? requests.map(a => a.id) : [m.id])); continue }
      if (!m.join_token) { failed.push(m.id); continue }
      const team = infoFor(m.church_id)
      const ok = await mail(m.email, joinEmail({
        member: m, inviter, team, link: `${base}/join/${m.join_token}`,
        requests: requests.map(a => ({ set: a.set || {}, position: a.position?.name || 'team member' })),
      }), team.replyTo || user.email)
      if (ok) { teamInvites.push(m.id); held.push(...requests.map(a => a.id)) } else failed.push(...(requests.length ? requests.map(a => a.id) : [m.id]))
    }

    const now = new Date().toISOString()
    if (teamInvites.length) {
      await sb(`/rest/v1/team_members?id=in.(${teamInvites.join(',')})&join_status=neq.accepted`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ join_status: 'invited', join_invited_at: now, join_invited_by: user.id }),
      })
    }
    const asked = [...sent, ...held]
    if (asked.length) {
      // Fresh requests (and re-sends to people who haven't answered) show as waiting for a reply.
      await sb(`/rest/v1/set_assignments?id=in.(${asked.join(',')})&status=in.(draft,invited)`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'invited', invited_at: now }),
      })
    }
    return res.status(200).json({ sent, held, teamInvites, already, noEmail, failed })
  } catch (err) {
    console.error('send-invites error:', err)
    return res.status(502).json({ error: 'send' })
  }
}
