import { supabase } from './supabase'
import { todayISO } from './sets'

// In-app notifications: serving requests (Accept / Decline), answers, and set reminders.
// Needs the notifications SQL (supabase/migrations/2026-10-15_notifications.sql); until it has been
// run these calls fail quietly and the bell stays hidden.

export async function loadNotifications() {
  const { data, error } = await supabase.rpc('my_notifications', { p_limit: 40 })
  if (error) return null
  return data || []
}

// Runs when the app opens: delivers requests that were waiting for this person's account, then reminders.
export async function makeReminders() {
  try { await supabase.rpc('deliver_waiting_requests') } catch { /* not set up yet */ }
  return supabase.rpc('generate_reminders', { p_today: todayISO() })
}

// { [teamMemberId]: true | false } — does each of my team members have a StaffList account?
export async function loadAccountStatus() {
  const { data, error } = await supabase.rpc('team_account_status')
  if (error || !data) return null
  return Object.fromEntries(data.map(r => [r.member_id, !!r.has_account]))
}

export async function markRead(ids) {
  if (!ids.length) return
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
}

export async function respondToRequest(assignmentId, response) {
  const { data, error } = await supabase.rpc('respond_assignment', { p_assignment: assignmentId, p_response: response })
  if (error || !data) throw new Error('Could not save your answer. Please try again.')
  return data
}
