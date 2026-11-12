// POST /api/v1/sets/slides  { set_id }
// Every slide of a set, in order, ready to present — the same list the web Present screen and
// Controller build: songs in the set's arrangement with the chosen translation line, welcome,
// announcements, blank and media slides. Also returns the set, its items and the songs, so the
// iOS app can save one reply for offline use.
//
// Each slide: { type, itemId, itemTitle, lines, subs?, label, sectionLabel, title?, subtitle?, image? }

import { userDb } from '../_lib/db.js'
import { buildPresentationSlides } from '../../src/lib/lyricFormatter.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const setId = String(req.body?.set_id || '')
  if (!/^[0-9a-f-]{36}$/i.test(setId)) return res.status(400).json({ error: 'set_id required' })

  const db = userDb(req)
  const [{ data: set, error: e1 }, { data: items, error: e2 }] = await Promise.all([
    db.from('sets').select('*').eq('id', setId).maybeSingle(),
    db.from('set_items').select('*').eq('set_id', setId).order('position'),
  ])
  if (e1 || e2) return res.status(400).json({ error: (e1 || e2).message })
  if (!set) return res.status(404).json({ error: "That set wasn't found, or you're not on it." })

  const songIds = [...new Set((items || []).filter(i => i.type === 'song').map(i => i.content?.song_id).filter(Boolean))]
  let songs = []
  if (songIds.length) {
    const { data, error } = await db.from('songs').select('*').in('id', songIds)
    if (error) return res.status(400).json({ error: error.message })
    songs = data || []
  }

  const slides = buildPresentationSlides(items || [], songs)
  return res.status(200).json({ set, items: items || [], songs, slides })
}
