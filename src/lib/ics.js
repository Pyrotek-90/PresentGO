// Builds an iCalendar (.ics) document from PresentGO sets. Node- and browser-safe.

const pad = n => String(n).padStart(2, '0')
const esc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

function fold(line) {
  const parts = []
  let rest = line
  while (rest.length > 74) { parts.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74) }
  parts.push(rest)
  return parts.join('\r\n')
}

const fmtUtc = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
const fmtDate = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
const fmtFloating = d => fmtUtc(d).replace(/Z$/, '')

function zoneOffsetMs(utcMs, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs)).map(p => [p.type, p.value])
  )
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - utcMs
}

// Wall-clock date/time in an IANA time zone -> UTC instant (null if the zone is unusable).
function zonedToUtc(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  try {
    const first = guess - zoneOffsetMs(guess, tz)
    return new Date(guess - zoneOffsetMs(first, tz))
  } catch {
    return null
  }
}

function eventLines(set, baseUrl) {
  if (!set.service_date) return []
  const lines = ['BEGIN:VEVENT', `UID:set-${set.id}@presentgo`, `DTSTAMP:${fmtUtc(new Date(set.updated_at || Date.now()))}`]

  if (set.service_time) {
    const time = set.service_time.slice(0, 5)
    const minutes = Number(set.duration_min) > 0 ? Number(set.duration_min) : 90
    const utc = set.time_zone ? zonedToUtc(set.service_date, time, set.time_zone) : null
    if (utc) {
      lines.push(`DTSTART:${fmtUtc(utc)}`, `DTEND:${fmtUtc(new Date(utc.getTime() + minutes * 60000))}`)
    } else {
      const [y, m, d] = set.service_date.split('-').map(Number)
      const [hh, mm] = time.split(':').map(Number)
      const start = new Date(Date.UTC(y, m - 1, d, hh, mm))
      lines.push(`DTSTART:${fmtFloating(start)}`, `DTEND:${fmtFloating(new Date(start.getTime() + minutes * 60000))}`)
    }
  } else {
    const [y, m, d] = set.service_date.split('-').map(Number)
    const day = new Date(Date.UTC(y, m - 1, d))
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(day)}`, `DTEND;VALUE=DATE:${fmtDate(new Date(day.getTime() + 86400000))}`)
  }

  lines.push(`SUMMARY:${esc(set.name)}`)
  const where = [set.venue_name, set.location_address].filter(Boolean).join(', ')
  if (where) lines.push(`LOCATION:${esc(where)}`)
  const description = [set.location_details && `Room / details: ${set.location_details}`, baseUrl && `Program: ${baseUrl}/sets/${set.id}`].filter(Boolean).join('\n')
  if (description) lines.push(`DESCRIPTION:${esc(description)}`)
  if (baseUrl) lines.push(`URL:${baseUrl}/sets/${set.id}`)
  if (set.updated_at) lines.push(`LAST-MODIFIED:${fmtUtc(new Date(set.updated_at))}`, `SEQUENCE:${Math.floor(new Date(set.updated_at).getTime() / 1000)}`)
  lines.push('END:VEVENT')
  return lines
}

export function buildIcs(sets, { baseUrl = '', calendarName = 'PresentGO' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PresentGO//Sets//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calendarName)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
    ...sets.flatMap(s => eventLines(s, baseUrl)),
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}
