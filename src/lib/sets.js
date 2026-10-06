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
