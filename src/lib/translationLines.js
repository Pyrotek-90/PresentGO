// Lines up a translation with a song's slides, line by line.
// Translations are stored as text with the same [Section] labels as the lyrics and one
// translated line per lyric line, so each slide line is matched to its section and position.

const norm = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const normLabel = s => norm(s).replace(/\s+/g, '')

// [{ label, lines }] in order, sections with no words dropped (bare repeats like "[Chorus]").
export function textSections(text) {
  const out = []
  let cur = null
  for (const raw of (text || '').split('\n')) {
    const m = raw.trim().match(/^\[(.+?)\]$/)
    if (m) { cur = { label: m[1].trim(), lines: [] }; out.push(cur); continue }
    if (!raw.trim()) continue
    if (!cur) { cur = { label: '', lines: [] }; out.push(cur) }
    cur.lines.push(raw.trim())
  }
  return out.filter(s => s.lines.length)
}

// Returns an array parallel to `slides`: for each slide, the translated line for each of its lines ('' when unknown).
export function translationForSlides(slides, translationText, rawLyrics) {
  if (!translationText?.trim() || !slides?.length) return slides?.map(() => []) || []
  const orig = textSections(rawLyrics)
  const trans = textSections(translationText)

  // Original lines and translated lines per section label (first time the section has words).
  const origBy = {}, transBy = {}
  orig.forEach(s => { const k = normLabel(s.label); if (!origBy[k]) origBy[k] = s.lines })
  trans.forEach(s => { const k = normLabel(s.label); if (!transBy[k]) transBy[k] = s.lines })
  const origKeys = Object.keys(origBy), transKeys = Object.keys(transBy)
  const transFor = key => transBy[key] || transBy[transKeys[origKeys.indexOf(key)]] || []

  let key = origKeys[0] || '', ptr = 0
  return slides.map(slide => {
    if (slide.label) { key = normLabel(slide.label); ptr = 0 }
    const o = origBy[key] || [], t = transFor(key)
    return (slide.lines || []).map(line => {
      const n = norm(line)
      let j = -1
      for (let x = ptr; x < o.length; x++) if (norm(o[x]) === n) { j = x; break }
      if (j < 0) j = ptr
      ptr = j + 1
      return line.trim() ? (t[j] || '') : ''
    })
  })
}

// The translation chosen for slides, if any.
export function slideTranslationText(metadata) {
  const pick = metadata?.slide_translation
  if (!pick) return ''
  return (metadata.translations || []).find(t => t.title === pick)?.text || ''
}
