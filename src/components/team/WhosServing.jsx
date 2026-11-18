import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useChurch } from '../../contexts/ChurchContext'
import SchedulePane, { sectionOf } from '../calendar/SchedulePane'
import { todayISO, formatSetTime } from '../../lib/sets'
import { extraTimes, timeText } from '../../lib/setTimes'
import { postInvites, mailJoinInvite, inviteSummary } from '../../lib/invites'

const OPEN_KEY = 'stafflist.whosServingOpen'
const GROUPS = [{ id: 'production', label: 'Production' }, { id: 'singers', label: 'Singers' }, { id: 'musicians', label: 'Musicians' }]
const PRODUCTION_WORDS = ['presenter', 'audio', 'sound', 'light', 'video', 'camera', 'stream', 'slide', 'lyric', 'media', 'tech', 'production', 'stage', 'broadcast', 'projection', 'propresenter', 'mix', 'director', 'producer', 'graphics', 'photo']
const SINGER_WORDS = ['sing', 'vocal', 'voice', 'choir', 'bgv', 'worship leader', 'lead']
const RANK = ['presenter', 'audio', 'singer', 'keys', 'acoustic', 'electric', 'bass', 'drums']
const lc = s => (s || '').toLowerCase()

// The matrix has three groups: behind-the-scenes roles, singers and instrumentalists.
function groupOf(p) {
  const s = sectionOf(p)
  if (s !== 'other') return s
  const n = lc(p.name)
  if (PRODUCTION_WORDS.some(w => n.includes(w))) return 'production'
  if (SINGER_WORDS.some(w => n.includes(w))) return 'singers'
  return 'musicians'
}
const rankOf = p => { const i = RANK.indexOf(lc(p.name)); return i < 0 ? 100 : i }

