import { useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, List, NotebookPen } from 'lucide-react'

// A Worship Leader Note shown in the Song Viewer, just before its song.
// Same layout as the Sunday Song Prep reflection page: title, artist, Summary, Reflection, Scripture.
export default function NoteViewer({ note, onClose, setNav }) {
  const [showList, setShowList] = useState(false)
  const touch = useRef(null)

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); setNav?.onNext() }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); setNav?.onPrev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, setNav])

  const onTouchStart = e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
  const onTouchEnd = e => {
    if (!touch.current) return
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? setNav?.onNext() : setNav?.onPrev())
    touch.current = null
  }

  const Heading = ({ children }) => <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: 'rgb(200,170,100)' }}>{children}</h3>

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-[#f5f5f5]"
      style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <header className="shrink-0 border-b border-border bg-surface px-3 py-2 flex items-center gap-2">
        <NotebookPen size={16} className="shrink-0" style={{ color: 'rgb(200,170,100)' }} />
        <div className="flex-1 min-w-0">
          <p className="truncate font-semibold leading-tight">Worship Leader Note</p>
          <p className="truncate text-xs text-muted">{note.song_title}</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg text-muted hover:text-[#f5f5f5] hover:bg-card" aria-label="Close"><X size={20} /></button>
      </header>

      <div className="flex-1 overflow-y-auto" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <article className="max-w-2xl mx-auto px-5 sm:px-8 py-6 sm:py-10 space-y-7">
          <div>
            <h2 className="text-2xl sm:text-4xl font-bold leading-tight">{note.song_title}</h2>
            {note.song_artist && <p className="mt-1 text-base sm:text-lg text-gray-400">{note.song_artist}</p>}
          </div>
          {note.summary && (
            <section className="space-y-2">
              <Heading>Summary</Heading>
              <p className="text-base sm:text-xl leading-relaxed text-gray-200 whitespace-pre-line">{note.summary}</p>
            </section>
          )}
          {note.reflection && (
            <section className="space-y-2">
              <Heading>Reflection</Heading>
              <p className="text-base sm:text-xl leading-relaxed text-gray-200 whitespace-pre-line">{note.reflection}</p>
            </section>
          )}
          {note.verses?.length > 0 && (
            <section className="space-y-3">
              <Heading>Scripture</Heading>
              {note.verses.map((v, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-sm sm:text-lg font-bold" style={{ color: 'rgb(170,200,230)' }}>{v.reference}</p>
                  <p className="pl-4 text-base sm:text-xl italic font-serif leading-relaxed text-gray-300">“{v.text}”</p>
                </div>
              ))}
              <p className="text-[11px] text-muted pt-1">Scripture: King James Version.</p>
            </section>
          )}
        </article>
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
      {setNav && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-1.5 border-t border-border bg-surface text-xs text-muted">
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={setNav.onPrev} disabled={setNav.index === 0} aria-label="Previous"
              className="p-1 rounded hover:bg-card disabled:opacity-25"><ChevronLeft size={14} /></button>
            <button onClick={() => setShowList(v => !v)} aria-label="Jump to a song" aria-expanded={showList}
              className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-card text-[#f5f5f5] font-semibold whitespace-nowrap">
              <List size={12} className="text-accent-light" /> {setNav.index + 1} of {setNav.total}
            </button>
            <button onClick={setNav.onNext} disabled={setNav.index === setNav.total - 1} aria-label="Next"
              className="p-1 rounded hover:bg-card disabled:opacity-25"><ChevronRight size={14} /></button>
          </div>
          <span className="truncate">Next: {setNav.titles[setNav.index + 1] || '—'}</span>
        </div>
      )}
    </div>
  )
}
