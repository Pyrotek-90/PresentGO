import { useState, useEffect, useMemo } from 'react'
import { X, Send, Check, ChevronLeft, BadgeCheck, Mail, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { posLabel } from '../../lib/positions'
import { todayISO, formatSetDate } from '../../lib/sets'

// Message Team: 1) choose who (filter by position), 2) write the message and send.
// People with a StaffList account get it in their bell; the rest get an email.

const TEMPLATES = [
  ['Songs added', set => `The songs for ${set || 'this week'} have been added. Please take a look and start practicing.`],
  ['Songs changed', set => `The songs for ${set || 'this week'} have changed. Please check the updated set before practice.`],
  ['Reminder', set => `A quick reminder about ${set || 'this week'}. Please let me know if anything has changed for you.`],
]

export default function MessageTeamDialog({ userId, members, positions, accounts, onClose }) {
  const [step, setStep] = useState('who')       // who | write | done
  const [posFilter, setPosFilter] = useState(() => new Set())
  const [picked, setPicked] = useState(() => new Set())
  const [sets, setSets] = useState([])
  const [setId, setSetId] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    supabase.from('sets').select('id, name, service_date').eq('user_id', userId).gte('service_date', todayISO()).order('service_date')
      .then(({ data }) => setSets(data || [])).catch(() => {})
  }, [userId])

  const shown = useMemo(() => (posFilter.size ? members.filter(m => (m.position_ids || []).some(id => posFilter.has(id))) : members), [members, posFilter])
  const reachable = m => !!m.email
  const shownReachable = shown.filter(reachable)
  const allShownPicked = shownReachable.length > 0 && shownReachable.every(m => picked.has(m.id))
  const usedPositions = positions.filter(p => members.some(m => m.position_ids?.includes(p.id)))
  const setLabel = (() => { const s = sets.find(x => x.id === setId); return s ? `${s.name} (${formatSetDate(s.service_date)})` : '' })()

  const toggle = id => setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const togglePos = id => setPosFilter(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectShown = () => setPicked(prev => {
    const n = new Set(prev)
    if (allShownPicked) shownReachable.forEach(m => n.delete(m.id)); else shownReachable.forEach(m => n.add(m.id))
    return n
  })
  const recipients = members.filter(m => picked.has(m.id))

  const send = async () => {
    setBusy(true); setError(null)
    const ids = [...picked]
    const title = subject.trim() || setLabel && `About ${setLabel}` || ''
    try {
      const { data, error: err } = await supabase.rpc('send_team_message', { p_member_ids: ids, p_title: title, p_body: message, p_set_id: setId || null })
      if (err || !data) throw new Error(/function|schema cache/i.test(err?.message || '') ? 'Run the team messages database update first (see setup notes).' : 'Could not send the message. Please try again.')
      const out = { inApp: data.delivered || 0, emailed: 0, failed: 0, mailApp: null }
      const rest = data.no_account || []
      if (rest.length) {
        const { data: { session } } = await supabase.auth.getSession()
        const r = await fetch('/api/send-team-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ ids: rest, subject: title, message }),
        }).catch(() => null)
        if (r && r.ok) {
          const o = await r.json().catch(() => ({}))
          out.emailed = o.sent?.length || 0; out.failed = (o.failed?.length || 0) + (o.noEmail?.length || 0)
        } else if (r && r.status === 501) {
          // Automatic email isn't set up: open one email to everyone left, addresses hidden in BCC.
          const bcc = members.filter(m => rest.includes(m.id) && m.email).map(m => m.email)
          out.mailApp = bcc.length
          window.location.href = `mailto:?bcc=${encodeURIComponent(bcc.join(','))}&subject=${encodeURIComponent(title || 'Message from your worship leader')}&body=${encodeURIComponent(message)}`
        } else out.failed = rest.length
      }
      setResult(out); setStep('done')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-black/75" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg max-h-[calc(100dvh-1.5rem)] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {step === 'write' && <button onClick={() => { setStep('who'); setError(null) }} className="btn-ghost p-1 rounded-lg" aria-label="Back"><ChevronLeft size={18} /></button>}
          <p className="font-semibold flex-1">{step === 'who' ? 'Message Team · Who?' : step === 'write' ? `Message ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}` : 'Message sent'}</p>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg" aria-label="Close"><X size={18} /></button>
        </div>

        {step === 'who' && (
          <>
            <div className="px-4 pt-3 space-y-2">
              <p className="text-xs text-muted">Filter by position, then choose who gets the message.</p>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setPosFilter(new Set())} aria-pressed={!posFilter.size}
                  className={`px-2.5 h-7 rounded-full border text-xs ${!posFilter.size ? 'border-accent bg-accent/15 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5]'}`}>Everyone</button>
                {usedPositions.map(p => (
                  <button key={p.id} onClick={() => togglePos(p.id)} aria-pressed={posFilter.has(p.id)}
                    className={`px-2.5 h-7 rounded-full border text-xs ${posFilter.has(p.id) ? 'border-accent bg-accent/15 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5]'}`}>{posLabel(p)}</button>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs">
                <button onClick={selectShown} disabled={!shownReachable.length} className="text-accent-light hover:underline disabled:opacity-40">{allShownPicked ? 'Clear these' : `Select ${posFilter.size ? 'these' : 'all'} (${shownReachable.length})`}</button>
                <span className="text-muted">{picked.size} selected</span>
              </div>
            </div>
            <ul className="overflow-y-auto px-2 py-2 mt-1 divide-y divide-border/50 border-t border-border">
              {!shown.length && <li className="text-sm text-muted text-center py-8">No team members in those positions.</li>}
              {shown.map(m => {
                const on = picked.has(m.id), ok = reachable(m)
                return (
                  <li key={m.id}>
                    <button onClick={() => ok && toggle(m.id)} disabled={!ok} aria-pressed={on}
                      className="w-full flex items-center gap-3 px-2 py-2 text-left disabled:opacity-50 hover:bg-[#1a1a1a] rounded-lg">
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-accent border-accent text-white' : 'border-[#666] text-transparent'}`}><Check size={13} strokeWidth={3} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{m.name}</span>
                        <span className="block text-[11px] text-muted truncate">{(positions.filter(p => m.position_ids?.includes(p.id)).map(posLabel)).join(', ') || 'No positions'}</span>
                      </span>
                      {!ok ? <span className="text-[11px] text-amber-300/80 shrink-0">No email</span>
                        : accounts?.[m.id] ? <span className="flex items-center gap-1 text-[11px] text-green-400 shrink-0"><BadgeCheck size={12} /> In app</span>
                        : <span className="flex items-center gap-1 text-[11px] text-muted shrink-0"><Mail size={11} /> By email</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="px-4 py-3 border-t border-border flex justify-end">
              <button onClick={() => setStep('write')} disabled={!picked.size} className="btn-primary text-sm disabled:opacity-50">Next</button>
            </div>
          </>
        )}

        {step === 'write' && (
          <div className="overflow-y-auto p-4 space-y-3">
            <p className="text-xs text-muted truncate">To: {recipients.map(m => m.name.split(' ')[0]).join(', ')}</p>
            {sets.length > 0 && (
              <select className="input !h-9 text-sm" value={setId} onChange={e => setSetId(e.target.value)} aria-label="About which set">
                <option value="">About a set… (optional)</option>
                {sets.map(s => <option key={s.id} value={s.id}>{s.name} · {formatSetDate(s.service_date)}</option>)}
              </select>
            )}
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map(([label, make]) => (
                <button key={label} onClick={() => setMessage(make(setLabel))}
                  className="px-2.5 h-7 rounded-full border border-border text-xs text-muted hover:text-[#f5f5f5] hover:border-[#555]">{label}</button>
              ))}
            </div>
            <input className="input !h-9 text-sm" placeholder="Subject (optional)" value={subject} maxLength={120} onChange={e => setSubject(e.target.value)} />
            <textarea className="input text-sm min-h-[8rem]" placeholder="Write your message…" value={message} maxLength={2000} autoFocus onChange={e => setMessage(e.target.value)} />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <span className="text-[11px] text-muted mr-auto">{message.length}/2000</span>
              <button onClick={send} disabled={busy || !message.trim()} className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
              </button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="p-4 space-y-3">
            <p className="flex items-center gap-2 text-sm text-green-400 font-medium"><Check size={16} /> Sent</p>
            <ul className="text-sm space-y-1">
              {result.inApp > 0 && <li>{result.inApp} {result.inApp === 1 ? 'person' : 'people'} will see it in the app.</li>}
              {result.emailed > 0 && <li>{result.emailed} emailed.</li>}
              {result.mailApp > 0 && <li>Opened an email in your mail app for {result.mailApp} {result.mailApp === 1 ? 'person' : 'people'} without the app. Send it from there.</li>}
              {result.failed > 0 && <li className="text-red-400">{result.failed} couldn’t be reached.</li>}
            </ul>
            <div className="flex justify-end"><button onClick={onClose} className="btn-primary text-sm">Done</button></div>
          </div>
        )}
      </div>
    </div>
  )
}
