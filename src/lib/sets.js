export const todayISO = () => new Date().toLocaleDateString('en-CA')

const keyDate = s => s.service_date || (s.updated_at || '').slice(0, 10)

export function groupSets(sets) {
  const today = todayISO()
  const upcoming = sets
    .filter(s => s.service_date && s.service_date >= today)
    .sort((a, b) => (a.service_date + (a.service_time || '')).localeCompare(b.service_date + (b.service_time || '')))
  const past = sets
    .filter(s => !(s.service_date && s.service_date >= today))
    .sort((a, b) => (keyDate(b) + (b.service_time || '')).localeCompare(keyDate(a) + (a.service_time || '')))
  return { upcoming, past }
}

export function formatSetDate(d) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatModified(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const mins = Math.floor((Date.now() - d) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const songCount = set => (set.set_items || []).filter(i => i.type === 'song').length

export function formatSetTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const d = new Date(1970, 0, 1, Number(h), Number(m))
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export const formatSetWhen = set => [formatSetDate(set.service_date), formatSetTime(set.service_time)].filter(Boolean).join(' · ')

export async function createSet(supabase, userId, { name, date, time }) {
  return supabase
    .from('sets')
    .insert({ user_id: userId, name, service_date: date || todayISO(), service_time: time || null })
    .select().single()
}
