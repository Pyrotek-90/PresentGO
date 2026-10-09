import { isChordLine } from './chords'
import { assembleSong, parseChordProKey, titleCase } from './chordpro'

// Reads a text-based PDF chord chart (SongSelect, Planning Center, PraiseCharts chord charts,
// or anything printed from a chart app) into the same song shape as the ChordPro reader.
// It rebuilds each text row from the positions of the PDF's text runs, then treats rows made
// only of chords as chord lines over the lyric row beneath. Scanned images and notation-only
// sheet music have no readable text and are reported as unreadable.

const MAX_PAGES = 8

const SECTION_RE = /^(intro|verse|chorus|pre-?chorus|post-?chorus|bridge|tag|outro|ending|interlude|instrumental|turnaround|refrain|vamp|coda|channel|breakdown|misc)\b\.?\s*(\d+[a-z]?)?\s*[:.]?\s*(\(?\s*x\s*\d+\s*\)?)?$/i
const SECTION_PREFIX_RE = /^(intro|verse|chorus|pre-?chorus|post-?chorus|bridge|tag|outro|ending|interlude|instrumental|turnaround|refrain|vamp|coda)\b\.?\s*(\d+[a-z]?)?\s*[:.]?\s+(.+)$/i
const FOOTER_RE = /(ccli\s*(song|license|lic)|for use solely|terms of use|all rights reserved|www\.ccli|songselect|praisecharts\.com|planning\s*center|©|\(c\)\s|\bcopyright\b|\badmin\.?\s+(by|at)\b|^page\s+\d+(\s+of\s+\d+)?$|^public\s+domain\.?$|^\d+\s*(\/|of)\s*\d+$)/i
const CCLI_RE = /CCLI\s*Song\s*(?:#|No\.?|Number)?\s*:?\s*(\d{3,8})/i
const KEY_RE = /\bKey\s*(?:of|[:\u2013\u2014-])?\s*([A-G](?:#|b|♭)?m?)(?![a-z#])/i
const TEMPO_RE = /(?:\bTempo\s*[:\u2013\u2014-]?\s*(\d{2,3})\b|\b(\d{2,3})\s*bpm\b)/i
const BAR_TOKEN_RE = /^(\||\|\||\/+|%|-+|\.+|\(?x\s*\d+\)?|\(|\))$/i

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjs
}

const median = arr => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// Groups a page's text runs into rows and lays each row out on a character grid.
function pageRows(items, pageNo) {
  const runs = items
    .filter(it => it.str && it.str.trim())
    .map(it => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      size: Math.abs(it.transform[3]) || it.height || 10,
    }))
  if (!runs.length) return []

  const widths = runs.filter(r => r.str.trim().length >= 4).map(r => r.w / r.str.length)
  const charW = median(widths) || median(runs.map(r => r.size)) * 0.5 || 5
  const left = Math.min(...runs.map(r => r.x))

  runs.sort((a, b) => b.y - a.y || a.x - b.x)
  const rows = []
  for (const r of runs) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(row.y - r.y) <= Math.min(row.size, r.size) * 0.3) row.runs.push(r)
    else rows.push({ y: r.y, size: r.size, runs: [r] })
    const cur = rows[rows.length - 1]
    cur.size = Math.max(cur.size, r.size)
  }

  return rows.map(row => {
    row.runs.sort((a, b) => a.x - b.x)
    let text = ''
    let prevEnd = null
    for (const r of row.runs) {
      const col = Math.max(0, Math.round((r.x - left) / charW))
      if (col > text.length) {
        text += ' '.repeat(col - text.length)
      } else if (text && prevEnd !== null && r.x - prevEnd > charW * 0.3 && !/\s$/.test(text) && !/^\s/.test(r.str)) {
        text += ' '
      }
      text += r.str
      prevEnd = r.x + r.w
    }
    return { text: text.replace(/\s+$/, ''), size: row.size, page: pageNo }
  }).filter(r => r.text.trim())
}

// Removes bar lines, slashes and repeat marks so "| G / / | D |" counts as a chord row.
function chordRowTokens(text) {
  const toks = text.trim().split(/\s+/).filter(t => !BAR_TOKEN_RE.test(t))
  return toks
}
function isChordRow(text) {
  const toks = chordRowTokens(text)
  return toks.length > 0 && isChordLine(toks.join(' '))
}

// Joins split syllables ("A - maz - ing") and collapses spaces, remembering where each
// original column ended up so chords above the line can be moved with their syllables.
function cleanLyric(s) {
  let out = ''
  const map = new Array(s.length + 1)
  let i = 0
  while (i < s.length) {
    const prev = out[out.length - 1]
    if (prev && /[a-z']/i.test(prev)) {
      const m = s.slice(i).match(/^(\s+-\s*|-\s+)(?=[a-z])/i)
      if (m) {
        for (let k = 0; k < m[0].length; k++) map[i + k] = out.length
        i += m[0].length
        continue
      }
    }
    if (/\s/.test(s[i]) && (!out || /\s$/.test(out))) { map[i] = out.length; i++; continue }
    map[i] = out.length
    out += /\s/.test(s[i]) ? ' ' : s[i]
    i++
  }
  map[s.length] = out.length
  const trimmed = out.replace(/\s+$/, '')
  return { text: trimmed, at: idx => idx <= s.length ? Math.min(map[idx] ?? trimmed.length, trimmed.length) : trimmed.length + (idx - s.length) }
}

// Places chords from a chord row over a lyric row that started `indent` columns in.
function alignChords(chordText, lyricRaw) {
  const indent = lyricRaw.match(/^\s*/)[0].length
  const lyric = cleanLyric(lyricRaw.slice(indent))
  let chords = ''
  const re = /\S+/g
  let m
  while ((m = re.exec(chordText))) {
    if (BAR_TOKEN_RE.test(m[0])) continue
    const pos = Math.max(lyric.at(Math.max(0, m.index - indent)), chords.length ? chords.length + 1 : 0)
    chords += ' '.repeat(pos - chords.length) + m[0]
  }
  return { chords, lyric: lyric.text }
}

const normTitle = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export async function readPdfChart(file) {
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = []
  for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p++) {
    const page = await doc.getPage(p)
    pages.push((await page.getTextContent()).items)
  }
  doc.destroy?.()
  return chartFromTextItems(pages)
}

