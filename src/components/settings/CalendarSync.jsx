import { useEffect, useState } from 'react'
import { CalendarDays, Copy, Check, RefreshCw, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const newToken = () => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')

export default function CalendarSync() {
  const { user } = useAuth()
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    supabase.from('calendar_tokens').select('token').eq('user_id', user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) setError('Calendar sync is not set up yet. Run the latest Supabase migration.')
        else setToken(data?.token || null)
      })
      .finally(() => setLoading(false))
  }, [user.id])

  const enabled = !!token
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const httpsUrl = token ? `${window.location.origin}/api/calendar/${token}.ics` : ''
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://')
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`

  const toggle = async () => {
    setBusy(true); setError(null)
    if (enabled) {
      const { error } = await supabase.from('calendar_tokens').delete().eq('user_id', user.id)
      if (error) setError('Could not turn off calendar sync.')
      else setToken(null)
    } else {
      const { data, error } = await supabase.from('calendar_tokens').insert({ user_id: user.id }).select('token').single()
      if (error) setError('Could not turn on calendar sync. Make sure the latest Supabase migration has been run.')
      else setToken(data.token)
    }
    setBusy(false)
  }

  const reset = async () => {
    if (!confirmReset) { setConfirmReset(true); return }
    setBusy(true); setError(null); setConfirmReset(false)
    const { data, error } = await supabase.from('calendar_tokens').update({ token: newToken() }).eq('user_id', user.id).select('token').single()
    if (error) setError('Could not reset the link.')
    else setToken(data.token)
    setBusy(false)
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(httpsUrl); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* ignore */ }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <CalendarDays size={18} className="text-accent-light shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">Calendar sync</p>
            <p className="text-xs text-muted">Show your sets (name, date, time, location) in Apple or Google Calendar.</p>
          </div>
        </div>
        <button onClick={toggle} disabled={loading || busy} aria-label="Toggle calendar sync" aria-pressed={enabled}
          className={`relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0 disabled:opacity-50 ${enabled ? 'bg-accent' : 'bg-stone-300'}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {enabled && (
        <div className="space-y-2.5 pt-1 border-t border-border">
          <p className="text-[11px] text-muted pt-2">Your private subscription link</p>
          <div className="flex gap-2">
            <input readOnly className="input !h-9 text-xs font-mono flex-1 min-w-0" value={httpsUrl} onFocus={e => e.target.select()} />
            <button onClick={copy} className="btn-secondary !h-9 !py-0 flex items-center gap-1.5 text-sm shrink-0">
              {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={webcalUrl} className="btn-primary !py-1.5 !px-3 text-sm flex items-center gap-1.5">
              <CalendarDays size={14} /> Add to Apple Calendar
            </a>
            <a href={googleUrl} target="_blank" rel="noreferrer" className="btn-secondary !py-1.5 !px-3 text-sm flex items-center gap-1.5">
              <ExternalLink size={13} /> Add to Google Calendar
            </a>
            <button onClick={reset} disabled={busy}
              className={`ml-auto flex items-center gap-1.5 text-xs px-2 ${confirmReset ? 'text-red-400' : 'text-muted hover:text-primary'}`}>
              <RefreshCw size={12} /> {confirmReset ? 'Click again — old link will stop working' : 'Reset link'}
            </button>
          </div>
          <ul className="text-[11px] text-muted space-y-1 list-disc pl-4">
            <li>Anyone with this link can see your set names, times and locations, so keep it private. Reset it any time to cut off old copies.</li>
            <li>It's read-only. Changes you make in PresentGO appear in your calendar after it next refreshes (Apple: within the hour; Google: can take several hours).</li>
            {isLocal && <li className="text-amber-400/90">You're on localhost, so this link won't work from Google or Apple. Open Settings on your deployed site to get a working link.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
