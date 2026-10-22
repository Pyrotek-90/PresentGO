import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useChurch } from '../contexts/ChurchContext'
import Layout from '../components/Layout'
import SchedulePane from '../components/calendar/SchedulePane'
import { sortPositions, ensureStandardPositions } from '../lib/positions'
import { todayISO, formatSetTime } from '../lib/sets'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CAL_COLLAPSE_KEY = 'presentgo.calendarCollapsed'

// How many set panes fit side by side: phone 1, iPad portrait 2, iPad landscape 3, wide 4.
function usePaneCount(ref) {
  const [n, setN] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => { const w = el.clientWidth; setN(w >= 1140 ? 4 : w >= 860 ? 3 : w >= 560 ? 2 : 1) }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return n
}

export default function Calendar() {
  const { user } = useAuth()
  const { scope } = useChurch()
  const [sets, setSets] = useState([])
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selected, setSelected] = useState(todayISO())
  const [schedId, setSchedId] = useState(null)   // set shown in the Team Schedule pane
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)   // { setId, ok, text }
  const [calCollapsed, setCalCollapsed] = useState(() => { try { return localStorage.getItem(CAL_COLLAPSE_KEY) === '1' } catch { return false } })
  const toggleCal = () => setCalCollapsed(c => { try { localStorage.setItem(CAL_COLLAPSE_KEY, c ? '0' : '1') } catch { /* ignore */ } return !c })
  const panesRef = useRef(null)
  const paneCount = usePaneCount(panesRef)
  const [positions, setPositions] = useState([])
  const [members, setMembers] = useState([])
  const [assignments, setAssignments] = useState([])
  const [teamLoading, setTeamLoading] = useState(true)
  const [teamError, setTeamError] = useState(null)

  useEffect(() => {
    Promise.all([
      scope.church(supabase.from('positions').select('*')).order('created_at'),
      scope.church(supabase.from('team_members').select('*')).order('name'),
      supabase.from('set_assignments').select('*'),
    ]).then(async ([p, m, a]) => {
      if (p.error || m.error || a.error) setTeamError('Team features are not set up yet. Run the latest Supabase migration.')
      setMembers(m.data || []); setAssignments(a.data || [])
      const list = p.error ? [] : await ensureStandardPositions(supabase, user, p.data || [], scope)
      setPositions(sortPositions(list))
    }).catch(() => setTeamError('Could not load team data.')).finally(() => setTeamLoading(false))
  }, [user.id, scope.churchId, scope.workspaceId])   // eslint-disable-line react-hooks/exhaustive-deps

  const addAssignment = async (setId, positionId, memberId) => {
    const { data, error } = await supabase.from('set_assignments')
      .insert({ set_id: setId, position_id: positionId, member_id: memberId }).select().single()
    if (error) return error.code === '23505' ? 'That person is already in this set for that position.' : 'Could not add. Please try again.'
    setAssignments(prev => [...prev, data])
    setSendResult(null)
    return null
  }

  // Replies arrive from the invite page; pick them up when you come back to the app and every 30s.
  const refreshAssignments = useCallback(() => {
    supabase.from('set_assignments').select('*').then(({ data, error }) => { if (!error && data) setAssignments(data) })
  }, [])
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') refreshAssignments() }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    const t = setInterval(onFocus, 30000)
    return () => { document.removeEventListener('visibilitychange', onFocus); window.removeEventListener('focus', onFocus); clearInterval(t) }
  }, [refreshAssignments])

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
    const link = `${window.location.origin}/respond/${a.invite_token}`
    const when = set?.service_date ? new Date(set.service_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''
    const subject = `Can you serve as ${p?.name || 'part of the team'}${when ? ` on ${when}` : ''}?`
    const body = `Hi ${m.name.split(' ')[0]},\n\nCan you serve as ${p?.name} for ${set?.name}${when ? ` on ${when}${set?.service_time ? ` at ${formatSetTime(set.service_time)}` : ''}` : ''}?\n\nPlease tap to answer:\n${link}\n\nThank you!`
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
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/send-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ ids }),
      })
      const out = await r.json().catch(() => ({}))
      if (r.status === 501) { await mailAppFallback(ids); return }
      if (r.status === 409) { setSendResult({ setId: sendSetId, ok: false, text: 'Run the team-invites database update first (see setup notes).' }); return }
      if (!r.ok) { setSendResult({ setId: sendSetId, ok: false, text: 'Could not send the emails. Please try again.' }); return }
      const now = new Date().toISOString()
      setAssignments(prev => prev.map(a => (out.sent.includes(a.id) && (a.status || 'draft') !== 'accepted' ? { ...a, status: 'invited', invited_at: now } : a)))
      const parts = [`Sent ${out.sent.length} invite${out.sent.length === 1 ? '' : 's'}.`]
      if (out.failed?.length) parts.push(`${out.failed.length} couldn't be sent.`)
      setSendResult({ setId: sendSetId, ok: !out.failed?.length, text: parts.join(' ') })
    } catch {
      setSendResult({ setId: sendSetId, ok: false, text: 'Could not send the emails. Check your connection and try again.' })
    } finally { setSending(false) }
  }

  const removeAssignment = async a => {
    await supabase.from('set_assignments').delete().eq('id', a.id)
    setAssignments(prev => prev.filter(x => x.id !== a.id))
  }

  useEffect(() => {
    scope.sets(supabase.from('sets').select('id, name, service_date, service_time, venue_name, location_address'))
      .then(({ data }) => setSets(data || []))
      .catch(() => {})
  }, [user.id, scope.churchId, scope.workspaceId])   // eslint-disable-line react-hooks/exhaustive-deps

  const setsByDate = useMemo(() => {
    const m = {}
    for (const s of sets) if (s.service_date) (m[s.service_date] ||= []).push(s)
    for (const k in m) m[k].sort((a, b) => (a.service_time || '').localeCompare(b.service_time || ''))
    return m
  }, [sets])

  const days = useMemo(() => {
    const first = cursor.getDay()
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - first + i)
      return { iso: d.toLocaleDateString('en-CA'), day: d.getDate(), inMonth: d.getMonth() === cursor.getMonth() }
    })
  }, [cursor])

  const today = todayISO()
  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const shift = n => setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1))
  const goToday = () => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(todayISO()) }

  // Sets in date order for the Team Schedule pane; it starts on the next upcoming set.
  const dated = useMemo(() => sets.filter(s => s.service_date)
    .sort((a, b) => a.service_date.localeCompare(b.service_date) || (a.service_time || '').localeCompare(b.service_time || '')), [sets])
  const schedIndex = useMemo(() => {
    const i = dated.findIndex(s => s.id === schedId)
    if (i >= 0) return i
    const next = dated.findIndex(s => s.service_date >= today)
    return next >= 0 ? next : dated.length - 1
  }, [dated, schedId, today])
  const schedSet = dated[schedIndex] || null
  const showSet = s => {
    if (!s) return
    setSchedId(s.id); setSelected(s.service_date); setSendResult(null)
    const d = new Date(s.service_date + 'T00:00:00')
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1))
  }
  // Panes shown: the selected set (by default the next upcoming one) first, then the sets after it.
  const paneWindow = useMemo(() => {
    if (!dated.length) return [-1]
    const n = Math.min(paneCount, dated.length)
    const start = Math.max(0, Math.min(schedIndex, dated.length - n))
    return Array.from({ length: n }, (_, k) => start + k)
  }, [dated.length, paneCount, schedIndex])

  const pickDay = iso => {
    setSelected(iso)
    const first = (setsByDate[iso] || [])[0]
    if (first) { setSchedId(first.id); setSendResult(null) }
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className={`flex items-center justify-between px-3 py-2 ${calCollapsed ? '' : 'border-b border-border'}`}>
              <button onClick={toggleCal} aria-expanded={!calCollapsed} className="flex items-center gap-2 min-w-0 text-left">
                <ChevronDown size={16} className={`text-muted transition-transform shrink-0 ${calCollapsed ? '-rotate-90' : ''}`} />
                <h1 className="font-semibold truncate">{monthLabel}</h1>
              </button>
              <div className="flex items-center gap-1">
                <button onClick={goToday} className="btn-ghost !py-1 !px-2.5 text-xs">Today</button>
                <button onClick={() => shift(-1)} className="btn-ghost p-1.5" aria-label="Previous month"><ChevronLeft size={16} /></button>
                <button onClick={() => shift(1)} className="btn-ghost p-1.5" aria-label="Next month"><ChevronRight size={16} /></button>
              </div>
            </div>
            {!calCollapsed && <>
            <div className="grid grid-cols-7 border-b border-border">
              {WEEKDAYS.map(w => <div key={w} className="py-1 text-center text-[10px] uppercase tracking-widest text-muted">{w}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map(({ iso, day, inMonth }) => {
                const daySets = setsByDate[iso] || []
                const isSel = schedSet ? iso === schedSet.service_date : iso === selected
                return (
                  <button key={iso} onClick={() => pickDay(iso)}
                    className={`h-14 sm:h-20 p-1 border-b border-r border-border/50 text-left align-top flex flex-col gap-0.5 transition-colors ${
                      isSel ? 'bg-accent/10 ring-1 ring-inset ring-accent/60' : 'hover:bg-[#1a1a1a]'
                    } ${inMonth ? '' : 'opacity-35'}`}>
                    <span className={`text-xs w-5 h-5 flex items-center justify-center rounded-full ${iso === today ? 'bg-accent text-white font-semibold' : 'text-muted'}`}>{day}</span>
                    <div className="hidden sm:flex flex-col gap-0.5 min-w-0">
                      {daySets.slice(0, 2).map(s => (
                        <span key={s.id} className="truncate text-[10px] px-1 py-0.5 rounded bg-accent/25 text-accent-light">{s.name}</span>
                      ))}
                      {daySets.length > 2 && <span className="text-[10px] text-muted px-1">+{daySets.length - 2} more</span>}
                    </div>
                    {daySets.length > 0 && (
                      <div className="sm:hidden flex gap-0.5 px-0.5">
                        {daySets.slice(0, 3).map(s => <span key={s.id} className="w-1.5 h-1.5 rounded-full bg-accent-light" />)}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
            </>}
          </section>

        {/* Who's Serving: the selected set first, then the sets that follow when there's room */}
        <div ref={panesRef} className="grid gap-4 items-start" style={{ gridTemplateColumns: `repeat(${Math.min(paneCount, Math.max(dated.length, 1))}, minmax(0, 1fr))` }}>
          {paneWindow.map(i => {
            const s = dated[i]
            return (
              <SchedulePane key={s ? s.id : 'none'} set={s || null} index={i} total={dated.length}
                active={i === schedIndex} multi={paneWindow.length > 1}
                showPrev={i === paneWindow[0]} showNext={i === paneWindow[paneWindow.length - 1]}
                onSelect={() => showSet(s)}
                onPrev={() => showSet(dated[schedIndex - 1])} onNext={() => showSet(dated[schedIndex + 1])}
                positions={positions} members={members}
                assignments={s ? assignments.filter(a => a.set_id === s.id) : []}
                onAdd={(pid, mid) => addAssignment(s.id, pid, mid)} onRemove={removeAssignment}
                onSend={sendInvites} sending={sending} sendResult={s && sendResult?.setId === s.id ? sendResult : null} onRefresh={refreshAssignments} />
            )
          })}
        </div>
        {teamError && <p className="text-red-400 text-xs">{teamError}</p>}
      </div>
    </Layout>
  )
}
