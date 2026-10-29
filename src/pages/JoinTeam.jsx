import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { Check, X, CalendarDays, MapPin, Music, Users, Phone, Clock3, Church } from 'lucide-react'
import Wordmark from '../components/Wordmark'
import { supabase } from '../lib/supabase'
import { formatSetTime } from '../lib/sets'
import { extraTimes, timeText } from '../lib/setTimes'

const dateText = d => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '')

// Public page from the "join the team" email. Shows the team's details and records the answer
// (only when a button is tapped, so email scanners opening the link can't answer). After
// joining, the set requests that were waiting can be answered right here.
export default function JoinTeam() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const suggested = params.get('r') === 'declined' ? 'declined' : params.get('r') === 'accepted' ? 'accepted' : null
  const [invite, setInvite] = useState(null)
  const [state, setState] = useState('loading')   // loading | ready | saving | missing | error
  const [error, setError] = useState(null)
  const [busyReq, setBusyReq] = useState(null)

  useEffect(() => {
    supabase.rpc('team_invite_details', { p_token: token }).then(({ data, error: err }) => {
      if (err) { setState('error'); return }
      if (!data) { setState('missing'); return }
      setInvite(data); setState('ready')
    })
  }, [token])

  const answer = async response => {
    setState('saving'); setError(null)
    const { data, error: err } = await supabase.rpc('respond_team_invite', { p_token: token, p_response: response })
    if (err || !data) { setError('Could not save your answer. Please try again.'); setState('ready'); return }
    setInvite(i => ({ ...i, status: data })); setState('ready')
  }

  const answerSet = async (req, response) => {
    setBusyReq(req.token); setError(null)
    const { data, error: err } = await supabase.rpc('respond_invite', { p_token: req.token, p_response: response })
    setBusyReq(null)
    if (err || !data) { setError('Could not save your answer. Please try again.'); return }
    setInvite(i => ({ ...i, requests: i.requests.map(r => (r.token === req.token ? { ...r, status: data } : r)) }))
  }

  const d = invite?.details || {}
  const first = (invite?.member_name || '').split(/\s+/)[0]
  const joined = invite?.status === 'accepted'
  const declined = invite?.status === 'declined'
  const requests = invite?.requests || []
  const contact = [d.contact_name || invite?.inviter, d.contact_phone, d.contact_email].filter(Boolean).join(' · ')

  return (
    <div className="min-h-[100dvh] bg-black text-[#f5f5f5] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Wordmark className="text-[22px]" />
        </div>

        {state === 'loading' && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>}
        {state === 'missing' && <p className="text-sm text-muted">This invitation link isn't valid any more. Please contact your worship leader.</p>}
        {state === 'error' && <p className="text-sm text-muted">We couldn't load this invitation right now. Please try again in a moment.</p>}

        {invite && (state === 'ready' || state === 'saving') && (
          <>
            <div className="space-y-1">
              <p className="text-lg font-semibold">Hi {first || 'there'},</p>
              <p className="text-sm text-muted">{invite.inviter || 'Your worship leader'} has invited you to join the team.</p>
            </div>

            <div className="rounded-xl border border-border p-4 space-y-2 text-sm">
              <p className="font-semibold text-base flex items-center gap-2"><Users size={16} className="text-accent-light" />{invite.team}</p>
              {d.church_name && <p className="flex items-center gap-2 text-muted"><Church size={14} />{d.church_name}</p>}
              {d.location && <p className="flex items-center gap-2 text-muted"><MapPin size={14} />{d.location}</p>}
              {contact && <p className="flex items-center gap-2 text-muted"><Phone size={14} />{contact}</p>}
              {d.welcome && <p className="pt-1 whitespace-pre-line">{d.welcome}</p>}
            </div>

            {joined && <p className="flex items-center gap-2 text-sm font-medium text-green-400"><Check size={16} /> You've joined {invite.team}. Welcome!</p>}
            {declined && <p className="flex items-center gap-2 text-sm font-medium text-red-400"><X size={16} /> You've declined. Thanks for letting us know.</p>}
            {error && <p className="text-red-400 text-xs">{error}</p>}

            {!joined && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => answer('accepted')} disabled={state === 'saving'}
                  className={`h-11 rounded-lg font-semibold flex items-center justify-center gap-1.5 bg-accent text-white hover:bg-accent-hover disabled:opacity-50 ${suggested === 'accepted' ? 'ring-2 ring-accent-light/60' : ''}`}>
                  <Check size={16} /> {declined ? 'Join after all' : 'Join the team'}
                </button>
                <button onClick={() => answer('declined')} disabled={state === 'saving' || declined}
                  className={`h-11 rounded-lg font-semibold flex items-center justify-center gap-1.5 border border-border text-muted hover:text-[#f5f5f5] disabled:opacity-50 ${suggested === 'declined' && !declined ? 'ring-2 ring-red-400/50' : ''}`}>
                  <X size={16} /> No thanks
                </button>
              </div>
            )}

            {joined && requests.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">You've been asked to serve:</p>
                <ul className="space-y-2">
                  {requests.map(r => {
                    const done = r.status === 'accepted' || r.status === 'declined'
                    return (
                      <li key={r.token} className="rounded-xl border border-border p-3 space-y-2 text-sm">
                        <p className="font-semibold">{r.set_name}</p>
                        {r.service_date && <p className="flex items-center gap-2 text-muted"><CalendarDays size={14} />{dateText(r.service_date)}{r.service_time ? ` · ${formatSetTime(r.service_time)}` : ''}</p>}
                        {(r.venue_name || r.location_address) && <p className="flex items-center gap-2 text-muted"><MapPin size={14} />{[r.venue_name, r.location_address].filter(Boolean).join(', ')}</p>}
                        {extraTimes(r).map((t, i) => <p key={i} className="flex items-center gap-2 text-muted"><Clock3 size={14} />{t.label}: {timeText(t)}</p>)}
                        {r.position && <p className="flex items-center gap-2"><Music size={14} className="text-accent-light" />{r.position}</p>}
                        {done && <p className={`text-xs font-medium ${r.status === 'accepted' ? 'text-green-400' : 'text-red-400'}`}>{r.status === 'accepted' ? "You're in. Thank you!" : 'You declined this one.'}</p>}
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => answerSet(r, 'accepted')} disabled={busyReq === r.token || r.status === 'accepted'}
                            className="h-9 rounded-lg bg-green-600/90 text-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-green-600 disabled:opacity-40"><Check size={14} /> {done && r.status !== 'accepted' ? 'Accept instead' : 'Accept'}</button>
                          <button onClick={() => answerSet(r, 'declined')} disabled={busyReq === r.token || r.status === 'declined'}
                            className="h-9 rounded-lg border border-red-500/60 text-red-400 text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-red-500/10 disabled:opacity-40"><X size={14} /> {done && r.status !== 'declined' ? 'Decline instead' : 'Decline'}</button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {joined && (
              <div className="rounded-xl bg-accent/10 border border-accent/30 p-3 text-sm space-y-2">
                <p>See your sets, chord charts and lyrics in StaffList. Sign in (or create an account) with the email this invitation was sent to.</p>
                <Link to="/" className="btn-primary inline-flex items-center gap-1.5 text-sm !py-1.5">Open StaffList</Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
