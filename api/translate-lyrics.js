import Anthropic from '@anthropic-ai/sdk'
import { checkPaid } from './_lib/plan.js'

// Translates song lyrics into English line by line, keeping the same [Section] labels and the
// same number of lines in each section so the translation can line up with the slides.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const plan = await checkPaid(req, 'Translate')   // AI tools are Pro
  if (!plan.ok) return res.status(plan.status).json({ error: plan.error })

  const { lyrics, detect } = req.body || {}
  if (!lyrics?.trim()) return res.status(400).json({ error: 'lyrics required' })
  if (lyrics.length > 12000) return res.status(400).json({ error: 'These lyrics are too long to translate in one go.' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Translation is not configured on this server.' })

  try {
    const client = new Anthropic({ apiKey })

    // Just name the language (used to label lyrics that came with a translation, e.g. from a PDF).
    if (detect) {
      const r = await client.messages.create({
        model: 'claude-sonnet-5-5',
        max_tokens: 20,
        messages: [{ role: 'user', content: `What language are these song lyrics in? They may be romanized (for example Hindi written in English letters). Reply with only the language name in English, one or two words.\n\n${lyrics.slice(0, 2000)}` }],
      })
      const language = r.content.map(b => b.text || '').join('').trim().replace(/[.\n].*$/s, '').slice(0, 30)
      return res.json({ language })
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-5-5',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `You are translating worship song lyrics into English for a church presentation app, so the congregation can follow the meaning.

Rules:
- The lyrics may be in any language and may be romanized (for example Hindi or Urdu written in English letters). Lines already in English stay as they are.
- Translate line by line: every lyric line gets exactly one English line, in the same order. Never merge or split lines.
- Keep every section header (lines like [Verse 1] or [Chorus]) exactly as written, in the same place. Keep blank lines between sections.
- Faithful, natural, reverent English. Keep the meaning; do not add ideas. Names of God may be rendered in English (Yeshu / Yesu / Isa Masih → Jesus, Prabhu → Lord) when that is clearly the meaning.
- First line of your reply: "LANGUAGE: <name of the source language>". Then a blank line, then the translation only. No notes or explanations.

Lyrics:
${lyrics}`,
      }],
    })

    const out = response.content.map(b => b.text || '').join('').trim()
    const m = out.match(/^LANGUAGE:\s*(.+)\n+/i)
    const language = m ? m[1].trim() : ''
    const text = (m ? out.slice(m[0].length) : out).trim()
    if (!text) throw new Error('No translation came back — try again.')
    return res.json({ language, text })
  } catch (err) {
    console.error('translate-lyrics error:', err)
    if (/credit balance/i.test(err.message || '')) return res.status(402).json({ error: 'AI features are paused — the Anthropic account behind StaffList is out of credits. Add credits in the Anthropic Console (Plans & Billing) and try again.' })
    return res.status(500).json({ error: err.message || 'Translation failed — try again.' })
  }
}
