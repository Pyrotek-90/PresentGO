// Song processing shared by the web app and the iOS app. The rules live here once (and in
// src/lib, which this reuses), so every client gets identical results.
//
//   POST /api/v1/songs/parse      { text, filename? }                 -> { status, song, message }
//   POST /api/v1/songs/import-pdf  (body: the PDF, ?filename=)         -> { status, song, message }
//   POST /api/v1/songs/slides     { raw_lyrics, lines_per_slide? }    -> { slides }
//   POST /api/v1/songs/chart      { raw_lyrics, chord_chart? }        -> { chord_chart }
//   POST /api/v1/songs/transpose  { chord_chart, from_key, to_key }   -> { chord_chart, key }
//   POST /api/v1/songs/keys       { key }                             -> { keys }
//   POST /api/v1/songs/language   { text }                            -> { non_english, language }
//
// All need a signed-in user (Authorization: Bearer <Supabase access token>).

import { parseChordPro, looksLikeChordPro, formatSongTitle } from '../../src/lib/chordpro.js'
import { buildSongSlides } from '../../src/lib/songSlides.js'
import { reconcileChart } from '../../src/lib/chart.js'
import { transposeChart, transposeKeyOptions, parseKey, hasChords } from '../../src/lib/chords.js'
import { looksNonEnglish, guessLanguage } from '../../src/lib/language.js'
import { parseFilename } from '../../src/lib/bulkImport.js'

const MAX_TEXT = 200_000

const str = (v, max = MAX_TEXT) => (typeof v === 'string' ? v : '').slice(0, max)
const linesPerSlide = v => Math.min(8, Math.max(1, parseInt(v, 10) || 2))

const READ_ERRORS = {
  no_text: "This PDF has no readable text (it may be a scanned image).",
  no_lyrics: 'No lyrics found in this file.',
  not_chordpro: "This file isn't a ChordPro chart.",
}

// A parsed chart (from parseChordPro or the PDF reader) as song fields, in the same shape for
// every source, plus notes for the person importing it. Mirrors the web importer.
export function songFromChart(parsed, filename = '', linesPer = 2) {
  if (parsed.error) return { status: 'error', message: READ_ERRORS[parsed.error] || 'Could not read this file.' }
  const fromName = filename ? parseFilename(String(filename)) : { title: '', ccli: '', key: '' }
  const rawLyrics = parsed.rawLyrics || ''
  const chordChart = parsed.chordChart || ''
  const lang = guessLanguage(rawLyrics)
  const song = {
    title: formatSongTitle(parsed.title || fromName.title || ''),
    artist: parsed.artist || '',
    author: parsed.author || '',
    ccli_number: parsed.ccli || fromName.ccli || '',
    key: parsed.key || fromName.key || '',
    bpm: parsed.bpm || '',
    copyright: parsed.copyright || '',
    raw_lyrics: rawLyrics,
    chord_chart: hasChords(chordChart) ? reconcileChart(rawLyrics, chordChart) : '',
    slides: buildSongSlides(rawLyrics, linesPer),
    language: lang || (looksNonEnglish(rawLyrics) ? '' : 'English'),
    translations: parsed.translations || [],
  }
  const notes = []
  if (parsed.warnings?.includes('two_column')) notes.push('Looks like a 2-column chart — check the chord placement, or re-download as 1 column.')
  if (!song.chord_chart) notes.push('No chords found — lyrics only.')
  if (song.translations.length) notes.push(`${song.translations.map(t => t.title).join(' and ')} saved with the song.`)
  return { status: 'ready', song, message: notes.join(' '), warnings: parsed.warnings || [] }
}

const actions = {
  parse(body) {
    const text = str(body.text)
    if (!text.trim()) return [400, { error: 'text required' }]
    const chordPro = looksLikeChordPro(text)
    // Plain lyrics (sections may already be marked [Verse 1]) have no chart of their own.
    const parsed = chordPro ? parseChordPro(text) : { rawLyrics: text.replace(/\r\n?/g, '\n').trim(), chordChart: '' }
    if (!parsed.error && !parsed.rawLyrics?.trim()) parsed.error = 'no_lyrics'
    return [200, { format: chordPro ? 'chordpro' : 'text', ...songFromChart(parsed, body.filename, linesPerSlide(body.lines_per_slide)) }]
  },

  slides(body) {
    return [200, { slides: buildSongSlides(str(body.raw_lyrics), linesPerSlide(body.lines_per_slide)) }]
  },

  chart(body) {
    return [200, { chord_chart: reconcileChart(str(body.raw_lyrics), str(body.chord_chart)) }]
  },

  transpose(body) {
    const from = str(body.from_key, 12), to = str(body.to_key, 12)
    if (!parseKey(from) || !parseKey(to)) return [400, { error: 'from_key and to_key must be keys like G, Bb or F#m' }]
    return [200, { chord_chart: transposeChart(str(body.chord_chart), from, to), key: to }]
  },

  keys(body) {
    const k = parseKey(str(body.key, 12))
    if (!k) return [400, { error: 'key must be a key like G, Bb or F#m' }]
    return [200, { keys: transposeKeyOptions(str(body.key, 12), k.mode) }]
  },

  language(body) {
    const text = str(body.text)
    const nonEnglish = looksNonEnglish(text)
    // language is '' when it isn't English but the name can't be told without AI (see translate-lyrics).
    return [200, { non_english: nonEnglish, language: nonEnglish ? guessLanguage(text) : 'English' }]
  },
}

export default function handler(req, res, action) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const fn = actions[action]
  if (!fn) return res.status(404).json({ error: 'Not found' })
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const [status, out] = fn(body)
  return res.status(status).json(out)
}
