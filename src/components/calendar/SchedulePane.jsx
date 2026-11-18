import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, UserPlus, X, Mail, Check, Clock, Send, ExternalLink, RotateCw } from 'lucide-react'
import { formatSetTime } from '../../lib/sets'
import { useUpgrade, locked } from '../../contexts/UpgradeContext'
import { GROUPS, groupOf, rankOf } from '../../lib/teamGroups'
import AssignTeamDialog from '../team/AssignTeamDialog'

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

// Team · Position · Name · Status, like the app's "Team for This Set".
const COLS = 'grid-cols-[4.75rem_5.5rem_minmax(0,1fr)_auto] sm:grid-cols-[6rem_7rem_minmax(0,1fr)_auto]'

// One set at a time: who's serving, in which position, and whether they've said yes.
// `set` is the set shown; `onPrev` / `onNext` step through sets by date. `bare`: no card or
// header (the Set page wraps it in its own card).
export default function SchedulePane({ set, index, total, onPrev, onNext, positions, members, assignments,
  onAdd, onRemove, onSend, sending, sendResult, onRefresh, active = true, multi = false, onSelect, showPrev = true, showNext = true, bare = false }) {
  const { pro, requirePro } = useUpgrade()   // scheduling people is Pro
  const [assigning, setAssigning] = useState(false)

  const posById = useMemo(() => Object.fromEntries(positions.map(p => [p.id, p])), [positions])
  const memById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])
  const order = useMemo(() => Object.fromEntries(positions.map((p, i) => [p.id, i])), [positions])
  const valid = useMemo(() => assignments.filter(a => memById[a.member_id] && posById[a.position_id]), [assignments, memById, posById])
  // Grouped Production, Singers, Musicians; in position order, then name.
  const groups = useMemo(() => GROUPS.map(g => ({
    ...g,
    rows: valid.filter(a => groupOf(posById[a.position_id]) === g.id)
      .sort((a, b) => rankOf(posById[a.position_id]) - rankOf(posById[b.position_id])
        || (order[a.position_id] ?? 999) - (order[b.position_id] ?? 999) || memById[a.member_id].name.localeCompare(memById[b.member_id].name)),
  })).filter(g => g.rows.length), [valid, posById, memById, order])

  const accepted = valid.filter(a => statusOf(a) === 'accepted').length
  const toSend = valid.filter(a => statusOf(a) === 'draft')
  const sendable = toSend.filter(a => memById[a.member_id]?.email)
  const noEmail = toSend.length - sendable.length
  const openAssign = () => { if (requirePro('Scheduling your team')) setAssigning(true) }

  const assignBtn = (
    <button onClick={openAssign} title={pro ? undefined : 'Assign (Pro)'}
      className={`flex items-center gap-1.5 px-3 h-7 rounded-full border border-accent/70 bg-accent/20 text-xs font-semibold text-accent-light hover:bg-accent/30 transition-colors ${locked(pro)}`}>
      <UserPlus size={13} /> Assign
    </button>
  )

  return (
    <section className={bare ? 'min-w-0' : `rounded-xl border bg-card overflow-hidden min-w-0 ${active && multi ? 'border-accent/60 ring-1 ring-accent/30' : 'border-border'}`}>
      {!bare && <div onClick={!active && onSelect ? onSelect : undefined} title={!active && onSelect ? 'Select this set' : undefined}
        className={`flex items-center gap-1 px-2 py-2 border-b border-border ${active && multi ? 'bg-accent/10' : ''} ${!active && onSelect ? 'cursor-pointer hover:bg-[#1a1a1a]' : ''}`}>
        {showPrev
          ? <button onClick={e => { e.stopPropagation(); onPrev() }} disabled={!set || index <= 0} className="btn-ghost p-1.5 disabled:opacity-30 shrink-0" aria-label="Previous set"><ChevronLeft size={16} /></button>
          : <span className="w-7 shrink-0" />}
        <div className="flex-1 min-w-0 text-center">
          {set ? (
            <>
              {!multi && <p className="text-[10px] uppercase tracking-widest text-muted">Team for This Set</p>}
              <Link to={`/sets/${set.id}`} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 max-w-full font-semibold hover:text-accent-light" title="Open set">
                <span className="truncate">{set.name}</span><ExternalLink size={12} className="shrink-0 text-muted" />
              </Link>
              <p className="text-xs text-muted">{dateLabel(set)}{set.service_time ? ` · ${formatSetTime(set.service_time)}` : ''}</p>
            </>
          ) : <p className="font-semibold py-2">Team for This Set</p>}
        </div>
        {showNext
          ? <button onClick={e => { e.stopPropagation(); onNext() }} disabled={!set || index >= total - 1} className="btn-ghost p-1.5 disabled:opacity-30 shrink-0" aria-label="Next set"><ChevronRight size={16} /></button>
          : <span className="w-7 shrink-0" />}
      </div>}

      {!set ? (
        <p className="px-3 py-6 text-sm text-muted text-center">No dated sets yet. Create a set with a date to schedule your team.</p>
      ) : (
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2 min-h-7">
            <p className="text-sm font-semibold truncate">{bare ? 'Team for This Set' : 'Who\'s serving'}
              {valid.length > 0 && <span className="text-xs font-normal text-muted"> · {accepted} of {valid.length} accepted</span>}
            </p>
            <div className="ml-auto flex items-center gap-3 shrink-0">
              {valid.length > 0 && onRefresh && <button onClick={onRefresh} className="flex items-center gap-1 text-[11px] text-muted hover:text-primary" title="Check for new replies"><RotateCw size={11} /> Refresh</button>}
              {assignBtn}
            </div>
          </div>

          {members.length === 0 && pro && (
            <p className="text-xs text-muted">Add people on the <Link to="/team" className="text-accent-light underline">Team</Link> tab first.</p>
          )}

          {valid.length === 0 ? (
            <p className="text-sm text-muted">No one scheduled yet</p>
          ) : (
            <div className="space-y-0.5">
              <div className={`grid ${COLS} gap-x-2 sm:gap-x-3 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted`} aria-hidden="true">
                <span>Team</span><span>Position</span><span>Name</span><span>Status</span>
              </div>
              <ul className="divide-y divide-border/50 border-t border-border/50">
                {groups.map(g => g.rows.map((a, i) => {
                  const m = memById[a.member_id], p = posById[a.position_id], st = STATUS[statusOf(a)]
                  const draft = statusOf(a) === 'draft'
                  return (
                    <li key={a.id} className={`grid ${COLS} items-center gap-x-2 sm:gap-x-3 px-1 py-1.5`}>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-accent-light truncate">{i === 0 ? g.label : ''}</span>
                      <span className="text-sm text-muted truncate">{p.name}</span>
                      <span className="text-sm font-medium truncate min-w-0">{m.name}{!m.email && draft && <span className="text-xs font-normal text-amber-300/80"> · no email</span>}</span>
                      <span className="flex items-center gap-1 justify-end">
                        <span className={`shrink-0 inline-flex items-center gap-1 px-2 h-6 rounded-full border text-[11px] font-medium ${st.cls}`}
                          title={a.responded_at ? `Answered ${new Date(a.responded_at).toLocaleString()}` : a.invited_at ? `Sent ${new Date(a.invited_at).toLocaleString()}` : undefined}>
                          {st.Icon && <st.Icon size={11} />}{st.label}
                        </span>
                        {(statusOf(a) === 'invited' || statusOf(a) === 'declined') && m.email && (
                          <button onClick={() => requirePro('Email invites') && onSend([a.id])} disabled={sending} title={pro ? 'Send the invite again' : 'Resend (Pro)'} aria-label={`Resend to ${m.name}`}
                            className={`shrink-0 p-1.5 rounded-lg text-muted hover:text-primary hover:bg-[#2e2e2e] disabled:opacity-40 ${locked(pro)}`}><Send size={13} /></button>
                        )}
                        <button onClick={() => onRemove(a)} title="Remove from this set" aria-label={`Remove ${m.name}`}
                          className="shrink-0 p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-[#2e2e2e]"><X size={14} /></button>
                      </span>
                    </li>
                  )
                }))}
              </ul>
            </div>
          )}

          {valid.length > 0 && (
            <div className="space-y-1.5">
              <button onClick={() => requirePro('Email invites') && onSend(sendable.map(a => a.id))}
                disabled={sending || (pro && sendable.length === 0)}
                className={`w-full btn-primary h-10 flex items-center justify-center gap-2 text-sm disabled:opacity-40 ${locked(pro)}`}>
                <Mail size={15} />
                {sending ? 'Sending…' : sendable.length > 0 ? `Send Requests (${sendable.length})` : 'Everyone has been asked'}
              </button>
              {noEmail > 0 && <p className="text-[11px] text-muted">{noEmail} {noEmail === 1 ? 'person has' : 'people have'} no email address. Add one on the Team tab to invite them.</p>}
            </div>
          )}
          {sendResult && <p className={`text-xs ${sendResult.ok ? 'text-green-400' : 'text-amber-300'}`}>{sendResult.text}</p>}
        </div>
      )}

      {assigning && set && (
        <AssignTeamDialog set={set} members={members} positions={positions} assignments={assignments}
          onAdd={onAdd} onRemove={onRemove} onClose={() => setAssigning(false)} />
      )}
    </section>
  )
}
