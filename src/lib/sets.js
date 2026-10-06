export const todayISO = () => new Date().toLocaleDateString('en-CA')

const keyDate = s => s.service_date || (s.updated_at || '').slice(0, 10)

export function groupSets(sets) {
  const today = todayISO()
  const upcoming = sets
    .filter(s => s.service_date && s.service_date >= today)
    .sort((a, b) => a.service_date.localeCompare(b.service_date))
  const past = sets
    .filter(s => !(s.service_date && s.service_date >= today))
    .sort((a, b) => keyDate(b).localeCompare(keyDate(a)))
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
