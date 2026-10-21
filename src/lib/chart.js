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

// ── Keeping chords when a lyric line is edited ─────────────────────────────────────────────
// A line that no longer matches exactly (a typo fixed, spaces joined, "-2X" added) keeps its
// chords: it is paired with the old line it most resembles, and each chord moves with the
// letter it sat over.

const letters = s => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

// Longest-common-subsequence table for a and b (small strings: lyric lines).
function lcsTable(a, b) {
  const t = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
  return t
}

// How alike two lyric lines are, 0..1, ignoring spaces, punctuation and case.
function similarity(a, b) {
  const x = letters(a), y = letters(b)
  if (!x.length || !y.length) return 0
  if (x === y) return 1
  if (x.length * y.length > 40000) return 0
  return (2 * lcsTable(x, y)[0][0]) / (x.length + y.length)
}

// For each character position in `from`, the matching position in `to`.
function positionMap(from, to) {
  const a = from.toLowerCase(), b = to.toLowerCase()
  const map = new Array(a.length + 1).fill(-1)
  if (a.length * b.length <= 40000) {
    const t = lcsTable(a, b)
    let i = 0, j = 0
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { map[i] = j; i++; j++ }
      else if (t[i + 1][j] >= t[i][j + 1]) i++
      else j++
    }
  }
  map[a.length] = b.length
  // unmatched characters (deleted / changed) take the position of the next matched one
  for (let i = a.length - 1; i >= 0; i--) if (map[i] < 0) map[i] = map[i + 1]
  return map
}

// Re-places a chord line written over `oldLyric` so it fits `newLyric`.
function moveChords(chords, oldLyric, newLyric) {
  const map = positionMap(oldLyric, newLyric)
  let out = ''
  for (const m of chords.matchAll(/\S+/g)) {
    const at = m.index < oldLyric.length ? map[m.index] : newLyric.length + (m.index - oldLyric.length)
    const pos = Math.max(at, out.length ? out.length + 1 : 0)
    out += ' '.repeat(pos - out.length) + m[0]
  }
  return out
}

// Builds a chart from the song's raw lyrics (the single source of lyric text). Chords already
// placed above a lyric line in `oldChart` are kept — on the same line, or on the line it was
// edited into; sections that only exist in the old chart (e.g. an Intro written with chords
// only) are preserved.
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
  const oldLyricSecs = old.filter(sec => sec.entries.some(e => e.lyric))

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
  sections.forEach((sec, si) => {
    if (sec.label) lines.push(`[${sec.label}]`)
    // the same section in the old chart: by name, else (renamed) by position
    const oldSec = old.find(o => norm(o.label) === norm(sec.label)) || oldLyricSecs[si]
    const oldLines = (oldSec?.entries || []).filter(e => e.lyric)
    let next = 0   // old lines are used in order
    for (const lyric of sec.lines) {
      let chords = byLabelAndText.get(`${norm(sec.label)}|${norm(lyric)}`) ?? null
      const exact = oldLines.findIndex((e, k) => k >= next && norm(e.lyric) === norm(lyric))
      if (exact >= 0) { next = exact + 1; chords ??= oldLines[exact].chords }
      if (chords == null) chords = byText.get(norm(lyric)) ?? null
      if (chords == null) {
        // edited line: the most similar of the next few old lines in this section
        let best = -1, score = 0.5
        for (let k = next; k < Math.min(oldLines.length, next + 3); k++) {
          const sc = similarity(oldLines[k].lyric, lyric)
          if (sc > score) { score = sc; best = k }
        }
        if (best >= 0) {
          next = best + 1
          chords = oldLines[best].chords ? moveChords(oldLines[best].chords, oldLines[best].lyric, lyric) : ''
        }
      }
      lines.push(chords ?? '', lyric)
    }
    lines.push('')
  })
  tail.forEach(pushRaw)
  return lines.join('\n').replace(/\n+$/, '\n')
}

export const buildChart = rawLyrics => reconcileChart(rawLyrics, '')
