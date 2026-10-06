import { isChordLine } from './chords'

const norm = s => s.trim().toLowerCase().replace(/\s+/g, ' ')
const HEADER_RE = /^\[(.+)\]$/

// Groups the flat slide list into sections, in arrangement order (repeats included).
function slideSections(slides) {
  const out = []
  for (const s of slides || []) {
    if (s.label || !out.length) out.push({ label: s.label || '', lines: [] })
    out[out.length - 1].lines.push(...(s.lines || []))
  }
  return out.filter(sec => sec.lines.length)
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

// Builds a chart from the song's slides (arrangement order). Chords already placed above a
// matching lyric line in `oldChart` are kept; sections that only exist in the old chart
// (e.g. an Intro written with chords only) are preserved.
export function reconcileChart(slides, oldChart = '') {
  const sections = slideSections(slides)
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

export const buildChart = slides => reconcileChart(slides, '')
