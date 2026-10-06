import { useState } from 'react'
import { Plus, Calendar, ChevronRight, Music, Layers, ChevronDown } from 'lucide-react'
import { groupSets, formatSetDate } from '../../lib/sets'

const PAST_PREVIEW = 5

function SetRow({ set, isNext, isTarget, onOpen }) {
  const count = set.set_items?.[0]?.count || 0
  return (
    <button onClick={() => onOpen(set.id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors group ${
        isTarget ? 'border-accent/50 bg-accent/5' : 'border-transparent hover:bg-[#1a1a1a] hover:border-border'
      }`}>
      <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
        <Calendar size={16} className="text-accent-light" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{set.name}</p>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted">
          {set.service_date && <span>{formatSetDate(set.service_date)}</span>}
          {count > 0 && <span className="flex items-center gap-1"><Music size={10} />{count} item{count !== 1 ? 's' : ''}</span>}
          {isNext && <span className="text-accent-light font-medium">Next up</span>}
        </div>
      </div>
      <ChevronRight size={15} className="text-muted group-hover:text-[#f5f5f5] shrink-0" />
    </button>
  )
}

export default function SetsPane({ sets, loading, targetSetId, onOpen, onCreate }) {
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [showAllPast, setShowAllPast] = useState(false)
  const { upcoming, past } = groupSets(sets)
  const visiblePast = showAllPast ? past : past.slice(0, PAST_PREVIEW)

  const submit = async () => {
    if (!name.trim()) return
    setCreating(true); setError(null)
    const err = await onCreate(name.trim())
    setCreating(false)
    if (err) setError(err)
  }

  return (
    <section className="flex flex-col min-h-0 h-full rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
        <div>
          <h2 className="font-semibold">Set Lists</h2>
          <p className="text-xs text-muted">{sets.length} set{sets.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowNew(v => !v)} className="btn-primary flex items-center gap-1.5 !py-1.5 !px-3 text-sm">
          <Plus size={14} /> New Set
        </button>
      </div>

      {showNew && (
        <div className="px-4 py-3 border-b border-border space-y-2 shrink-0">
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="e.g. Sunday Morning — March 23" autoFocus
              value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
            <button onClick={submit} disabled={creating} className="btn-primary shrink-0">{creating ? 'Creating…' : 'Create'}</button>
            <button onClick={() => { setShowNew(false); setName(''); setError(null) }} className="btn-ghost shrink-0">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : sets.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <Layers size={36} className="text-muted mx-auto" />
            <p className="text-muted text-sm">No sets yet. Create your first set to get started.</p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div className="space-y-0.5">
                <p className="px-3 text-[10px] uppercase tracking-widest text-muted">Upcoming</p>
                {upcoming.map((s, i) => <SetRow key={s.id} set={s} isNext={i === 0} isTarget={s.id === targetSetId} onOpen={onOpen} />)}
              </div>
            )}
            {past.length > 0 && (
              <div className="space-y-0.5">
                <p className="px-3 text-[10px] uppercase tracking-widest text-muted">Past</p>
                {visiblePast.map(s => <SetRow key={s.id} set={s} isTarget={s.id === targetSetId} onOpen={onOpen} />)}
                {past.length > PAST_PREVIEW && (
                  <button onClick={() => setShowAllPast(v => !v)}
                    className="w-full flex items-center justify-center gap-1 py-2 text-xs text-muted hover:text-accent-light transition-colors">
                    <ChevronDown size={12} className={showAllPast ? 'rotate-180' : ''} />
                    {showAllPast ? 'Show fewer' : `Show all ${past.length} past sets`}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
