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
  Music, Star, Megaphone, FolderOpen, Layers, LayoutGrid, AlignLeft,
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
          {lines.map((line, i) => (
            <div key={i} style={{ marginTop: i ? '0.5em' : 0 }}>
              <p className="text-white font-bold leading-snug whitespace-nowrap">{line}</p>
              {slide.subs?.[i] && <p className="text-gray-400 font-bold leading-snug whitespace-nowrap" style={{ fontSize: '0.55em' }}>[{slide.subs[i]}]</p>}
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

// ─── Slide matrix (bottom) ───────────────────────────────────────────────────

// All slides of one item in a grid. `focus` = { idx, n } scrolls that slide's row to the top
// (used by the section buttons); otherwise the live slide is kept in view.
function SlideMatrix({ group, current, blank, onGo, fits, focus, mode = 'tiles' }) {
  const boxRef = useRef(null)

  // Bring idx's row to the top of the grid. Scrolling stops on its own once the end of the
  // song is in view, so further Nexts just move the highlight.
  const scrollToIdx = (idx) => {
    const box = boxRef.current
    const cell = box?.querySelector(`[data-idx="${idx}"]`)
    if (!box || !cell) return
    const top = Math.min(Math.max(0, cell.offsetTop - 12), box.scrollHeight - box.clientHeight)
    if (Math.abs(box.scrollTop - top) > 2) box.scrollTo({ top, behavior: 'smooth' })
  }
  useEffect(() => { if (focus) scrollToIdx(focus.idx) }, [focus?.n])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scrollToIdx(current) }, [current, group?.itemId, mode])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!group) return <div className="flex-1 min-h-0" />
  const Icon = ITEM_ICONS[group.type] || Layers

  return (
    <div ref={boxRef} className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-6 select-none relative">
      {mode === 'text' ? (
        // Text mode: just the words, large and readable, like ProPresenter's text view
        <div className="grid gap-2.5 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {group.slides.map(s => {
            const live = s.idx === current && !blank
            return (
              <button key={s.idx} data-idx={s.idx} onClick={() => onGo(s.idx)}
                className={`relative flex flex-col justify-start text-center rounded-lg border-2 px-3 pt-2 pb-3 transition-colors ${
                  live ? 'border-red-500/70 bg-red-500/10' : 'border-border bg-[#1a1a1a] hover:border-[#555]'}`}>
                <div className="w-full flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${live ? 'text-red-400' : 'text-gray-500'}`}>{s.label || '\u00a0'}</span>
                  <span className="ml-auto text-[10px] text-gray-600">{s.idx + 1}</span>
                </div>
                {s.image ? (
                  <img src={s.image} alt="" className="w-full aspect-video object-contain bg-black rounded" draggable={false} />
                ) : s.type === 'welcome' ? (
                  <p className="text-[15px] font-bold text-white leading-snug">{s.title}{s.subtitle ? <span className="block text-sm font-semibold text-gray-400">{s.subtitle}</span> : null}</p>
                ) : (s.lines || []).length ? (
                  <div className="space-y-1">
                    {s.lines.map((line, i) => (
                      <div key={i}>
                        <p className="text-[15px] font-bold text-white leading-snug">{line}</p>
                        {s.subs?.[i] && <p className="text-xs font-semibold text-gray-400 leading-snug">[{s.subs[i]}]</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-gray-600">Blank</p>
                )}
              </button>
            )
          })}
        </div>
      ) : (
      <div className="grid gap-2.5 grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {group.slides.map(s => {
          const live = s.idx === current && !blank
          return (
            <div key={s.idx} data-idx={s.idx} className="relative aspect-video">
              <SlideThumb slide={s} live={live} onClick={() => onGo(s.idx)} fit={fits[s.itemId]} className="!rounded-lg" />
              {s.label && (
                <span className="absolute top-1 left-1.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400 bg-black/70 px-1 rounded pointer-events-none">{s.label}</span>
              )}
              {live && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 pointer-events-none" />}
              <span className="absolute bottom-1 right-1.5 text-[9px] text-gray-600 pointer-events-none">{s.idx + 1}</span>
            </div>
          )
        })}
      </div>
      )}
      {group.slides.length === 0 && (
        <p className="text-xs text-muted flex items-center gap-1.5"><Icon size={13} /> No slides</p>
      )}
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
  const [gridMode, setGridMode] = useState(() => { try { return localStorage.getItem('controller-grid-mode') || 'tiles' } catch { return 'tiles' } })
  const chooseGridMode = m => { setGridMode(m); try { localStorage.setItem('controller-grid-mode', m) } catch { /* ignore */ } }
  const [stripFocus, setStripFocus] = useState(null)   // { idx, n }: scroll the strip so idx comes first
  const channelRef = useRef(null)

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

  const groupForGrid = groups.find(g => g.itemId === selectedGroupId) || currentGroup

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-[52px] border-b border-border shrink-0">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
        <span className="text-xs text-red-400 font-semibold uppercase tracking-wide shrink-0">Live</span>
        <span className="text-muted shrink-0">·</span>
        <span className="font-medium text-sm truncate">{setName}</span>
        <span className="ml-auto text-xs text-muted shrink-0 hidden sm:inline">Slide {current + 1} of {slides.length}</span>
        <button onClick={handleDisconnect} className="btn-danger flex items-center gap-1.5 text-sm px-3 h-9 shrink-0">
          <X size={14} /> End
        </button>
      </div>

      {/* Top row: Now Showing | Up Next | Run Order — equal slides; Run Order matches their height */}
      <div className="shrink-0 bg-[#1a1a1a] border-b border-border">
      <div className="flex justify-center gap-3 px-4 pt-3 shrink-0">
        <section className="min-w-0 flex flex-col gap-1.5" style={{ flex: '1 1 0', maxWidth: 'calc(36vh * 16 / 9)' }}>
          <p className="text-xs font-semibold text-red-400 shrink-0 truncate">● {blank ? 'Screen Blanked' : 'Now Showing'}</p>
          <div className="w-full aspect-video">
            <SlideThumb slide={blank ? null : curr} live={!blank} onClick={() => {}} large fit={curr ? fits[curr.itemId] : null} />
          </div>
        </section>
        <section className="min-w-0 flex flex-col gap-1.5" style={{ flex: '1 1 0', maxWidth: 'calc(36vh * 16 / 9)' }}>
          <p className="text-xs font-semibold text-muted shrink-0 truncate">Up Next{next?.label ? ` · ${next.label}` : next && next.itemId !== curr?.itemId ? ` · ${next.itemTitle}` : ''}</p>
          <div className="w-full aspect-video">
            <SlideThumb slide={next} live={false} onClick={() => go(current + 1)} fit={next ? fits[next.itemId] : null} />
          </div>
        </section>
        <section className="w-[200px] lg:w-[250px] shrink-0 hidden md:flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-muted shrink-0">Run Order</p>
          <div className="relative flex-1 min-h-0">
            <div className="absolute inset-0 overflow-y-auto rounded-xl border-2 border-border bg-[#242424]">
              {groups.map(group => {
                const isActive = currentGroup?.itemId === group.itemId
                const isSelected = selectedGroupId === group.itemId
                return (
                  <button key={group.itemId} onClick={() => { setSelectedGroupId(group.itemId); go(group.firstIdx) }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-border text-left text-sm transition-colors ${
                      isActive ? 'bg-[#333] text-white font-semibold' : isSelected ? 'bg-card/30 text-muted' : 'text-muted hover:bg-card/30'}`}>
                    {isActive ? <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" /> : <span className="w-2 h-2 rounded-full border border-[#525252] shrink-0" />}
                    <span className="flex-1 truncate">{group.itemTitle}</span>
                    {isActive && <span className="text-[11px] text-red-400 shrink-0">{current - group.firstIdx + 1}/{group.slides.length}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      </div>

      {/* Sections (left, for the thumb) | song title (center) | Blank, Back, Next (right) */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {groupForGrid?.itemId === currentGroup?.itemId && currentSections.map(sec => (
            <button key={sec.idx} onClick={() => jumpToSection(sec.idx)} title={sec.label}
              className={`shrink-0 h-8 min-w-[2.5rem] px-2.5 rounded-lg border text-xs font-semibold transition-colors ${
                activeSection?.idx === sec.idx ? 'border-accent bg-accent/25 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5] hover:border-[#555]'}`}>
              {abbreviate(sec.label)}
            </button>
          ))}
        </div>
        <span className="text-sm font-semibold truncate max-w-[16rem] text-center">{groupForGrid?.itemTitle}</span>
        <div className="flex justify-end gap-1.5">
          <button onClick={toggleBlank} title="Blank the screen (B)"
            className={`h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${blank ? 'border-white bg-white/10 text-white' : 'border-border text-muted hover:text-[#f5f5f5] hover:border-[#555]'}`}>
            <XSquare size={14} /> {blank ? 'Unblank' : 'Blank'}
          </button>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {[['tiles', LayoutGrid, 'Tile view'], ['text', AlignLeft, 'Text view']].map(([m, I, t]) => (
              <button key={m} onClick={() => chooseGridMode(m)} title={t} aria-label={t} aria-pressed={gridMode === m}
                className={`h-8 w-10 flex items-center justify-center transition-colors ${gridMode === m ? 'bg-accent/25 text-accent-light' : 'text-muted hover:text-[#f5f5f5]'}`}>
                <I size={15} />
              </button>
            ))}
          </div>
          <button onClick={() => go(current - 1)} disabled={current === 0} aria-label="Previous slide"
            className="h-8 min-w-[2.5rem] px-2.5 rounded-lg border border-border text-muted hover:text-[#f5f5f5] hover:border-[#555] flex items-center justify-center transition-colors disabled:opacity-30"><ChevronLeft size={16} /></button>
          <button onClick={() => go(current + 1)} disabled={current >= slides.length - 1} aria-label="Next slide"
            className="h-8 min-w-[2.5rem] px-2.5 rounded-lg border border-accent bg-accent/25 text-accent-light hover:bg-accent/35 flex items-center justify-center transition-colors disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      </div>
      </div>

      {/* Slide grid */}
      <SlideMatrix group={groupForGrid} current={current} blank={blank} onGo={go} fits={fits} focus={stripFocus} mode={gridMode} />
    </div>
  )
}
