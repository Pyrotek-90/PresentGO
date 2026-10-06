import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { CATEGORIES } from './PositionsPanel'

const posLabel = p => `${p.name}${p.level ? ` (${p.level})` : ''}`

export default function SetTeam({ assignments, positions, members, onAdd, onRemove }) {
  const [positionId, setPositionId] = useState('')
  const [memberId, setMemberId] = useState('')

  const byId = (list, id) => list.find(x => x.id === id)
  const qualified = members.filter(m => m.position_ids?.includes(positionId))
  const others = members.filter(m => !m.position_ids?.includes(positionId))

  const submit = async () => {
    if (!positionId || !memberId) return
    await onAdd(positionId, memberId)
    setMemberId('')
  }

  return (
    <div className="pl-2 pb-2 space-y-1.5">
      {assignments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {assignments.map(a => {
            const pos = byId(positions, a.position_id)
            const mem = byId(members, a.member_id)
            if (!pos || !mem) return null
            return (
              <span key={a.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-xs text-accent-light">
                <span className="text-muted">{posLabel(pos)}:</span> {mem.name}
                <button onClick={() => onRemove(a)} className="hover:text-red-400" aria-label="Remove assignment"><X size={10} /></button>
              </span>
            )
          })}
        </div>
      )}
      {positions.length === 0 || members.length === 0 ? (
        <p className="text-[11px] text-muted">
          {positions.length === 0 ? 'Add positions first (right).' : 'Add team members on the Team page to assign them.'}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <select className="input !h-7 !py-0 !px-2 text-xs !w-auto max-w-[11rem]" value={positionId}
            onChange={e => { setPositionId(e.target.value); setMemberId('') }}>
            <option value="">Position…</option>
            {CATEGORIES.map(cat => {
              const items = positions.filter(p => p.category === cat)
              return items.length ? <optgroup key={cat} label={cat}>{items.map(p => <option key={p.id} value={p.id}>{posLabel(p)}</option>)}</optgroup> : null
            })}
          </select>
          <select className="input !h-7 !py-0 !px-2 text-xs !w-auto max-w-[11rem]" value={memberId} disabled={!positionId}
            onChange={e => setMemberId(e.target.value)}>
            <option value="">Team member…</option>
            {qualified.length > 0 && <optgroup label="Can fill this position">{qualified.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>}
            {others.length > 0 && <optgroup label="Other members">{others.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>}
          </select>
          <button onClick={submit} disabled={!positionId || !memberId}
            className="h-7 px-2.5 rounded-lg border border-accent/50 bg-accent/10 text-xs font-medium text-accent-light hover:bg-accent/20 disabled:opacity-30 flex items-center gap-1">
            <Plus size={11} /> Assign
          </button>
        </div>
      )}
    </div>
  )
}
