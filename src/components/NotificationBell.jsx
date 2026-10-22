import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, UserPlus, CalendarClock, CheckCircle2, XCircle, Check, X, MessageSquare, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { loadNotifications, makeReminders, markRead, respondToRequest, respondToTeam } from '../lib/notifications'
import { useChurch } from '../contexts/ChurchContext'
import { formatModified } from '../lib/sets'

// Bell in the header. Serving requests can be accepted or declined right here; the leader gets
// the answer, and everyone gets reminders as a set gets close.
export default function NotificationBell({ userId, onOpen }) {
  const navigate = useNavigate()
  const church = useChurch()
  const [items, setItems] = useState(null)   // null = not set up yet (bell hidden)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [changing, setChanging] = useState(() => new Set())
  const [error, setError] = useState(null)
  const box = useRef(null)

  const refresh = useCallback(async () => {
    try { const list = await loadNotifications(); if (list) setItems(list) } catch { /* offline */ }
  }, [])

  useEffect(() => {
    let live = true
    const start = async () => {
      try { await makeReminders() } catch { /* not set up yet */ }
      if (live) refresh()
    }
    start()
    const timer = setInterval(start, 5 * 60 * 1000)
    const poll = setInterval(refresh, 60 * 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') start() }
    document.addEventListener('visibilitychange', onVisible)
    let ch = null
    try {
      ch = supabase.channel(`notifications-${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => refresh())
        .subscribe()
    } catch { /* realtime unavailable; polling covers it */ }
    return () => {
      live = false; clearInterval(timer); clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      try { if (ch) supabase.removeChannel(ch) } catch { /* ignore */ }
    }
  }, [userId, refresh])

  useEffect(() => {
    if (!open) return
    const down = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const key = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])

  if (items === null) return null
  const unread = items.filter(n => !n.read_at)

  const read = async ids => {
    if (!ids.length) return
    const now = new Date().toISOString()
    setItems(prev => prev.map(n => (ids.includes(n.id) ? { ...n, read_at: n.read_at || now } : n)))
    try { await markRead(ids) } catch { /* ignore */ }
  }
  const toggleOpen = () => { setOpen(o => !o); setError(null); if (!open) onOpen?.() }
  const answer = async (n, response) => {
    setBusy(n.id); setError(null)
    if (n.kind === 'team_invite') {
      try {
        const status = await respondToTeam(n.member_id, response)
        setItems(prev => prev.map(x => (x.member_id === n.member_id ? { ...x, join_status: status, read_at: x.read_at || new Date().toISOString() } : x)))
        setChanging(prev => { const s = new Set(prev); s.delete(n.id); return s })
        if (status === 'accepted') { church?.refresh?.(); refresh() }   // the new team, and set requests that were waiting
      } catch (e) { setError(e.message) } finally { setBusy(null) }
      return
    }
    try {
      const status = await respondToRequest(n.assignment_id, response)
      setItems(prev => prev.map(x => (x.assignment_id === n.assignment_id ? { ...x, assignment_status: status, read_at: x.read_at || new Date().toISOString() } : x)))
      setChanging(prev => { const s = new Set(prev); s.delete(n.id); return s })
    } catch (e) { setError(e.message) } finally { setBusy(null) }
  }
  const go = n => {
    read([n.id])
    // Sets open for the leader, and for team members once they've accepted.
    if (n.set_id && n.kind !== 'team_message' && !(n.kind === 'serving_request' && n.assignment_status !== 'accepted')) { setOpen(false); navigate(`/sets/${n.set_id}`) }
  }

  const icon = n => n.kind === 'team_invite' ? <Users size={16} className="text-accent-light" />
    : n.kind === 'serving_request' ? <UserPlus size={16} className="text-accent-light" />
    : n.kind === 'team_message' ? <MessageSquare size={16} className="text-sky-300" />
    : n.kind === 'request_answered' ? (/ declined ·/.test(n.title) ? <XCircle size={16} className="text-red-400" /> : <CheckCircle2 size={16} className="text-green-400" />)
    : <CalendarClock size={16} className="text-amber-300" />

  return (
    <div className="relative" ref={box}>
      <button onClick={toggleOpen} aria-label={unread.length ? `Notifications, ${unread.length} unread` : 'Notifications'} aria-expanded={open}
        className={`relative w-10 h-10 md:w-9 md:h-9 flex items-center justify-center rounded-xl border transition-colors ${unread.length ? 'border-accent/60 bg-accent/15 text-accent-light' : 'border-border bg-card text-[#d4d4d4] hover:text-[#f5f5f5]'}`}>
        <Bell size={20} />
        {unread.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[19px] h-[19px] px-1 ring-2 ring-surface rounded-full bg-accent text-black text-[10px] font-bold flex items-center justify-center">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications"
          className="fixed left-3 right-3 top-14 md:absolute md:left-auto md:right-0 md:top-full md:mt-1 md:w-96 z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[min(34rem,calc(100dvh-5rem))]">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <p className="font-semibold text-sm">Notifications</p>
            {unread.length > 0 && <button onClick={() => read(unread.map(n => n.id))} className="text-xs text-accent-light hover:underline">Mark all read</button>}
          </div>
          {error && <p className="px-4 py-2 text-xs text-red-400">{error}</p>}
          <ul className="overflow-y-auto divide-y divide-border/60">
            {!items.length && <li className="px-4 py-8 text-center text-sm text-muted">You’re all caught up.<br /><span className="text-xs">Serving requests and set reminders will show up here.</span></li>}
            {items.map(n => {
              const isTeam = n.kind === 'team_invite'
              const isReq = n.kind === 'serving_request' || isTeam
              const st = isTeam ? n.join_status : n.assignment_status
              const answered = isReq && (st === 'accepted' || st === 'declined')
              const showButtons = isReq && (!answered || changing.has(n.id))
              return (
                <li key={n.id} className={`px-4 py-3 ${n.read_at ? '' : 'bg-accent/5'}`}>
                  <div className="flex gap-3">
                    <span className="mt-0.5 shrink-0">{icon(n)}</span>
                    <div className="flex-1 min-w-0">
                      <button onClick={() => go(n)} className="block w-full text-left">
                        <span className="block text-sm font-medium leading-snug">{n.title}</span>
                        {n.body && <span className={`block text-xs text-muted mt-0.5 ${n.kind === 'team_message' ? 'whitespace-pre-wrap break-words' : ''}`}>{n.body}</span>}
                      </button>
                      <p className="text-[10px] text-muted mt-1">{formatModified(n.created_at)}</p>
                      {isReq && (
                        <div className="mt-2">
                          {answered && !showButtons && (
                            <p className={`flex items-center gap-2 text-xs font-medium ${st === 'accepted' ? 'text-green-400' : 'text-red-400'}`}>
                              {st === 'accepted' ? <Check size={14} /> : <X size={14} />} You {isTeam ? (st === 'accepted' ? 'joined' : 'declined to join') : st === 'accepted' ? 'accepted' : 'declined'}
                              <button onClick={() => setChanging(prev => new Set(prev).add(n.id))} className="ml-1 text-muted hover:text-[#f5f5f5] underline font-normal">Change</button>
                            </p>
                          )}
                          {showButtons && (
                            <div className="flex gap-2">
                              <button onClick={() => answer(n, 'accepted')} disabled={busy === n.id || st === 'accepted'}
                                className="flex-1 h-9 rounded-lg bg-green-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"><Check size={14} /> {isTeam ? 'Join' : 'Accept'}</button>
                              <button onClick={() => answer(n, 'declined')} disabled={busy === n.id || st === 'declined'}
                                className="flex-1 h-9 rounded-lg border border-red-500/60 text-red-400 text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-red-500/10 disabled:opacity-40"><X size={14} /> {isTeam ? 'No thanks' : 'Decline'}</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {!n.read_at && <span className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" aria-label="Unread" />}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
