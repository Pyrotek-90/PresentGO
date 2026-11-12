// POST /api/v1/reports/ccli  { church_id, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
// Songs used in the team's sets between two dates, for CCLI reporting — the same rows the web
// CCLI Report page shows: { rows: [{ title, ccli, writers, public_domain, missing, uses, dates }],
// sets, total_uses, csv }.

import { userDb } from '../_lib/db.js'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const csvCell = v => {
  const s = String(v ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildRows(sets, items, songs) {
  const setById = new Map(sets.map(s => [s.id, s]))
  const songById = new Map(songs.map(s => [s.id, s]))
  const bySong = new Map()
  for (const it of items) {
    const id = it.content?.song_id
    const set = setById.get(it.set_id)
    if (!id || !set) continue
    const song = songById.get(id)
    const row = bySong.get(id) || {
      title: song?.title || it.content?.song_title || 'Unknown song',
      ccli: (song?.ccli_number || '').trim(),
      writers: song?.metadata?.author || song?.artist || it.content?.song_artist || '',
      public_domain: /public domain/i.test(song?.metadata?.copyright || ''),
      missing: !song,
      sets: new Set(),
      dates: new Set(),
    }
    row.sets.add(set.id)
    if (set.service_date) row.dates.add(set.service_date)
    bySong.set(id, row)
  }
  return [...bySong.values()]
    .map(r => ({ ...r, uses: r.sets.size, dates: [...r.dates].sort(), sets: undefined }))
    .sort((a, b) => b.uses - a.uses || a.title.localeCompare(b.title))
}

export function toCsv(rows, { church = '', license = '', period = '' } = {}) {
  const lines = [
    [`CCLI Song Usage Report${church ? ` — ${church}` : ''}`],
    ['CCLI License #', license],
    ['Period', period],
    [],
    ['Song Title', 'CCLI Song #', 'Writers', 'Times Used', 'Dates Used', 'Notes'],
    ...rows.map(r => [r.title, r.ccli, r.writers, r.uses, r.dates.join('; '),
      r.public_domain ? 'Public domain' : !r.ccli ? 'Missing CCLI #' : '']),
  ]
  return lines.map(l => l.map(csvCell).join(',')).join('\r\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { church_id: churchId, from, to, church, license } = req.body || {}
  if (!/^[0-9a-f-]{36}$/i.test(churchId || '')) return res.status(400).json({ error: 'church_id required' })
  if (!DAY.test(from || '') || !DAY.test(to || '') || from > to) return res.status(400).json({ error: 'Choose a start date before the end date.' })

  const db = userDb(req)
  const { data: sets, error: e1 } = await db.from('sets').select('id, name, service_date')
    .eq('church_id', churchId).gte('service_date', from).lte('service_date', to)
  if (e1) return res.status(400).json({ error: e1.message })
  const setIds = (sets || []).map(s => s.id)
  let items = []
  if (setIds.length) {
    const { data, error } = await db.from('set_items').select('set_id, content').eq('type', 'song').in('set_id', setIds)
    if (error) return res.status(400).json({ error: error.message })
    items = data || []
  }
  const songIds = [...new Set(items.map(i => i.content?.song_id).filter(Boolean))]
  let songs = []
  if (songIds.length) {
    const { data, error } = await db.from('songs').select('id, title, artist, ccli_number, metadata').in('id', songIds)
    if (error) return res.status(400).json({ error: error.message })
    songs = data || []
  }
  const rows = buildRows(sets || [], items, songs)
  const period = `${from} – ${to}`
  return res.status(200).json({
    rows,
    sets: setIds.length,
    total_uses: rows.reduce((n, r) => n + r.uses, 0),
    csv: toCsv(rows, { church: String(church || ''), license: String(license || ''), period }),
  })
}
