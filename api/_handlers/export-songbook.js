import { buildSongbookHtml } from '../../src/lib/songbook.js'

// Settings → Export Song Library: every song in the team's library as one PDF songbook.
// Paid plans only (Solo, Pro, Ultimate). Reads the songs with the caller's own login, so the
// database's rules decide what they can see, then prints the songbook page with headless Chrome.
//   POST { church_id }  (Authorization: Bearer <access token>)  →  application/pdf

const PAID = ['solo', 'pro', 'ultimate']
const PAGE = 1000

async function rest(path, auth) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  return fetch(`${url}/rest/v1/${path}`, { headers: { apikey: anon, Authorization: auth }, signal: AbortSignal.timeout(15000) })
}

async function launch() {
  const puppeteer = (await import('puppeteer-core')).default
  if (process.env.CHROME_PATH) {   // local testing
    return puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'], headless: true })
  }
  const chromium = (await import('@sparticuz/chromium')).default
  return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = req.headers.authorization || ''
  if (!/^Bearer\s+\S+/.test(auth)) return res.status(401).json({ error: 'Please sign in again to export.' })
  const churchId = req.body?.church_id
  const legacy = !churchId

  // The team, its plan, and that the caller belongs to it.
  let teamName = 'My'
  if (!legacy) {
    if (!/^[0-9a-f-]{36}$/i.test(churchId)) return res.status(400).json({ error: 'Unknown team.' })
    const r = await rest(`churches?id=eq.${churchId}&select=name,plan`, auth)
    if (r.status === 401) return res.status(401).json({ error: 'Please sign in again to export.' })
    const team = r.ok ? (await r.json())[0] : null
    if (!team) return res.status(403).json({ error: "You're not on this team." })
    if (!PAID.includes(team.plan)) {
      return res.status(402).json({ error: 'Exporting the Song Library is part of the paid plans. Upgrade in Settings → Subscription Plans.' })
    }
    teamName = team.name
  }

  // Every song the caller can see in this team, a page at a time.
  const songs = []
  const filter = legacy ? '' : `church_id=eq.${churchId}&`
  for (let from = 0; ; from += PAGE) {
    const r = await rest(`songs?${filter}select=id,title,artist,ccli_number,raw_lyrics,metadata&order=title.asc&limit=${PAGE}&offset=${from}`, auth)
    if (!r.ok) return res.status(502).json({ error: 'Could not read your songs. Please try again.' })
    const rows = await r.json()
    songs.push(...rows)
    if (rows.length < PAGE) break
  }
  if (!songs.length) return res.status(404).json({ error: 'Your Song Library is empty.' })

  const generatedOn = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })
  const html = buildSongbookHtml({ teamName: legacy ? 'My Song Library' : teamName, songs, generatedOn })

  let browser
  try {
    browser = await launch()
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {})   // fonts: wait, but print anyway
    await page.evaluate(() => document.fonts?.ready).catch(() => {})
    const footer = `<div style="width:100%;font-size:8px;color:#9ca3af;padding:0 0.6in;display:flex;justify-content:space-between;font-family:sans-serif">
      <span>${teamName.replace(/[<>&]/g, '')} · Song Library</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`
    const pdf = await page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true,
      displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer })
    const name = `${(legacy ? 'Song Library' : `${teamName} Song Library`).replace(/[^\w\s-]+/g, '').trim() || 'Song Library'}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(Buffer.from(pdf))
  } catch (err) {
    console.error('export-songbook', err)
    return res.status(500).json({ error: 'Could not build the PDF. Please try again.' })
  } finally {
    await browser?.close().catch(() => {})
  }
}
