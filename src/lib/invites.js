import { supabase } from './supabase'

// Team invitations and set requests go out through /api/send-invites (Resend).
//   { members: [teamMemberId] }   invitation to join the team
//   { ids: [setAssignmentId] }     set requests; people who haven't joined get the join invitation first
// Returns { status, ok, out } — status 501 means automatic email isn't set up yet.
export async function postInvites(body) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch('/api/send-invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body),
  })
  const out = await r.json().catch(() => ({}))
  return { status: r.status, ok: r.ok, out }
}

export const joinLink = member => `${window.location.origin}/join/${member.join_token}`

// Before automatic email is set up: a ready-written invitation in the person's own mail app.
export function mailJoinInvite(member, teamName) {
  const first = (member.name || '').split(/\s+/)[0] || 'there'
  const subject = `Join ${teamName} on StaffList`
  const body = `Hi ${first},\n\nI'd like you to join ${teamName} on StaffList, where we share our sets, chord charts and lyrics.\n\nTap to join:\n${joinLink(member)}\n\nThank you!`
  window.location.href = `mailto:${encodeURIComponent(member.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// One line for the result of a send.
export function inviteSummary(out = {}) {
  const parts = []
  if (out.sent?.length) parts.push(`Sent ${plural(out.sent.length, 'set request')}.`)
  if (out.teamInvites?.length) {
    parts.push(out.held?.length
      ? `Invited ${plural(out.teamInvites.length, 'person', 'people')} to join the team first; they'll answer ${out.held.length === 1 ? 'their set request' : 'their set requests'} when they join.`
      : `Sent ${plural(out.teamInvites.length, 'team invitation')}.`)
  }
  if (out.already?.length) parts.push(`${plural(out.already.length, 'person has', 'people have')} already joined.`)
  if (out.failed?.length) parts.push(`${out.failed.length} couldn't be sent.`)
  return parts.join(' ') || 'Nothing to send.'
}
