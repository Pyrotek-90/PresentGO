import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useChurch } from '../contexts/ChurchContext'
import { formatSetTime } from './sets'
import { extraTimes, timeText } from './setTimes'
import { postInvites, mailJoinInvite, inviteSummary } from './invites'

// Who's serving: a set's assignments and the actions on them (assign, remove, email invites),
// shared by the Team tab's matrix and the Set page's Who's Serving pane.
// `setId`: load only that set's assignments. `sets`: the sets (for the invite email's details).
// `onChange`: called after the assignments change.
export function useScheduling({ members, setMembers, positions, sets, setId = null, onChange }) {
  const { church } = useChurch()
  const [assignments, setAssignments] = useState([])
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)   // { setId, ok, text }

  const refresh = useCallback(() => {
    let q = supabase.from('set_assignments').select('*')
    if (setId) q = q.eq('set_id', setId)
    return q.then(({ data, error: e }) => {
      if (e) setError('Team features are not set up yet. Run the latest Supabase migration.')
      else if (data) setAssignments(data)
    })
  }, [setId])

  useEffect(() => { refresh() }, [refresh])

  // Replies arrive from the invite page; pick them up when you come back to the app and every 30s.
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    const t = setInterval(onFocus, 30000)
    return () => { document.removeEventListener('visibilitychange', onFocus); window.removeEventListener('focus', onFocus); clearInterval(t) }
  }, [refresh])

  const changed = () => { onChange?.() }

  const addAssignment = async (forSet, positionId, memberId) => {
    const { data, error: e } = await supabase.from('set_assignments')
      .insert({ set_id: forSet, position_id: positionId, member_id: memberId }).select().single()
    if (e) return e.code === '23505' ? 'That person is already in this set for that position.' : 'Could not add. Please try again.'
    setAssignments(prev => [...prev, data])
    setSendResult(null)
    changed()
    return null
  }
  const removeAssignment = async a => {
    await supabase.from('set_assignments').delete().eq('id', a.id)
    setAssignments(prev => prev.filter(x => x.id !== a.id))
    changed()
  }
  const markInvited = async ids => {
    const now = new Date().toISOString()
    await supabase.from('set_assignments').update({ status: 'invited', invited_at: now }).in('id', ids).in('status', ['draft', 'invited'])
    setAssignments(prev => prev.map(a => (ids.includes(a.id) && (a.status || 'draft') !== 'accepted' ? { ...a, status: 'invited', invited_at: now } : a)))
  }

  // Before automatic email is set up: open a ready-written email in the mail app, one person per tap.
  const mailAppFallback = async ids => {
    const a = assignments.find(x => x.id === ids[0])
    const sendSetId = a?.set_id
    const m = members.find(x => x.id === a?.member_id), p = positions.find(x => x.id === a?.position_id)
    const set = sets.find(x => x.id === a?.set_id)
    if (!a?.invite_token || !m?.email) { setSendResult({ setId: sendSetId, ok: false, text: 'Run the team-invites database update first (see setup notes).' }); return }
    if (m.join_token && m.join_status && m.join_status !== 'accepted') {
      // They haven't joined the team yet: the first email is the invitation to join.
      mailJoinInvite(m, church?.name || 'the team')
      const now = new Date().toISOString()
      await supabase.from('team_members').update({ join_status: 'invited', join_invited_at: now }).eq('id', m.id).neq('join_status', 'accepted')
      setMembers(prev => prev.map(x => (x.id === m.id ? { ...x, join_status: 'invited', join_invited_at: now } : x)))
      await markInvited([a.id])
      setSendResult({ setId: sendSetId, ok: true, text: `${m.name} hasn't joined the team yet, so this opened an invitation to join in your mail app. They can answer the set request after joining.` })
      return
    }
    const link = `${window.location.origin}/respond/${a.invite_token}`
    const when = set?.service_date ? new Date(set.service_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''
    const subject = `Can you serve as ${p?.name || 'part of the team'}${when ? ` on ${when}` : ''}?`
    const lines = [
      ['Set', set?.name], ['Date', when], ['Time', set?.service_time && formatSetTime(set.service_time)],
      ...extraTimes(set).map(t => [t.label, timeText(t)]),
      ['Venue', [set?.venue_name, set?.location_address, set?.location_details].filter(Boolean).join(', ')], ['Position', p?.name],
    ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')
    const body = `Hi ${m.name.split(' ')[0]},\n\nCan you serve as ${p?.name} for ${set?.name}?\n\n${lines}\n\nPlease tap to answer:\n${link}\n\nThank you!`
    window.location.href = `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    await markInvited([a.id])
    const left = ids.length - 1
    setSendResult({ setId: sendSetId, ok: true, text: `Opened an email to ${m.name} in your mail app.${left ? ` Tap Email invites again for the next person (${left} left).` : ''}` })
  }

  const sendInvites = async ids => {
    if (!ids.length) return
    const sendSetId = assignments.find(a => a.id === ids[0])?.set_id
    setSending(true); setSendResult(null)
    try {
      const { status, ok, out } = await postInvites({ ids })
      if (status === 501) { await mailAppFallback(ids); return }
      if (status === 402) { setSendResult({ setId: sendSetId, ok: false, text: 'Email invites are part of Pro. Upgrade your team in Settings → Subscription Plans.' }); return }
      if (status === 409) { setSendResult({ setId: sendSetId, ok: false, text: 'Run the team-invites database update first (see setup notes).' }); return }
      if (!ok) { setSendResult({ setId: sendSetId, ok: false, text: 'Could not send the emails. Please try again.' }); return }
      const now = new Date().toISOString()
      const asked = [...(out.sent || []), ...(out.held || [])]
      setAssignments(prev => prev.map(a => (asked.includes(a.id) && (a.status || 'draft') !== 'accepted' ? { ...a, status: 'invited', invited_at: now } : a)))
      if (out.teamInvites?.length) setMembers(prev => prev.map(m => (out.teamInvites.includes(m.id) && m.join_status !== 'accepted' ? { ...m, join_status: 'invited', join_invited_at: now } : m)))
      setSendResult({ setId: sendSetId, ok: !out.failed?.length, text: inviteSummary(out) })
    } catch {
      setSendResult({ setId: sendSetId, ok: false, text: 'Could not send the emails. Check your connection and try again.' })
    } finally { setSending(false) }
  }

  return { assignments, error, refresh, addAssignment, removeAssignment, sendInvites, sending, sendResult, setSendResult }
}
