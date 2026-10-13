import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { openControlChannel } from '../lib/controlChannel'
import TitleSlide from '../components/TitleSlide'
import { buildPresentationSlides } from '../lib/lyricFormatter'
import { groupFit } from '../lib/slideFit'
import {
  ChevronLeft, ChevronRight, XSquare, X, Tv, ArrowLeft,
  MonitorPlay, ArrowRight, Radio, Wifi,
  Music, Star, Megaphone, FolderOpen, Layers,
} from 'lucide-react'

// ─── Connect step — open presentation then AirPlay ───────────────────────────

function ConnectStep({ setId, setName, onContinue, onBack }) {
  const [opened, setOpened] = useState(false)

  const openPresent = () => {
    window.open(`${window.location.origin}/present/${setId}`, '_blank')
    setOpened(true)
  }

  const steps = [
    {
      n: 1,
      title: 'Connect to the same Wi-Fi',
      body: (
        <ul className="space-y-2">
          <li className="flex items-start gap-2 text-sm text-muted">
            <span className="shrink-0 mt-0.5 text-accent-light">•</span>
            Make sure your device and your Apple TV (or AirPlay-enabled TV) are on the <span className="text-[#f5f5f5]">same Wi-Fi network</span>.
          </li>
          <li className="flex items-start gap-2 text-sm text-muted">
            <span className="shrink-0 mt-0.5 text-accent-light">•</span>
            AirPlay won't discover your display if they're on different networks.
          </li>
        </ul>
      ),
    },
    {
      n: 2,
      title: 'Open the presentation screen',
      body: (
        <button
          onClick={openPresent}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
            opened
              ? 'border-green-500/40 text-green-400 bg-green-500/10 cursor-default'
              : 'btn-primary'
          }`}
        >
          <MonitorPlay size={16} />
          {opened ? '✓ Presentation screen opened' : 'Open Presentation Screen'}
        </button>
      ),
      note: opened ? 'Switch to that tab now — it shows the full-screen slide display.' : null,
    },
    {
      n: 3,
      title: 'Switch to the presentation tab & AirPlay',
      body: (
        <ul className="space-y-2">
          <li className="flex items-start gap-2 text-sm text-muted">
            <span className="shrink-0 mt-0.5 text-accent-light">•</span>
            Switch to the presentation tab so your iPad shows only the slide.
          </li>
          <li className="flex items-start gap-2 text-sm text-muted">
            <span className="shrink-0 mt-0.5 text-accent-light">•</span>
            Swipe down from the top-right → tap <span className="text-[#f5f5f5]">Screen Mirroring</span> → select your TV.
          </li>
          <li className="flex items-start gap-2 text-sm text-muted">
            <span className="shrink-0 mt-0.5 text-accent-light">•</span>
            Your TV will now show only the clean slide — no app chrome.
          </li>
        </ul>
      ),
    },
    {
      n: 4,
      title: 'Control slides from the presentation screen',
      body: (
        <ul className="space-y-2">
          <li className="flex items-start gap-2 text-sm text-muted">
            <span className="shrink-0 mt-0.5 text-accent-light">•</span>
            <span><span className="text-[#f5f5f5]">Swipe left/right</span> or <span className="text-[#f5f5f5]">tap the left/right edges</span> to go to the previous or next slide.</span>
          </li>
          <li className="flex items-start gap-2 text-sm text-muted">
            <span className="shrink-0 mt-0.5 text-accent-light">•</span>
            <span><span className="text-[#f5f5f5]">Tap the center</span> to reveal a mini control bar with Prev, Next, and Blank.</span>
          </li>
          <li className="flex items-start gap-2 text-sm text-muted">
            <span className="shrink-0 mt-0.5 text-accent-light">•</span>
            Have a second device? Open this Controller page on it — changes sync automatically.
          </li>
        </ul>
      ),
    },
  ]

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
        <button onClick={onBack} className="btn-ghost flex items-center gap-1.5 text-sm !px-2 !py-1.5 shrink-0">
          <ArrowLeft size={16} /> Program
        </button>
        <Tv size={18} className="text-accent" />
        <span className="font-medium text-sm truncate">{setName || 'Loading…'}</span>
        <span className="text-xs text-muted shrink-0">· Presentation Mode</span>
      </div>
      <div className="flex-1 overflow-y-auto flex items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-5">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center mx-auto">
              <Wifi size={26} className="text-accent-light" />
            </div>
            <h2 className="text-xl font-semibold">Presentation Mode</h2>
            <p className="text-muted text-sm">Your program is ready. Follow these steps to get your TV showing the slides.</p>
          </div>

          {steps.map(({ n, title, body, note }) => (
            <div key={n} className="card space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-accent/20 text-accent-light text-xs flex items-center justify-center font-semibold shrink-0">
                  {n}
                </span>
                <span className="text-sm font-medium">{title}</span>
              </div>
              {body}
              {note && <p className="text-xs text-muted">{note}</p>}
            </div>
          ))}

          <button onClick={onContinue} className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base">
            Display is ready — Start Controlling <ArrowRight size={18} />
          </button>
          <p className="text-center text-xs text-muted">No display? You can still use the controller to rehearse.</p>
        </div>
      </div>
    </div>
  )
}

// ─── Slide thumbnail ──────────────────────────────────────────────────────────

// `fit` is the song's text size in container units (cqw/cqh), so previews match the TV.
function SlideThumb({ slide, live, onClick, className = '', large = false, fit = null }) {
  const lines = slide?.lines || []
  return (
    <button
      onClick={onClick}
      style={{ containerType: 'size' }}
      className={`w-full h-full rounded-xl bg-black border-2 flex flex-col items-center justify-center overflow-hidden transition-all ${
        live ? 'border-red-500/70 shadow-[0_0_20px_rgba(239,68,68,0.15)]' : 'border-border hover:border-[#555]'
      } ${className}`}
    >
      {slide?.image ? (
        <img src={slide.image} alt="" className="w-full h-full object-contain" draggable={false} />
      ) : slide?.type === 'welcome' ? (
        <TitleSlide title={slide.title} subtitle={slide.subtitle} style={slide.style} unit="cqw" />
      ) : slide ? (
        <div className="text-center w-full" style={{ fontSize: fit || '6cqw' }}>
          {slide.label && !large && (
            <p className="text-gray-500 uppercase tracking-wider mb-1" style={{ fontSize: 9 }}>{slide.label}</p>
          )}
          {lines.map((line, i) => (
            <div key={i} style={{ marginTop: i ? '0.5em' : 0 }}>
              <p className="text-white font-light leading-snug whitespace-nowrap">{line}</p>
              {slide.subs?.[i] && <p className="text-gray-400 italic leading-snug whitespace-nowrap" style={{ fontSize: '0.55em' }}>{slide.subs[i]}</p>}
            </div>
          ))}
          {lines.length === 0 && <p className="text-gray-700 italic" style={{ fontSize: large ? '1rem' : '10px' }}>Blank</p>}
        </div>
      ) : (
        <p className="text-gray-700 text-xs">—</p>
      )}
    </button>
  )
}

// ─── Item type icons ──────────────────────────────────────────────────────────

const ITEM_ICONS = { song: Music, welcome: Star, announcement: Megaphone, media: FolderOpen }
const ITEM_COLORS = {
  song: 'text-accent-light', welcome: 'text-yellow-400',
  announcement: 'text-orange-400', media: 'text-purple-400',
}

// ─── Smart slide strip (bottom) ──────────────────────────────────────────────

// Slides of one item along the bottom. Thumbnails fill the strip's height; `focus` = { idx, n }
// scrolls that slide to the front (used by the section buttons).
function SmartStrip({ group, current, blank, onGo, fits, focus }) {
  const wrapRef = useRef(null)
  const rowRef = useRef(null)
  const labelRef = useRef(null)
  const [h, setH] = useState(160)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setH(e.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scrollToIdx = (idx, mode) => {
    const row = rowRef.current
    const btn = row?.querySelector(`[data-idx="${idx}"]`)
    if (!row || !btn) return
    const lead = (labelRef.current?.offsetWidth || 0) + 8
    if (mode === 'first') { row.scrollTo({ left: btn.offsetLeft - lead, behavior: 'smooth' }); return }
    const left = btn.offsetLeft - lead, right = btn.offsetLeft + btn.offsetWidth
    if (left < row.scrollLeft || right > row.scrollLeft + row.clientWidth) row.scrollTo({ left, behavior: 'smooth' })
  }
  useEffect(() => { if (focus) scrollToIdx(focus.idx, 'first') }, [focus?.n])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scrollToIdx(current, 'visible') }, [current, group?.itemId])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!group) return <div ref={wrapRef} className="flex-1 min-h-0" />
  const Icon = ITEM_ICONS[group.type] || Layers
  const slideH = Math.max(48, Math.min(h - 24, 240))
  const slideW = Math.round(slideH * 16 / 9)

  return (
    <div ref={wrapRef} className="flex-1 min-h-0 border-t border-border bg-[#0a0a0a] select-none">
      <div ref={rowRef} className="h-full flex items-center overflow-x-auto pr-3 relative">
        <div ref={labelRef} className="sticky left-0 z-10 self-stretch flex items-center gap-1.5 shrink-0 pl-3 pr-3 mr-3 border-r border-border bg-[#0a0a0a] max-w-[10rem]">
          <Icon size={13} className={`shrink-0 ${ITEM_COLORS[group.type] || 'text-muted'}`} />
          <span className="text-xs text-muted font-medium line-clamp-3">{group.itemTitle}</span>
        </div>
        {group.slides.map(s => (
          <div key={s.idx} data-idx={s.idx} className="shrink-0 mr-2 relative" style={{ width: slideW, height: slideH }}>
            <SlideThumb slide={s} live={s.idx === current && !blank} onClick={() => onGo(s.idx)} fit={fits[s.itemId]} className="!rounded-lg" />
            <span className="absolute bottom-1 right-1.5 text-[9px] text-gray-600 pointer-events-none">{s.idx + 1}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Controller ──────────────────────────────────────────────────────────

export default function Controller() {
  const { setId } = useParams()
  const navigate = useNavigate()
  const [slides, setSlides]       = useState([])
  const [current, setCurrent]     = useState(0)
  const [blank, setBlank]         = useState(false)
  const [setName, setSetName]     = useState('')
  const [connected, setConnected] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [rightWidth, setRightWidth] = useState(240)
  const [stripFocus, setStripFocus] = useState(null)   // { idx, n }: scroll the strip so idx comes first
  const rightDragRef = useRef(null)
  const channelRef = useRef(null)

  const startRightDrag = useCallback((clientX) => {
    rightDragRef.current = { x: clientX, w: rightWidth }
    const onMove = (e) => {
      const cx = e.touches ? e.touches[0].clientX : e.clientX
      const delta = rightDragRef.current.x - cx
      setRightWidth(Math.max(160, Math.min(420, rightDragRef.current.w + delta)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
  }, [rightWidth])

  useEffect(() => {
    async function load() {
      if (setId === 'mock') {
        setSetName('Sunday Morning — March 23')
        const mockSong = {
          id: 'mock-song-1', title: 'Holy Forever', artist: 'Bethel Music', lines_per_slide: 2,
          raw_lyrics: '[Verse 1]\nA thousand generations falling down in worship\nTo sing the song of ages to the Lamb\n\n[Chorus]\nHoly forever\nA story never ending\nHoly forever\nTo sing Your praise unceasing',
          slides: [],
        }
        const mockItems = [
          { id: 'i1', type: 'welcome',      position: 0, content: { title: 'Welcome', subtitle: "Glad you're here!" } },
          { id: 'i2', type: 'song',         position: 1, content: { song_id: 'mock-song-1', song_title: 'Holy Forever' } },
          { id: 'i3', type: 'announcement', position: 2, content: { title: 'Announcements', slides: [{ lines: ['Join us for small groups', 'Every Wednesday at 7pm'] }] } },
          { id: 'i4', type: 'blank',        position: 3, content: {} },
        ]
        setSlides(buildPresentationSlides(mockItems, [mockSong]))
        return
      }

      const [{ data: setData }, { data: items }] = await Promise.all([
        supabase.from('sets').select('name').eq('id', setId).single(),
        supabase.from('set_items').select('*').eq('set_id', setId).order('position'),
      ])
      setSetName(setData?.name || '')
      const songIds = (items || []).filter(i => i.type === 'song').map(i => i.content?.song_id).filter(Boolean)
      let songs = []
      if (songIds.length) {
        const { data } = await supabase.from('songs').select('*').in('id', songIds)
        songs = data || []
      }
      setSlides(buildPresentationSlides(items || [], songs))
    }
    load()
  }, [setId])

  // Group slides by item
  const groups = useMemo(() => {
    const result = []
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i]
      const last = result[result.length - 1]
      if (last && last.itemId === s.itemId) {
        last.slides.push({ ...s, idx: i })
      } else {
        result.push({ itemId: s.itemId, itemTitle: s.itemTitle, type: s.type, firstIdx: i, slides: [{ ...s, idx: i }] })
      }
    }
    return result
  }, [slides])

  // Abbreviate section labels: "Verse 1" → "V1", "Chorus" → "C", "Bridge" → "B", etc.
  const abbreviate = (label) => {
    if (!label) return label
    return label
      .replace(/^verse\s*/i, 'V')
      .replace(/^chorus$/i, 'C')
      .replace(/^bridge$/i, 'B')
      .replace(/^pre-?chorus$/i, 'PC')
      .replace(/^tag$/i, 'T')
      .replace(/^outro$/i, 'Out')
      .replace(/^intro$/i, 'In')
  }

  // The group containing the current slide
  const currentGroup = useMemo(
    () => groups.find(g => g.slides.some(s => s.idx === current)),
    [groups, current]
  )

  // The song's arrangement for this set, in order with repeats (V1 C V2 C B C): one button per section.
  const currentSections = useMemo(() => {
    if (!currentGroup) return []
    return currentGroup.slides.filter(s => s.label).map(s => ({ label: s.label, idx: s.idx }))
  }, [currentGroup])

  // One text size per item (song): longest line = 85% of the slide width. Container units for previews.
  const fits = useMemo(() => Object.fromEntries(groups.map(g => [g.itemId, groupFit(g.slides).fit('cqw', 'cqh')])), [groups])

  // Auto-select the active item in the strip when navigation changes
  useEffect(() => {
    if (currentGroup) setSelectedGroupId(currentGroup.itemId)
  }, [currentGroup?.itemId])

  // Supabase Realtime channel — persists for the session
  useEffect(() => {
    const ch = openControlChannel(setId, {
      onStatus: payload => { if (payload.type === 'STATUS') { setCurrent(payload.current); setBlank(payload.blank) } },
    })
    channelRef.current = ch
    return () => { ch.close(); channelRef.current = null }
  }, [setId])

  const send = useCallback((msg) => {
    channelRef.current?.sendControl(msg)
  }, [])

  const go = useCallback((idx) => {
    const clamped = Math.max(0, Math.min(idx, slides.length - 1))
    setCurrent(clamped)
    send({ type: 'GOTO', index: clamped })
  }, [slides.length, send])

  const toggleBlank = useCallback(() => {
    setBlank(b => !b)
    send({ type: 'BLANK' })
  }, [send])

  const handleDisconnect = useCallback(() => {
    send({ type: 'EXIT' })
    navigate(`/sets/${setId}`)
  }, [send, navigate, setId])

  useEffect(() => {
    const handler = (e) => {
      if (!connected) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') go(current + 1)
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(current - 1)
      else if (e.key === 'b' || e.key === 'B') toggleBlank()
      else if (e.key === 'Escape') handleDisconnect()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [current, go, toggleBlank, handleDisconnect, connected])


  if (!connected) {
    return <ConnectStep setId={setId} setName={setName} onContinue={() => setConnected(true)} onBack={() => navigate(`/sets/${setId}`)} />
  }

  const curr = slides[current]
  const next = slides[current + 1]

  // Which section occurrence is live (the last one starting at or before the current slide)
  const activeSection = [...currentSections].reverse().find(sec => sec.idx <= current)
  const jumpToSection = idx => { go(idx); setStripFocus(f => ({ idx, n: (f?.n || 0) + 1 })) }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="text-xs text-red-400 font-medium uppercase tracking-wide shrink-0">Live</span>
          <span className="text-muted shrink-0">·</span>
          <span className="font-medium text-sm truncate">{setName}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted">{current + 1} / {slides.length}</span>
          <button onClick={handleDisconnect} className="btn-danger flex items-center gap-1.5 text-sm px-3 py-1.5">
            <X size={14} /> End
          </button>
        </div>
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 min-h-0">

        {/* Left: Now Showing (top half) and the item's slides (bottom half) */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-border">
        <div className="flex flex-col gap-1.5 p-3 min-h-0" style={{ flex: '1 1 0' }}>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <p className="text-xs font-medium text-red-400">{blank ? 'Screen Blanked' : 'Now Showing'}</p>
          </div>
          <div className="flex-1 min-h-0 relative group/preview">
            <div className="h-full mx-auto" style={{ aspectRatio: '16 / 9', maxWidth: '100%' }}>
              <SlideThumb slide={blank ? null : curr} live={!blank} onClick={() => {}} large fit={curr ? fits[curr.itemId] : null} />
            </div>
            {/* Left overlay arrow */}
            <button
              onClick={() => go(current - 1)}
              disabled={current === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/80 opacity-0 group-hover/preview:opacity-100 disabled:opacity-0 transition-all"
            >
              <ChevronLeft size={22} />
            </button>
            {/* Right overlay arrow */}
            <button
              onClick={() => go(current + 1)}
              disabled={current >= slides.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/80 opacity-0 group-hover/preview:opacity-100 disabled:opacity-0 transition-all"
            >
              <ChevronRight size={22} />
            </button>
          </div>
        </div>

          <div className="flex flex-col min-h-0" style={{ flex: '1 1 0' }}>
            <SmartStrip
              group={groups.find(g => g.itemId === selectedGroupId) || currentGroup}
              current={current}
              blank={blank}
              onGo={go}
              fits={fits}
              focus={stripFocus}
            />
          </div>
        </div>

        {/* Right: Up Next + sections + blank + Run Order */}
        <div className="shrink-0 flex flex-col overflow-hidden relative" style={{ width: rightWidth }}>
          {/* Drag handle — left edge */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-10 hover:bg-accent/20 transition-colors select-none"
            onMouseDown={e => { e.preventDefault(); startRightDrag(e.clientX) }}
            onTouchStart={e => startRightDrag(e.touches[0].clientX)}
          />

          {/* Up Next thumbnail */}
          <div className="shrink-0 pl-4 pr-3 pt-3 pb-3 border-b border-border space-y-1.5">
            <p className="text-xs font-medium text-muted">Up Next</p>
            <div className="aspect-video w-full">
              <SlideThumb slide={next} live={false} onClick={() => go(current + 1)} fit={next ? fits[next.itemId] : null} />
            </div>
          </div>

          {/* Section jumps + Blank icon — same row, same size */}
          {currentSections.length > 1 && (
            <div className="shrink-0 pl-4 pr-3 py-2 border-b border-border flex flex-wrap items-center gap-1">
              {currentSections.map(sec => (
                <button
                  key={sec.idx}
                  onClick={() => jumpToSection(sec.idx)}
                  title={sec.label}
                  className={`min-w-[2rem] h-7 px-1.5 flex items-center justify-center rounded border text-[11px] font-medium transition-colors ${
                    activeSection?.idx === sec.idx
                      ? 'border-accent/60 text-accent-light bg-accent/10'
                      : 'border-border text-muted hover:text-[#f5f5f5] hover:border-[#444]'
                  }`}
                >
                  {abbreviate(sec.label)}
                </button>
              ))}
              <button
                onClick={toggleBlank}
                title={blank ? 'Unblank Screen' : 'Blank Screen'}
                className={`w-8 h-7 flex items-center justify-center rounded border transition-colors ${
                  blank
                    ? 'border-white text-white bg-white/10'
                    : 'border-border text-muted hover:text-[#f5f5f5] hover:border-[#444]'
                }`}
              >
                <XSquare size={14} />
              </button>
            </div>
          )}

          {/* Blank Screen — shown when no sections */}
          {currentSections.length <= 1 && (
            <div className="shrink-0 pl-4 pr-3 py-2 border-b border-border flex">
              <button
                onClick={toggleBlank}
                title={blank ? 'Unblank Screen' : 'Blank Screen'}
                className={`w-8 h-7 flex items-center justify-center rounded border transition-colors ${
                  blank
                    ? 'border-white text-white bg-white/10'
                    : 'border-border text-muted hover:text-[#f5f5f5] hover:border-[#444]'
                }`}
              >
                <XSquare size={14} />
              </button>
            </div>
          )}

          {/* Run Order — scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-3 py-1.5 border-b border-border">
              <span className="text-[10px] text-muted uppercase tracking-wider font-medium">Run Order</span>
            </div>

            {groups.map((group) => {
          const Icon = ITEM_ICONS[group.type] || Layers
          const colorClass = ITEM_COLORS[group.type] || 'text-muted'
          const isActive = currentGroup?.itemId === group.itemId
          const isSelected = selectedGroupId === group.itemId

          return (
            <button
              key={group.itemId}
              onClick={() => { setSelectedGroupId(group.itemId); go(group.firstIdx) }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 border-b border-border transition-colors text-left ${
                isSelected && !isActive ? 'bg-card/30' : isActive ? 'bg-card/50' : 'hover:bg-card/30'
              }`}
            >
              {isActive
                ? <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
                : <span className="w-2 h-2 rounded-full border border-border shrink-0" />
              }
              <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${isActive ? 'bg-accent/20' : 'bg-card'}`}>
                <Icon size={13} className={colorClass} />
              </div>
              <span className={`text-sm font-medium flex-1 truncate ${isActive ? 'text-[#f5f5f5]' : 'text-muted'}`}>
                {group.itemTitle}
              </span>
              {isActive && (
                <span className="text-[10px] text-red-400 font-medium shrink-0">
                  {current - group.firstIdx + 1}/{group.slides.length}
                </span>
              )}
            </button>
          )
        })}
          </div>
          {/* keyboard hint */}
          <div className="shrink-0 px-3 py-1.5 border-t border-border">
            <p className="text-[10px] text-muted text-center">← → · B blank · Esc end</p>
          </div>
        </div>
      </div>

    </div>
  )
}
