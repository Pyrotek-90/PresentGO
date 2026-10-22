import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { useChurch } from '../contexts/ChurchContext'
import { TEAM_COLORS, dotStyle } from '../lib/teamColors'

// A team's color dot that opens a row of swatches to change it (saved to this person's account).
export function TeamColorDot({ churchId, name, size = 12 }) {
  const { teamColor, setTeamColor } = useChurch()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const color = teamColor(churchId)
  useEffect(() => {
    if (!open) return
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const key = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key) }
  }, [open])
  return (
    <span className="relative inline-flex" ref={ref}>
      <button type="button" onClick={e => { e.stopPropagation(); setOpen(o => !o) }} aria-haspopup="true" aria-expanded={open}
        aria-label={`Change the color for ${name}`} title={`Change the color for ${name}`}
        className="rounded-full ring-1 ring-white/20 hover:ring-white/60 transition-shadow shrink-0"
        style={{ ...dotStyle(color), width: size, height: size }} />
      {open && (
        <span role="dialog" aria-label={`Colors for ${name}`} onClick={e => e.stopPropagation()}
          className="absolute z-50 left-0 top-full mt-1.5 flex gap-1.5 p-2 rounded-xl bg-card border border-border shadow-xl">
          {TEAM_COLORS.map(c => (
            <button key={c} type="button" onClick={() => { setTeamColor(churchId, c); setOpen(false) }}
              aria-label={`Use this color${c === color ? ' (current)' : ''}`} aria-pressed={c === color}
              className="w-7 h-7 rounded-full flex items-center justify-center ring-1 ring-white/10 hover:ring-white/60" style={dotStyle(c)}>
              {c === color && <Check size={14} className="text-black/70" />}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

// A line of teams with their colors (tap a dot to change it). `ids` limits it to some teams.
export default function TeamColorKey({ ids = null, className = '', label = 'Colors' }) {
  const { legacy, churches } = useChurch()
  const list = churches.filter(c => !ids || ids.includes(c.id))
  if (legacy || list.length === 0) return null
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted ${className}`}>
      {label && <span>{label}:</span>}
      {list.map(c => (
        <span key={c.id} className="inline-flex items-center gap-1.5">
          <TeamColorDot churchId={c.id} name={c.name} />
          <span className="truncate max-w-[12rem]">{c.name}</span>
        </span>
      ))}
    </div>
  )
}
