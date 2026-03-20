import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { buildPresentationSlides } from '../lib/lyricFormatter'
import { ChevronLeft, ChevronRight, Square } from 'lucide-react'

export default function PresentMode() {
  const { setId } = useParams()
  const [slides, setSlides] = useState([])
  const [current, setCurrent] = useState(0)
  const [blank, setBlank] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Controls overlay visibility (tap center to toggle)
  const [showControls, setShowControls] = useState(false)
  const controlsTimerRef = useRef(null)

  // Touch/swipe tracking
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)

  // ── Load set + items + songs ────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: items } = await supabase
        .from('set_items')
        .select('*')
        .eq('set_id', setId)
        .order('position')

      const songIds = (items || [])
        .filter(i => i.type === 'song')
        .map(i => i.content?.song_id)
        .filter(Boolean)

      let songMap = []
      if (songIds.length) {
        const { data: songData } = await supabase.from('songs').select('*').in('id', songIds)
        songMap = songData || []
      }

      const built = buildPresentationSlides(items || [], songMap)
      setSlides(built)
      setLoaded(true)
    }
    load()
  }, [setId])

  // ── Supabase Realtime — receive control commands from Controller ────────────
  const channelRef = useRef(null)
  useEffect(() => {
    const ch = supabase.channel(`presentgo-${setId}`)
    channelRef.current = ch
    ch
      .on('broadcast', { event: 'control' }, ({ payload }) => {
        if (payload.type === 'GOTO')  setCurrent(payload.index)
        if (payload.type === 'BLANK') setBlank(b => !b)
        if (payload.type === 'NEXT')  setCurrent(c => Math.min(c + 1, slides.length - 1))
        if (payload.type === 'PREV')  setCurrent(c => Math.max(c - 1, 0))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch); channelRef.current = null }
  }, [setId, slides.length])

  // ── Send status back to controller ─────────────────────────────────────────
  useEffect(() => {
    if (!loaded || !channelRef.current) return
    channelRef.current.send({
      type: 'broadcast',
      event: 'status',
      payload: { type: 'STATUS', current, blank, total: slides.length },
    })
  }, [current, blank, loaded, slides.length])

  // ── Keyboard navigation ─────────────────────────────────────────────────────
  const handleKey = useCallback((e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ')
      setCurrent(c => Math.min(c + 1, slides.length - 1))
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      setCurrent(c => Math.max(c - 1, 0))
    else if (e.key === 'b' || e.key === 'B')
      setBlank(b => !b)
    else if (e.key === 'Escape')
      window.close()
  }, [slides.length])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // ── Controls auto-hide ──────────────────────────────────────────────────────
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true)
    clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000)
  }, [])

  useEffect(() => () => clearTimeout(controlsTimerRef.current), [])

  // ── Touch handlers: swipe left/right OR tap left/center/right zone ──────────
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    // Swipe gesture (>50px horizontal, more horizontal than vertical)
    if (absDx > 50 && absDx > absDy) {
      if (dx < 0) {
        // Swipe left → next
        setCurrent(c => Math.min(c + 1, slides.length - 1))
      } else {
        // Swipe right → prev
        setCurrent(c => Math.max(c - 1, 0))
      }
      touchStartX.current = null
      return
    }

    // Tap (minimal movement)
    if (absDx < 15 && absDy < 15) {
      const x = e.changedTouches[0].clientX
      const w = window.innerWidth
      if (x < w * 0.25) {
        // Left quarter → prev
        setCurrent(c => Math.max(c - 1, 0))
      } else if (x > w * 0.75) {
        // Right quarter → next
        setCurrent(c => Math.min(c + 1, slides.length - 1))
      } else {
        // Center half → toggle controls overlay
        showControlsTemporarily()
      }
    }

    touchStartX.current = null
  }

  // ── Click handler for non-touch devices ────────────────────────────────────
  const handleClick = (e) => {
    const x = e.clientX
    const w = window.innerWidth
    if (x < w * 0.25) {
      setCurrent(c => Math.max(c - 1, 0))
    } else if (x > w * 0.75) {
      setCurrent(c => Math.min(c + 1, slides.length - 1))
    } else {
      showControlsTemporarily()
    }
  }

  // ── Font size ───────────────────────────────────────────────────────────────
  const slide = slides[current]
  const dynamicFontSize = slide?.lines?.length
    ? (() => {
        const maxLen = Math.max(...slide.lines.map(l => l.length), 1)
        const vw = (90 / maxLen).toFixed(2)
        return `clamp(1.5rem, ${vw}vw, 4.5rem)`
      })()
    : '3rem'

  return (
    <div
      className="fixed inset-0 bg-black flex items-center justify-center select-none"
      style={{ cursor: 'none', touchAction: 'none' }}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Loading spinner */}
      {!loaded && (
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      )}

      {/* Slide content */}
      {loaded && !blank && slide && (
        <div className="w-full max-w-5xl px-16 text-center">
          <div className="space-y-4">
            {slide.lines.map((line, i) => (
              <p
                key={i}
                className="text-white font-light leading-snug slide-text"
                style={{ fontSize: dynamicFontSize }}
              >
                {line}
              </p>
            ))}
          </div>
          {slide.type === 'song' && slide.itemTitle && (
            <p className="absolute bottom-8 right-10 text-gray-800 text-xs tracking-widest uppercase">
              {slide.itemTitle}
            </p>
          )}
        </div>
      )}

      {/* Blank overlay */}
      {blank && <div className="fixed inset-0 bg-black" />}

      {/* Slide dot indicator */}
      {loaded && !blank && slides.length > 1 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === current ? 'bg-white/40' : 'bg-white/10'}`}
            />
          ))}
        </div>
      )}

      {/* ── Floating controls overlay — appears on center tap, auto-hides ── */}
      <div
        className={`fixed bottom-12 left-1/2 -translate-x-1/2 transition-all duration-300 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl px-5 py-3 shadow-2xl">
          {/* Prev */}
          <button
            className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={() => { setCurrent(c => Math.max(c - 1, 0)); showControlsTemporarily() }}
          >
            <ChevronLeft size={20} className="text-white" />
          </button>

          {/* Slide counter */}
          <span className="text-white/60 text-sm font-mono w-16 text-center">
            {current + 1} / {slides.length}
          </span>

          {/* Next */}
          <button
            className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={() => { setCurrent(c => Math.min(c + 1, slides.length - 1)); showControlsTemporarily() }}
          >
            <ChevronRight size={20} className="text-white" />
          </button>

          {/* Divider */}
          <div className="w-px h-7 bg-white/10 mx-1" />

          {/* Blank */}
          <button
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              blank ? 'bg-red-500/40 hover:bg-red-500/50' : 'bg-white/10 hover:bg-white/20'
            }`}
            onClick={() => { setBlank(b => !b); showControlsTemporarily() }}
          >
            <Square size={16} className="text-white" />
          </button>
        </div>

        {/* Gesture hint */}
        <p className="text-center text-white/25 text-xs mt-2">
          swipe left/right · tap edges · tap center to toggle
        </p>
      </div>
    </div>
  )
}
