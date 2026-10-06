const decode = t => (t || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const q = String(req.body?.q || '').trim().slice(0, 200)
  if (!q) return res.status(400).json({ error: 'q required' })

  const key = process.env.YOUTUBE_API_KEY
  if (!key) return res.status(501).json({ error: 'not_configured' })

  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search')
    url.search = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '5', videoEmbeddable: 'true', q, key }).toString()
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
    const json = await r.json()
    if (!r.ok) return res.status(502).json({ error: json?.error?.message || 'YouTube search failed' })
    const results = (json.items || []).map(i => ({
      id: i.id?.videoId,
      title: decode(i.snippet?.title),
      channel: decode(i.snippet?.channelTitle),
      thumbnail: i.snippet?.thumbnails?.default?.url,
    })).filter(v => v.id)
    return res.json({ results })
  } catch (err) {
    console.error('youtube-search error:', err)
    return res.status(502).json({ error: 'YouTube search failed' })
  }
}
