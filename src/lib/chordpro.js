import { formatKey } from './chords'

// Parses a ChordPro file (as downloaded from SongSelect, PraiseCharts, OnSong, etc.) into
// PresentGO's song shape: raw lyrics with [Section] headers, a chords-over-lyrics chart whose
// lyric lines match the raw lyrics exactly, and song metadata.

const DIRECTIVE_RE = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i
const INLINE_CHORD_RE = /\[([^\]]+)\]/g

const SECTION_ENV = {
  start_of_verse: 'Verse', sov: 'Verse',
  start_of_chorus: 'Chorus', soc: 'Chorus',
  start_of_bridge: 'Bridge', sob: 'Bridge',
  start_of_tab: 'Tab', sot: 'Tab',
  start_of_grid: 'Grid', sog: 'Grid',
}
const END_ENV = /^(end_of_(verse|chorus|bridge|tab|grid)|eov|eoc|eob|eot|eog)$/

// Plain lines some exports use instead of {comment: ...} directives.
export const BARE_SECTION_RE = /^(intro|verse|chorus|pre-?chorus|bridge|tag|outro|ending|interlude|instrumental|turnaround|refrain|vamp|coda|misc)(\s*\d+[a-z]?)?\s*:?$/i

export const titleCase = s => s.replace(/\b([a-z])/g, c => c.toUpperCase())

