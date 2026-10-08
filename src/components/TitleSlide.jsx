import { useEffect, useRef } from 'react'

// Title slide text. `unit` is 'vw' on the TV and 'cqw' inside previews (they size relative to their
// own box). Default sizing matches the original slide look: both lines share one size that shrinks
// with the longest line, between 1.25% and 3.75% of the slide width (24–72px on a 1080p screen).

export const FONTS = {
  sans:  { label: 'Sans',  family: "'Inter', system-ui, sans-serif" },
  serif: { label: 'Serif', family: "Georgia, 'Times New Roman', serif" },
  wide:  { label: 'Wide',  family: "'Archivo', 'Inter', sans-serif", stretch: '125%' },
}
export const COLORS = ['#ffffff', '#d1d5db', '#fde047', '#22d3ee', '#fb923c', '#f87171']

const BASE = { bold: false, italic: false, color: '#ffffff', font: 'sans', scale: 1 }
export const DEFAULT_STYLE = { align: 'center', title: { ...BASE }, subtitle: { ...BASE } }

export const mergeStyle = s => ({
  align: s?.align || DEFAULT_STYLE.align,
  title: { ...BASE, ...(s?.title || {}) },
  subtitle: { ...BASE, ...(s?.subtitle || {}) },
})

export function titleSlideSizes(title, subtitle) {
  const longest = Math.max(...[title || 'Welcome', subtitle].filter(Boolean).map(l => l.length), 1)
  const size = Math.min(3.75, Math.max(1.25, 90 / longest))
  return { titleSize: size, subSize: subtitle ? size : 0 }
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

// `target` / `onTarget` make the lines selectable in the editor preview: click or highlight a line
// to choose which text the formatting toolbar changes.
export default function TitleSlide({ title, subtitle, unit = 'vw', style, target, onTarget }) {
  const st = mergeStyle(style)
  const { titleSize, subSize } = titleSlideSizes(title || 'Welcome', subtitle)
  const root = useRef(null)

  useEffect(() => {
    if (!onTarget) return
    const onSel = () => {
      const sel = document.getSelection()
      if (!sel || sel.isCollapsed || !root.current) return
      const node = sel.anchorNode?.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode
      const line = node?.closest?.('[data-line]')
      if (line && root.current.contains(line)) onTarget(line.dataset.line)
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [onTarget])

  const line = (which, text, size, extra = {}) => (
    <p data-line={which} onClick={onTarget ? () => onTarget(which) : undefined}
      className="leading-snug rounded"
      style={{
        ...textStyle(st[which], size, unit), ...extra,
        ...(onTarget ? { cursor: 'text', outline: target === which ? '2px dashed #22d3ee' : '2px dashed transparent', outlineOffset: '0.15em' } : {}),
      }}>
      {text}
    </p>
  )

  return (
    <div ref={root} className="w-full max-w-[76%] mx-auto" style={{ textAlign: st.align }}>
      {line('title', title || 'Welcome', titleSize)}
      {subtitle && line('subtitle', subtitle, subSize, { marginTop: '0.6em' })}
    </div>
  )
}
