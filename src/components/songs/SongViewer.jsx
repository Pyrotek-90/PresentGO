import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { X, Music2, Music, Mic, Minus, Plus, Square, Columns2 } from 'lucide-react'
import { transposeChart, isChordLine } from '../../lib/chords'
import { reconcileChart } from '../../lib/chart'

const PAD = 20 // horizontal page padding, px
const PAD_V = 12 // vertical page padding, px
const FIT = { lyrics: [34, 16], chords: [30, 14], chords2: [26, 12] } // auto-fit [max, min] font size
const COLS_KEY = 'presentgo.viewer.cols'
const TWO_COL_MIN_WIDTH = 640
const shortKey = k => k.replace(' Major', '').replace(' Minor', 'm')
const SIZE_KEY = 'presentgo.viewer.size'
const loadSizes = () => { try { return JSON.parse(localStorage.getItem(SIZE_KEY)) || {} } catch { return {} } }

const headerStyle = { fontFamily: "'Archivo', 'Inter', sans-serif", fontStretch: '125%', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }

function SectionBanner({ text, size = '1.05em' }) {
  return (
    <div style={{ breakAfter: 'avoid', marginTop: '0.7em', marginBottom: '0.25em' }}>
      <span style={{ ...headerStyle, fontSize: size }}
        className="inline-block px-3 py-0.5 rounded-md bg-accent text-white border-l-[0.4em] border-white/60">{text}</span>
    </div>
  )
}

