import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { X, Minus, Plus, Check, Maximize2, ChevronLeft, ChevronRight, List } from 'lucide-react'
import { transposeChart, isChordLine, isBarToken } from '../../lib/chords'
import { reconcileChart, lyricSections } from '../../lib/chart'
import { getPref } from '../../lib/prefs'
import { splitRepeat } from '../../lib/repeat'

const PAD = 20 // horizontal page padding, px
const PAD_V = 12 // vertical page padding, px
// 12–25 px covers every real use: no bigger, and nothing smaller than 12.
const SIZE_MIN = 12, SIZE_MAX = 25
const FIT = { lyrics: [25, 15], chords: [25, 15] }       // auto-fit [largest, smallest] font size
const COMFORT = { lyrics: 22, chords: 18 }              // never auto-shrink below this; paginate instead
const FIT_PHONE = { lyrics: [25, 15], chords: [25, 15] } // phones: smaller text so more of the song is visible
const COMFORT_PHONE = { lyrics: 16, chords: 15 }
const FLOOR_TWO_COL = { lyrics: 15, chords: 15 }        // two columns may go a little smaller to keep a song on one page
const MIN_READABLE = { lyrics: 12, chords: 12 }         // last resort: smallest size used to keep one long line from wrapping
const MIN_READABLE_PHONE = { lyrics: 12, chords: 12 }
const COLS_KEY = 'presentgo.viewer.cols.v2'
const TWO_COL_MIN_WIDTH = 640
const shortKey = k => k.replace(' Major', '').replace(' Minor', 'm')
const SIZE_KEY = 'presentgo.viewer.size'
const SIZE_STEPS = [12, 16, 20, 24]   // phone size button choices (13 smallest, 24 largest)
const PHONE_MIN = SIZE_MIN, PHONE_MAX = SIZE_MAX
const clampPhone = v => Math.max(PHONE_MIN, Math.min(PHONE_MAX, v))
const loadSizes = () => { try { return JSON.parse(localStorage.getItem(SIZE_KEY)) || {} } catch { return {} } }

const ABBREV = {
  verse: 'V', chorus: 'C', 'pre-chorus': 'PC', prechorus: 'PC', 'pre chorus': 'PC', bridge: 'B', intro: 'I', outro: 'O',
  tag: 'T', interlude: 'Int', instrumental: 'Inst', refrain: 'R', ending: 'E', turnaround: 'TA', vamp: 'Vamp', coda: 'Coda',
}
// "Verse 1" -> V1, "Chorus" -> C, "Pre-Chorus 2" -> PC2, unknown labels -> initials or first letters
export function abbreviateLabel(label) {
  const m = label.trim().match(/^(.*?)\s*(\d+)?$/)
  const base = (m?.[1] || label).trim().toLowerCase()
  const num = m?.[2] || ''
  if (ABBREV[base]) return ABBREV[base] + num
  const words = base.split(/[\s-]+/).filter(Boolean)
  const short = words.length > 1 ? words.map(w => w[0]).join('') : base.slice(0, 3)
  return short.toUpperCase() + num
}

const INDENT = '0.9em'   // lyric text and section headers sit slightly in from the edge

// Section headers (Verse 1, Chorus…) use the same small caps label style as the
// Scheduling page's group headings (Production / Singers / Musicians), in muted grey, slightly larger and bold.
const headerStyle = { fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.4 }

function SectionBanner({ text, size = '0.66em' }) {
  return (
    <h3 style={{ ...headerStyle, fontSize: size, breakAfter: 'avoid', margin: '0 0 0.1em 0', paddingLeft: INDENT }}
      className="text-muted">{text}</h3>
  )
}

// Splits a lyric line at each chord's column so every chord sits directly above its word,
// whatever font is used (the chart's spaces only tell us *where* in the line each chord goes).
function chordSegments(chordLine, lyric) {
  const chords = [...chordLine.matchAll(/\S+/g)].map(m => ({ text: m[0], at: m.index }))
  const segs = []
  if (chords[0].at > 0 && lyric.slice(0, chords[0].at).trim()) segs.push({ chord: '', text: lyric.slice(0, chords[0].at) })
  chords.forEach((c, i) => {
    const end = i + 1 < chords.length ? chords[i + 1].at : lyric.length
    segs.push({ chord: c.text, text: lyric.slice(Math.min(c.at, lyric.length), Math.max(end, c.at)) })
  })
  return segs
}

