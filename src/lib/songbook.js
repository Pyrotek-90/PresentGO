// The Song Library as a printable songbook (Settings → Export Song Library). Builds one HTML page
// that the server prints to PDF with headless Chrome (api/export-songbook.js), so every script —
// Malayalam, Hindi, Tamil, Korean… — is laid out by a real browser. Pure functions, no DOM.
//
//   cover · index (No., title, artist, key, BPM) · one song per page: title, artist, key / BPM /
//   time / CCLI, themes, then the chord chart (chords over their words) or the lyrics.

import { isChordLine, isBarToken } from './chords.js'
import { reconcileChart, lyricSections } from './chart.js'
import { splitRepeat } from './repeat.js'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const shortKey = k => String(k || '').replace(' Major', '').replace(' Minor', 'm')

// Google Noto fonts for the scripts that appear, so nothing prints as empty boxes.
const SCRIPTS = [
  [/[ऀ-ॿ]/, 'Noto Sans Devanagari'], [/[ഀ-ൿ]/, 'Noto Sans Malayalam'],
  [/[஀-௿]/, 'Noto Sans Tamil'], [/[ఀ-౿]/, 'Noto Sans Telugu'],
  [/[ಀ-೿]/, 'Noto Sans Kannada'], [/[ঀ-৿]/, 'Noto Sans Bengali'],
  [/[਀-੿]/, 'Noto Sans Gurmukhi'], [/[઀-૿]/, 'Noto Sans Gujarati'],
  [/[؀-ۿ]/, 'Noto Naskh Arabic'], [/[ሀ-፿]/, 'Noto Sans Ethiopic'],
  [/[가-힯]/, 'Noto Sans KR'], [/[぀-ヿ]/, 'Noto Sans JP'], [/[一-鿿]/, 'Noto Sans SC'],
]
export function fontsFor(text) {
  const families = ['Inter', 'Noto Sans', ...SCRIPTS.filter(([re]) => re.test(text)).map(([, f]) => f)]
  return families
}

// Splits a lyric line at each chord's column so every chord sits over its word (as the Song Viewer does).
// Scripts whose letters join (Indic, Arabic, Ethiopic…) can't be cut inside a word without breaking
// the letters apart, so there a chord moves to the start of its word.
const JOINED = /[\u0600-\u06FF\u0900-\u0DFF\u1200-\u137F]/
function chordSegments(chordLine, lyric) {
  let chords = [...chordLine.matchAll(/\S+/g)].map(m => ({ text: m[0], at: m.index }))
  if (JOINED.test(lyric)) {
    let last = -1
    chords = chords.map(c => {
      let at = Math.min(c.at, lyric.length)
      while (at > 0 && at < lyric.length && /\S/.test(lyric[at - 1]) && /\S/.test(lyric[at])) at--
      at = Math.max(at, last)   // keep chords in order
      last = at
      return { text: c.text, at }
    })
  }
  const segs = []
  if (chords[0].at > 0 && lyric.slice(0, chords[0].at).trim()) segs.push({ chord: '', text: lyric.slice(0, chords[0].at) })
  chords.forEach((c, i) => {
    const end = i + 1 < chords.length ? chords[i + 1].at : lyric.length
    segs.push({ chord: c.text, text: lyric.slice(Math.min(c.at, lyric.length), Math.max(end, c.at)) })
  })
  return segs
}

const pill = t => `<span class="ch">${esc(t)}</span>`
const repeat = mark => (mark ? ` <span class="ch rep">${esc(mark)}</span>` : '')

