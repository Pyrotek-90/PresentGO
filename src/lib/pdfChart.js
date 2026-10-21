import { isChordLine, isBarToken } from './chords'
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
// "----- ENGLISH TRANSLATION -----", "English Singable Version", "Meaning": everything after
// it is a translation of the song, kept separately from the chart.
const DIVIDER_RE = /^[-–—=_~*•\s]{3,}(.+?)[-–—=_~*•\s]{3,}$/
const TRANSLATION_RE = /\b(translation|translated|singable|meaning|english\s+version|transliteration)\b/i
// Repeat marks at the end of a lyric line: "2X", "x2", "(2x)", "×3".
const REPEAT_RE = /\s+\(?\s*(?:[x×]\s*\d+|\d+\s*[x×])\s*\)?\s*$/i
const PAGE_NO_RE = /^\d{1,3}$/
// A repeat mark ending a lyric line ("2X", "x2", "(2x)", "- 2") becomes the app's own "-2X",
// which the Song Viewer highlights and slides leave out.
const DASH_REPEAT_RE = /\s+[-–—]\s*(\d)\s*$/
function repeatMark(lyric) {
  const m = lyric.match(REPEAT_RE) || lyric.match(DASH_REPEAT_RE)
  if (!m) return lyric
  const n = m[0].match(/\d+/)[0]
  return `${lyric.slice(0, m.index).replace(/\s+$/, '')} -${n}X`
}

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjs
}

const median = arr => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// Text runs of one page: drops empty runs and tiny marks (chord-diagram finger dots,
// strokes: very small symbols only a character or two long), keeps small header/footer text
// and small letters or numbers such as a footer's "KEY: C",
// and joins raised chord extensions back onto their chord.
function pageRuns(items) {
  const runs = items
    .filter(it => it.str && it.str.trim())
    .map(it => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      size: Math.abs(it.transform[3]) || it.height || 10,
    }))
  const body = median(runs.map(r => r.size))
  return joinSuperscripts(runs.filter(r => !(r.size < body * 0.6 && r.str.trim().length <= 2 && !/^[A-Za-z0-9]/.test(r.str.trim()))))
}

// SongSelect and similar charts print a chord's extension as a smaller raised run right
// after the root: "Bm" + "7", "G" + "2(no3)", "Em" + "7(4)". Glue each back onto its chord,
// dropping parenthesised details ("(4)", "(no3)") the team doesn't need.
const CHORD_ROOT_RE = /^[A-G][#b♭]?(m|maj|min|dim|aug|sus)?$/
const EXT_RE = /^(maj|m|min|sus|add|dim|aug|M|\d|\+|°|ø|#|b|♭|\(|\)|[a-z0-9])+$/
function joinSuperscripts(runs) {
  const used = new Set()
  for (const s of runs) {
    const t = s.str.trim()
    if (!EXT_RE.test(t)) continue
    const host = runs.find(c => c !== s && !used.has(c) && c.size > s.size * 1.1 && CHORD_ROOT_RE.test(c.str.trim())
      && Math.abs(s.x - (c.x + c.w)) <= Math.max(3, c.size * 0.25) && s.y >= c.y - 0.5 && s.y - c.y <= c.size * 0.6)
    if (!host) continue
    host.str = host.str.trim() + t.replace(/\([^)]*\)/g, '')
    host.w = s.x + s.w - host.x
    used.add(s)
  }
  return runs.filter(r => !used.has(r))
}

// Two-column charts (e.g. chords on the left, a translation on the right): finds a left
// edge that many runs share, with nothing on the page crossing it. Returns that x or null.
function findGutter(runs) {
  if (runs.length < 12) return null
  const minX = Math.min(...runs.map(r => r.x))
  const maxX = Math.max(...runs.map(r => r.x + r.w))
  const starts = {}
  for (const r of runs) { const k = Math.round(r.x / 3) * 3; starts[k] = (starts[k] || 0) + 1 }
  const candidates = Object.entries(starts)
    .map(([k, n]) => ({ x: Number(k), n }))
    .filter(c => c.n >= 5 && c.x > minX + (maxX - minX) * 0.25 && c.x < minX + (maxX - minX) * 0.75)
    .sort((a, b) => b.n - a.n)
  for (const c of candidates) {
    const split = c.x - 4
    const crosses = runs.some(r => r.x < split && r.x + r.w > split + 2)
    const left = runs.filter(r => r.x < split).length
    if (!crosses && left >= 5) return split
  }
  return null
}

// Groups runs into rows and lays each row out on a character grid.
function runsToRows(runs, pageNo) {
  if (!runs.length) return []
  const widths = runs.filter(r => r.str.trim().length >= 4).map(r => r.w / r.str.length)
  const charW = median(widths) || median(runs.map(r => r.size)) * 0.5 || 5
  const left = Math.min(...runs.map(r => r.x))

  runs = [...runs].sort((a, b) => b.y - a.y || a.x - b.x)
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
    const spans = []   // where each run landed in `text`, so chords can be matched to lyrics by position
    for (const r of row.runs) {
      const gap = prevEnd === null ? null : r.x - prevEnd
      if (gap !== null && gap <= charW * 0.3) {
        // touching runs are one word split by the PDF (often at a chord): join them as-is,
        // never pad them out to the character grid ("prasanna me" → "prasanname")
      } else {
        const col = Math.max(0, Math.round((r.x - left) / charW))
        if (col > text.length + (text ? 1 : 0)) text += ' '.repeat(col - text.length)
        else if (text && !/\s$/.test(text) && !/^\s/.test(r.str)) text += ' '
      }
      spans.push({ x: r.x, w: r.w, start: text.length, len: r.str.length })
      text += r.str
      prevEnd = r.x + r.w
    }
    return { text: text.replace(/\s+$/, ''), size: row.size, y: row.y, page: pageNo, spans, charW, left }
  }).filter(r => r.text.trim())
}

