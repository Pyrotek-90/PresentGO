// Song arrangements. A song's saved slides already follow its arrangement: a slide with a label
// starts a section (e.g. Verse 1, Chorus, Verse 2, Chorus …). A set can use its own order of
// sections (set item content.arrangement = ['Verse 1', 'Chorus', …]) without changing the song.

// Sections of a song: { order: unique labels, slidesBy: label → slides, sequence: the song's own order }.
export function songSections(song) {
  const order = [], slidesBy = {}, sequence = []
  let cur = null, collecting = false
  for (const sl of song?.slides || []) {
    if (sl.label || cur === null) {
      cur = sl.label || 'Song'
      sequence.push(cur)
      collecting = !slidesBy[cur]          // only the first time a section appears holds its slides
      if (collecting) { slidesBy[cur] = []; order.push(cur) }
    }
    if (collecting) slidesBy[cur].push(sl)
  }
  return { order, slidesBy, sequence }
}

// The song's slides re-ordered to a set's arrangement (falls back to the song's own slides).
export function arrangedSlides(song, arrangement) {
  if (!arrangement?.length || !song?.slides?.length) return song?.slides || []
  const { slidesBy } = songSections(song)
  const out = arrangement.flatMap(label => (slidesBy[label] || []).map((s, i) => ({ ...s, label: i === 0 ? label : null })))
  return out.length ? out : song.slides
}

export const sameArrangement = (a, b) => (a || []).length === (b || []).length && (a || []).every((x, i) => x === b[i])