function ChordPill({ children, floating }) {
  return (
    <span {...(floating !== undefined ? { 'data-chord': '' } : {})} className="inline-block text-accent-light font-extrabold rounded-sm px-[0.25em] bg-accent/15" style={{ lineHeight: 1.25 }}>{children}</span>
  )
}

// "-2X" at the end of a lyric line: shown in the chord color so the repeat stands out
function RepeatMark({ mark }) {
  return mark ? <span style={{ marginLeft: '0.4em' }}><ChordPill>{mark}</ChordPill></span> : null
}

// A chord that lands in the middle of a word must not widen its slot, or the word gets split
// ("unden  iable"). Those chords overhang the next letters instead, and settleChords() nudges any
// chord that would then collide with the one before it a little to the right. Runs after every
// layout change (the viewer re-measures at each candidate font size).
function settleChords(root) {
  const lines = root.querySelectorAll('[data-chordline]')
  if (!lines.length) return
  const gap = (parseFloat(getComputedStyle(root).fontSize) || 16) * 0.3
  lines.forEach(line => {
    const pills = line.querySelectorAll('[data-chord]')
    pills.forEach(p => { p.style.marginLeft = '' })
    let prev = null
    pills.forEach(p => {
      const r = p.getBoundingClientRect()
      if (prev && Math.abs(r.top - prev.top) < 2 && r.left < prev.right + gap) {
        const push = prev.right + gap - r.left
        p.style.marginLeft = `${push}px`
        prev = { top: r.top, right: r.right + push }
      } else prev = { top: r.top, right: r.right }
    })
  })
}

function ChartBlock({ block }) {
  if (block.type === 'header') return <SectionBanner text={block.text} />
  if (block.type === 'pair') {
    if (block.lyric === null) {
      // chords with no lyric underneath (intro / instrumental): keep their relative spacing
      const parts = [...block.chords.matchAll(/(\S+)(\s*)/g)]
      return (
        <div data-fit className="whitespace-nowrap" style={{ paddingLeft: INDENT, breakInside: 'avoid' }}>
          {parts.map((m, i) => <span key={i} style={{ marginRight: `${Math.max(0.8, m[2].length * 0.45)}em` }}>{isBarToken(m[1])
            ? <span className="text-muted font-semibold">{m[1]}</span>
            : <ChordPill>{m[1]}</ChordPill>}</span>)}
        </div>
      )
    }
    const { text: lyricText, mark } = splitRepeat(block.lyric)
    return (
      <div data-fit data-chordline className="whitespace-nowrap" style={{ paddingLeft: INDENT, breakInside: 'avoid', lineHeight: 1.15, marginTop: '0.3em' }}>
        {chordSegments(block.chords, lyricText).map((seg, i, all) => {
          // mid-word: this piece ends in a letter and the next piece carries on the same word
          const midWord = !!seg.chord && i + 1 < all.length && /\S$/.test(seg.text) && /^\S/.test(all[i + 1].text)
          return (
            <span key={i} style={{ display: 'inline-flex', flexDirection: 'column', verticalAlign: 'top' }}>
              <span style={midWord
                ? { minHeight: '1.3em', width: 0, whiteSpace: 'nowrap', overflow: 'visible' }
                : { minHeight: '1.3em', paddingRight: seg.chord ? '0.35em' : 0 }}>
                {seg.chord ? <ChordPill floating>{seg.chord}</ChordPill> : '\u00a0'}
              </span>
              <span style={{ whiteSpace: 'pre' }}>{seg.text}</span>
            </span>
          )
        })}
        {mark && (
          <span style={{ display: 'inline-flex', flexDirection: 'column', verticalAlign: 'top' }}>
            <span style={{ minHeight: '1.3em' }}>{'\u00a0'}</span>
            <RepeatMark mark={mark} />
          </span>
        )}
      </div>
    )
  }
  const { text, mark } = splitRepeat(block.text)
  return <div data-fit className="whitespace-pre" style={{ paddingLeft: INDENT }}>{text || (mark ? '' : '\u00a0')}<RepeatMark mark={mark} /></div>
}

