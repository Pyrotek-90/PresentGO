// Repeating sets. A rule looks like { freq: 'weekly' | 'biweekly' | 'monthly', count?: n, until?: 'YYYY-MM-DD' }.
// `count` includes the first set. Every set in a series shares `series_id` and stores the rule in `recurrence`.

export const MAX_OCCURRENCES = 104
export const DEFAULT_COUNT = 12

const iso = d => d.toLocaleDateString('en-CA')
const parse = s => new Date(s + 'T12:00:00')
const ORD = ['1st', '2nd', '3rd', '4th', 'last']
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Which week of the month a date falls in: 0-3 for 1st-4th, 4 for the 5th (treated as "last").
const weekOfMonth = d => Math.min(Math.floor((d.getDate() - 1) / 7), 4)

// Nth weekday (or last weekday) of a given month.
const nthWeekday = (y, m, dow, n) => {
  const first = new Date(y, m, 1, 12)
  const year = first.getFullYear(), month = first.getMonth()
  if (n === 4) {
    const d = new Date(year, month + 1, 0, 12)
    while (d.getDay() !== dow) d.setDate(d.getDate() - 1)
    return d
  }
  const d = new Date(year, month, 1, 12)
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1)
  d.setDate(d.getDate() + 7 * n)
  return d.getMonth() === month ? d : null
}

export function freqLabel(freq, startDate) {
  if (freq === 'weekly') return 'Weekly'
  if (freq === 'biweekly') return 'Every 2 weeks'
  if (freq === 'monthly') {
    if (!startDate) return 'Monthly'
    const d = parse(startDate)
    return `Monthly (${ORD[weekOfMonth(d)]} ${DOW[d.getDay()]})`
  }
  return 'Does not repeat'
}

export function ruleSummary(rule, startDate) {
  if (!rule?.freq) return 'Does not repeat'
  const end = rule.until
    ? `until ${parse(rule.until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : `${rule.count || DEFAULT_COUNT} sets`
  return `${freqLabel(rule.freq, startDate)} · ${end}`
}

// Dates in the series after `startDate` (the start itself is not included).
export function nextDates(startDate, rule) {
  if (!startDate || !rule?.freq) return []
  const start = parse(startDate)
  const limit = rule.until ? MAX_OCCURRENCES : Math.min(Math.max(Number(rule.count) || DEFAULT_COUNT, 1), MAX_OCCURRENCES)
  const out = []
  if (rule.freq === 'monthly') {
    const dow = start.getDay(), n = weekOfMonth(start)
    for (let m = 1; out.length + 1 < limit && m <= MAX_OCCURRENCES * 2; m++) {
      const d = nthWeekday(start.getFullYear(), start.getMonth() + m, dow, n)
      if (!d) continue
      if (rule.until && iso(d) > rule.until) break
      out.push(iso(d))
    }
  } else {
    const step = rule.freq === 'biweekly' ? 14 : 7
    for (let i = 1; out.length + 1 < limit; i++) {
      const d = new Date(start); d.setDate(start.getDate() + step * i)
      if (rule.until && iso(d) > rule.until) break
      out.push(iso(d))
    }
  }
  return out
}

export const sameRule = (a, b) =>
  (a?.freq || '') === (b?.freq || '') && (a?.until || '') === (b?.until || '') &&
  (a?.until ? true : (Number(a?.count) || 0) === (Number(b?.count) || 0))
