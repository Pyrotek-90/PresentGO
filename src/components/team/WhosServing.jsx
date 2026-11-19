import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Maximize2, Minimize2, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useChurch } from '../../contexts/ChurchContext'
import { useScheduling } from '../../lib/useScheduling'
import { useUpgrade, locked } from '../../contexts/UpgradeContext'
import SchedulePane from '../calendar/SchedulePane'
import AssignTeamDialog from './AssignTeamDialog'
import { GROUPS, groupOf, rankOf, STATUS_DOT as DOT } from '../../lib/teamGroups'
import { todayISO, formatSetTime } from '../../lib/sets'

const DRAG_TYPE = 'application/x-stafflist-assignment'
const OPEN_KEY = 'stafflist.whosServingOpen'
const LEGEND = [['accepted', 'Accepted'], ['invited', 'Waiting'], ['declined', 'Declined'], ['draft', 'Not sent']]

const whenLabel = s => [
  s.service_date && new Date(s.service_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
  s.service_time && formatSetTime(s.service_time),
].filter(Boolean).join(' · ')

// Team tab: who's serving across sets at a glance (one column per set: the last one, then the
// upcoming ones, with its songs and the people in each position). Pick a set to edit its team
// and send invites below the matrix.
export default function WhosServing({ members, setMembers, positions }) {
  const { user } = useAuth()
  const { scope } = useChurch()
  const navigate = useNavigate()
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(OPEN_KEY) !== '0' } catch { return true } })
  const toggle = () => setOpen(o => { try { localStorage.setItem(OPEN_KEY, o ? '0' : '1') } catch { /* ignore */ } return !o })
  const [sets, setSets] = useState([])
  const [songs, setSongs] = useState({})   // setId -> [titles]
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [schedId, setSchedId] = useState(null)
  const { pro, requirePro } = useUpgrade()
  const [expanded, setExpanded] = useState(false)   // the matrix fills the page
  const [assigning, setAssigning] = useState(false)
  const [dropKey, setDropKey] = useState(null)   // cell a person is being dragged over
  const [dragNote, setDragNote] = useState(null) // { ok, text }
  const { assignments, error: schedError, refresh: refreshAssignments, addAssignment, removeAssignment, sendInvites, sending, sendResult, setSendResult } =
    useScheduling({ members, setMembers, positions, sets })
  const paneRef = useRef(null)
  const today = todayISO()

  // Dated sets in order; the matrix shows the last past set and the next 30.
  const dated = useMemo(() => sets.filter(s => s.service_date)
    .sort((a, b) => a.service_date.localeCompare(b.service_date) || (a.service_time || '').localeCompare(b.service_time || '')), [sets])
  const firstUpcoming = dated.findIndex(s => s.service_date >= today)
  const nextIdx = firstUpcoming >= 0 ? firstUpcoming : dated.length   // index of the next set (or past the end)
  const columns = useMemo(() => dated.slice(Math.max(0, nextIdx - 1), nextIdx + 30), [dated, nextIdx])
  const columnKey = columns.map(s => s.id).join(',')

  useEffect(() => {
    scope.sets(supabase.from('sets').select('*'))
      .then(({ data, error: e }) => { if (e) setError('Could not load sets.'); setSets(data || []) })
      .catch(() => setError('Could not load sets.'))
      .finally(() => setLoaded(true))
  }, [user.id, scope.churchId, scope.workspaceId])   // eslint-disable-line react-hooks/exhaustive-deps

  // Song titles for the sets in the matrix.
  useEffect(() => {
    if (!columns.length) { setSongs({}); return }
    let live = true
    ;(async () => {
      const { data: items } = await supabase.from('set_items').select('set_id, position, content').eq('type', 'song')
        .in('set_id', columns.map(s => s.id)).order('position')
      const rows = items || []
      const missing = [...new Set(rows.filter(r => !(r.content?.song_title || r.content?.title) && r.content?.song_id).map(r => r.content.song_id))]
      const titles = {}
      if (missing.length) {
        const { data } = await supabase.from('songs').select('id, title').in('id', missing)
        for (const r of data || []) titles[r.id] = r.title
      }
      const by = {}
      for (const r of rows) (by[r.set_id] ||= []).push(r.content?.song_title || r.content?.title || titles[r.content?.song_id] || 'Song')
      if (live) setSongs(by)
    })()
    return () => { live = false }
  }, [columnKey])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!expanded) return
    const onKey = e => { if (e.key === 'Escape' && !assigning) setExpanded(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [expanded, assigning])

  const posById = useMemo(() => Object.fromEntries(positions.map(p => [p.id, p])), [positions])
  const memById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])
  const rows = useMemo(() => {
    const order = Object.fromEntries(positions.map((p, i) => [p.id, i]))
    return GROUPS.map(g => ({
      ...g,
      positions: positions.filter(p => groupOf(p) === g.id)
        .sort((a, b) => rankOf(a) - rankOf(b) || (order[a.id] ?? 0) - (order[b.id] ?? 0)),
    })).filter(g => g.positions.length)
  }, [positions])
  const people = (p, s) => assignments.filter(a => a.set_id === s.id && a.position_id === p.id && memById[a.member_id])
    .sort((a, b) => memById[a.member_id].name.localeCompare(memById[b.member_id].name))

  // The set whose team is being edited: the one picked, else the next upcoming (else the last).
  const schedIndex = useMemo(() => {
    const i = dated.findIndex(s => s.id === schedId)
    if (i >= 0) return i
    return nextIdx < dated.length ? nextIdx : dated.length - 1
  }, [dated, schedId, nextIdx])
  const schedSet = dated[schedIndex] || null
  const showSet = s => { if (!s) return; setSchedId(s.id); setSendResult(null) }
  const pickColumn = s => { showSet(s); setTimeout(() => paneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50) }

  // Drag a person onto another set (any cell in its column) to put them on that set in that row's position.
  const dropOn = async (target, position, e) => {
    e.preventDefault(); setDropKey(null)
    let payload
    try { payload = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) } catch { return }
    const m = members.find(x => x.id === payload.memberId)
    if (!m || !requirePro('Scheduling your team')) return
    if (assignments.some(a => a.set_id === target.id && a.member_id === m.id && a.position_id === position.id)) {
      setDragNote({ ok: false, text: `${m.name} is already on ${target.name} as ${position.name}.` }); return
    }
    const err = await addAssignment(target.id, position.id, m.id)
    setDragNote(err ? { ok: false, text: err } : { ok: true, text: `${m.name} added to ${target.name} as ${position.name}. Not sent yet — use Send Requests to ask them.` })
  }

  const isNext = s => dated[nextIdx]?.id === s.id
  const isPast = s => s.service_date < today
  const cellBand = 'bg-[#1a1a1a]'

  return (
    <>
    <section className={expanded ? 'fixed inset-0 z-40 bg-card flex flex-col overflow-hidden' : 'rounded-xl border border-border bg-card overflow-hidden'}>
      <div className="flex items-center gap-2 px-3 py-2 shrink-0">
        <button onClick={toggle} aria-expanded={open || expanded} disabled={expanded} className="flex items-center gap-2 min-w-0 text-left flex-1">
          <ChevronDown size={16} className={`text-muted transition-transform shrink-0 ${open || expanded ? '' : '-rotate-90'}`} />
          <h2 className="font-semibold whitespace-nowrap">Who's Serving</h2>
          {columns.length > 0 && <span className="text-xs text-muted truncate">{columns.length} set{columns.length === 1 ? '' : 's'}</span>}
        </button>
        {columns.length > 0 && (
          <button onClick={() => requirePro('Scheduling your team') && setAssigning(true)} title={pro ? `Assign the team for ${schedSet?.name || 'a set'}` : 'Assign (Pro)'}
            className={`flex items-center gap-1.5 px-3 h-7 rounded-full border border-accent/70 bg-accent/20 text-xs font-semibold text-accent-light hover:bg-accent/30 transition-colors shrink-0 ${locked(pro)}`}>
            <UserPlus size={13} /> Assign
          </button>
        )}
        <button onClick={() => setExpanded(e => !e)} aria-label={expanded ? 'Exit full page' : 'Expand to full page'} title={expanded ? 'Exit full page (Esc)' : 'Full page'}
          className="btn-ghost p-1.5 shrink-0">{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
      </div>

      {(open || expanded) && (
        <div className={`border-t border-border ${expanded ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
          {(error || schedError) && <p className="px-3 py-2 text-red-400 text-xs">{error || schedError}</p>}
          {!loaded ? (
            <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
          ) : columns.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted text-center">No dated sets yet. Give a set a date to see who's serving.</p>
          ) : (
            <>
              <div className={expanded ? 'flex-1 min-h-0 overflow-auto' : 'overflow-x-auto'}>
                <table className="border-collapse text-xs w-max min-w-full">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-card w-24 sm:w-28 min-w-[6rem] sm:min-w-[7rem] p-2 text-left font-normal text-muted align-top border-r border-border/70 border-b border-border/50">
                        {columns.length} set{columns.length === 1 ? '' : 's'}
                      </th>
                      {columns.map(s => (
                        <th key={s.id} scope="col" className={`min-w-[8.5rem] sm:min-w-[10.5rem] max-w-[10.5rem] p-0 align-top font-normal text-left border-r border-border/30 border-b border-border/50 ${isPast(s) ? 'opacity-60' : ''} ${s.id === schedSet?.id ? 'bg-accent/15' : isNext(s) ? 'bg-accent/[0.07]' : ''}`}>
                          <button onClick={() => pickColumn(s)} title="Select this set (Assign works on it)" aria-label={`Select ${s.name}`} aria-pressed={s.id === schedSet?.id}
                            className={`block w-full text-left p-2 hover:bg-white/5 ${isNext(s) ? 'border-t-2 border-accent-light' : 'border-t-2 border-transparent'}`}>
                            <span className="flex items-center gap-1 min-w-0">
                              {isNext(s) && <span className="shrink-0 text-[8px] font-bold px-1 rounded border border-accent-light/60 text-accent-light">NEXT</span>}
                              {!isNext(s) && isPast(s) && columns.indexOf(s) === 0 && <span className="shrink-0 text-[8px] font-bold px-1 rounded border border-border text-muted">LAST</span>}
                              <span className="font-semibold text-primary truncate">{s.name}</span>
                            </span>
                            <span className="block text-[10px] text-muted truncate">{whenLabel(s)}</span>
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th colSpan={columns.length + 1} className={`sticky left-0 text-left px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted ${cellBand}`}>Songs</th>
                    </tr>
                    <tr>
                      <td className="sticky left-0 z-10 bg-card border-r border-border/70 border-b border-border/40" />
                      {columns.map(s => (
                        <td key={s.id} className={`align-top p-0 border-r border-border/30 border-b border-border/40 ${isPast(s) ? 'opacity-60' : ''} ${s.id === schedSet?.id ? 'bg-accent/15' : isNext(s) ? 'bg-accent/[0.07]' : ''}`}>
                          {/* The songs open Edit Set; the header above selects the set. */}
                          <button onClick={() => navigate(`/sets/${s.id}`)} title={`Edit ${s.name}`} aria-label={`Edit ${s.name}`}
                            className="block w-full h-full text-left p-2 hover:bg-white/5">
                            {(songs[s.id] || []).length === 0
                              ? <span className="text-[#6f6f6f]">No songs yet</span>
                              : <ol className="space-y-0.5">{songs[s.id].map((t, i) => (
                                <li key={i} className="flex gap-1 min-w-0"><span className="text-muted tabular-nums">{i + 1}</span><span className="truncate">{t}</span></li>
                              ))}</ol>}
                          </button>
                        </td>
                      ))}
                    </tr>
                    {rows.map(g => (
                      <GroupRows key={g.id} group={g} columns={columns} people={people} memById={memById}
                        cellBand={cellBand} isPast={isPast} isNext={isNext} selectedId={schedSet?.id}
                        dropKey={dropKey} setDropKey={setDropKey} onDrop={dropOn} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[11px] text-muted border-t border-border/50">
                {LEGEND.map(([k, t]) => <span key={k} className="flex items-center gap-1.5"><span className={`w-[7px] h-[7px] rounded-full ${DOT[k]}`} />{t}</span>)}
                <span className="ml-auto text-[#6f6f6f]">Click a set to select it · click its songs to edit it · drag a person onto another set to add them</span>
              </div>
              {dragNote && <p className={`px-3 pb-2 text-xs ${dragNote.ok ? 'text-green-400' : 'text-amber-300'}`}>{dragNote.text}</p>}

            </>
          )}
        </div>
      )}
    </section>
    {assigning && schedSet && (
      <AssignTeamDialog set={schedSet} members={members} positions={positions} assignments={assignments.filter(a => a.set_id === schedSet.id)}
        onAdd={(pid, mid) => addAssignment(schedSet.id, pid, mid)} onRemove={removeAssignment} onClose={() => setAssigning(false)} />
    )}
    {loaded && columns.length > 0 && (
      // The set's team is its own card below the matrix, so the page scrolls past the matrix.
      <div ref={paneRef} className="scroll-mt-4">
        <SchedulePane key={schedSet?.id || 'none'} set={schedSet} index={schedIndex} total={dated.length} active multi={false}
          onPrev={() => showSet(dated[schedIndex - 1])} onNext={() => showSet(dated[schedIndex + 1])}
          positions={positions} members={members}
          assignments={schedSet ? assignments.filter(a => a.set_id === schedSet.id) : []}
          onAdd={(pid, mid) => addAssignment(schedSet.id, pid, mid)} onRemove={removeAssignment}
          onSend={sendInvites} sending={sending} sendResult={schedSet && sendResult?.setId === schedSet.id ? sendResult : null} onRefresh={refreshAssignments} />
      </div>
    )}
    </>
  )
}

// One group's band (Production / Singers / Musicians) and a row per position.
function GroupRows({ group, columns, people, memById, cellBand, isPast, isNext, selectedId, dropKey, setDropKey, onDrop }) {
  return (
    <>
      <tr>
        <th colSpan={columns.length + 1} className={`sticky left-0 text-left px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted ${cellBand}`}>{group.label}</th>
      </tr>
      {group.positions.map(p => (
        <tr key={p.id}>
          <th scope="row" className="sticky left-0 z-10 bg-card text-left font-medium p-2 align-top border-r border-border/70 border-b border-border/40 truncate max-w-[7rem]">{p.name}</th>
          {columns.map(s => {
            const list = people(p, s)
            return (
              <td key={s.id} onDragOver={e => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (dropKey !== `${s.id}-${p.id}`) setDropKey(`${s.id}-${p.id}`) } }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropKey(k => (k === `${s.id}-${p.id}` ? null : k)) }}
                onDrop={e => onDrop(s, p, e)}
                className={`align-top p-2 border-r border-border/30 border-b border-border/40 ${isPast(s) ? 'opacity-60' : ''} ${dropKey === `${s.id}-${p.id}` ? 'bg-accent/30 ring-1 ring-inset ring-accent' : s.id === selectedId ? 'bg-accent/15' : isNext(s) ? 'bg-accent/[0.07]' : ''}`}>
                {list.length === 0 ? <span className="text-[#6f6f6f]">—</span> : list.map(a => (
                  <span key={a.id} draggable onDragStart={e => { e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ memberId: a.member_id, positionId: p.id, fromSet: s.id })); e.dataTransfer.effectAllowed = 'copy' }}
                    className="flex items-center gap-1.5 min-w-0 leading-5 cursor-grab active:cursor-grabbing" title={`${memById[a.member_id].name}: ${a.status || 'draft'}. Drag onto another set to add them there.`}>
                    <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${DOT[a.status] || DOT.draft}`} />
                    <span className="truncate">{memById[a.member_id].name}</span>
                  </span>
                ))}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
