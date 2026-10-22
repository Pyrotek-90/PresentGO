import Anthropic from '@anthropic-ai/sdk'
import { checkPaid } from './_lib/plan.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const plan = await checkPaid(req, 'Smart Cleanup')   // AI tools are Pro
  if (!plan.ok) return res.status(plan.status).json({ error: plan.error })

  const { lyrics } = req.body || {}
  if (!lyrics?.trim()) return res.status(400).json({ error: 'lyrics required' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AI cleanup not configured on this server.' })

  try {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-sonnet-5-5',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are cleaning up song lyrics for a church presentation app.

Rules:
- Remove all metadata lines (e.g. "Written by:", "Author:", "©", "CCLI", "Lyrics:", contributor names)
- Standardize section headers using square brackets: [Verse 1], [Verse 2], [Chorus], [Bridge], [Pre-Chorus], [Outro], [Intro], [Tag]
- If a section repeats identically, keep only the FIRST occurrence
- Remove sections labeled Tag, Echo, Echoes, Ad-lib, Spoken, Instrumental, Interlude, Background, Vamp
- Fix obvious line-break issues (a single word on its own line that belongs with the line above)
- Preserve the exact lyric wording — do NOT paraphrase or rewrite
- Separate sections with a single blank line
- Return ONLY the cleaned lyrics — no explanation, no preamble

Lyrics to clean:
${lyrics}`,
      }],
    })

    return res.json({ cleaned: response.content[0].text })
  } catch (err) {
    console.error('cleanup-lyrics error:', err)
    if (/credit balance/i.test(err.message || '')) return res.status(402).json({ error: 'AI features are paused — the Anthropic account behind StaffList is out of credits. Add credits in the Anthropic Console (Plans & Billing) and try again.' })
    return res.status(500).json({ error: err.message || 'Cleanup failed — try again.' })
  }
}