// Character index in a row's text that sits at horizontal position x (via the row's runs).
function idxAtX(row, x) {
  const spans = row.spans || []
  for (const s of spans) {
    if (x < s.x - 0.5) return s.start
    if (x <= s.x + s.w) return s.start + Math.min(s.len, Math.round(((x - s.x) / (s.w || 1)) * s.len))
  }
  const last = spans[spans.length - 1]
  if (!last) return Math.max(0, Math.round((x - (row.left || 0)) / (row.charW || 5)))
  return last.start + last.len + Math.max(0, Math.round((x - (last.x + last.w)) / (row.charW || 5)))
}
// Horizontal position of a character index in a row's text.
function xAtIdx(row, idx) {
  const spans = row.spans || []
  for (const s of spans) if (idx >= s.start && idx < s.start + s.len) return s.x + ((idx - s.start) / (s.len || 1)) * s.w
  return (row.left || 0) + idx * (row.charW || 5)
}

// A chord-only row standing alone well below the rest of a column is a chord-diagram
// legend (the G / Am / D boxes printed at the bottom of many charts), not part of the song.
// Exception: a chord row with strum slashes printed under it is the song's rhythm pattern; keep
// it (as a "Rhythm" section) instead of dropping it.
function dropDiagramLegend(rows, slashes = []) {
  if (rows.length < 3) return rows
  const last = rows[rows.length - 1], prev = rows[rows.length - 2]
  const gaps = rows.slice(1).map((r, i) => rows[i].y - r.y).filter(g => g > 0)
  const lineGap = median(gaps) || last.size * 1.2
  if (!(isChordRow(last.text) && prev.y - last.y > lineGap * 2.5)) return rows
  const strum = slashes.some(r => r.y < last.y && last.y - r.y <= last.size * 4)
  return strum ? [...rows.slice(0, -1), { ...last, rhythm: true }] : rows.slice(0, -1)
}

// One page in reading order: header lines (title, writers), then the song (left column,
// then right column when the page has two), then footer lines (page number, website,
// Key / Tempo printed at the bottom). Footer rows are marked so they never become lyrics.
function pageRows(items, pageNo) {
  const runs = pageRuns(items)
  const slashes = items.filter(it => /^\/+$/.test((it.str || '').trim())).map(it => ({ y: it.transform[5] }))
  if (!runs.length) return []
  const body = median(runs.map(r => r.size))
  const bodyRuns = runs.filter(r => r.size >= body * 0.8 && r.size <= body * 1.25)
  const top = Math.max(...bodyRuns.map(r => r.y))
  const bottom = Math.min(...bodyRuns.map(r => r.y))
  const footer = runs.filter(r => r.y < bottom - 1)
  let mid = runs.filter(r => r.y >= bottom - 1)

  const split = findGutter(mid.filter(r => r.y <= top + 1))
  const tag = zone => rows => rows.map(r => ({ ...r, zone }))
  const footerRows = tag('footer')(runsToRows(footer, pageNo))
  if (split == null) return [...dropDiagramLegend(runsToRows(mid, pageNo), slashes), ...footerRows]

  // Two columns: everything above where the right column starts is header (title, Key / Tempo).
  const colX = Math.min(...mid.filter(r => r.x >= split).map(r => r.x))
  const rightTop = Math.max(...mid.filter(r => r.x >= split && r.x <= colX + 6).map(r => r.y + r.size * 0.5))
  const header = mid.filter(r => r.y > rightTop + 2)
  mid = mid.filter(r => r.y <= rightTop + 2)
  return [
    ...runsToRows(header, pageNo),
    ...dropDiagramLegend(runsToRows(mid.filter(r => r.x < split), pageNo), slashes),
    ...dropDiagramLegend(runsToRows(mid.filter(r => r.x >= split), pageNo), slashes),
    ...footerRows,
  ]
}


