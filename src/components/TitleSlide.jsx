// Title slide text, sized so the block fills roughly 60% of the screen. `unit` is 'vw' on the TV
// and 'cqw' inside previews (they size relative to their own box).
// Sizes are in "% of slide width". A 16:9 slide is 56.25 tall, so the block gets about 60% of that,
// word-wrapped within 70% of the width.
const MAX_WIDTH = 70
const HEIGHT_BUDGET = 34

export const FONTS = {
  sans:  { label: 'Sans',  family: "'Inter', system-ui, sans-serif" },
  serif: { label: 'Serif', family: "Georgia, 'Times New Roman', serif" },
  wide:  { label: 'Wide',  family: "'Archivo', 'Inter', sans-serif", stretch: '125%' },
}
export const COLORS = ['#ffffff', '#d1d5db', '#fde047', '#22d3ee', '#fb923c', '#f87171']

export const DEFAULT_STYLE = {
  align: 'center',
  title:    { bold: true,  italic: false, color: '#ffffff', font: 'sans', scale: 1 },
  subtitle: { bold: false, italic: false, color: '#d1d5db', font: 'sans', scale: 1 },
}

export const mergeStyle = s => ({
  align: s?.align || DEFAULT_STYLE.align,
  title: { ...DEFAULT_STYLE.title, ...(s?.title || {}) },
  subtitle: { ...DEFAULT_STYLE.subtitle, ...(s?.subtitle || {}) },
})

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

const textStyle = (st, size, unit) => ({
  fontSize: `${size * st.scale}${unit}`,
  fontWeight: st.bold ? 700 : 300,
  fontStyle: st.italic ? 'italic' : 'normal',
  color: st.color,
  fontFamily: FONTS[st.font]?.family,
  fontStretch: FONTS[st.font]?.stretch,
  textWrap: 'balance',
})

export default function TitleSlide({ title, subtitle, unit = 'vw', style }) {
  const st = mergeStyle(style)
  const { titleSize, subSize } = titleSlideSizes(title || 'Welcome', subtitle)
  return (
    <div className="w-full max-w-[76%] mx-auto" style={{ textAlign: st.align }}>
      <p className="leading-[1.1] tracking-tight" style={textStyle(st.title, titleSize, unit)}>{title || 'Welcome'}</p>
      {subtitle && <p className="leading-tight" style={{ ...textStyle(st.subtitle, subSize, unit), marginTop: '0.5em' }}>{subtitle}</p>}
    </div>
  )
}
