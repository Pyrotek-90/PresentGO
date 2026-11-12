// POST /api/v1/songs/import-pdf?filename=<name>
// Body: the PDF file itself with Content-Type: application/octet-stream (Vercel passes those bytes
// through as-is), or JSON { data: <base64> }. At most 4 MB.
// Reads a text-based PDF chord chart (SongSelect, PraiseCharts and similar) into song fields,
// using the same reader the web app used in the browser. Scanned PDFs have no text to read.

import { chartFromTextItems } from '../../src/lib/pdfChart.js'
import { songFromChart } from './songs.js'

const MAX_BYTES = 4 * 1024 * 1024
const MAX_PAGES = 8

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body
  if (req.body && typeof req.body === 'object' && typeof req.body.data === 'string') {
    return Buffer.from(req.body.data, 'base64')   // JSON { data: <base64> } also accepted
  }
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > MAX_BYTES) throw Object.assign(new Error('too big'), { tooBig: true })
    chunks.push(c)
  }
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  let bytes
  try {
    bytes = await readBody(req)
  } catch (e) {
    return res.status(413).json({ error: 'That PDF is too large (4 MB at most).' })
  }
  if (!bytes?.length) return res.status(400).json({ error: 'Send the PDF as the request body.' })
  if (bytes.length > MAX_BYTES) return res.status(413).json({ error: 'That PDF is too large (4 MB at most).' })
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return res.status(400).json({ error: "That file isn't a PDF." })

  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false, disableFontFace: true,
    }).promise
    const pages = []
    for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p++) {
      const page = await doc.getPage(p)
      pages.push((await page.getTextContent()).items)
    }
    await doc.destroy?.()
    const linesPer = Math.min(8, Math.max(1, parseInt(req.query?.lines_per_slide, 10) || 2))
    return res.status(200).json({ format: 'pdf', ...songFromChart(chartFromTextItems(pages), String(req.query?.filename || ''), linesPer) })
  } catch (err) {
    console.error('import-pdf failed', err)
    return res.status(200).json({ format: 'pdf', status: 'error', message: 'Could not read this file — it may be damaged or password-protected.' })
  }
}
