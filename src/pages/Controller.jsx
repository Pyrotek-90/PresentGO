import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { buildPresentationSlides } from '../lib/lyricFormatter'
import {
  ChevronLeft, ChevronRight, XSquare, X, Tv,
  MonitorPlay, ArrowRight, Radio, Wifi,
  Music, Star, Megaphone, FolderOpen, Layers,
} from 'lucide-react'

// ─── Connect step — open presentation then AirPlay ───────────────────────────

function ConnectStep({ setId, setName, onContinue }) {
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
      title: 'Mirror your screen via AirPlay',
      body: (
        <ul className="space-y-2">
          <li className="flex items-start gap-2 text-sm text-muted">
            <span className="shrink-0 mt-0.5 text-accent-light">•</span>
            Swipe down from the top-right corner to open Control Center.
          </li>
          <li className="flex items-start gap-2 text-sm text-muted">
            <span className="shrink-0 mt-0.5 text-accent-light">•</span>
            Tap <span className="text-[#f5f5f5]">Screen Mirroring</span> and select your Apple TV or AirPlay display.
          </li>
          <li className="flex items-start gap-2 text-sm text-muted">
            <span className="shrink-0 mt-0.5 text-accent-light">•</span>
            Your TV will now mirror whatever is on your screen.
          </li>
        </ul>
      ),
    },
    {
      n: 3,
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
      note: opened ? 'Switch to the new tab — your TV should now show the full-screen slides.' : null,
    },
    {
      n: 4,
      title: 'Come back here to control',
      body: (
        <p className="text-sm text-muted">
          Switch back to this tab. Your TV will keep showing the presentation screen while you control slides from here.
        </p>
      ),
    },
  ]

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
        <Tv size={18} className="text-accent" />
        <span className="font-medium text-sm truncate">{setName || 'Loading…'}</span>
      </div>
      <div className="flex-1 overflow-y-auto flex items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-5">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center mx-auto">
              <Wifi size={26} className="text-accent-light" />
            </div>
            <h2 className="text-xl font-semibold">Set up your display</h2>
            <p className="text-muted text-sm">Follow these steps to get your TV showing the presentation.</p>
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