// Notes printed among the chords, e.g. "(Last x)", "(Repeat)", "(2x)": not chords.
const stripNotes = text => text.replace(/\(([^)]*)\)/g, (m, inner) => (isChordLine(inner) ? m : ' '.repeat(m.length)))

// Removes bar lines, slashes and repeat marks so "| G / / | D |" counts as a chord row.
function chordRowTokens(text) {
  const toks = stripNotes(text).trim().split(/\s+/).filter(t => t && !BAR_TOKEN_RE.test(t))
  return toks
}
// A chord-only line as it should appear in the chart: bar lines and spacing kept, notes removed.
const chordOnlyLine = raw => stripNotes(raw).replace(/\s+$/, '').replace(/^\s+/, '')
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

// Places chords from a chord row over the lyric row beneath it. Each chord goes over the lyric
// letter printed directly under it (matched by position on the page, so proportional fonts
// line up); rows without position data fall back to character columns.
function alignChords(chordRow, lyricRow) {
  const lyricRaw = lyricRow.text
  const indent = lyricRaw.match(/^\s*/)[0].length
  const lyric = cleanLyric(lyricRaw.slice(indent))
  const byPos = !!(chordRow.spans?.length && lyricRow.spans?.length)
  let chords = ''
  const re = /\S+/g
  const chordText = stripNotes(chordRow.text)
  let m
  while ((m = re.exec(chordText))) {
    if (BAR_TOKEN_RE.test(m[0])) continue
    const col = byPos ? idxAtX(lyricRow, xAtIdx(chordRow, m.index)) : m.index
    const pos = Math.max(lyric.at(Math.max(0, col - indent)), chords.length ? chords.length + 1 : 0)
    chords += ' '.repeat(pos - chords.length) + m[0]
  }
  return { chords, lyric: lyric.text }
}

