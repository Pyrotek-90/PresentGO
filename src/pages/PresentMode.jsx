import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatLyrics, buildPresentationSlides } from '../lib/lyricFormatter'

export default function PresentMode() {
  const { setId } = useParams()
  const [slides, setSlides] = useState([])
  const [current, setCurrent] = useState(0)
  const [blank, setBlank] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Load set + items + songs
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

  // Persistent Supabase Realtime channel — receive control commands from controller
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

  // Keyboard navigation
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

  // Send status back to controller whenever slide or blank changes
  useEffect(() => {
    if (!loaded || !channelRef.current) return
    channelRef.current.send({
      type: 'broadcast',
      event: 'status',
      payload: { type: 'STATUS', current, blank, total: slides.length },
    })
  }, [current, blank, loaded, slides.length])

  const slide = slides[current]

  // Scale font so the longest line never wraps — each line stays on one visual line
  const dynamicFontSize = slide?.lines?.length
    ? (() => {
        const maxLen = Math.max(...slide.lines.map(l => l.length), 1)
        const vw = (90 / maxLen).toFixed(2)
        return `clamp(1.5rem, ${vw}vw, 4.5rem)`
      })()
    : '3rem'

  return (
    <div
      className="fixed inset-0 bg-black flex items-center justify-center cursor-none select-none"
      onClick={() => setCurrent(c => Math.min(c + 1, slides.length - 1))}
    >
      {!loaded && (
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      )}

      {loaded && !blank && slide && (
        <div className="w-full max-w-5xl px-16 text-center">
          {/* Slide lines — each on its own visual line, no wrapping */}
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

          {/* Song title watermark */}
          {slide.type === 'song' && slide.itemTitle && (
            <p className="absolute bottom-8 right-10 text-gray-800 text-xs tracking-widest uppercase">
              {slide.itemTitle}
            </p>
          )}
        </div>
      )}

      {/* Blank overlay */}
      {blank && <div className="fixed inset-0 bg-black" />}

      {/* Slide counter (subtle) */}
      {loaded && !blank && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === current ? 'bg-white/40' : 'bg-white/10'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
