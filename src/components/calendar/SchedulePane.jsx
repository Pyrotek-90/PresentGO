import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, UserPlus, X, Mail, Check, Clock, Send, ExternalLink, RotateCw } from 'lucide-react'
import { formatSetTime } from '../../lib/sets'

const STATUS = {
  draft:    { label: 'Not sent',  cls: 'border-border text-muted', Icon: null },
  invited:  { label: 'Waiting',   cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300', Icon: Clock },
  accepted: { label: 'Accepted',  cls: 'border-green-500/40 bg-green-500/10 text-green-400', Icon: Check },
  declined: { label: 'Declined',  cls: 'border-red-500/40 bg-red-500/10 text-red-400', Icon: X },
}
const statusOf = a => STATUS[a.status] ? a.status : 'draft'

const dateLabel = s => s.service_date
  ? new Date(s.service_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  : ''

// One set at a time: who's serving, in which position, and whether they've said yes.
// `set` is the set shown; `onPrev` / `onNext` step through sets by date.
export default function SchedulePane({ set, index, total, onPrev, onNext, positions, members, assignments,
  onAdd, onRemove, onSend, sending, sendResult, onRefresh }) {
  const [memberId, setMemberId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [addError, setAddError] = useState(null)

  const posById = useMemo(() => Object.fromEntries(positions.map(p => [p.id, p])), [positions])
  const memById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])
  const order = useMemo(() => Object.fromEntries(positions.map((p, i) => [p.id, i])), [positions])
  const rows = useMemo(() => assignments
    .filter(a => memById[a.member_id] && posById[a.position_id])
    .sort((a, b) => (order[a.position_id] ?? 999) - (order[b.position_id] ?? 999) || memById[a.member_id].name.localeCompare(memById[b.member_id].name)),
  [assignments, memById, posById, order])

  const member = memById[memberId]
  const theirPositions = member ? positions.filter(p => member.position_ids?.includes(p.id)) : []
  const otherPositions = member ? positions.filter(p => !member.position_ids?.includes(p.id)) : []
  const pickMember = id => {
    setMemberId(id); setAddError(null)
    const m = memById[id]
    const mine = m ? positions.filter(p => m.position_ids?.includes(p.id)) : []
    setPositionId(mine.length === 1 ? mine[0].id : '')
  }
  const add = async () => {
    if (!memberId || !positionId) return
    const err = await onAdd(positionId, memberId)
    if (err) { setAddError(err); return }
    setMemberId(''); setPositionId(''); setAddError(null)
  }

  const counts = rows.reduce((c, a) => { c[statusOf(a)]++; return c }, { draft: 0, invited: 0, accepted: 0, declined: 0 })
  const toSend = rows.filter(a => statusOf(a) === 'draft')
  const noEmail = toSend.filter(a => !memById[a.member_id]?.email)

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-2 border-b border-border">
        <button onClick={onPrev} disabled={!set || index <= 0} className="btn-ghost p-1.5 disabled:opacity-30" aria-label="Previous set"><ChevronLeft size={16} /></button>
        <div className="flex-1 min-w-0 text-center">
          {set ? (
            <>
              <p className="text-[10px] uppercase tracking-widest text-muted">Team Schedule</p>
              <Link to={`/sets/${set.id}`} className="inline-flex items-center gap-1 max-w-full font-semibold hover:text-accent-light" title="Open set">
                <span className="truncate">{set.name}</span><ExternalLink size={12} className="shrink-0 text-muted" />
              </Link>
              <p className="text-xs text-muted">{dateLabel(set)}{set.service_time ? ` · ${formatSetTime(set.service_time)}` : ''}</p>
            </>
          ) : <p className="font-semibold py-2">Team Schedule</p>}
        </div>
        <button onClick={onNext} disabled={!set || index >= total - 1} className="btn-ghost p-1.5 disabled:opacity-30" aria-label="Next set"><ChevronRight size={16} /></button>
      </div>

      {!set ? (
        <p className="px-3 py-6 text-sm text-muted text-center">No dated sets yet. Create a set with a date to schedule your team.</p>
      ) : (
        <div className="p-3 space-y-3">
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
              <span><b className="text-green-400">{counts.accepted}</b> accepted</span>
              <span><b className="text-amber-300">{counts.invited}</b> waiting</span>
              <span><b className="text-red-400">{counts.declined}</b> declined</span>
              {counts.draft > 0 && <span><b className="text-primary">{counts.draft}</b> not sent</span>}
              <button onClick={onRefresh} className="ml-auto flex items-center gap-1 hover:text-primary" title="Check for new replies"><RotateCw size={11} /> Refresh</button>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="text-sm text-muted">No one scheduled yet. Add people below.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {rows.map(a => {
                const m = memById[a.member_id], p = posById[a.position_id], st = STATUS[statusOf(a)]
                return (
                  <li key={a.id} className="flex items-center gap-2 py-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <p className="text-xs text-muted truncate">{p.name}{!m.email && statusOf(a) === 'draft' ? ' · no email' : ''}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2 h-6 rounded-full border text-[11px] font-medium ${st.cls}`}
                      title={a.responded_at ? `Answered ${new Date(a.responded_at).toLocaleString()}` : a.invited_at ? `Sent ${new Date(a.invited_at).toLocaleString()}` : undefined}>
                      {st.Icon && <st.Icon size={11} />}{st.label}
                    </span>
                    {(statusOf(a) === 'invited' || statusOf(a) === 'declined') && m.email && (
                      <button onClick={() => onSend([a.id])} disabled={sending} title="Send the invite again" aria-label={`Resend to ${m.name}`}
                        className="shrink-0 p-1.5 rounded-lg text-muted hover:text-primary hover:bg-[#2e2e2e] disabled:opacity-40"><Send size={13} /></button>
                    )}
                    <button onClick={() => onRemove(a)} title="Remove from this set" aria-label={`Remove ${m.name}`}
                      className="shrink-0 p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-[#2e2e2e]"><X size={14} /></button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="rounded-lg border border-border/70 p-2 space-y-2">
            {members.length === 0 ? (
              <p className="text-xs text-muted">Add people on the <Link to="/team" className="text-accent-light underline">Team</Link> page first.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <select className="input !h-9 !py-0 text-sm flex-1 min-w-[9rem]" value={memberId} onChange={e => pickMember(e.target.value)} aria-label="Person">
                    <option value="">Add a person…</option>
                    {[...members].sort((a, b) => a.name.localeCompare(b.name)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  {member && (
                    <select className="input !h-9 !py-0 text-sm flex-1 min-w-[8rem]" value={positionId} onChange={e => setPositionId(e.target.value)} aria-label="Position">
                      <option value="">Position…</option>
                      {theirPositions.length > 0 && <optgroup label={`${member.name.split(' ')[0]}'s positions`}>{theirPositions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
                      {otherPositions.length > 0 && <optgroup label="Other positions">{otherPositions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
                    </select>
                  )}
                  <button onClick={add} disabled={!memberId || !positionId} className="btn-primary !py-0 h-9 !px-3 text-sm flex items-center gap-1.5 shrink-0">
                    <UserPlus size={14} /> Add
                  </button>
                </div>
                {addError && <p className="text-red-400 text-xs">{addError}</p>}
              </>
            )}
          </div>

          {rows.length > 0 && (
            <div className="space-y-1.5">
              <button onClick={() => onSend(toSend.filter(a => memById[a.member_id]?.email).map(a => a.id))}
                disabled={sending || toSend.length - noEmail.length === 0}
                className="w-full btn-primary h-10 flex items-center justify-center gap-2 text-sm disabled:opacity-40">
                <Mail size={15} />
                {sending ? 'Sending…' : toSend.length - noEmail.length > 0 ? `Email invites (${toSend.length - noEmail.length})` : 'Everyone has been invited'}
              </button>
              {noEmail.length > 0 && <p className="text-[11px] text-muted">{noEmail.length} {noEmail.length === 1 ? 'person has' : 'people have'} no email address. Add one on the Team page to invite them.</p>}
              {sendResult && <p className={`text-xs ${sendResult.ok ? 'text-green-400' : 'text-amber-300'}`}>{sendResult.text}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
