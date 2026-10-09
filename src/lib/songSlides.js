// Builds a song's default slides from raw lyrics, the same way the song editor's
// "Format Slides" step does: one entry per section, split into slides of N lines,
// with the section label on the first slide. Used by bulk import so imported songs
// are ready to present without opening each one in the editor.

function sectionSlides(label, rawLines, lps) {
  const out = []
  let cur = []
  for (const l of rawLines.join('\n').trim().split('\n')) {
    if (!l.trim()) {
      if (cur.length) { out.push({ lines: cur, label: null }); cur = [] }
      continue
    }
    cur.push(l)
    if (cur.length >= lps) { out.push({ lines: cur, label: null }); cur = [] }
  }
  if (cur.length) out.push({ lines: cur, label: null })
  if (out.length) out[0] = { ...out[0], label }
  return out
}

export function buildSongSlides(rawLyrics, linesPerSlide = 2) {
  const sections = []
  let label = null
  let buffer = []
  for (const line of (rawLyrics || '').split('\n')) {
    const m = line.match(/^\[(.+?)\]$/)
    if (m) {
      if (label !== null) sections.push({ label, lines: buffer })
      else if (buffer.some(l => l.trim())) sections.push({ label: 'Intro', lines: buffer })
      label = m[1].trim(); buffer = []
    } else {
      buffer.push(line)
    }
  }
  if (label !== null && buffer.some(l => l.trim())) sections.push({ label, lines: buffer })
  else if (label === null && buffer.some(l => l.trim())) sections.push({ label: 'Song', lines: buffer })

  const seen = new Set()
  const slides = []
  for (const sec of sections) {
    if (seen.has(sec.label)) continue
    seen.add(sec.label)
    slides.push(...sectionSlides(sec.label, sec.lines, linesPerSlide))
  }
  return slides
}