// Some PDFs space out letters after certain capitals ("C hris", "W orship"); rejoin them.
const fixKerning = t => t.replace(/\b([B-HJ-Z]) (?=[a-z]{2,})/g, '$1').replace(/\bw (?=ith\b)/g, 'w')

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

  // Footer and licensing lines: keep the CCLI number, copyright, Key and Tempo; drop the rest.
  rows = rows.filter(r => {
    const t = r.text.trim()
    if (r.zone === 'footer') {
      const ccliF = t.match(CCLI_RE)
      if (ccliF && !meta.ccli) meta.ccli = ccliF[1]
      const kF = t.match(KEY_RE)
      if (kF && !meta.key) meta.key = parseChordProKey(kF[1])
      const tF = t.match(TEMPO_RE)
      if (tF && !meta.bpm) meta.bpm = String(tF[1] || tF[2])
      if (!meta.copyright && /©|\(c\)|copyright/i.test(t)) meta.copyright = fixKerning(t).replace(/^.*?(©|\(c\)|copyright)/i, '©').replace(/\s{2,}/g, ' ').slice(0, 300)
      return false
    }
    const ccli = t.match(CCLI_RE)
    if (ccli && !meta.ccli) meta.ccli = ccli[1]
    if (FOOTER_RE.test(t)) {
      if (!meta.copyright && /©|\(c\)|copyright/i.test(t)) meta.copyright = fixKerning(t).replace(/^.*?(©|\(c\)|copyright)/i, '©').replace(/\s{2,}/g, ' ').slice(0, 300)
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
    const t = fixKerning(r.text.trim().replace(/\s{2,}/g, ' '))
    let used = false
    const k = t.match(KEY_RE)
    if (k) { meta.key = parseChordProKey(k[1]); used = true }
    const tm = t.match(TEMPO_RE)
    if (tm) { meta.bpm = String(tm[1] || tm[2]); used = true }
    if (used || /\btime\s*[:\u2013-]?\s*\d+\s*\/\s*\d+/i.test(t)) continue
    const artist = t.match(/(?:recording|recorded|performed|sung)\s+by\s*:?\s*(.+)$|^artist\s*:\s*(.+)$/i)
    if (artist) {
      if (!meta.artist) meta.artist = (artist[1] || artist[2]).replace(/\)+\s*$/, '').replace(/[,;]?\s*\b(feat\.?|featuring|ft\.?)\s.*$/i, '').trim()
      continue
    }
    // Writer lines: "Words and Music by A | B", "Original Words by C", "Addt'l. Words and Music by D".
    const byLine = t.match(/\b(?:words|music|lyrics|written|composed)\b[^:]*?\bby\s*:?\s*(.+)$/i)
    if (!byLine && /\b(scripture|reference|capo|ccli|copyright|©|bpm|tempo)\b/i.test(t)) continue
    const names = byLine ? byLine[1] : (!meta.author && t.length <= 160 ? t : '')
    if (!names) continue
    const list = names.split(/\s*(?:\||,|;|&|\band\b)\s*/i).map(n => n.replace(/^[()\s]+|[()\s]+$/g, '')).filter(Boolean)
    const have = meta.author ? meta.author.split(/,\s*/) : []
    meta.author = [...new Set([...have, ...list])].join(', ')
  }
  rows = rows.slice(headerEnd)

  // Running headers on later pages (title, Key / Tempo or writers repeated) and page numbers.
  const titleKey = normTitle(meta.title)
  rows = rows.filter(r => {
    const t = r.text.trim()
    if (PAGE_NO_RE.test(t)) return false
    if (r.page === 1) return true
    if (titleKey && normTitle(t).startsWith(titleKey)) return false
    return !/^(key|tempo|time|bpm)\b\s*[:\u2013\u2014-]?\s*\S+(\s*[|·,]\s*(key|tempo|time|bpm)\b.*)?$/i.test(t)
  })


  const sections = []
  let cur = null
  const open = label => { cur = { label, rows: [] }; sections.push(cur) }
  const translations = []   // [{ title, sections: [{ label, lines }] }]
  let tr = null

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i].text
    const t = raw.trim()

    // Translation blocks: kept for slides, never part of the chord chart.
    const div = t.match(DIVIDER_RE)
    if ((div && TRANSLATION_RE.test(div[1])) || (TRANSLATION_RE.test(t) && t.length <= 40 && !isChordRow(raw))) {
      tr = { title: titleCase((div ? div[1] : t).replace(/[:\-–—]+$/, '').trim().toLowerCase()), sections: [] }
      translations.push(tr)
      continue
    }
    if (tr) {
      const th = t.match(SECTION_RE)
      if (th) { tr.sections.push({ label: titleCase(`${th[1]}${th[2] ? ' ' + th[2] : ''}`.toLowerCase()), lines: [] }); continue }
      if (isChordRow(raw)) continue
      if (!tr.sections.length) tr.sections.push({ label: '', lines: [] })
      tr.sections[tr.sections.length - 1].lines.push(cleanLyric(t).text.replace(REPEAT_RE, ''))
      continue
    }

    const h = t.match(SECTION_RE)
    if (h) { open(titleCase(`${h[1]}${h[2] ? ' ' + h[2] : ''}`.toLowerCase())); continue }
    const hp = t.match(SECTION_PREFIX_RE)
    if (hp && isChordRow(hp[3])) {
      open(titleCase(`${hp[1]}${hp[2] ? ' ' + hp[2] : ''}`.toLowerCase()))
      cur.rows.push({ chords: chordOnlyLine(hp[3]), lyric: '' })
      continue
    }

    if (rows[i].rhythm) open('Rhythm')
    if (!cur) open('')
    if (isChordRow(raw)) {
      const next = rows[i + 1]
      const nt = next?.text.trim() || ''
      if (next && next.page === rows[i].page && nt && !isChordRow(next.text) && !SECTION_RE.test(nt) && !SECTION_PREFIX_RE.test(nt)) {
        const pair = alignChords(rows[i], next)
        cur.rows.push({ ...pair, lyric: repeatMark(pair.lyric) })
        i++
      } else {
        cur.rows.push({ chords: chordOnlyLine(raw), lyric: '' })
      }
      continue
    }
    cur.rows.push({ chords: '', lyric: repeatMark(cleanLyric(t).text) })
  }

  const song = assembleSong(meta, sections)
  if (!song.rawLyrics.trim()) return { error: 'no_lyrics', ...song, warnings }
  const translationList = translations
    .map(b => ({
      title: b.title,
      text: b.sections.filter(sec => sec.lines.length)
        .map(sec => [sec.label ? `[${sec.label}]` : null, ...sec.lines].filter(l => l !== null).join('\n')).join('\n\n'),
    }))
    .filter(b => b.text.trim())
  return { ...song, warnings, ...(translationList.length ? { translations: translationList } : {}) }
}