function ChartBlock({ block }) {
  if (block.type === 'header') return <SectionBanner text={block.text} />
  if (block.type === 'pair') {
    return (
      <div style={{ breakInside: 'avoid' }}>
        <div data-fit className="text-accent-light font-extrabold bg-accent/10 rounded-sm">{block.chords}</div>
        {block.lyric !== null && <div data-fit>{block.lyric}</div>}
      </div>
    )
  }
  return <div data-fit>{block.text || '\u00a0'}</div>
}

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
  const [fontSize, setFontSize] = useState(20)
  const [cols, setCols] = useState(() => { try { return localStorage.getItem(COLS_KEY) === '2' ? 2 : 1 } catch { return 1 } })
  const [manual, setManual] = useState(loadSizes) // { lyrics?: px, chords?: px } — absent means auto-fit
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

  // Same lyric content as Lyrics mode: the chart follows the saved slides, keeping its chords.
  const baseChart = useMemo(
    () => (hasChart && song.slides?.length ? reconcileChart(song.slides, meta.chord_chart) : meta.chord_chart || ''),
    [hasChart, song.slides, meta.chord_chart]
  )
  const chart = useMemo(() => {
    if (!hasChart) return ''
    return activeKey && activeKey !== original ? transposeChart(baseChart, original, activeKey) : baseChart
  }, [hasChart, activeKey, original, baseChart])

  const chartBlocks = useMemo(() => {
    if (!chart) return []
    const lines = chart.split('\n')
    const blocks = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const header = line.trim().match(/^\[(.+)\]$/)
      if (header) { blocks.push({ type: 'header', text: header[1] }); continue }
      if (isChordLine(line)) {
        const nextLine = lines[i + 1]
        const pair = nextLine !== undefined && nextLine.trim() && !isChordLine(nextLine) && !/^\[.+\]$/.test(nextLine.trim())
        blocks.push({ type: 'pair', chords: line, lyric: pair ? nextLine : null })
        if (pair) i++
        continue
      }
      blocks.push({ type: 'line', text: line })
    }
    return blocks
  }, [chart])

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const showCols = mode === 'chords'
  const widthOk = box.w >= TWO_COL_MIN_WIDTH
  const colCount = showCols && widthOk && cols === 2 ? 2 : 1

  // Pick the largest font that fits on one page; otherwise paginate at the minimum size.
  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner || !box.w) return
    const cw = box.w - PAD * 2
    const gap = PAD * 2
    inner.style.width = `${cw}px`
    inner.style.height = `${box.h - PAD_V * 2}px`
    inner.style.columnCount = String(colCount)
    inner.style.columnWidth = 'auto'
    inner.style.columnGap = `${gap}px`
    const [max, min] = FIT[mode === 'chords' && colCount === 2 ? 'chords2' : mode]
    let f = manual[mode]
    if (f) {
      inner.style.fontSize = `${f}px`
    } else {
      f = max
      for (; f > min; f--) {
        inner.style.fontSize = `${f}px`
        if (inner.scrollWidth <= cw + 1) break
      }
      inner.style.fontSize = `${f}px`
    }
    if (mode === 'chords') {
      const lines = inner.querySelectorAll('[data-fit]')
      const clipped = () => Array.from(lines).some(el => el.scrollWidth > el.clientWidth + 1)
      while (f > 10 && clipped()) { f--; inner.style.fontSize = `${f}px` }
    }
    setFontSize(f)
    const colW = (cw - (colCount - 1) * gap) / colCount
    const totalCols = Math.max(1, Math.round((inner.scrollWidth + gap) / (colW + gap)))
    const n = Math.ceil(totalCols / colCount)
    setPages(n)
    setPage(p => Math.min(p, n - 1))
  }, [box, mode, activeKey, sections, chart, chartBlocks, manual, colCount])

  useEffect(() => { setPage(0) }, [mode, activeKey, colCount])

  const pickCols = n => {
    setCols(n)
    try { localStorage.setItem(COLS_KEY, String(n)) } catch { /* ignore */ }
  }

  const bump = d => setManual(m => {
    const nextSize = Math.max(10, Math.min(60, Math.round(m[mode] || fontSize) + d))
    const out = { ...m, [mode]: nextSize }
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(out)) } catch { /* ignore */ }
    return out
  })
  const resetSize = () => setManual(m => {
    const out = { ...m }; delete out[mode]
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(out)) } catch { /* ignore */ }
    return out
  })

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

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-[#f5f5f5]"
      style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <header className="shrink-0 border-b border-border bg-surface px-3 py-2 flex items-center gap-2 sm:gap-3">
        <div className="flex-1 min-w-0 basis-14">
          <p className="truncate font-semibold leading-tight">{song.title}</p>
          {song.artist && <p className="truncate text-xs text-muted">{song.artist}</p>}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {/* View controls */}
          <div className="flex rounded-lg overflow-hidden border border-border shrink-0" role="group" aria-label="View">
            {[['lyrics', Mic, 'Lyrics'], ['chords', Music, 'Chord Chart']].map(([id, Icon, label]) => (
              <button key={id} onClick={() => setMode(id)} title={label} aria-label={label} aria-pressed={mode === id}
                className={`w-10 h-8 flex items-center justify-center transition-colors ${mode === id ? 'bg-accent text-white' : 'bg-card text-muted hover:text-[#f5f5f5]'}`}>
                <Icon size={16} />
              </button>
            ))}
          </div>

          {showCols && (
            <div className="flex rounded-lg overflow-hidden border border-border shrink-0" role="group" aria-label="Columns">
              {[[1, Square, 'Single column'], [2, Columns2, widthOk ? 'Two columns' : 'Two columns (needs a wider screen — try landscape)']].map(([n, Icon, label]) => (
                <button key={n} onClick={() => pickCols(n)} title={label} aria-label={label} disabled={n === 2 && !widthOk}
                  className={`w-9 h-8 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${colCount === n ? 'bg-accent text-white' : 'bg-card text-muted hover:text-[#f5f5f5]'}`}>
                  <Icon size={15} />
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center rounded-lg border border-border overflow-hidden shrink-0" role="group" aria-label="Text size">
            <button onClick={() => bump(-2)} className="w-8 h-8 flex items-center justify-center text-muted hover:text-[#f5f5f5] hover:bg-card" aria-label="Smaller text"><Minus size={14} /></button>
            <button onClick={resetSize} title={manual[mode] ? 'Back to auto-fit' : 'Auto-fit text size'}
              className={`px-2 h-8 text-xs font-semibold border-x border-border ${manual[mode] ? 'text-muted hover:text-[#f5f5f5]' : 'text-accent-light'}`}>
              {manual[mode] ? 'Fit' : 'Aa'}
            </button>
            <button onClick={() => bump(2)} className="w-8 h-8 flex items-center justify-center text-muted hover:text-[#f5f5f5] hover:bg-card" aria-label="Larger text"><Plus size={14} /></button>
          </div>

          {/* BPM and Key */}
          {mode === 'chords' && meta.bpm && (
            <span className="flex items-baseline gap-1 shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-muted">BPM</span>
              <span className="text-base font-bold">{meta.bpm}</span>
            </span>
          )}
          {mode === 'chords' && keys.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-muted">Key</span>
              {keys.map(k => (
                <button key={k} onClick={() => setActiveKey(k)} title={k}
                  className={`shrink-0 min-w-[2.25rem] px-2 h-8 rounded-md border text-sm font-semibold transition-colors ${
                    activeKey === k ? 'border-accent bg-accent/25 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5]'
                  }`}>{shortKey(k)}</button>
              ))}
            </div>
          )}
        </div>

        <button onClick={onClose} className="p-2 rounded-lg hover:bg-card text-muted hover:text-[#f5f5f5] shrink-0" aria-label="Close"><X size={18} /></button>
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
            className={mode === 'chords' ? 'font-mono whitespace-pre font-bold' : 'font-semibold'}
            style={{ transform: `translateX(${-page * (box.w)}px)`, transition: 'transform 0.2s ease', columnFill: 'auto', lineHeight: mode === 'chords' ? 1.3 : 1.4 }}>
            {mode === 'chords' ? chartBlocks.map((b, i) => <ChartBlock key={i} block={b} />) : sections.map((sec, i) => (
              <div key={i} style={{ breakInside: 'avoid', marginBottom: '0.6em' }}>
                {sec.label && <SectionBanner text={sec.label} size="0.7em" />}
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
