import { useState } from 'react'
import { Plus, ChevronRight, ChevronDown } from 'lucide-react'
import { groupSets, formatSetWhen, songCount, todayISO } from '../../lib/sets'

const PAST_PREVIEW = 5
const COLLAPSE_KEY = 'presentgo.setsCollapsed'

function SetRow({ set, isTarget, onOpen }) {
  const n = songCount(set)
  return (
    <button onClick={() => onOpen(set.id)}
      className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-lg border text-left transition-colors group ${
        isTarget ? 'border-accent/50 bg-accent/5' : 'border-transparent hover:bg-[#1a1a1a] hover:border-border'
      }`}>
      <span className="flex-1 min-w-0 text-sm font-medium truncate">{set.name}</span>
      <span className="text-xs text-muted shrink-0">{formatSetWhen(set)}</span>
      <span className="text-xs text-muted shrink-0 w-14 text-right">{n} song{n !== 1 ? 's' : ''}</span>
      <ChevronRight size={14} className="text-muted group-hover:text-[#f5f5f5] shrink-0" />
    </button>
  )
}

export default function SetsPane({ sets, loading, targetSetId, onOpen, onCreate }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState(todayISO)
  const [time, setTime] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [showAllPast, setShowAllPast] = useState(false)
  const { upcoming, past } = groupSets(sets)
  const visiblePast = showAllPast ? past : past.slice(0, PAST_PREVIEW)

  const toggle = () => setCollapsed(c => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1') } catch { /* ignore */ }
    return !c
  })

  const submit = async () => {
    if (!name.trim()) return
    setCreating(true); setError(null)
    const err = await onCreate({ name: name.trim(), date, time })
    setCreating(false)
    if (err) setError(err)
  }

  return (
    <section className={`flex flex-col rounded-xl border border-border bg-card overflow-hidden shrink-0 ${collapsed ? '' : 'max-h-[40%]'}`}>
      <div className="flex items-center justify-between gap-3 px-3 py-2 shrink-0">
        <button onClick={toggle} className="flex items-center gap-2 min-w-0 text-left" aria-expanded={!collapsed}>
          <ChevronDown size={16} className={`text-muted transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          <h2 className="font-semibold">Set Lists</h2>
          <span className="text-xs text-muted">{sets.length}</span>
        </button>
        <button onClick={() => { setCollapsed(false); setShowNew(v => !v) }} className="btn-primary flex items-center gap-1.5 !py-1 !px-3 text-sm">
          <Plus size={14} /> New Set
        </button>
      </div>

      {!collapsed && (
        <>
          {showNew && (
            <div className="px-3 pb-2 space-y-2 shrink-0">
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <input className="input flex-1 min-w-[12rem] !h-9" placeholder="Set name, e.g. Sunday Morning Worship" autoFocus
                  value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
                <input type="date" className="input !h-9 !w-auto" value={date} onChange={e => setDate(e.target.value)} aria-label="Service date" />
                <input type="time" className="input !h-9 !w-auto" value={time} onChange={e => setTime(e.target.value)} aria-label="Service time" />
                <button onClick={submit} disabled={creating || !name.trim()} className="btn-primary shrink-0">{creating ? 'Creating…' : 'Create'}</button>
                <button onClick={() => { setShowNew(false); setName(''); setTime(''); setDate(todayISO()); setError(null) }} className="btn-ghost shrink-0">Cancel</button>
              </div>
            </div>
          )}
          <div className="overflow-y-auto px-2 pb-2 border-t border-border pt-1">
            {loading ? (
              <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
            ) : sets.length === 0 ? (
              <p className="text-muted text-sm text-center py-6">No sets yet. Create your first set to get started.</p>
            ) : (
              <>
                {upcoming.length > 0 && (
                  <div>
                    <p className="px-3 pt-1 text-[10px] uppercase tracking-widest text-muted">Upcoming</p>
                    {upcoming.map(s => <SetRow key={s.id} set={s} isTarget={s.id === targetSetId} onOpen={onOpen} />)}
                  </div>
                )}
                {past.length > 0 && (
                  <div>
                    <p className="px-3 pt-1 text-[10px] uppercase tracking-widest text-muted">Past</p>
                    {visiblePast.map(s => <SetRow key={s.id} set={s} isTarget={s.id === targetSetId} onOpen={onOpen} />)}
                    {past.length > PAST_PREVIEW && (
                      <button onClick={() => setShowAllPast(v => !v)}
                        className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-muted hover:text-accent-light transition-colors">
                        <ChevronDown size={12} className={showAllPast ? 'rotate-180' : ''} />
                        {showAllPast ? 'Show fewer' : `Show all ${past.length} past sets`}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}
