// POST /api/v1/songs/save — create or update a song, the same way for the web app and the iOS app.
//
// Body: { id?, church_id? (new songs), title, artist?, ccli_number?, raw_lyrics, lines_per_slide?,
//         chord_chart?, metadata?: { key, bpm, author, copyright, youtube_url, preferred_key, … } }
// Returns { song } — the saved row.
//
// The server does the work every client would otherwise repeat:
//   • keeps metadata fields the client doesn't send (themes, key notes, translations, import info)
//   • keeps the chord chart's lyric lines in step with the lyrics (reconcileChart)
//   • rebuilds the slides, keeping the song's arrangement (section order) when it still fits
//   • normalises the key ("g" / "G" / "G Major" → "G Major") and fills in the language
// It writes with the caller's own access token, so the database's row-level security applies.

import { createClient } from '@supabase/supabase-js'
import { supabaseEnv } from '../_lib/auth.js'
import { buildSongSlides } from '../../src/lib/songSlides.js'
import { reconcileChart } from '../../src/lib/chart.js'
import { parseKey, formatKey } from '../../src/lib/chords.js'
import { songSections, arrangedSlides } from '../../src/lib/arrangement.js'
import { looksNonEnglish, guessLanguage } from '../../src/lib/language.js'

const str = (v, max = 200_000) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max)

export function normaliseKey(k) {
  const p = parseKey(str(k, 20))
  return p ? formatKey(p.root.toUpperCase(), p.accidental, p.mode) : ''
}

// New slides from the lyrics, in the song's previous section order if every section still exists.
export function rebuildSlides(rawLyrics, linesPer, previousSlides) {
  const fresh = buildSongSlides(rawLyrics, linesPer)
  const { sequence } = songSections({ slides: previousSlides || [] })
  if (!sequence.length) return fresh
  const available = new Set(songSections({ slides: fresh }).order)
  if (!sequence.every(label => available.has(label))) return fresh
  return arrangedSlides({ slides: fresh }, sequence)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body && typeof req.body === 'object' ? req.body : {}
  const title = str(b.title, 300).trim()
  const rawLyrics = str(b.raw_lyrics).replace(/\r\n?/g, '\n')
  if (!title) return res.status(400).json({ error: 'Song title is required.' })
  if (!b.id && !b.church_id) return res.status(400).json({ error: 'church_id is required for a new song.' })

  const { url, anon } = supabaseEnv()
  const token = req.headers.authorization.replace(/^Bearer\s+/i, '')
  const db = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let existing = null
  if (b.id) {
    const { data, error } = await db.from('songs').select('id, slides, lines_per_slide, raw_lyrics, metadata').eq('id', b.id).maybeSingle()
    if (error) return res.status(400).json({ error: error.message })
    if (!data) return res.status(404).json({ error: "That song wasn't found, or you can't edit it." })
    existing = data
  }

  const linesPer = Math.min(8, Math.max(1, parseInt(b.lines_per_slide, 10) || existing?.lines_per_slide || 2))
  const patch = b.metadata && typeof b.metadata === 'object' ? b.metadata : {}
  const metadata = { ...(existing?.metadata || {}), ...patch }

  if ('key' in patch) {
    metadata.key = normaliseKey(patch.key)
    metadata.original_key = metadata.key
  }
  const chart = 'chord_chart' in b ? str(b.chord_chart) : (metadata.chord_chart || '')
  metadata.chord_chart = rawLyrics.trim() ? reconcileChart(rawLyrics, chart) : chart
  if (!metadata.language) {
    metadata.language = looksNonEnglish(rawLyrics) ? (guessLanguage(rawLyrics) || '') : 'English'
  }

  const lyricsChanged = !existing || existing.raw_lyrics !== rawLyrics || existing.lines_per_slide !== linesPer
  const payload = {
    title,
    artist: str(b.artist, 300).trim(),
    ccli_number: str(b.ccli_number, 40).trim(),
    raw_lyrics: rawLyrics,
    lines_per_slide: linesPer,
    slides: lyricsChanged ? rebuildSlides(rawLyrics, linesPer, existing?.slides) : existing.slides,
    metadata,
  }

  const result = existing
    ? await db.from('songs').update(payload).eq('id', existing.id).select().single()
    : await db.from('songs').insert({ ...payload, user_id: req.user.id, church_id: b.church_id }).select().single()

  if (result.error) return res.status(400).json({ error: result.error.message })
  return res.status(200).json({ song: result.data })
}
