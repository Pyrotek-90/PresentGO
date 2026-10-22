import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, UserPlus, X, Mail, Check, Clock, Send, ExternalLink, RotateCw } from 'lucide-react'
import { formatSetTime } from '../../lib/sets'
import { useUpgrade, locked } from '../../contexts/UpgradeContext'

const STATUS = {
  draft:    { label: 'Not sent',  cls: 'border-border text-muted', Icon: null },
  invited:  { label: 'Waiting',   cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300', Icon: Clock },
  accepted: { label: 'Accepted',  cls: 'border-green-500/40 bg-green-500/10 text-green-400', Icon: Check },
  declined: { label: 'Declined',  cls: 'border-red-500/40 bg-red-500/10 text-red-400', Icon: X },
}
const statusOf = a => STATUS[a.status] ? a.status : 'draft'

// Team sections, in the order the schedule shows them. Positions are placed by name first,
// then by their category; anything else (custom positions) goes under Other.
const SECTIONS = [
  { id: 'production', label: 'Production', names: ['Presenter', 'Audio'], categories: ['Presenter', 'Audio'] },
  { id: 'singers', label: 'Singers', names: ['Singer'], categories: ['Singers'] },
  { id: 'musicians', label: 'Musicians', names: ['Keys', 'Acoustic', 'Electric', 'Bass', 'Drums'], categories: ['Band Musicians'] },
  { id: 'other', label: 'Other', names: [], categories: [] },
]
const lc = s => (s || '').toLowerCase()
const sectionOf = p => (SECTIONS.find(sec => sec.names.some(n => lc(n) === lc(p.name)))
  || SECTIONS.find(sec => sec.categories.includes(p.category)) || SECTIONS[3]).id
const rankInSection = p => {
  const sec = SECTIONS.find(x => x.id === sectionOf(p))
  const i = sec.names.findIndex(n => lc(n) === lc(p.name))
  return i < 0 ? 100 : i
}

const dateLabel = s => s.service_date
  ? new Date(s.service_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  : ''

// One set at a time: who's serving, in which position, and whether they've said yes.
// `set` is the set shown; `onPrev` / `onNext` step through sets by date.
export default function SchedulePane({ set, index, total, onPrev, onNext, positions, members, assignments,
  onAdd, onRemove, onSend, sending, sendResult, onRefresh, active = true, multi = false, onSelect, showPrev = true, showNext = true }) {
  const { pro, requirePro } = useUpgrade()   // scheduling people is Pro
  const [memberId, setMemberId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [addError, setAddError] = useState(null)
  const [addSection, setAddSection] = useState(null)   // section whose "+ Add" is open

  const posById = useMemo(() => Object.fromEntries(positions.map(p => [p.id, p])), [positions])
  const memById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])
  const order = useMemo(() => Object.fromEntries(positions.map((p, i) => [p.id, i])), [positions])
  const rows = useMemo(() => assignments
    .filter(a => memById[a.member_id] && posById[a.position_id])
    .sort((a, b) => rankInSection(posById[a.position_id]) - rankInSection(posById[b.position_id])
      || (order[a.position_id] ?? 999) - (order[b.position_id] ?? 999) || memById[a.member_id].name.localeCompare(memById[b.member_id].name)),
  [assignments, memById, posById, order])
  const sectionPositions = useMemo(() => Object.fromEntries(SECTIONS.map(sec => [sec.id,
    positions.filter(p => sectionOf(p) === sec.id).sort((a, b) => rankInSection(a) - rankInSection(b) || (order[a.id] ?? 0) - (order[b.id] ?? 0))])), [positions, order])
  const visibleSections = SECTIONS.filter(sec => sec.id !== 'other' || sectionPositions.other.length || rows.some(a => sectionOf(posById[a.position_id]) === 'other'))

  const member = memById[memberId]
  const pool = addSection ? sectionPositions[addSection] : []
  const theirPositions = member ? pool.filter(p => member.position_ids?.includes(p.id)) : []
  const otherPositions = member ? pool.filter(p => !member.position_ids?.includes(p.id)) : []
  // People who can fill a position in this section are listed first.
  const qualified = addSection ? members.filter(m => pool.some(p => m.position_ids?.includes(p.id))) : []
  const others = addSection ? members.filter(m => !qualified.includes(m)) : []
  const byName = (a, b) => a.name.localeCompare(b.name)
  const openAdd = id => { setAddSection(cur => (cur === id ? null : id)); setMemberId(''); setPositionId(''); setAddError(null) }
  const pickMember = id => {
    setMemberId(id); setAddError(null)
    const m = memById[id]
    const mine = m ? pool.filter(p => m.position_ids?.includes(p.id)) : []
    setPositionId(mine.length === 1 ? mine[0].id : pool.length === 1 ? pool[0].id : '')
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
    <section className={`rounded-xl border bg-card overflow-hidden min-w-0 ${active && multi ? 'border-accent/60 ring-1 ring-accent/30' : 'border-border'}`}>
      <div onClick={!active && onSelect ? onSelect : undefined} title={!active && onSelect ? 'Select this set' : undefined}
        className={`flex items-center gap-1 px-2 py-2 border-b border-border ${active && multi ? 'bg-accent/10' : ''} ${!active && onSelect ? 'cursor-pointer hover:bg-[#1a1a1a]' : ''}`}>
        {showPrev
          ? <button onClick={e => { e.stopPropagation(); onPrev() }} disabled={!set || index <= 0} className="btn-ghost p-1.5 disabled:opacity-30 shrink-0" aria-label="Previous set"><ChevronLeft size={16} /></button>
          : <span className="w-7 shrink-0" />}
        <div className="flex-1 min-w-0 text-center">
          {set ? (
            <>
              {!multi && <p className="text-[10px] uppercase tracking-widest text-muted">Who's Serving</p>}
              <Link to={`/sets/${set.id}`} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 max-w-full font-semibold hover:text-accent-light" title="Open set">
                <span className="truncate">{set.name}</span><ExternalLink size={12} className="shrink-0 text-muted" />
              </Link>
              <p className="text-xs text-muted">{dateLabel(set)}{set.service_time ? ` · ${formatSetTime(set.service_time)}` : ''}</p>
            </>
          ) : <p className="font-semibold py-2">Who's Serving</p>}
        </div>
        {showNext
          ? <button onClick={e => { e.stopPropagation(); onNext() }} disabled={!set || index >= total - 1} className="btn-ghost p-1.5 disabled:opacity-30 shrink-0" aria-label="Next set"><ChevronRight size={16} /></button>
          : <span className="w-7 shrink-0" />}
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

          {members.length === 0 && pro && (
            <p className="text-xs text-muted">Add people on the <Link to="/team" className="text-accent-light underline">Team</Link> page first.</p>
          )}

          {visibleSections.map(sec => {
            const secRows = rows.filter(a => sectionOf(posById[a.position_id]) === sec.id)
            const open = addSection === sec.id
            return (
              <div key={sec.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted">{sec.label}</h3>
                  <span className="text-[11px] text-muted">{secRows.length || ''}</span>
                  <div className="flex-1 border-t border-border/60" />
                  {(members.length > 0 || !pro) && sectionPositions[sec.id].length > 0 && (
                    <button onClick={() => requirePro('Scheduling your team') && openAdd(sec.id)} title={pro ? undefined : 'Add (Pro)'}
                      className={`flex items-center gap-1 px-2 h-6 rounded-full border text-[11px] font-medium transition-colors ${open ? 'border-accent bg-accent/20 text-accent-light' : 'border-dashed border-accent/50 text-accent-light hover:bg-accent/10'} ${locked(pro)}`}>
                      {open ? <X size={11} /> : <UserPlus size={11} />} {open ? 'Close' : 'Add'}
                    </button>
                  )}
                </div>

                {secRows.length === 0 && !open && <p className="text-xs text-muted/70 pl-0.5">No one yet</p>}
                {secRows.length > 0 && (
                  <ul className="divide-y divide-border/50">
                    {secRows.map(a => {
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
                            <button onClick={() => requirePro('Email invites') && onSend([a.id])} disabled={sending} title={pro ? 'Send the invite again' : 'Resend (Pro)'} aria-label={`Resend to ${m.name}`}
                              className={`shrink-0 p-1.5 rounded-lg text-muted hover:text-primary hover:bg-[#2e2e2e] disabled:opacity-40 ${locked(pro)}`}><Send size={13} /></button>
                          )}
                          <button onClick={() => onRemove(a)} title="Remove from this set" aria-label={`Remove ${m.name}`}
                            className="shrink-0 p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-[#2e2e2e]"><X size={14} /></button>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {open && (
                  <div className="rounded-lg border border-accent/40 bg-accent/5 p-2 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <select autoFocus className="input !h-9 !py-0 text-sm flex-1 min-w-[9rem]" value={memberId} onChange={e => pickMember(e.target.value)} aria-label="Person">
                        <option value="">Choose a person…</option>
                        {qualified.length > 0 && <optgroup label={`${sec.label}`}>{[...qualified].sort(byName).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>}
                        {others.length > 0 && <optgroup label="Everyone else">{[...others].sort(byName).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>}
                      </select>
                      {member && pool.length > 1 && (
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
                  </div>
                )}
              </div>
            )
          })}

          {rows.length > 0 && (
            <div className="space-y-1.5">
              <button onClick={() => requirePro('Email invites') && onSend(toSend.filter(a => memById[a.member_id]?.email).map(a => a.id))}
                disabled={sending || (pro && toSend.length - noEmail.length === 0)}
                className={`w-full btn-primary h-10 flex items-center justify-center gap-2 text-sm disabled:opacity-40 ${locked(pro)}`}>
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