export function parseChordProKey(raw) {
  const m = (raw || '').trim().match(/^([A-G])([#b♭]?)\s*(m(?!aj)|min|minor)?/i)
  if (!m) return ''
  const acc = m[2] === '♭' ? 'b' : m[2]
  return formatKey(m[1].toUpperCase(), acc, m[3] ? 'Minor' : 'Major')
}

// Joins syllables split for chord placement ("A - mazing" → "Amazing") and collapses spaces.
const tidy = s => s.replace(/(\S)\s+-\s+(?=\S)/g, '$1').replace(/\s{2,}/g, ' ')

// Turns "A - [D]mazing [D/A]grace" into { chords: "  D      D/A", lyric: "Amazing grace" }.
function splitInlineChords(line) {
  const parts = []
  let last = 0, m
  INLINE_CHORD_RE.lastIndex = 0
  while ((m = INLINE_CHORD_RE.exec(line))) {
    parts.push({ text: line.slice(last, m.index) })
    parts.push({ chord: m[1].trim() })
    last = m.index + m[0].length
  }
  parts.push({ text: line.slice(last) })

  let lyric = ''
  const placed = []
  for (const p of parts) {
    if (p.chord !== undefined) {
      // A trailing " - " means the next syllable continues the same word.
      if (/\S\s*-\s*$/.test(lyric)) lyric = lyric.replace(/\s*-\s*$/, '')
      else lyric = lyric.replace(/\s{2,}$/, ' ')
      placed.push({ chord: p.chord, at: lyric.length })
      continue
    }
    let text = tidy(p.text)
    if (!lyric || (/\s$/.test(lyric) && /^\s/.test(text))) text = text.replace(/^\s+/, '')
    lyric += text
  }
  lyric = lyric.replace(/\s*-\s*$/, '').trim()

  let chords = ''
  for (const { chord, at } of placed) {
    const pos = Math.max(at, chords.length ? chords.length + 1 : 0)
    chords += ' '.repeat(pos - chords.length) + chord
  }
  return { chords, lyric }
}

export function looksLikeChordPro(text) {
  return /\{\s*(title|t|key|comment|c|start_of_\w+|soc|sov|ccli)\s*[:}]/i.test(text || '') ||
    /\[[A-G][#b♭]?[^\]\s]{0,8}\][a-z]/i.test(text || '')
}

export function parseChordPro(text) {
  const meta = { title: '', artist: '', authors: [], ccli: '', key: '', bpm: '', copyright: '' }
  const sections = []
  let cur = null
  let envLabel = null

  const open = label => {
    cur = { label, rows: [] }
    sections.push(cur)
  }

  for (const rawLine of (text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.replace(/\s+$/, '')
    const t = line.trim()
    if (t.startsWith('#')) continue

    const d = t.match(DIRECTIVE_RE)
    if (d) {
      const name = d[1].toLowerCase()
      const val = (d[2] || '').trim()
      if (name === 'title' || name === 't') meta.title = val
      else if (name === 'subtitle' || name === 'st' || name === 'artist') { if (!meta.artist) meta.artist = val }
      else if (name === 'author' || name === 'composer' || name === 'lyricist') {
        val.replace(/^(words|music|words and music)\s*(by)?\s*:\s*/i, '')
          .split(/\s*[,|&]\s*|\s+and\s+/).map(s => s.trim()).filter(Boolean)
          .forEach(a => { if (!meta.authors.includes(a)) meta.authors.push(a) })
      }
      else if (name === 'ccli' || name === 'ccli_song' || name === 'ccli_number') meta.ccli = val.replace(/[^\d]/g, '')
      else if (name === 'key') meta.key = parseChordProKey(val)
      else if (name === 'tempo') { const n = parseInt(val, 10); if (n >= 30 && n <= 300) meta.bpm = String(n) }
      else if (name === 'copyright' || name === '(c)') meta.copyright = val
      else if (['comment', 'c', 'comment_italic', 'ci', 'comment_box', 'cb'].includes(name)) { if (val) open(val) }
      else if (SECTION_ENV[name]) {
        envLabel = val || SECTION_ENV[name]
        open(envLabel)
      }
      else if (END_ENV.test(name)) envLabel = null
      continue
    }

    if (!t) continue
    if (BARE_SECTION_RE.test(t) && !t.includes('[')) { open(titleCase(t.replace(/:$/, '').toLowerCase())); continue }

    if (!cur) open('')
    if (t.includes('[')) {
      const { chords, lyric } = splitInlineChords(t)
      cur.rows.push({ chords, lyric })
    } else {
      cur.rows.push({ chords: '', lyric: t.replace(/\s{2,}/g, ' ') })
    }
  }

  return assembleSong({ ...meta, author: meta.authors.join(', ') }, sections)
}

// Builds the song shape from parsed sections ({ label, rows: [{ chords, lyric }] }).
// Raw lyrics keep each section once; identical repeats are dropped, differing ones get numbered.
// Shared by the ChordPro and PDF readers so both produce charts the editor can reconcile.
export function assembleSong(meta, sections) {
  const counts = {}
  const seen = new Map()
  const lyricBlocks = []
  const chartBlocks = []
  for (const sec of sections) {
    if (!sec.rows.length) continue
    const lyricLines = sec.rows.map(r => r.lyric).filter(Boolean)
    const body = lyricLines.join('\n')
    let label = sec.label

    if (label && seen.has(label)) {
      if (seen.get(label) === body) continue
      counts[label] = (counts[label] || 1) + 1
      label = `${label} ${counts[label]}`
    }
    if (label) seen.set(label, body)

    if (lyricLines.length) lyricBlocks.push([label ? `[${label}]` : null, ...lyricLines].filter(l => l !== null).join('\n'))

    const chartLines = []
    if (label) chartLines.push(`[${label}]`)
    for (const r of sec.rows) {
      if (r.chords) chartLines.push(r.chords)
      if (r.lyric) chartLines.push(r.lyric)
    }
    chartBlocks.push(chartLines.join('\n'))
  }

  return {
    title: meta.title || '',
    artist: meta.artist || '',
    author: meta.author || '',
    ccli: meta.ccli || '',
    key: meta.key || '',
    bpm: meta.bpm || '',
    copyright: meta.copyright || '',
    rawLyrics: lyricBlocks.join('\n\n'),
    chordChart: chartBlocks.length ? chartBlocks.join('\n\n') + '\n' : '',
  }
}
