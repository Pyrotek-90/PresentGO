// One text size per song (or other item): the longest line fills 85% of the slide width,
// unless the tallest slide would then be too tall, in which case it shrinks to fit 80% of the height.
// Returns CSS lengths in container units so the same rule works on the TV (vw/vh) and in previews (cqw/cqh).

const LINE_H = 1.25          // matches leading-snug
const GAP_EM = 0.5           // space between lines (space-y-4 / space-y-6 ≈ 0.5em at slide sizes)
const SUB_SCALE = 0.55       // translation line size relative to the lyric

let ctx = null
const widthCache = new Map()

function textWidthEm(text, weight = 700) {
  if (!text) return 0
  const key = `${weight}|${text}`
  if (widthCache.has(key)) return widthCache.get(key)
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif'
  ctx.font = `${weight} 100px ${family}`
  const w = ctx.measureText(text).width / 100      // width in ems
  widthCache.set(key, w)
  return w
}

// slides: [{ lines, subs? }]. Returns { fit(unitW, unitH), widestEm, rows } for the whole group.
export function groupFit(slides) {
  let widestEm = 0, rows = 1
  for (const s of slides || []) {
    const lines = (s.lines || []).filter(l => l != null)
    for (const l of lines) widestEm = Math.max(widestEm, textWidthEm(l))
    for (const t of s.subs || []) widestEm = Math.max(widestEm, textWidthEm(`[${t}]`) * SUB_SCALE)
    const n = lines.length
    const subRows = (s.subs || []).filter(Boolean).length * SUB_SCALE
    rows = Math.max(rows, n * LINE_H + subRows * LINE_H + Math.max(0, n - 1) * GAP_EM)
  }
  widestEm = Math.max(widestEm, 1)
  // e.g. fit('vw', 'vh') → 'min(7.4vw, 11vh)'
  const fit = (w = 'vw', h = 'vh') => `min(${(85 / widestEm).toFixed(2)}${w}, ${(80 / rows).toFixed(2)}${h})`
  return { fit, widestEm, rows }
}
