// POST /api/v1/songs/search-lyrics  { q }
// Finds lyrics to start a song from — the same sources as the web editor (LRCLIB, then
// lyrics.ovh). Returns { results: [{ title, artist, album, lyrics }], source }.
// These are crowd-sourced and unlicensed: a quick draft only; churches confirm their CCLI license.

const TIMEOUT = 7000

async function lrclib(q) {
  const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': 'StaffList (https://stafflist.app)' }, signal: AbortSignal.timeout(TIMEOUT),
  })
  if (!r.ok) throw new Error('lrclib down')
  const json = await r.json()
  return (json || []).slice(0, 10).map(i => ({
    title: i.trackName || '', artist: i.artistName || '', album: i.albumName || '', lyrics: i.plainLyrics || '',
  }))
}

async function lyricsOvh(q) {
  const r = await fetch(`https://api.lyrics.ovh/suggest/${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(TIMEOUT) })
  if (!r.ok) throw new Error('lyrics.ovh down')
  const json = await r.json()
  const items = (json.data || []).slice(0, 8)
  const withLyrics = await Promise.allSettled(items.map(async i => {
    const lr = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(i.artist?.name || '')}/${encodeURIComponent(i.title)}`, { signal: AbortSignal.timeout(TIMEOUT) })
    const lj = await lr.json().catch(() => ({}))
    return { title: i.title, artist: i.artist?.name || '', album: '', lyrics: lj.lyrics || '' }
  }))
  return withLyrics.filter(x => x.status === 'fulfilled').map(x => x.value)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const q = String(req.body?.q || '').trim().slice(0, 200)
  if (!q) return res.status(400).json({ error: 'Type a song title or artist.' })
  try {
    const hits = await lrclib(q)
    if (hits.length) return res.status(200).json({ results: hits, source: 'lrclib' })
  } catch { /* try the next source */ }
  try {
    return res.status(200).json({ results: await lyricsOvh(q), source: 'lyrics.ovh' })
  } catch {
    return res.status(502).json({ error: 'Lyrics search is unavailable right now. Paste the lyrics instead.' })
  }
}
