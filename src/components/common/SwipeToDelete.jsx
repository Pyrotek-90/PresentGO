import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'

const REVEAL = 80   // px the row slides to show the delete button

// Phone gesture: swipe a row left to reveal a red Delete button behind it, tap it to delete.
// `open` / `onOpenChange` let the parent keep one row open at a time.
export default function SwipeToDelete({ open, onOpenChange, onDelete, label = 'Delete', className = '', children }) {
  const [dx, setDx] = useState(null)
  const touch = useRef(null)

  const onTouchStart = e => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: open ? -REVEAL : 0, swiping: false }
  }
  const onTouchMove = e => {
    const t = touch.current
    if (!t) return
    const mx = e.touches[0].clientX - t.x
    const my = e.touches[0].clientY - t.y
    if (!t.swiping) {
      if (Math.abs(mx) < 8 || Math.abs(mx) < Math.abs(my)) return
      t.swiping = true
    }
    setDx(Math.max(-REVEAL, Math.min(0, t.base + mx)))
  }
  const onTouchEnd = () => {
    const t = touch.current
    touch.current = null
    if (!t?.swiping) return
    onOpenChange(dx !== null && dx < -REVEAL / 2)
    setDx(null)
  }
  const offset = dx !== null ? dx : open ? -REVEAL : 0

  return (
    <li data-swiped-row={open ? '' : undefined} className="relative overflow-hidden rounded-lg">
      <button type="button" onClick={onDelete} tabIndex={open ? 0 : -1} aria-hidden={!open} aria-label={label}
        className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-0.5 bg-red-600 text-white text-[10px] font-medium"
        style={{ width: REVEAL }}>
        <Trash2 size={18} /> Delete
      </button>
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onClickCapture={e => { if (open) { e.preventDefault(); e.stopPropagation(); onOpenChange(false) } }}
        style={{ transform: `translateX(${offset}px)`, transition: dx !== null ? 'none' : 'transform 0.2s ease', touchAction: 'pan-y' }}
        className={`relative bg-card ${className}`}>
        {children}
      </div>
    </li>
  )
}
