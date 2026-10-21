// Repeat marks: a lyric line ending in "-2X" (also "- 2x", "-3X", "–2×"…) means
// "play/sing up to here that many times". The Song Viewer highlights the mark like a
// chord; slides shown on screen leave it out.
const REPEAT = /\s*[-–—]\s*(\d+)\s*[xX×]\s*$/

// { text, mark } — the line without its repeat mark, and the mark as typed (or '')
export function splitRepeat(line) {
  const s = line ?? ''
  const m = s.match(REPEAT)
  return m ? { text: s.slice(0, m.index), mark: m[0].trim() } : { text: s, mark: '' }
}

export const stripRepeat = line => splitRepeat(line).text
