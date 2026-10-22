// Extra times on a set: rehearsal, practice, run-thru, soundcheck… each with its own name, date,
// time and length. Stored on the set as extra_times: [{ label, date, time, minutes }].
// Browser- and server-safe (the invite emails and calendar feed use it too).

export const TIME_NAMES = ['Rehearsal', 'Practice', 'Run-Thru', 'Soundcheck', 'Prayer']
export const DEFAULT_MINUTES = 90

export const durationLabel = m => (m % 60 === 0 ? `${m / 60} hr` : m > 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`)

// The set's extra times, cleaned up and in date order.
export function extraTimes(set) {
  const list = Array.isArray(set?.extra_times) ? set.extra_times : []
  return list
    .filter(t => t && /^\d{4}-\d{2}-\d{2}$/.test(t.date || ''))
    .map(t => ({
      label: String(t.label || '').trim() || 'Rehearsal',
      date: t.date,
      time: /^\d{2}:\d{2}/.test(t.time || '') ? t.time.slice(0, 5) : '',
      minutes: Number(t.minutes) > 0 ? Number(t.minutes) : DEFAULT_MINUTES,
    }))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
}

export function clockText(time) {
  if (!time) return ''
  const [h, m] = time.slice(0, 5).split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// "Friday, October 30 at 7:00 PM · 1 hr 30 min"   (short: "Fri, Oct 30 · 7:00 PM · 1 hr 30 min")
export function timeText(t, { short = false } = {}) {
  const day = new Date(`${t.date}T00:00:00`).toLocaleDateString('en-US', short
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { weekday: 'long', month: 'long', day: 'numeric' })
  const at = t.time ? `${short ? ' · ' : ' at '}${clockText(t.time)}` : ''
  return `${day}${at}${t.time ? ` · ${durationLabel(t.minutes)}` : ''}`
}

// Day arithmetic on YYYY-MM-DD strings (for repeating sets: each time keeps its distance from the set).
const isoDay = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
export const daysBetween = (a, b) => Math.round((isoDay(b) - isoDay(a)) / 86400000)
export const addDays = (s, n) => new Date(isoDay(s) + n * 86400000).toISOString().slice(0, 10)