// `setNav` turns this into "set mode": the songs of a set played back to back.
//   { index, total, titles, onNext(), onPrev(), onJump(i) }   `startAtEnd` lands on the last page (coming back from the next song).
export default function SongViewer({ song, onClose, setNav, onModeChange, startAtEnd, initialKey, lead }) {
  const meta = song.metadata || {}
  const original = meta.original_key || meta.key || ''
  const keys = [...new Set([original, ...(meta.transposed_keys || []), initialKey].filter(Boolean))]
  const hasChart = !!meta.chord_chart?.trim()

  // Lyrics or Chord Chart comes from Settings → Chord Chart; there's no switch in the viewer.
  // A song without a chart shows its lyrics.
  const mode = getPref('viewerMode', 'lyrics') === 'chords' && hasChart ? 'chords' : 'lyrics'
  const [sizeOpen, setSizeOpen] = useState(false)
  const [showList, setShowList] = useState(false)
  const wantEnd = useRef(!!startAtEnd)
  useEffect(() => { onModeChange?.(mode) }, [mode])
  useEffect(() => { if (wantEnd.current) { const t = setTimeout(() => { wantEnd.current = false }, 400); return () => clearTimeout(t) } }, [])
  // A set's chosen key wins; otherwise the song's preferred key, then the original.
  const [activeKey, setActiveKey] = useState(initialKey || (keys.includes(meta.preferred_key) ? meta.preferred_key : '') || keys[0] || '')
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [fontSize, setFontSize] = useState(20)
  const [effCols, setEffCols] = useState(1)   // columns actually in use (auto picks this)
  const [fontTick, setFontTick] = useState(0)
  const [cols, setCols] = useState(() => { try { const v = localStorage.getItem(COLS_KEY); return v === '1' ? 1 : v === '2' ? 2 : 'auto' } catch { return 'auto' } })
  const [manual, setManual] = useState(loadSizes) // { lyrics?: px, chords?: px } — absent means auto-fit
  const viewportRef = useRef(null)
  const innerRef = useRef(null)
  const touch = useRef(null)
  const swiped = useRef(false)

  // Lyrics text is the single source for both modes (slides/arrangement are presentation-only).
  const sections = useMemo(() => {
    const fromRaw = lyricSections(song.raw_lyrics)
    if (fromRaw.length) return fromRaw
    const out = []
    for (const sl of song.slides || []) {
      if (sl.label || !out.length) out.push({ label: sl.label || '', lines: [] })
      out[out.length - 1].lines.push(...(sl.lines || []))
    }
    return out
  }, [song])

  // Same lyric content as Lyrics mode: the chart follows the saved lyrics, keeping its chords.
  const baseChart = useMemo(
    () => (hasChart && song.raw_lyrics?.trim() ? reconcileChart(song.raw_lyrics, meta.chord_chart) : meta.chord_chart || ''),
    [hasChart, song.raw_lyrics, meta.chord_chart]
  )
  // Order the sections are performed in (from the saved arrangement), e.g. V1 C V2 C B C
  const arrangement = useMemo(
    () => (song.slides || []).filter(sl => sl.label).map(sl => abbreviateLabel(sl.label)),
    [song.slides]
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

  const chartSections = useMemo(() => {
    const out = []
    for (const b of chartBlocks) {
      if (b.type === 'header' || !out.length) out.push([])
      out[out.length - 1].push(b)
    }
    return out
  }, [chartBlocks])

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const widthOk = box.w >= TWO_COL_MIN_WIDTH
  const pad = box.w > 0 && !widthOk ? 14 : PAD   // narrower side margins on phones

  // Re-measure once web fonts are ready (text width changes when Inter loads).
  useEffect(() => { document.fonts?.ready?.then(() => setFontTick(t => t + 1)) }, [])

  // Default view logic.
  //  1. Fits on one page in a single column at a comfortable size -> single column, as large as fits.
  //  2. Otherwise, on a wide screen -> two columns, as large as fits on one page.
  //  3. Otherwise -> paginate at a comfortable size. Sections move to the next column/page whole.
  // Choosing 1 or 2 columns, or a text size, by hand overrides the matching part.
  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner || !box.w) return
    const cw = box.w - pad * 2
    const gap = pad * 2
    inner.style.width = `${cw}px`
    inner.style.height = `${box.h - PAD_V * 2}px`
    inner.style.columnWidth = 'auto'
    inner.style.columnGap = `${gap}px`

    const [max] = (widthOk ? FIT : FIT_PHONE)[mode]
    const floor = (widthOk ? COMFORT : COMFORT_PHONE)[mode]
    const floor2 = Math.min(floor, FLOOR_TWO_COL[mode])
    const minReadable = (widthOk ? MIN_READABLE : MIN_READABLE_PHONE)[mode]
    const lines = inner.querySelectorAll('[data-fit]')   // every lyric / chart line: none may wrap or overflow
    lines.forEach(el => { if (el.dataset.wrapped) { el.style.whiteSpace = el.dataset.ws; delete el.dataset.wrapped } })
    const apply = (nc, f) => { inner.style.columnCount = String(nc); inner.style.fontSize = `${f}px`; settleChords(inner) }
    const clipped = () => lines.length > 0 && Array.from(lines).some(el => el.scrollWidth > el.clientWidth + 1)
    const fitsOnePage = (nc, f) => { apply(nc, f); return inner.scrollWidth <= cw + 1 && !clipped() }
    const largestFit = (nc, lo) => { for (let f = max; f >= lo; f--) if (fitsOnePage(nc, f)) return f; return null }
    const widestNoWrap = nc => { for (let f = max; f >= minReadable; f--) { apply(nc, f); if (!clipped()) return f } return minReadable }

    let nc, f
    if (manual[mode]) {
      f = widthOk ? manual[mode] : clampPhone(manual[mode])
      nc = cols === 'auto' ? (fitsOnePage(1, f) || !widthOk ? 1 : 2) : (cols === 2 && widthOk ? 2 : 1)
    } else if (cols !== 'auto') {
      nc = cols === 2 && widthOk ? 2 : 1
      f = largestFit(nc, floor) ?? floor
    } else if ((f = largestFit(1, floor)) != null) {
      nc = 1
    } else if (widthOk) {
      f = largestFit(2, floor2)
      if (f != null) nc = 2
      else {
        // Too long for one page either way: paginate. Use two columns unless they'd force tiny text.
        const wide2 = widestNoWrap(2)
        if (wide2 >= floor2) { nc = 2; f = Math.min(floor, wide2) } else { nc = 1; f = Math.min(floor, widestNoWrap(1)) }
      }
    } else {
      nc = 1; f = Math.min(floor, widestNoWrap(1))
    }
    apply(nc, f)
    if (manual[mode]) {
      // A size you picked is honored exactly; lines that are too wide for it wrap instead of being shrunk.
      lines.forEach(el => { el.dataset.ws = el.style.whiteSpace; el.dataset.wrapped = '1'; el.style.whiteSpace = 'normal' })
    } else {
      // Automatic sizing: a line must never spill onto a second row. Shrink until every line fits its
      // column, but not below a readable size; if one line is still too wide, only that line wraps.
      while (f > minReadable && clipped()) { f--; apply(nc, f) }
      if (clipped()) lines.forEach(el => { if (el.scrollWidth > el.clientWidth + 1) { el.dataset.ws = el.style.whiteSpace; el.dataset.wrapped = '1'; el.style.whiteSpace = 'normal' } })
    }
    settleChords(inner)   // lines that wrapped have moved their chords

    setFontSize(f)
    setEffCols(nc)
    const colW = (cw - (nc - 1) * gap) / nc
    const totalCols = Math.max(1, Math.round((inner.scrollWidth + gap) / (colW + gap)))
    const n = Math.ceil(totalCols / nc)
    setPages(n)
    setPage(p => (wantEnd.current ? n - 1 : Math.min(p, n - 1)))
  }, [box, mode, activeKey, sections, chart, chartBlocks, manual, cols, widthOk, pad, fontTick])

  useEffect(() => { if (!wantEnd.current) setPage(0) }, [mode, activeKey, effCols])

  const pickCols = n => {
    setCols(n)
    try { localStorage.setItem(COLS_KEY, String(n)) } catch { /* ignore */ }
  }

  const bump = d => setManual(m => {
    const from = m[mode] ? (widthOk ? m[mode] : clampPhone(m[mode])) : fontSize
    const nextSize = widthOk ? Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(from) + d)) : clampPhone(Math.round(from) + d)
    const out = { ...m, [mode]: nextSize }
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(out)) } catch { /* ignore */ }
    return out
  })
  const resetSize = () => setManual(m => {
    const out = { ...m }; delete out[mode]
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(out)) } catch { /* ignore */ }
    return out
  })

  const next = () => (page < pages - 1 ? setPage(page + 1) : setNav?.onNext())
  const prev = () => (page > 0 ? setPage(page - 1) : setNav?.onPrev())

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pages, page, onClose, setNav])

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
      <header className="shrink-0 border-b border-border bg-surface px-3 py-2 flex flex-nowrap items-center gap-2 sm:gap-3">
        <div className="order-1 flex-1 min-w-0 basis-14">
          <p className="truncate font-semibold leading-tight">{song.title}</p>
          {(song.artist || lead) && (
            <p className="truncate text-xs text-muted">
              {lead && <span className="text-accent-light font-medium">Song Leader: {lead}</span>}{lead && song.artist && ' · '}{song.artist}
            </p>
          )}
        </div>

        {/* Key and BPM (read only), then Aa: text size and columns in one popup, like the iOS app */}
        <div className="order-2 flex items-center gap-3 shrink-0">
          {meta.bpm && (
            <span className="hidden sm:flex items-baseline gap-1 text-sm">
              <span className="text-muted font-medium">BPM</span>
              <span className="font-bold">{meta.bpm}</span>
            </span>
          )}
          {/* From the Songs page the key can be changed (Default = the preferred key); in a set it's the set's key, shown only. */}
          {mode === 'chords' && activeKey && (setNav || keys.length < 2 ? (
            <span className="flex items-baseline gap-1 text-sm">
              <span className="text-muted font-medium">Key</span>
              <span className="font-bold">{shortKey(activeKey)}</span>
            </span>
          ) : (
            <label className="flex items-center gap-1 text-sm">
              <span className="text-muted font-medium">Key</span>
              <select value={activeKey} onChange={e => setActiveKey(e.target.value)} aria-label="Key"
                className="h-8 rounded-lg border border-accent bg-accent/25 text-accent-light font-bold px-1.5 text-sm">
                {keys.map(k => <option key={k} value={k}>{shortKey(k)}{meta.preferred_key === k ? ' · Default' : ''}</option>)}
              </select>
            </label>
          ))}
          <div className="relative">
            <button onClick={() => setSizeOpen(o => !o)} aria-label="Text size and columns" aria-expanded={sizeOpen}
              className={`min-w-[2.5rem] h-8 px-2 rounded-lg border text-xs font-semibold ${sizeOpen ? 'border-accent text-accent-light bg-accent/15' : 'border-border text-accent-light hover:bg-card'}`}>
              Aa
            </button>
            {sizeOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSizeOpen(false)} />
                <div className="absolute right-0 top-10 z-20 w-56 rounded-xl border border-border bg-surface shadow-2xl py-1 text-sm">
                  <p className="px-3 pt-1.5 pb-1 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <span>Text Size</span>
                    <span className="normal-case tracking-normal text-[#f5f5f5] font-semibold">{manual[mode] ? fontSize : `Auto · ${fontSize}`}</span>
                  </p>
                  <MenuRow icon={Plus} label="Larger" onClick={() => bump(1)} />
                  <MenuRow icon={Minus} label="Smaller" onClick={() => bump(-1)} />
                  <MenuRow icon={manual[mode] ? Maximize2 : Check} label="Fit Automatically" active={!manual[mode]} onClick={resetSize} />
                  {widthOk && (
                    <>
                      <div className="my-1 border-t border-border" />
                      <p className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Columns</p>
                      {[['auto', `Auto (now ${effCols})`], [1, 'One Column'], [2, 'Two Columns']].map(([v, label]) => (
                        <MenuRow key={v} icon={cols === v ? Check : null} label={label} active={cols === v} onClick={() => pickCols(v)} />
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <button onClick={onClose} className="order-3 p-2 rounded-lg hover:bg-card text-muted hover:text-[#f5f5f5] shrink-0" aria-label="Close"><X size={18} /></button>
      </header>

      <div ref={viewportRef} className="relative flex-1 min-h-0 overflow-hidden select-none"
        style={{ padding: `${PAD_V}px ${pad}px` }}
        onClick={onTap} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {(
          <div ref={innerRef}
            className="font-semibold"
            style={{ transform: `translateX(${-page * (box.w)}px)`, transition: 'transform 0.2s ease', columnFill: 'auto', lineHeight: 1.4 }}>
            {mode === 'chords' ? chartSections.map((sec, i) => (
              <div key={i} style={{ breakInside: 'avoid', marginBottom: '1em' }}>
                {sec.map((b, j) => <ChartBlock key={j} block={b} />)}
              </div>
            )) : sections.map((sec, i) => (
              <div key={i} style={{ breakInside: 'avoid', marginBottom: '1em' }}>
                {sec.label && <SectionBanner text={sec.label} />}
                {sec.lines.map((l, j) => { const { text, mark } = splitRepeat(l); return <p key={j} data-fit style={{ paddingLeft: INDENT, whiteSpace: 'nowrap' }}>{text || (mark ? '' : '\u00a0')}<RepeatMark mark={mark} /></p> })}
              </div>
            ))}
          </div>
        )}
      </div>

      {showList && setNav && (
        <div className="absolute inset-x-0 bottom-9 z-10 mx-2 max-h-[55vh] overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl">
          {setNav.titles.map((t, i) => (
            <button key={i} onClick={() => { setShowList(false); setNav.onJump(i) }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm border-b border-border/50 last:border-0 ${i === setNav.index ? 'bg-accent/20 text-accent-light' : 'hover:bg-card'}`}>
              <span className="w-5 text-xs text-muted shrink-0">{i + 1}</span>
              <span className="truncate font-medium">{t}</span>
            </button>
          ))}
        </div>
      )}
      {(pages > 1 || arrangement.length > 0 || setNav) && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-1.5 border-t border-border bg-surface text-xs text-muted">
          <div className="flex items-center gap-2 min-w-0">
            {setNav && (
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={setNav.onPrev} disabled={setNav.index === 0} aria-label="Previous song"
                  className="p-1 rounded hover:bg-card disabled:opacity-25"><ChevronLeft size={14} /></button>
                <button onClick={() => setShowList(v => !v)} aria-label="Jump to a song" aria-expanded={showList}
                  className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-card text-[#f5f5f5] font-semibold whitespace-nowrap">
                  <List size={12} className="text-accent-light" /> {setNav.index + 1} of {setNav.total}
                </button>
                <button onClick={setNav.onNext} disabled={setNav.index === setNav.total - 1} aria-label="Next song"
                  className="p-1 rounded hover:bg-card disabled:opacity-25"><ChevronRight size={14} /></button>
              </div>
            )}
            {pages > 1 && Array.from({ length: pages }, (_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full shrink-0 ${i === page ? 'bg-accent-light' : 'bg-border'}`} />
            ))}
            {pages > 1 && !setNav && <span className="ml-1 whitespace-nowrap">{page + 1} / {pages}<span className="hidden sm:inline"> · swipe or tap to turn</span></span>}
          </div>
          {arrangement.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1 max-w-[75%]" aria-label={`Song arrangement: ${arrangement.join(', ')}`} title="Arrangement">
              {arrangement.map((a, i) => (
                <span key={i} className="px-1.5 rounded bg-accent/15 text-accent-light font-semibold leading-5">{a}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// One row of the Aa popup.
function MenuRow({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-card ${active ? 'text-accent-light' : 'text-[#f5f5f5]'}`}>
      <span className="w-4 flex justify-center">{Icon && <Icon size={14} />}</span>
      {label}
    </button>
  )
}