function SlideThumb({ slide, live, onClick, className = '', large = false, groupMaxLen = 1 }) {
  const lines = slide?.lines || []
  // For large preview, use the group's max line length so font is consistent across all slides
  const maxLen = large ? groupMaxLen : Math.max(...lines.map(l => l.length), 1)
  const fontSize = large ? `clamp(0.75rem, ${Math.min(6, 52 / maxLen)}vw, 2.8rem)` : undefined

  return (
    <button
      onClick={onClick}
      className={`w-full h-full rounded-xl bg-black border-2 flex flex-col items-center justify-center p-3 transition-all ${
        live ? 'border-red-500/70 shadow-[0_0_20px_rgba(239,68,68,0.15)]' : 'border-border hover:border-[#555]'
      } ${className}`}
    >
      {slide ? (
        <div className="text-center w-full">
          {slide.label && !large && (
            <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">
              {slide.label}
            </p>
          )}
          {lines.map((line, i) => (
            <p
              key={i}
              className="text-white leading-snug"
              style={large ? { fontSize } : { fontSize: '10px' }}
            >
              {line}
            </p>
          ))}
          {lines.length === 0 && (
            <p className="text-gray-700 italic" style={{ fontSize: large ? '1rem' : '10px' }}>Blank</p>
          )}
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

function SmartStrip({ group, current, blank, onGo }) {
  const [stripHeight, setStripHeight] = useState(120)
  const dragStartRef = useRef(null)

  const startDrag = useCallback((clientY) => {
    dragStartRef.current = { y: clientY, h: stripHeight }
    const onMove = (e) => {
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      const delta = dragStartRef.current.y - clientY
      setStripHeight(Math.max(80, Math.min(320, dragStartRef.current.h + delta)))
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
  }, [stripHeight])

  if (!group) return null
  const Icon = ITEM_ICONS[group.type] || Layers

  // Responsive slide dimensions — fill available height at 16:9
  const HANDLE_H = 10
  const PADDING_V = 12
  const slideH = Math.max(40, stripHeight - HANDLE_H - PADDING_V * 2)
  const slideW = Math.round(slideH * 16 / 9)
  const textSize = Math.max(8, Math.round(slideH * 0.11))

  return (
    <div className="shrink-0 border-t border-border bg-[#0a0a0a] select-none" style={{ height: stripHeight }}>
      {/* Drag handle */}
      <div
        className="w-full flex items-center justify-center cursor-ns-resize hover:bg-[#1a1a1a] transition-colors"
        style={{ height: HANDLE_H }}
        onMouseDown={e => { e.preventDefault(); startDrag(e.clientY) }}
        onTouchStart={e => startDrag(e.touches[0].clientY)}
      >
        <div className="w-10 h-0.5 rounded-full bg-[#444]" />
      </div>

      {/* Slides row */}
      <div
        className="flex items-center overflow-x-auto px-3 gap-0"
        style={{ height: stripHeight - HANDLE_H, paddingTop: PADDING_V, paddingBottom: PADDING_V }}
      >
        {/* Item label */}
        <div className="flex items-center gap-1.5 shrink-0 pr-3 mr-3 border-r border-border self-stretch items-center">
          <Icon size={13} className={ITEM_COLORS[group.type] || 'text-muted'} />
          <span className="text-xs text-muted font-medium whitespace-nowrap">{group.itemTitle}</span>
        </div>

        {/* Responsive slide thumbnails */}
        {group.slides.map(s => (
          <button
            key={s.idx}
            onClick={() => onGo(s.idx)}
            style={{ width: slideW, height: slideH }}
            className={`shrink-0 rounded-lg bg-black border-2 flex flex-col items-center justify-center transition-colors relative mr-2 overflow-hidden ${
              s.idx === current && !blank ? 'border-red-500/60' : 'border-border hover:border-[#444]'
            }`}
          >
            {s.idx === current && !blank && (
              <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-red-500" />
            )}
            <div className="text-center w-full px-1">
              {s.lines?.slice(0, 2).map((line, j) => (
                <p key={j} className="text-white leading-tight truncate" style={{ fontSize: textSize }}>{line}</p>
              ))}
            </div>
            <span className="absolute bottom-0.5 right-1 text-gray-700" style={{ fontSize: 7 }}>{s.idx + 1}</span>
          </button>
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
  const [rightWidth, setRightWidth] = useState(224)
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

  // Sections within the current group (for songs/presentations)
  const currentSections = useMemo(() => {
    if (!currentGroup) return []
    const sections = []
    for (const s of currentGroup.slides) {
      if (s.label && !sections.find(sec => sec.label === s.label)) {
        sections.push({ label: s.label, idx: s.idx })
      }
    }
    return sections
  }, [currentGroup])

  // Max line length across current group — keeps font size consistent for all slides in the item
  const groupMaxLen = useMemo(() => {
    if (!currentGroup) return 20
    const allLines = currentGroup.slides.flatMap(s => s.lines || [])
    return Math.max(...allLines.map(l => l.length), 1)
  }, [currentGroup])

  // Auto-select the active item in the strip when navigation changes
  useEffect(() => {
    if (currentGroup) setSelectedGroupId(currentGroup.itemId)
  }, [currentGroup?.itemId])

  // Supabase Realtime channel — persists for the session
  useEffect(() => {
    const ch = supabase.channel(`presentgo-${setId}`)
    channelRef.current = ch
    ch
      .on('broadcast', { event: 'status' }, ({ payload }) => {
        if (payload.type === 'STATUS') { setCurrent(payload.current); setBlank(payload.blank) }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch); channelRef.current = null }
  }, [setId])

  const send = useCallback((msg) => {
    channelRef.current?.send({ type: 'broadcast', event: 'control', payload: msg })
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
    return <ConnectStep setId={setId} setName={setName} onContinue={() => setConnected(true)} />
  }

  const curr = slides[current]
  const next = slides[current + 1]

  // Which section is currently active (within currentGroup)
  const activeSection = currentSections.find((sec, i) => {
    const nextIdx = currentSections[i + 1]?.idx ?? Infinity
    return current >= sec.idx && current < nextIdx
  })

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

        {/* Left: Now Showing with overlay nav arrows */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5 p-3 border-r border-border">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <p className="text-xs font-medium text-red-400">{blank ? 'Screen Blanked' : 'Now Showing'}</p>
          </div>
          <div className="flex-1 min-h-0 relative group/preview">
            <SlideThumb slide={blank ? null : curr} live={!blank} onClick={() => {}} large groupMaxLen={groupMaxLen} />
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
              <SlideThumb slide={next} live={false} onClick={() => go(current + 1)} />
            </div>
          </div>

          {/* Section jumps + Blank icon — same row, same size */}
          {currentSections.length > 1 && (
            <div className="shrink-0 pl-4 pr-3 py-2 border-b border-border flex flex-wrap items-center gap-1">
              {currentSections.map(sec => (
                <button
                  key={sec.label}
                  onClick={() => go(sec.idx)}
                  title={sec.label}
                  className={`w-8 h-7 flex items-center justify-center rounded border text-[11px] font-medium transition-colors ${
                    activeSection?.label === sec.label
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

      {/* Smart strip — full width at bottom */}
      <SmartStrip
        group={groups.find(g => g.itemId === selectedGroupId) || currentGroup}
        current={current}
        blank={blank}
        onGo={go}
      />
    </div>
  )
}
