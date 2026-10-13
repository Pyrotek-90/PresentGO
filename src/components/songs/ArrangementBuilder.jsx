import { useEffect, useRef, useState } from 'react'
import { GripVertical, X, Plus, RotateCcw, ListOrdered } from 'lucide-react'

// Step 3 of the song editor: the song order as a vertical list you reorder by dragging
// (mouse, finger or pen), with the section palette in a column on the right.
// Dragging uses pointer events on the grip, so it works the same on iPad, phone and desktop
// while the rest of the row still scrolls the page normally on touch screens.
export default function ArrangementBuilder({ sections, slideCounts, arrangement, onChange, onReset, canReset }) {
  const listRef = useRef(null)
  const dragRef = useRef(null)          // live drag data (positions, scroll, pointer)
  const [drag, setDrag] = useState(null) // { id, from, over, dy } — drives rendering
  const [added, setAdded] = useState(null)

  const rowHeight = () => dragRef.current?.h || 0

  const computeOver = d => {
    const mid = d.mids[d.from] + d.dy
    let over = 0
    d.mids.forEach((m, i) => { if (i !== d.from && m < mid) over++ })
    return over
  }

  const update = () => {
    const d = dragRef.current
    if (!d) return
    d.dy = d.y - d.startY + (d.scroller ? d.scroller.scrollTop - d.startScroll : 0)
    setDrag({ id: d.id, from: d.from, over: computeOver(d), dy: d.dy })
  }

  // Keep scrolling while the finger rests near the top or bottom edge of the editor.
  useEffect(() => {
    if (!drag) return
    let raf
    const tick = () => {
      const d = dragRef.current
      if (!d) return
      if (d.scroller) {
        const r = d.scroller.getBoundingClientRect()
        const edge = 56
        let v = 0
        if (d.y < r.top + edge) v = -Math.ceil((r.top + edge - d.y) / 6)
        else if (d.y > r.bottom - edge) v = Math.ceil((d.y - (r.bottom - edge)) / 6)
        if (v) { d.scroller.scrollTop += v; update() }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [drag?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  const startDrag = (e, entry, index) => {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    const rows = [...listRef.current.querySelectorAll('[data-row]')]
    const rects = rows.map(r => r.getBoundingClientRect())
    const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 0
    dragRef.current = {
      id: entry.id, from: index, startY: e.clientY, y: e.clientY, dy: 0,
      mids: rects.map(r => r.top + r.height / 2),
      h: rects[index].height + gap,
      scroller: listRef.current.closest('.overflow-y-auto'),
      startScroll: listRef.current.closest('.overflow-y-auto')?.scrollTop || 0,
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDrag({ id: entry.id, from: index, over: index, dy: 0 })
  }

  const moveDrag = e => {
    if (!dragRef.current) return
    dragRef.current.y = e.clientY
    update()
  }

  const endDrag = () => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    const over = computeOver(d)
    setDrag(null)
    if (over !== d.from) {
      const n = [...arrangement]
      const [moved] = n.splice(d.from, 1)
      n.splice(over, 0, moved)
      onChange(n)
    }
  }

  const shiftFor = i => {
    if (!drag || i === drag.from) return 0
    const h = rowHeight()
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -h
    if (drag.from > drag.over && i >= drag.over && i < drag.from) return h
    return 0
  }

  const addSection = label => {
    onChange([...arrangement, { id: crypto.randomUUID(), label }])
    setAdded(label)
    setTimeout(() => setAdded(a => (a === label ? null : a)), 900)
  }

  const totalSlides = arrangement.reduce((n, e) => n + (slideCounts[e.label] || 0), 0)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] sm:grid-cols-[minmax(0,1fr)_11rem] gap-3 items-start">
      {/* Song order */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-3 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-2">
              <ListOrdered size={15} className="text-accent-light shrink-0" /> Song Order
            </p>
            {arrangement.length > 0 && (
              <p className="text-[11px] text-muted mt-0.5">{arrangement.length} sections · {totalSlides} slides</p>
            )}
          </div>
          {canReset && (
            <button onClick={onReset} title="Reset to the order in the lyrics"
              className="shrink-0 flex items-center gap-1 text-xs text-muted hover:text-[#f5f5f5] transition-colors py-0.5">
              <RotateCcw size={12} /> Reset
            </button>
          )}
        </div>

        {arrangement.length > 0 ? (
          <ol ref={listRef} className="space-y-1.5 select-none">
            {arrangement.map((entry, i) => {
              const dragging = drag?.id === entry.id
              const y = dragging ? drag.dy : shiftFor(i)
              return (
                <li key={entry.id} data-row
                  style={{ transform: y ? `translateY(${y}px)` : undefined, transition: dragging ? 'none' : 'transform 150ms ease' }}
                  className={`relative flex items-center gap-1 h-11 rounded-lg border bg-surface ${
                    dragging ? 'z-10 border-accent shadow-lg shadow-black/50 bg-[#1f1f1f]' : 'border-border'
                  }`}>
                  <button
                    onPointerDown={e => startDrag(e, entry, i)} onPointerMove={moveDrag}
                    onPointerUp={endDrag} onPointerCancel={endDrag}
                    aria-label={`Drag to move ${entry.label}`} title="Drag to reorder"
                    style={{ touchAction: 'none' }}
                    className={`h-full w-9 shrink-0 flex items-center justify-center text-muted hover:text-[#f5f5f5] ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}>
                    <GripVertical size={16} />
                  </button>
                  <span className="w-5 shrink-0 text-[11px] text-muted tabular-nums">{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate text-sm font-medium">{entry.label}</span>
                  <span className="shrink-0 text-[10px] text-muted mr-1">{slideCounts[entry.label] || 0}</span>
                  <button onClick={() => onChange(arrangement.filter(a => a.id !== entry.id))}
                    aria-label={`Remove ${entry.label}`} title="Remove"
                    className="h-full w-9 shrink-0 flex items-center justify-center text-muted hover:text-red-400">
                    <X size={14} />
                  </button>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="text-xs text-muted italic">Tap a section on the right to add it to the song order.</p>
        )}
      </div>

      {/* Section palette */}
      <div className="rounded-xl border border-border bg-card p-2.5 sm:p-3 space-y-2">
        <div>
          <p className="text-sm font-medium">Sections</p>
          <p className="text-[11px] text-muted leading-tight">Tap to add</p>
        </div>
        <div className="flex flex-col gap-1.5">
          {sections.map(label => (
            <button key={label} onClick={() => addSection(label)}
              className={`w-full flex items-center gap-1 px-2 h-9 rounded-lg border text-sm font-medium text-left transition-colors ${
                added === label ? 'border-green-500/50 bg-green-500/15 text-green-400' : 'border-accent/40 bg-accent/10 text-accent-light hover:bg-accent/20'
              }`}>
              <Plus size={12} className="shrink-0" /> <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
