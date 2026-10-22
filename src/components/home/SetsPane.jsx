import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ChevronRight, ChevronDown, CalendarDays, Repeat } from 'lucide-react'
import { groupSets, formatSetWhen, songCount } from '../../lib/sets'
import { useChurch } from '../../contexts/ChurchContext'
import TeamColorKey from '../TeamColorKey'
import { dotStyle } from '../../lib/teamColors'

// Home shows a short list so the Song Library gets the room; the Schedule page has every set.
const UPCOMING_SHOWN = 4   // phones show 3
const PAST_SHOWN = 2
const COLLAPSE_KEY = 'presentgo.setsCollapsed'

// Sets from teams I serve on show in that team's color, with my position; a request waiting
// for my answer says so.
function SetRow({ set, isTarget, onOpen, className = '' }) {
  const { teamColor, churches } = useChurch()
  const n = songCount(set)
  const sv = set.serving
  const color = sv ? teamColor(sv.churchId) : null
  const team = sv ? churches.find(c => c.id === sv.churchId)?.name : ''
  return (
    <button onClick={() => onOpen(set.id, set)} title={sv ? `${team}${sv.positions.length ? ` · ${sv.positions.join(', ')}` : ''}` : undefined}
      className={`${className} w-full flex items-center gap-3 px-3 py-1.5 rounded-lg border text-left transition-colors group ${
        isTarget ? 'border-accent/50 bg-accent/5' : 'border-transparent hover:bg-[#1a1a1a] hover:border-border'
      }`}>
      {sv && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={dotStyle(color)} aria-hidden="true" />}
      <span className="flex-1 min-w-0 text-sm font-medium truncate" style={sv ? { color } : undefined}>
        {set.name}
        {sv?.positions.length > 0 && <span className="text-xs font-normal text-muted"> · {sv.positions.join(', ')}</span>}
      </span>
      {sv?.status === 'invited' && <span className="shrink-0 px-1.5 rounded border border-amber-500/40 text-[10px] text-amber-300 leading-4">Reply</span>}
      {set.series_id && set.recurrence && <Repeat size={11} className="text-muted shrink-0" aria-label="Repeating" />}
      <span className="text-xs text-muted shrink-0">{formatSetWhen(set)}</span>
      <span className="text-xs text-muted shrink-0 w-14 text-right">{n} song{n !== 1 ? 's' : ''}</span>
      <ChevronRight size={14} className="text-muted group-hover:text-[#f5f5f5] shrink-0" />
    </button>
  )
}

// readOnly: musicians and singers (Members) — their accepted sets, no New Set.
export default function SetsPane({ sets, loading, targetSetId, onOpen, onCreate, readOnly = false }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const { upcoming, past } = groupSets(sets)
  const shownUpcoming = upcoming.slice(0, UPCOMING_SHOWN)
  const shownPast = past.slice(0, PAST_SHOWN)
  const more = upcoming.length > 3 || past.length > PAST_SHOWN

  const toggle = () => setCollapsed(c => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1') } catch { /* ignore */ }
    return !c
  })

  const createNew = async () => {
    if (creating) return
    setCreating(true); setError(null)
    const err = await onCreate()
    setCreating(false)
    if (err) { setCollapsed(false); setError(err) }
  }

  return (
    <section className="flex flex-col rounded-xl border border-border bg-card overflow-hidden shrink-0">
      <div className="flex items-center justify-between gap-3 px-3 py-2 shrink-0">
        <button onClick={toggle} className="flex items-center gap-2 min-w-0 text-left" aria-expanded={!collapsed}>
          <ChevronDown size={16} className={`text-muted transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          <h2 className="font-semibold">{readOnly ? 'My Sets' : 'Set Lists'}</h2>
          <span className="text-xs text-muted">{sets.length}</span>
        </button>
        {!readOnly && (
          <button onClick={createNew} disabled={creating} className="btn-primary flex items-center gap-1.5 !py-1 !px-3 text-sm">
            <Plus size={14} /> {creating ? 'Creating…' : 'New Set'}
          </button>
        )}
      </div>

      {!collapsed && (
        <>
          {error && <p className="px-3 pb-2 text-red-400 text-xs shrink-0">{error}</p>}
          <div className="px-2 pb-1.5 border-t border-border pt-1">
            {loading ? (
              <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
            ) : sets.length === 0 ? (
              <p className="text-muted text-sm text-center py-6 px-4">{readOnly ? "No sets yet. When you accept a request to serve, the set and its charts show up here." : 'No sets yet. Create your first set to get started.'}</p>
            ) : (
              <>
                {upcoming.length > 0 && (
                  <div>
                    <p className="px-3 pt-1 text-[10px] uppercase tracking-widest text-muted">Upcoming</p>
                    {shownUpcoming.map((s, i) => (
                      <SetRow key={s.id} set={s} isTarget={s.id === targetSetId} onOpen={onOpen} className={i >= 3 ? 'hidden sm:flex' : ''} />
                    ))}
                  </div>
                )}
                {past.length > 0 && (
                  <div>
                    <p className="px-3 pt-1 text-[10px] uppercase tracking-widest text-muted">Past</p>
                    {shownPast.map(s => <SetRow key={s.id} set={s} isTarget={s.id === targetSetId} onOpen={onOpen} />)}
                  </div>
                )}
                {(() => {
                  const ids = [...new Set(sets.filter(s => s.serving).map(s => s.serving.churchId))]
                  return ids.length > 0 && <TeamColorKey ids={ids} label="Teams you serve on" className="px-3 pt-1.5" />
                })()}
                {more && (
                  <Link to="/schedule"
                    className="w-full flex items-center justify-center gap-1.5 pt-1.5 pb-0.5 text-xs text-muted hover:text-accent-light transition-colors">
                    <CalendarDays size={12} /> See all {sets.length} sets in Schedule
                  </Link>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}
