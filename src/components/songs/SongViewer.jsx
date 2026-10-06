import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { X, Music2 } from 'lucide-react'
import { transposeChart } from '../../lib/chords'

const PAD = 20 // horizontal page padding, px
const PAD_V = 12 // vertical page padding, px
const FIT = { lyrics: [34, 16], chords: [22, 11] } // [max, min] font size

export default function SongViewer({ song, onClose }) {
  const meta = song.metadata || {}
  const original = meta.original_key || meta.key || ''
  const keys = [original, ...(meta.transposed_keys || [])].filter(Boolean)
  const hasChart = !!meta.chord_chart?.trim()

  const [mode, setMode] = useState('lyrics')
  const [activeKey, setActiveKey] = useState(keys[0] || '')
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const viewportRef = useRef(null)
  const innerRef = useRef(null)
  const touch = useRef(null)
  const swiped = useRef(false)

  const sections = useMemo(() => {
    if (song.slides?.length) {
      const out = []
      for (const s of song.slides) {
        if (s.label || !out.length) out.push({ label: s.label || '', lines: [] })
        out[out.length - 1].lines.push(...(s.lines || []))
      }
      return out
    }
    return [{ label: '', lines: (song.raw_lyrics || '').split('\n') }]
  }, [song])

  const chart = useMemo(() => {
    if (!hasChart) return ''
    return activeKey && activeKey !== original ? transposeChart(meta.chord_chart, original, activeKey) : meta.chord_chart
  }, [hasChart, activeKey, original, meta.chord_chart])

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Pick the largest font that fits on one page; otherwise paginate at the minimum size.
  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner || !box.w) return
    const cw = box.w - PAD * 2
    inner.style.width = `${cw}px`
    inner.style.height = `${box.h - PAD_V * 2}px`
    inner.style.columnWidth = `${cw}px`
    inner.style.columnGap = `${PAD * 2}px`
    const [max, min] = FIT[mode]
    let f = max
    for (; f > min; f--) {
      inner.style.fontSize = `${f}px`
      if (inner.scrollWidth <= cw + 1) break
    }
    inner.style.fontSize = `${f}px`
    const n = Math.max(1, Math.round((inner.scrollWidth + PAD * 2) / (cw + PAD * 2)))
    setPages(n)
    setPage(p => Math.min(p, n - 1))
  }, [box, mode, activeKey, sections, chart])

  useEffect(() => { setPage(0) }, [mode, activeKey])

  const next = () => setPage(p => Math.min(p + 1, pages - 1))
  const prev = () => setPage(p => Math.max(p - 1, 0))

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pages, onClose])

  const onTouchStart = e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; swiped.current = false }
  const onTouchEnd = e => {
    if (!touch.current) return
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true
      dx < 0 ? next() : prev()
    }
    touch.current = null
  }
  const onTap = e => {
    if (swiped.current) { swiped.current = false; return }
    const rect = e.currentTarget.getBoundingClientRect()
    ;(e.clientX - rect.left) < rect.width / 3 ? prev() : next()
  }

  const toggleBtn = (id, label, disabled) => (
    <button onClick={() => setMode(id)} disabled={disabled}
      className={`px-3 h-8 text-xs font-medium transition-colors disabled:opacity-30 ${mode === id ? 'bg-accent text-white' : 'bg-card text-muted hover:text-[#f5f5f5]'}`}>
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-[#f5f5f5]"
      style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <header className="shrink-0 border-b border-border bg-surface px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="truncate font-semibold leading-tight">{song.title}</p>
            {song.artist && <p className="truncate text-xs text-muted">{song.artist}</p>}
          </div>
          <div className="flex rounded-lg overflow-hidden border border-border shrink-0">
            {toggleBtn('lyrics', 'Lyrics')}
            {toggleBtn('chords', 'Chord Chart')}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-card text-muted hover:text-[#f5f5f5] shrink-0" aria-label="Close"><X size={18} /></button>
        </div>
        {mode === 'chords' && (original || meta.bpm) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {keys.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] uppercase tracking-widest text-muted">Key</span>
                {keys.map(k => (
                  <button key={k} onClick={() => setActiveKey(k)}
                    className={`px-2 h-6 rounded-md border text-xs font-medium transition-colors ${
                      activeKey === k ? 'border-accent bg-accent/20 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5]'
                    }`}>{k}</button>
                ))}
              </div>
            )}
            {meta.bpm && <span className="text-xs text-muted"><span className="text-[10px] uppercase tracking-widest">BPM</span> <span className="text-[#f5f5f5] font-medium">{meta.bpm}</span></span>}
          </div>
        )}
      </header>

      <div ref={viewportRef} className="relative flex-1 min-h-0 overflow-hidden select-none"
        style={{ padding: `${PAD_V}px ${PAD}px` }}
        onClick={onTap} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {mode === 'chords' && !hasChart ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-muted text-center">
            <Music2 size={32} />
            <p className="text-sm">No chord chart for this song yet.</p>
            <p className="text-xs">Open the song editor and add one on the Chords step.</p>
          </div>
        ) : (
          <div ref={innerRef}
            className={mode === 'chords' ? 'font-mono whitespace-pre' : ''}
            style={{ transform: `translateX(${-page * (box.w)}px)`, transition: 'transform 0.2s ease', columnFill: 'auto', lineHeight: mode === 'chords' ? 1.3 : 1.4 }}>
            {mode === 'chords' ? chart : sections.map((sec, i) => (
              <div key={i} style={{ breakInside: 'avoid', marginBottom: '0.9em' }}>
                {sec.label && <p className="text-accent-light font-semibold uppercase tracking-wider" style={{ fontSize: '0.6em', breakAfter: 'avoid' }}>{sec.label}</p>}
                {sec.lines.map((l, j) => <p key={j}>{l || ' '}</p>)}
              </div>
            ))}
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-2 border-t border-border bg-surface text-xs text-muted">
          {Array.from({ length: pages }, (_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === page ? 'bg-accent-light' : 'bg-border'}`} />
          ))}
          <span className="ml-1">Page {page + 1} of {pages} · swipe or tap to turn</span>
        </div>
      )}
    </div>
  )
}
