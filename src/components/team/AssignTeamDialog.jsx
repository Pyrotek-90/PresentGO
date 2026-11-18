import { useMemo, useState } from 'react'
import { Check, Plus, Search, X } from 'lucide-react'
import { posLabel } from '../../lib/positions'
import { GROUPS, groupOf, sortByGroup, STATUS_DOT } from '../../lib/teamGroups'

// Assign: the whole team in one list, each person with their positions as chips. Click a chip to
// put them on the set in that position (click again to take them off); + gives any other
// position. Changes save as you click.
export default function AssignTeamDialog({ set, members, positions, assignments, onAdd, onRemove, onClose }) {
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState(null)   // null = everyone
  const [busy, setBusy] = useState(() => new Set())
  const [error, setError] = useState(null)
  const [plusFor, setPlusFor] = useState(null)   // member whose "+" menu is open

  const sorted = useMemo(() => sortByGroup(positions), [positions])
  const inGroup = p => !group || groupOf(p) === group
  const theirs = m => sorted.filter(p => m.position_ids?.includes(p.id))
  const assignmentOf = (m, p) => assignments.find(a => a.member_id === m.id && a.position_id === p.id)
  const isOn = m => assignments.some(a => a.member_id === m.id)

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...members]
      .filter(m => !q || m.name.toLowerCase().includes(q))
      .filter(m => !group || theirs(m).some(inGroup) || isOn(m))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [members, search, group, assignments, sorted])   // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (m, p) => {
    const key = `${m.id}-${p.id}`
    setBusy(b => new Set(b).add(key)); setError(null)
    const a = assignmentOf(m, p)
    try {
      if (a) await onRemove(a)
      else { const err = await onAdd(p.id, m.id); if (err) setError(err) }
    } finally { setBusy(b => { const n = new Set(b); n.delete(key); return n }) }
  }

  const Chip = ({ m, p }) => {
    const a = assignmentOf(m, p), on = !!a, key = `${m.id}-${p.id}`
    return (
      <button onClick={() => toggle(m, p)} disabled={busy.has(key)} aria-pressed={on}
        className={`flex items-center gap-1 px-2.5 h-7 rounded-full border text-xs font-medium transition-colors disabled:opacity-60 ${
          on ? 'border-accent bg-accent/25 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5] hover:border-accent/40'}`}>
        {on && <Check size={12} />}{posLabel(p)}
        {a && a.status && a.status !== 'draft' && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[a.status] || ''}`} />}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-black/75" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg max-h-[calc(100dvh-1.5rem)] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Assign Team</p>
            <p className="text-xs text-muted truncate">{set?.name}</p>
          </div>
          <button onClick={onClose} className="btn-primary !py-1.5 !px-4 text-sm">Done</button>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="px-4 pt-3 space-y-2">
          <div className="flex rounded-lg border border-border overflow-hidden" role="group" aria-label="Show">
            {[{ id: null, label: 'Everyone' }, ...GROUPS].map(g => (
              <button key={g.id || 'all'} onClick={() => setGroup(g.id)} aria-pressed={group === g.id}
                className={`flex-1 h-8 text-xs font-medium transition-colors ${group === g.id ? 'bg-accent/25 text-accent-light' : 'text-muted hover:text-primary'}`}>{g.label}</button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !pl-9 !h-9 text-sm" placeholder="Find a person" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <ul className="overflow-y-auto px-2 py-2 mt-2 divide-y divide-border/50 border-t border-border">
          {members.length === 0 && <li className="text-sm text-muted text-center py-8 px-4">No one on the team yet. Add people on the Team tab first.</li>}
          {members.length > 0 && list.length === 0 && <li className="text-sm text-muted text-center py-8">No one matches.</li>}
          {list.map(m => {
            const mine = theirs(m).filter(inGroup)
            const extra = sorted.filter(p => assignmentOf(m, p) && !mine.includes(p))
            const others = sorted.filter(p => inGroup(p) && !mine.includes(p) && !extra.includes(p))
            return (
              <li key={m.id} className="px-2 py-2.5 space-y-1.5">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  {m.name}{isOn(m) && <Check size={14} className="text-accent-light" aria-label="On this set" />}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[...mine, ...extra].map(p => <Chip key={p.id} m={m} p={p} />)}
                  {others.length > 0 && (
                    <span className="relative">
                      <button onClick={() => setPlusFor(plusFor === m.id ? null : m.id)} aria-label={`Another position for ${m.name}`} aria-expanded={plusFor === m.id}
                        className="w-[30px] h-7 rounded-full border border-dashed border-accent/60 text-accent-light flex items-center justify-center hover:bg-accent/10"><Plus size={13} /></button>
                      {plusFor === m.id && (
                        <div className="absolute left-0 top-full mt-1 z-10 w-44 max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-xl shadow-black/50 py-1">
                          {others.map(p => (
                            <button key={p.id} onClick={() => { setPlusFor(null); toggle(m, p) }}
                              className="w-full text-left px-3 h-8 text-sm hover:bg-[#232323]">{posLabel(p)}</button>
                          ))}
                        </div>
                      )}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        <p className="px-4 py-2.5 border-t border-border text-[11px] text-muted">Click a position to put someone on this set; click it again to take them off. Use + for a position they don't usually fill.</p>
      </div>
    </div>
  )
}
