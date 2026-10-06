import { isChordLine } from './chords'

const norm = s => s.trim().toLowerCase().replace(/\s+/g, ' ')
const HEADER_RE = /^\[(.+)\]$/

// Splits raw lyrics text ("[Verse 1]\nline\n...") into sections, exactly as written.
// Text before the first header belongs to an unlabeled section.
export function lyricSections(raw) {
  const out = []
  let cur = null
  for (const line of (raw || '').split('\n')) {
    const h = line.trim().match(HEADER_RE)
    if (h) { cur = { label: h[1].trim(), lines: [] }; out.push(cur); continue }
    if (!line.trim()) continue
    if (!cur) { cur = { label: '', lines: [] }; out.push(cur) }
    cur.lines.push(line)
  }
  return out.filter(sec => sec.lines.length)
}

// Replaces the body of one section in raw lyrics, leaving every other section untouched.
export function replaceSectionInRaw(raw, label, lines) {
  const all = (raw || '').split('\n')
  const isHeader = l => HEADER_RE.test(l.trim())
  let start = all.findIndex(l => isHeader(l) && l.trim().slice(1, -1).trim() === label)
  let bodyFrom, end
  if (start >= 0) {
    bodyFrom = start + 1
  } else if (label === 'Intro' || label === 'Song') {
    start = -1; bodyFrom = 0   // headerless leading text
  } else {
    const tail = all.length && all[all.length - 1].trim() ? ['', ''] : all.length ? [''] : []
    return [...all, ...tail.slice(0, 1), `[${label}]`, ...lines].join('\n')
  }
  end = all.findIndex((l, i) => i >= bodyFrom && isHeader(l))
  if (end < 0) end = all.length
  const spacer = end < all.length ? [''] : []
  return [...all.slice(0, bodyFrom), ...lines, ...spacer, ...all.slice(end)].join('\n')
}

function parseChart(chart) {
  const sections = []
  let cur = null
  const lines = (chart || '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const h = line.trim().match(HEADER_RE)
    if (h) { cur = { label: h[1], entries: [], raw: [line] }; sections.push(cur); continue }
    if (!cur) { cur = { label: '', entries: [], raw: [] }; sections.push(cur) }
    cur.raw.push(line)
    if (!line.trim()) continue
    if (isChordLine(line)) {
      const next = lines[i + 1]
      if (next !== undefined && next.trim() && !isChordLine(next) && !HEADER_RE.test(next.trim())) {
        cur.entries.push({ chords: line, lyric: next })
        cur.raw.push(next)
        i++
      } else {
        cur.entries.push({ chords: line, lyric: '' })
      }
    } else {
      cur.entries.push({ chords: '', lyric: line })
    }
  }
  return sections
}

// Builds a chart from the song's raw lyrics (the single source of lyric text). Chords already
// placed above a matching lyric line in `oldChart` are kept; sections that only exist in the
// old chart (e.g. an Intro written with chords only) are preserved.
export function reconcileChart(rawLyrics, oldChart = '') {
  const sections = lyricSections(rawLyrics)
  if (!sections.length) return oldChart
  const old = parseChart(oldChart)

  const byLabelAndText = new Map()
  const byText = new Map()
  for (const sec of old) {
    for (const e of sec.entries) {
      if (!e.lyric || !e.chords) continue
      byLabelAndText.set(`${norm(sec.label)}|${norm(e.lyric)}`, e.chords)
      if (!byText.has(norm(e.lyric))) byText.set(norm(e.lyric), e.chords)
    }
  }

  const used = new Set(sections.map(s => norm(s.label)))
  const lines = []
  const extras = old.filter(sec => sec.label && !used.has(norm(sec.label)))
  const lead = extras.filter(sec => /intro/i.test(sec.label))
  const tail = extras.filter(sec => !/intro/i.test(sec.label))

  const pushRaw = sec => {
    while (sec.raw.length && !sec.raw[sec.raw.length - 1].trim()) sec.raw.pop()
    lines.push(...sec.raw, '')
  }

  lead.forEach(pushRaw)
  for (const sec of sections) {
    if (sec.label) lines.push(`[${sec.label}]`)
    for (const lyric of sec.lines) {
      const chords = byLabelAndText.get(`${norm(sec.label)}|${norm(lyric)}`) ?? byText.get(norm(lyric)) ?? ''
      lines.push(chords, lyric)
    }
    lines.push('')
  }
  tail.forEach(pushRaw)
  return lines.join('\n').replace(/\n+$/, '\n')
}

export const buildChart = rawLyrics => reconcileChart(rawLyrics, '')
