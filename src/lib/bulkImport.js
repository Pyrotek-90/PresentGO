import { parseChordPro, looksLikeChordPro } from './chordpro'
import { readPdfChart } from './pdfChart'
import { buildSongSlides } from './songSlides'
import { hasChords } from './chords'

export const CHORDPRO_EXT = ['chordpro', 'cho', 'crd', 'chopro', 'pro', 'chord']
export const MAX_FILES = 500
const MAX_TEXT_BYTES = 512 * 1024
const MAX_PDF_BYTES = 20 * 1024 * 1024

const ext = name => (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
export const normTitle = s => (s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

// "07 - Goodness Of God - Chord Chart (G).pdf" → { title: "Goodness Of God", ccli, key }
export function parseFilename(name) {
  let base = name.replace(/\.[^.]+$/, '')
  const ccli = base.match(/(?:^|[\s_-])(\d{5,8})(?=$|[\s_-])/)?.[1] || ''
  const keyM = base.match(/[\s_(-]\(?(?:key\s*(?:of\s*)?)?([A-G][#b]?m?)\)?\s*$/i)
  if (ccli) base = base.replace(ccli, ' ')
  base = base
    .replace(/[\s_(-]\(?(?:key\s*(?:of\s*)?)?[A-G][#b]?m?\)?\s*$/i, '')
    .replace(/^\s*\d{1,3}\s*[-._)]\s*/, '')
    .replace(/\b(chord\s*charts?|chords|lead\s*sheet|lyrics?|chart|songselect|praisecharts|pco)\b/gi, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s*-\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s-]+|[\s-]+$/g, '')
  return { title: base, ccli, key: keyM ? keyM[1] : '' }
}

export function fileKind(file) {
  const e = ext(file.name)
  if (e === 'pdf') return 'pdf'
  if (CHORDPRO_EXT.includes(e)) return 'chordpro'
  if (e === 'txt') return 'text'
  return null
}

const isHidden = name => /(^|\/)\./.test(name) || /^__MACOSX/.test(name)

// Walks folders dropped onto the page (Chrome, Edge, Safari, Firefox).
export async function filesFromDrop(dataTransfer) {
  const entries = [...(dataTransfer.items || [])].map(i => i.webkitGetAsEntry?.()).filter(Boolean)
  if (!entries.length) return [...(dataTransfer.files || [])]
  const out = []
  const walk = async (entry, prefix) => {
    if (out.length >= MAX_FILES * 2) return
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej))
      Object.defineProperty(file, 'relPath', { value: prefix + file.name })
      out.push(file)
    } else if (entry.isDirectory) {
      const reader = entry.createReader()
      let batch
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej))
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`)
      } while (batch.length)
    }
  }
  for (const e of entries) await walk(e, '')
  return out
}

// Sorts picked files into importable charts and skipped files.
export function triageFiles(files) {
  const charts = []
  const skipped = []
  for (const file of files) {
    const path = file.relPath || file.webkitRelativePath || file.name
    if (isHidden(path)) continue
    const kind = fileKind(file)
    if (!kind) { skipped.push({ path, reason: 'Unsupported file type' }); continue }
    if (kind === 'pdf' && file.size > MAX_PDF_BYTES) { skipped.push({ path, reason: 'PDF is larger than 20 MB' }); continue }
    if (kind !== 'pdf' && file.size > MAX_TEXT_BYTES) { skipped.push({ path, reason: 'File is too large to be a chart' }); continue }
    charts.push({ id: crypto.randomUUID(), file, path, kind })
  }
  charts.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
  if (charts.length > MAX_FILES) {
    charts.slice(MAX_FILES).forEach(c => skipped.push({ path: c.path, reason: `Over the ${MAX_FILES}-file limit — import these in a second batch` }))
    charts.length = MAX_FILES
  }
  return { charts, skipped }
}

const READ_ERRORS = {
  no_text: 'No readable text — likely a scanned image or sheet music. Add this song manually.',
  no_lyrics: 'No lyrics found in this file.',
  not_chordpro: "Text file isn't in ChordPro format.",
}

// Reads one chart file into a song draft. Never throws.
export async function readChart(entry) {
  const fromName = parseFilename(entry.file.name)
  try {
    let parsed
    if (entry.kind === 'pdf') {
      parsed = await readPdfChart(entry.file)
    } else {
      const text = await entry.file.text()
      if (entry.kind === 'text' && !looksLikeChordPro(text)) parsed = { error: 'not_chordpro' }
      else parsed = parseChordPro(text)
      if (!parsed.error && !parsed.rawLyrics.trim()) parsed = { ...parsed, error: 'no_lyrics' }
    }
    if (parsed.error) return { ...entry, status: 'error', message: READ_ERRORS[parsed.error] || 'Could not read this file.' }
    const song = {
      ...parsed,
      title: parsed.title || fromName.title,
      ccli: parsed.ccli || fromName.ccli,
    }
    const notes = []
    if (parsed.warnings?.includes('two_column')) notes.push('Looks like a 2-column chart — check the chord placement, or re-download as 1 column.')
    if (!hasChords(song.chordChart)) notes.push('No chords found — lyrics only.')
    return { ...entry, status: 'ready', song, message: notes.join(' ') }
  } catch (err) {
    console.error('chart read failed', entry.path, err)
    return { ...entry, status: 'error', message: 'Could not read this file — it may be damaged or password-protected.' }
  }
}

// Marks songs already in the library (same CCLI number or title) and duplicates within the batch.
// ChordPro wins over PDF when the same song appears in both forms.
export function markDuplicates(results, existingSongs) {
  const byCcli = new Map()
  const byTitle = new Map()
  for (const s of existingSongs) {
    if (s.ccli_number) byCcli.set(String(s.ccli_number).trim(), s)
    if (s.title) byTitle.set(normTitle(s.title), s)
  }
  const rank = r => (r.kind === 'pdf' ? 1 : 0)
  const ordered = [...results].sort((a, b) => rank(a) - rank(b))
  const batchCcli = new Map()
  const batchTitle = new Map()
  const out = new Map()
  for (const r of ordered) {
    if (r.status !== 'ready') { out.set(r.id, r); continue }
    const c = r.song.ccli
    const t = normTitle(r.song.title)
    const existing = (c && byCcli.get(c)) || (t && byTitle.get(t))
    const twin = (c && batchCcli.get(c)) || (t && batchTitle.get(t))
    if (existing) out.set(r.id, { ...r, status: 'duplicate', message: `Already in your library as "${existing.title}".` })
    else if (twin) out.set(r.id, { ...r, status: 'duplicate', message: `Same song as ${twin.path}.` })
    else out.set(r.id, r)
    if (c && !batchCcli.has(c)) batchCcli.set(c, r)
    if (t && !batchTitle.has(t)) batchTitle.set(t, r)
  }
  return results.map(r => out.get(r.id))
}

export function songPayload(entry, userId, linesPerSlide = 2) {
  const s = entry.song
  return {
    user_id: userId,
    title: s.title.trim().slice(0, 200) || 'Untitled',
    artist: (s.artist || '').trim(),
    ccli_number: (s.ccli || '').trim(),
    raw_lyrics: s.rawLyrics,
    lines_per_slide: linesPerSlide,
    slides: buildSongSlides(s.rawLyrics, linesPerSlide),
    metadata: {
      key: s.key || '',
      original_key: s.key || '',
      chord_chart: s.chordChart || '',
      bpm: s.bpm || '',
      themes: [],
      author: s.author || '',
      copyright: s.copyright || '',
      youtube_url: '',
      transposed_keys: [],
      import_source: entry.kind === 'pdf' ? 'pdf' : 'chordpro',
      import_file: entry.path,
    },
  }
}