// pages: one array of pdf.js text items per page.
export function chartFromTextItems(pages) {
  let rows = pages.flatMap((items, i) => pageRows(items, i + 1))
  if (!rows.length) return { error: 'no_text' }

  const meta = { title: '', artist: '', author: '', ccli: '', key: '', bpm: '', copyright: '' }
  const warnings = []

  // Footer and licensing lines: keep the CCLI number and copyright, drop the rest.
  rows = rows.filter(r => {
    const t = r.text.trim()
    const ccli = t.match(CCLI_RE)
    if (ccli && !meta.ccli) meta.ccli = ccli[1]
    if (FOOTER_RE.test(t)) {
      if (!meta.copyright && /©|\(c\)|copyright/i.test(t)) meta.copyright = t.replace(/^.*?(©|\(c\)|copyright)/i, '©').replace(/\s{2,}/g, ' ').slice(0, 300)
      return false
    }
    return true
  })
  if (!rows.length) return { error: 'no_lyrics', ...meta }

  // Title: the largest text near the top of the first page.
  const top = rows.filter(r => r.page === 1).slice(0, 5)
  const bodySize = median(rows.map(r => r.size))
  const biggest = top.reduce((a, b) => (b.size > a.size ? b : a), top[0])
  const titleRow = biggest && biggest.size > bodySize * 1.12 ? biggest : top[0]
  if (titleRow && !isChordRow(titleRow.text) && !SECTION_RE.test(titleRow.text.trim())) {
    meta.title = titleRow.text.trim().replace(/\s{2,}/g, ' ')
    rows = rows.filter(r => r !== titleRow)
  }

  // Header lines between the title and the first section or chord row.
  const firstBody = rows.findIndex(r => SECTION_RE.test(r.text.trim()) || SECTION_PREFIX_RE.test(r.text.trim()) || isChordRow(r.text))
  const headerEnd = firstBody < 0 ? 0 : firstBody
  const header = rows.slice(0, headerEnd)
  for (const r of header) {
    const t = r.text.trim().replace(/\s{2,}/g, ' ')
    let used = false
    const k = t.match(KEY_RE)
    if (k) { meta.key = parseChordProKey(k[1]); used = true }
    const tm = t.match(TEMPO_RE)
    if (tm) { meta.bpm = String(tm[1] || tm[2]); used = true }
    if (used || /\btime\s*[:\u2013-]?\s*\d+\s*\/\s*\d+/i.test(t)) continue
    if (/recorded by|artist\s*:/i.test(t)) { if (!meta.artist) meta.artist = t.replace(/^.*?(recorded by|artist\s*:)\s*/i, '') }
    else if (!meta.author && t.length <= 160) meta.author = t
      .replace(/^(words\s*(and|&)\s*music|words|music|written)?\s*(by)?\s*:?\s*/i, '')
      .replace(/[,;|]?\s*\b(words|music)(\s*(and|&)\s*music)?\s*by\s*:?\s*/gi, ', ')
      .replace(/^[,\s]+|[,\s]+$/g, '')
  }
  rows = rows.slice(headerEnd)

  // Running headers on later pages (title or writers repeated).
  const titleKey = normTitle(meta.title)
  rows = rows.filter(r => !(r.page > 1 && titleKey && normTitle(r.text).startsWith(titleKey)))

  const bodyRows = rows.filter(r => !isChordRow(r.text))
  const twoCol = bodyRows.filter(r => /\S {10,}\S/.test(r.text.trim())).length
  if (bodyRows.length > 6 && twoCol / bodyRows.length > 0.3) warnings.push('two_column')

  const sections = []
  let cur = null
  const open = label => { cur = { label, rows: [] }; sections.push(cur) }

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i].text
    const t = raw.trim()

    const h = t.match(SECTION_RE)
    if (h) { open(titleCase(`${h[1]}${h[2] ? ' ' + h[2] : ''}`.toLowerCase())); continue }
    const hp = t.match(SECTION_PREFIX_RE)
    if (hp && isChordRow(hp[3])) {
      open(titleCase(`${hp[1]}${hp[2] ? ' ' + hp[2] : ''}`.toLowerCase()))
      cur.rows.push({ chords: chordRowTokens(hp[3]).join(' '), lyric: '' })
      continue
    }

    if (!cur) open('')
    if (isChordRow(raw)) {
      const next = rows[i + 1]
      const nt = next?.text.trim() || ''
      if (next && next.page === rows[i].page && nt && !isChordRow(next.text) && !SECTION_RE.test(nt) && !SECTION_PREFIX_RE.test(nt)) {
        cur.rows.push(alignChords(raw, next.text))
        i++
      } else {
        cur.rows.push({ chords: chordRowTokens(raw).join(' '), lyric: '' })
      }
      continue
    }
    cur.rows.push({ chords: '', lyric: cleanLyric(t).text })
  }

  const song = assembleSong(meta, sections)
  if (!song.rawLyrics.trim()) return { error: 'no_lyrics', ...song, warnings }
  return { ...song, warnings }
}
