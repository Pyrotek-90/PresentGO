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

export const makeReminders = () => supabase.rpc('generate_reminders', { p_today: todayISO() })

export async function markRead(ids) {
  if (!ids.length) return
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
}

export async function respondToRequest(assignmentId, response) {
  const { data, error } = await supabase.rpc('respond_assignment', { p_assignment: assignmentId, p_response: response })
  if (error || !data) throw new Error('Could not save your answer. Please try again.')
  return data
}
