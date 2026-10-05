import Anthropic from '@anthropic-ai/sdk'

async function deezerBpm(title, artist) {
  try {
    const q = encodeURIComponent(`artist:"${artist}" track:"${title}"`)
    const ctl = AbortSignal.timeout(4000)
    const search = await fetch(`https://api.deezer.com/search?q=${q}&limit=1`, { signal: ctl }).then(r => r.json())
    const id = search?.data?.[0]?.id
    if (!id) return null
    const track = await fetch(`https://api.deezer.com/track/${id}`, { signal: AbortSignal.timeout(4000) }).then(r => r.json())
    return track?.bpm > 0 ? Math.round(track.bpm) : null
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const title = String(req.body?.title || '').trim().slice(0, 200)
  const artist = String(req.body?.artist || '').trim().slice(0, 200)
  if (!title) return res.status(400).json({ error: 'title required' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Song lookup not configured on this server.' })

  try {
    const client = new Anthropic({ apiKey })
    const [bpmFromDeezer, response] = await Promise.all([
      artist ? deezerBpm(title, artist) : Promise.resolve(null),
      client.messages.create({
        model: 'claude-sonnet-5-5',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Song: "${title}"${artist ? ` by ${artist}` : ''}

Give the original recording's details if you know them with reasonable confidence. Use null for anything you are not sure about — do not guess.
Reply with ONLY a JSON object:
{"bpm": <integer or null>, "key": <e.g. "G Major" or "E Minor", or null>, "songwriters": <comma-separated writers/composers, or null>}`,
        }],
      }),
    ])

    const text = response.content[0]?.text || ''
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}')
    const aiBpm = Number.isFinite(parsed.bpm) && parsed.bpm >= 40 && parsed.bpm <= 240 ? Math.round(parsed.bpm) : null

    return res.json({
      bpm: bpmFromDeezer ?? aiBpm,
      key: typeof parsed.key === 'string' ? parsed.key : null,
      songwriters: typeof parsed.songwriters === 'string' ? parsed.songwriters : null,
      sources: { bpm: bpmFromDeezer ? 'deezer' : aiBpm ? 'ai' : null },
    })
  } catch (err) {
    console.error('song-details error:', err)
    return res.status(500).json({ error: 'Song lookup failed.' })
  }
}