const DOT = { accepted: 'bg-green-500', declined: 'bg-red-500', invited: 'bg-orange-400', draft: 'bg-[#8a8a8a]' }
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
  const { scope, church } = useChurch()
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(OPEN_KEY) !== '0' } catch { return true } })
  const toggle = () => setOpen(o => { try { localStorage.setItem(OPEN_KEY, o ? '0' : '1') } catch { /* ignore */ } return !o })
  const [sets, setSets] = useState([])
  const [assignments, setAssignments] = useState([])
  const [songs, setSongs] = useState({})   // setId -> [titles]
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [schedId, setSchedId] = useState(null)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)   // { setId, ok, text }
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
    supabase.from('set_assignments').select('*').then(({ data, error: e }) => {
      if (e) setError('Team features are not set up yet. Run the latest Supabase migration.')
      setAssignments(data || [])
    })
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

  // Replies arrive from the invite page; pick them up when you come back to the app and every 30s.
  const refreshAssignments = useCallback(() => {
    supabase.from('set_assignments').select('*').then(({ data, error: e }) => { if (!e && data) setAssignments(data) })
  }, [])
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') refreshAssignments() }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    const t = setInterval(onFocus, 30000)
    return () => { document.removeEventListener('visibilitychange', onFocus); window.removeEventListener('focus', onFocus); clearInterval(t) }
  }, [refreshAssignments])

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

  // ── Assigning and inviting (the set's team) ──────────────────────────────
  const addAssignment = async (setId, positionId, memberId) => {
    const { data, error: e } = await supabase.from('set_assignments')
      .insert({ set_id: setId, position_id: positionId, member_id: memberId }).select().single()
    if (e) return e.code === '23505' ? 'That person is already in this set for that position.' : 'Could not add. Please try again.'
    setAssignments(prev => [...prev, data])
    setSendResult(null)
    return null
  }
  const removeAssignment = async a => {
    await supabase.from('set_assignments').delete().eq('id', a.id)
    setAssignments(prev => prev.filter(x => x.id !== a.id))
  }
  const markInvited = async ids => {
    const now = new Date().toISOString()
    await supabase.from('set_assignments').update({ status: 'invited', invited_at: now }).in('id', ids).in('status', ['draft', 'invited'])
    setAssignments(prev => prev.map(a => (ids.includes(a.id) && (a.status || 'draft') !== 'accepted' ? { ...a, status: 'invited', invited_at: now } : a)))
  }

  // Before automatic email is set up: open a ready-written email in the mail app, one person per tap.
  const mailAppFallback = async ids => {
    const a = assignments.find(x => x.id === ids[0])
    const sendSetId = a?.set_id
    const m = members.find(x => x.id === a?.member_id), p = positions.find(x => x.id === a?.position_id)
    const set = sets.find(x => x.id === a?.set_id)
    if (!a?.invite_token || !m?.email) { setSendResult({ setId: sendSetId, ok: false, text: 'Run the team-invites database update first (see setup notes).' }); return }
    if (m.join_token && m.join_status && m.join_status !== 'accepted') {
      // They haven't joined the team yet: the first email is the invitation to join.
      mailJoinInvite(m, church?.name || 'the team')
      const now = new Date().toISOString()
      await supabase.from('team_members').update({ join_status: 'invited', join_invited_at: now }).eq('id', m.id).neq('join_status', 'accepted')
      setMembers(prev => prev.map(x => (x.id === m.id ? { ...x, join_status: 'invited', join_invited_at: now } : x)))
      await markInvited([a.id])
      setSendResult({ setId: sendSetId, ok: true, text: `${m.name} hasn't joined the team yet, so this opened an invitation to join in your mail app. They can answer the set request after joining.` })
      return
    }
    const link = `${window.location.origin}/respond/${a.invite_token}`
    const when = set?.service_date ? new Date(set.service_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''
    const subject = `Can you serve as ${p?.name || 'part of the team'}${when ? ` on ${when}` : ''}?`
    const lines = [
      ['Set', set?.name], ['Date', when], ['Time', set?.service_time && formatSetTime(set.service_time)],
      ...extraTimes(set).map(t => [t.label, timeText(t)]),
      ['Venue', [set?.venue_name, set?.location_address, set?.location_details].filter(Boolean).join(', ')], ['Position', p?.name],
    ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')
    const body = `Hi ${m.name.split(' ')[0]},\n\nCan you serve as ${p?.name} for ${set?.name}?\n\n${lines}\n\nPlease tap to answer:\n${link}\n\nThank you!`
    window.location.href = `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    await markInvited([a.id])
    const left = ids.length - 1
    setSendResult({ setId: sendSetId, ok: true, text: `Opened an email to ${m.name} in your mail app.${left ? ` Tap Email invites again for the next person (${left} left).` : ''}` })
  }

  const sendInvites = async ids => {
    if (!ids.length) return
    const sendSetId = assignments.find(a => a.id === ids[0])?.set_id
    setSending(true); setSendResult(null)
    try {
      const { status, ok, out } = await postInvites({ ids })
      if (status === 501) { await mailAppFallback(ids); return }
      if (status === 402) { setSendResult({ setId: sendSetId, ok: false, text: 'Email invites are part of Pro. Upgrade your team in Settings → Subscription Plans.' }); return }
      if (status === 409) { setSendResult({ setId: sendSetId, ok: false, text: 'Run the team-invites database update first (see setup notes).' }); return }
      if (!ok) { setSendResult({ setId: sendSetId, ok: false, text: 'Could not send the emails. Please try again.' }); return }
      const now = new Date().toISOString()
      const asked = [...(out.sent || []), ...(out.held || [])]
      setAssignments(prev => prev.map(a => (asked.includes(a.id) && (a.status || 'draft') !== 'accepted' ? { ...a, status: 'invited', invited_at: now } : a)))
      if (out.teamInvites?.length) setMembers(prev => prev.map(m => (out.teamInvites.includes(m.id) && m.join_status !== 'accepted' ? { ...m, join_status: 'invited', join_invited_at: now } : m)))
      setSendResult({ setId: sendSetId, ok: !out.failed?.length, text: inviteSummary(out) })
    } catch {
      setSendResult({ setId: sendSetId, ok: false, text: 'Could not send the emails. Check your connection and try again.' })
    } finally { setSending(false) }
  }

  const isNext = s => dated[nextIdx]?.id === s.id
  const isPast = s => s.service_date < today
  const cellBand = 'bg-[#1a1a1a]'

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <button onClick={toggle} aria-expanded={open} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <ChevronDown size={16} className={`text-muted transition-transform shrink-0 ${open ? '' : '-rotate-90'}`} />
        <h2 className="font-semibold whitespace-nowrap">Who's Serving</h2>
        {columns.length > 0 && <span className="text-xs text-muted truncate">{columns.length} set{columns.length === 1 ? '' : 's'}</span>}
      </button>

      {open && (
        <div className="border-t border-border">
          {error && <p className="px-3 py-2 text-red-400 text-xs">{error}</p>}
          {!loaded ? (
            <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
          ) : columns.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted text-center">No dated sets yet. Give a set a date to see who's serving.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="border-collapse text-xs w-max min-w-full">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-card w-24 sm:w-28 min-w-[6rem] sm:min-w-[7rem] p-2 text-left font-normal text-muted align-top border-r border-border/70 border-b border-border/50">
                        {columns.length} set{columns.length === 1 ? '' : 's'}
                      </th>
                      {columns.map(s => (
                        <th key={s.id} scope="col" className={`min-w-[8.5rem] sm:min-w-[10.5rem] max-w-[10.5rem] p-0 align-top font-normal text-left border-r border-border/30 border-b border-border/50 ${isPast(s) ? 'opacity-60' : ''} ${s.id === schedSet?.id ? 'bg-accent/15' : isNext(s) ? 'bg-accent/[0.07]' : ''}`}>
                          <button onClick={() => pickColumn(s)} title="Edit this set's team" aria-label={`Edit the team for ${s.name}`}
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
                        <td key={s.id} className={`align-top p-2 border-r border-border/30 border-b border-border/40 ${isPast(s) ? 'opacity-60' : ''} ${s.id === schedSet?.id ? 'bg-accent/15' : isNext(s) ? 'bg-accent/[0.07]' : ''}`}>
                          {(songs[s.id] || []).length === 0
                            ? <span className="text-[#6f6f6f]">No songs yet</span>
                            : <ol className="space-y-0.5">{songs[s.id].map((t, i) => (
                              <li key={i} className="flex gap-1 min-w-0"><span className="text-muted tabular-nums">{i + 1}</span><span className="truncate">{t}</span></li>
                            ))}</ol>}
                        </td>
                      ))}
                    </tr>
                    {rows.map(g => (
                      <GroupRows key={g.id} group={g} columns={columns} people={people} memById={memById}
                        cellBand={cellBand} isPast={isPast} isNext={isNext} selectedId={schedSet?.id} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[11px] text-muted border-t border-border/50">
                {LEGEND.map(([k, t]) => <span key={k} className="flex items-center gap-1.5"><span className={`w-[7px] h-[7px] rounded-full ${DOT[k]}`} />{t}</span>)}
                <span className="ml-auto text-[#6f6f6f]">Click a set to edit its team</span>
              </div>

              <div ref={paneRef} className="p-3 border-t border-border scroll-mt-4">
                <SchedulePane key={schedSet?.id || 'none'} set={schedSet} index={schedIndex} total={dated.length} active multi={false}
                  onPrev={() => showSet(dated[schedIndex - 1])} onNext={() => showSet(dated[schedIndex + 1])}
                  positions={positions} members={members}
                  assignments={schedSet ? assignments.filter(a => a.set_id === schedSet.id) : []}
                  onAdd={(pid, mid) => addAssignment(schedSet.id, pid, mid)} onRemove={removeAssignment}
                  onSend={sendInvites} sending={sending} sendResult={schedSet && sendResult?.setId === schedSet.id ? sendResult : null} onRefresh={refreshAssignments} />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

// One group's band (Production / Singers / Musicians) and a row per position.
function GroupRows({ group, columns, people, memById, cellBand, isPast, isNext, selectedId }) {
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
              <td key={s.id} className={`align-top p-2 border-r border-border/30 border-b border-border/40 ${isPast(s) ? 'opacity-60' : ''} ${s.id === selectedId ? 'bg-accent/15' : isNext(s) ? 'bg-accent/[0.07]' : ''}`}>
                {list.length === 0 ? <span className="text-[#6f6f6f]">—</span> : list.map(a => (
                  <span key={a.id} className="flex items-center gap-1.5 min-w-0 leading-5" title={`${memById[a.member_id].name}: ${a.status || 'draft'}`}>
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
