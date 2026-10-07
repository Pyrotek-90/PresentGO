// Title slide text, sized so the block fills roughly 60% of the screen width on any display.
// `unit` is 'vw' on the TV screen and 'cqw' inside previews (they size relative to their own box).
// Sizes are in "% of slide width" (vw on the TV, cqw in previews). A 16:9 slide is 56.25 tall,
// so the text block gets about 60% of that. Lines are word-wrapped within 70% of the width.
const MAX_WIDTH = 70
const HEIGHT_BUDGET = 34

const countLines = (text, maxChars) => {
  let lines = 1, len = 0
  for (const word of (text || '').split(/\s+/).filter(Boolean)) {
    if (len && len + 1 + word.length > maxChars) { lines++; len = word.length } else len += (len ? 1 : 0) + word.length
  }
  return lines
}

export function titleSlideSizes(title, subtitle) {
  for (let t = 12; t >= 3.5; t -= 0.25) {
    const titleLines = countLines(title, Math.max(1, Math.floor(MAX_WIDTH / (t * 0.54))))
    let s = 0, subLines = 0
    if (subtitle) {
      s = Math.max(2.4, Math.min(t * 0.45, 5))
      subLines = countLines(subtitle, Math.max(1, Math.floor(MAX_WIDTH / (s * 0.5))))
    }
    const height = titleLines * t * 1.12 + (subtitle ? s * 0.5 + subLines * s * 1.2 : 0)
    if (height <= HEIGHT_BUDGET) return { titleSize: t, subSize: s }
  }
  return { titleSize: 3.5, subSize: subtitle ? 2.4 : 0 }
}

export default function TitleSlide({ title, subtitle, unit = 'vw' }) {
  const { titleSize, subSize } = titleSlideSizes(title || 'Welcome', subtitle)
  return (
    <div className="w-full max-w-[70%] mx-auto text-center">
      <p className="text-white font-bold leading-[1.1] tracking-tight" style={{ fontSize: `${titleSize}${unit}`, textWrap: 'balance' }}>
        {title || 'Welcome'}
      </p>
      {subtitle && (
        <p className="text-gray-300 font-light leading-tight" style={{ fontSize: `${subSize}${unit}`, marginTop: '0.5em', textWrap: 'balance' }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}