function chartHtml(chart) {
  const lines = chart.split('\n')
  const sections = []
  let cur = null
  const push = html => { if (!cur) { cur = { label: '', rows: [] }; sections.push(cur) } cur.rows.push(html) }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const header = line.trim().match(/^\[(.+)\]$/)
    if (header) { cur = { label: header[1], rows: [] }; sections.push(cur); continue }
    if (!line.trim()) continue
    if (isChordLine(line)) {
      const next = lines[i + 1]
      const paired = next !== undefined && next.trim() && !isChordLine(next) && !/^\[.+\]$/.test(next.trim())
      if (!paired) {
        const parts = [...line.matchAll(/(\S+)(\s*)/g)]
        push(`<div class="row solo">${parts.map(m => `<span style="margin-right:${Math.max(0.8, m[2].length * 0.45)}em">${isBarToken(m[1]) ? `<span class="bar">${esc(m[1])}</span>` : pill(m[1])}</span>`).join('')}</div>`)
        continue
      }
      i++
      const { text, mark } = splitRepeat(next)
      const segs = chordSegments(line, text)
      push(`<div class="row pair">${segs.map((s, k) => {
        const midWord = !!s.chord && k + 1 < segs.length && /\S$/.test(s.text) && /^\S/.test(segs[k + 1].text)
        return `<span class="seg"><span class="c${midWord ? ' mid' : ''}">${s.chord ? pill(s.chord) : '&nbsp;'}</span><span class="w">${esc(s.text)}</span></span>`
      }).join('')}${mark ? `<span class="seg"><span class="c">&nbsp;</span><span class="w">${repeat(mark)}</span></span>` : ''}</div>`)
      continue
    }
    const { text, mark } = splitRepeat(line)
    push(`<div class="row">${esc(text)}${repeat(mark)}</div>`)
  }
  return sections
}

function lyricsHtml(raw) {
  return lyricSections(raw).map(sec => ({
    label: sec.label,
    rows: sec.lines.map(l => { const { text, mark } = splitRepeat(l); return `<div class="row">${esc(text)}${repeat(mark)}</div>` }),
  }))
}

function songBody(song) {
  const meta = song.metadata || {}
  const hasChart = !!meta.chord_chart?.trim()
  const sections = hasChart
    ? chartHtml(song.raw_lyrics?.trim() ? reconcileChart(song.raw_lyrics, meta.chord_chart) : meta.chord_chart)
    : lyricsHtml(song.raw_lyrics || '')
  const rows = sections.reduce((n, s) => n + s.rows.length + 1, 0)
  if (!rows) return '<p class="empty">No lyrics or chart yet.</p>'
  const cols = rows > 42 ? ' two' : ''
  return `<div class="body${hasChart ? ' chart' : ''}${cols}">${sections.map(s =>
    `<section>${s.label ? `<h3>${esc(s.label)}</h3>` : ''}${s.rows.join('')}</section>`).join('')}</div>`
}

export const songKey = song => shortKey(song.metadata?.key || song.metadata?.original_key || '')

export function buildSongbookHtml({ teamName, songs, generatedOn }) {
  const list = [...songs].sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }))
  const allText = list.map(s => `${s.title} ${s.artist} ${s.raw_lyrics || ''}`).join(' ')
  const families = fontsFor(allText)
  const fontUrl = `https://fonts.googleapis.com/css2?${families.map(f => `family=${f.replace(/ /g, '+')}:wght@400;600;700;800`).join('&')}&display=block`
  const stack = families.map(f => `'${f}'`).join(', ')

  const index = list.map((s, i) => `<tr><td class="no">${i + 1}</td><td class="t">${esc(s.title)}</td><td>${esc(s.artist)}</td><td class="k">${esc(songKey(s))}</td><td class="k">${esc(s.metadata?.bpm || '')}</td></tr>`).join('')

  const pages = list.map((s, i) => {
    const m = s.metadata || {}
    const facts = [
      songKey(s) && ['Key', songKey(s)],
      m.bpm && ['BPM', m.bpm],
      m.time_signature && ['Time', m.time_signature],
      s.ccli_number && ['CCLI', s.ccli_number],
    ].filter(Boolean)
    const themes = (m.themes || []).filter(Boolean)
    const by = [s.artist, m.author && m.author !== s.artist ? `Written by ${m.author}` : ''].filter(Boolean).join(' · ')
    return `<article class="song">
      <header>
        <div class="num">${i + 1}</div>
        <div class="head">
          <h2>${esc(s.title || 'Untitled')}</h2>
          ${by ? `<p class="by">${esc(by)}</p>` : ''}
        </div>
      </header>
      ${facts.length || themes.length ? `<div class="facts">${facts.map(([k, v]) => `<span class="fact"><b>${k}</b> ${esc(v)}</span>`).join('')}${themes.length ? `<span class="themes">${esc(themes.join(' · '))}</span>` : ''}</div>` : ''}
      ${songBody(s)}
    </article>`
  }).join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(teamName)} Song Library</title>
