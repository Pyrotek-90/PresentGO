// POST (or GET) /api/v1/thoughts/week  { date?: 'YYYY-MM-DD' }
// This week's worship thought — the same one the web Home page shows (src/lib/worshipThoughts.js),
// new each Sunday: { title, thought, text, ref, week_of }.

import { thoughtForWeek } from '../../src/lib/worshipThoughts.js'

export default function handler(req, res) {
  const asked = (req.body && req.body.date) || req.query?.date
  const date = /^\d{4}-\d{2}-\d{2}$/.test(asked || '') ? new Date(`${asked}T12:00:00`) : new Date()
  const t = thoughtForWeek(date)
  const sunday = new Date(date)
  sunday.setDate(date.getDate() - date.getDay())
  res.setHeader('Cache-Control', 'public, max-age=3600')
  return res.status(200).json({ title: t.title, thought: t.thought, text: t.text, ref: t.ref, week_of: sunday.toISOString().slice(0, 10) })
}
