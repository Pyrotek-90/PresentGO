import Anthropic from '@anthropic-ai/sdk'
import { checkPaid } from './_lib/plan.js'

// Worship Leader Note for one song (same shape as the Sunday Song Prep reflection page):
// a summary, a pastoral reflection, and 2-3 Scripture verses (KJV, public domain).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const plan = await checkPaid(req, 'AI Worship Leader Notes')   // AI tools are Pro
  if (!plan.ok) return res.status(plan.status).json({ error: plan.error })

  const { title, artist, lyrics } = req.body || {}
  if (!title?.trim()) return res.status(400).json({ error: 'title required' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AI is not configured on this server.' })

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-5-5',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `You are helping a worship leader prepare to lead a song in a church service. Write a Worship Leader Note for this song.

Song: ${title.trim()}${artist?.trim() ? ` — ${artist.trim()}` : ''}
${lyrics?.trim() ? `Lyrics:\n${lyrics.slice(0, 6000)}` : '(No lyrics provided — base the note on what you reliably know about this song; if you do not know it, keep the note general and say nothing untrue about it.)'}

Read the lyrics carefully: the theological themes, the emotional arc, and who the song speaks to.

Return ONLY a JSON object, no other text:
{
  "summary": "one concise paragraph (2-3 sentences) capturing the song's theme and message",
  "reflection": "one warm, pastoral paragraph (3-5 sentences) connecting the song to the congregation's spiritual journey, as a worship leader would share before leading it — grounded in Scripture and inviting",
  "verses": [ { "reference": "Book chapter:verse", "text": "the verse quoted from the King James Version" } ]
}
Include 2 or 3 verses the song draws from or resonates with. Quote the King James Version exactly.`,
      }],
    })

    const out = response.content.map(b => b.text || '').join('').trim()
    const json = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1))
    const verses = (Array.isArray(json.verses) ? json.verses : [])
      .filter(v => v?.reference && v?.text).slice(0, 3)
      .map(v => ({ reference: String(v.reference).trim(), text: String(v.text).trim() }))
    if (!json.summary || !json.reflection) throw new Error('The note came back incomplete — try again.')
    return res.json({ summary: String(json.summary).trim(), reflection: String(json.reflection).trim(), verses })
  } catch (err) {
    console.error('worship-note error:', err)
    if (/credit balance/i.test(err.message || '')) return res.status(402).json({ error: 'AI features are paused — the Anthropic account behind StaffList is out of credits. Add credits in the Anthropic Console (Plans & Billing) and try again.' })
    return res.status(500).json({ error: err instanceof SyntaxError ? 'The note came back in an unexpected format — try again.' : (err.message || 'Could not write the note — try again.') })
  }
}