<link rel="stylesheet" href="${fontUrl}">
<style>
  @page { size: Letter; margin: 0.6in 0.6in 0.7in; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: ${stack}, sans-serif; color: #111827; font-size: 11pt; }
  .cover { height: 9.4in; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
  .cover .eyebrow { color: #0e7490; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; font-size: 10pt; }
  .cover h1 { font-size: 40pt; line-height: 1.05; margin: .2in 0 .15in; font-weight: 800; letter-spacing: -.02em; }
  .cover .sub { color: #4b5563; font-size: 13pt; }
  .cover .rule { width: 1.2in; height: 4px; background: #0e7490; border-radius: 2px; margin: .35in 0; }
  .cover .made { color: #9ca3af; font-size: 9.5pt; }
  .index { page-break-after: always; }
  .index h2 { font-size: 18pt; margin: 0 0 .2in; }
  .index table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .index th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; border-bottom: 1.5px solid #111827; padding: 4px 6px; }
  .index td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .index tr { break-inside: avoid; }
  .index .no { color: #0e7490; font-weight: 700; width: .45in; }
  .index .t { font-weight: 600; }
  .index .k { width: .6in; white-space: nowrap; }
  .song { page-break-before: always; }
  .song header { display: flex; gap: 14px; align-items: flex-start; }
  .num { flex: none; min-width: 36px; height: 36px; padding: 0 6px; border-radius: 10px; background: #0e7490; color: #fff; font-weight: 800; font-size: 14pt; display: flex; align-items: center; justify-content: center; }
  .head h2 { font-size: 21pt; line-height: 1.15; margin: 0; font-weight: 800; letter-spacing: -.01em; }
  .by { margin: 3px 0 0; color: #4b5563; font-size: 11pt; }
  .facts { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; margin: 12px 0 0; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
  .fact { border: 1px solid #d1d5db; border-radius: 999px; padding: 2px 10px; font-size: 9.5pt; }
  .fact b { color: #6b7280; font-weight: 600; margin-right: 3px; }
  .themes { color: #6b7280; font-size: 9.5pt; }
  .body { margin-top: 14px; line-height: 1.35; }
  .body.two { column-count: 2; column-gap: .4in; }
  section { break-inside: avoid; margin-bottom: 12px; }
  h3 { font-size: 8.5pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #6b7280; margin: 0 0 3px; }
  .row { white-space: pre-wrap; padding-left: .12in; }
  .chart .row.pair, .chart .row.solo { white-space: nowrap; margin-top: 3px; line-height: 1.15; }
  .seg { display: inline-flex; flex-direction: column; vertical-align: top; }
  .seg .c { min-height: 1.3em; padding-right: .35em; }
  .seg .c.mid { width: 0; padding-right: 0; white-space: nowrap; overflow: visible; }
  .seg .w { white-space: pre; }
  .ch { display: inline-block; color: #0e7490; font-weight: 800; background: #ecfeff; border-radius: 3px; padding: 0 .25em; line-height: 1.25; }
  .bar { color: #9ca3af; font-weight: 600; }
  .empty { color: #9ca3af; font-style: italic; margin-top: 14px; }
</style></head><body>
  <div class="cover">
    <div class="eyebrow">Song Library</div>
    <h1>${esc(teamName)}</h1>
    <div class="sub">${list.length} song${list.length === 1 ? '' : 's'} · ${esc(generatedOn)}</div>
    <div class="rule"></div>
    <div class="made">Made with StaffList · stafflist.app</div>
  </div>
  <div class="index"><h2>Index</h2><table><thead><tr><th>No.</th><th>Title</th><th>Artist</th><th>Key</th><th>BPM</th></tr></thead><tbody>${index}</tbody></table></div>
  ${pages}
</body></html>`
}
