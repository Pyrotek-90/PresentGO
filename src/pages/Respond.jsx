import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Check, X, CalendarDays, MapPin, Music, Clock3 } from 'lucide-react'
import Logo from '../components/Logo'
import { supabase } from '../lib/supabase'
import { formatSetTime } from '../lib/sets'
import { extraTimes, timeText } from '../lib/setTimes'

// Public page reached from an invite email: shows the request and records Accept / Decline.
// The answer is only saved when the person taps a button here (links alone change nothing,
// so email scanners that open links can't answer for them).
export default function Respond() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const suggested = params.get('r') === 'declined' ? 'declined' : params.get('r') === 'accepted' ? 'accepted' : null
  const [invite, setInvite] = useState(null)
  const [state, setState] = useState('loading')   // loading | ready | saving | missing | error
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.rpc('invite_details', { p_token: token }).then(({ data, error }) => {
      if (error) { setState('error'); return }
      const row = Array.isArray(data) ? data[0] : data
      if (!row) { setState('missing'); return }
      setInvite(row); setState('ready')
    })
  }, [token])

  const answer = async response => {
    setState('saving'); setError(null)
    const { data, error } = await supabase.rpc('respond_invite', { p_token: token, p_response: response })
    if (error || !data) { setError('Could not save your answer. Please try again.'); setState('ready'); return }
    setInvite(i => ({ ...i, status: data })); setState('ready')
  }

  const dateText = invite?.service_date
    ? new Date(invite.service_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : ''
  const answered = invite && (invite.status === 'accepted' || invite.status === 'declined')
  const first = (invite?.member_name || '').split(/\s+/)[0]

  return (
    <div className="min-h-[100dvh] bg-black text-[#f5f5f5] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Logo className="text-accent" size={24} />
          <span className="font-semibold tracking-tight">StaffList</span>
        </div>

        {state === 'loading' && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>}
        {state === 'missing' && <p className="text-sm text-muted">This invitation link isn't valid any more. It may have been removed from the set. Please contact your worship leader.</p>}
        {state === 'error' && <p className="text-sm text-muted">We couldn't load this invitation right now. Please try again in a moment.</p>}

        {invite && (state === 'ready' || state === 'saving') && (
          <>
            <div className="space-y-1">
              <p className="text-lg font-semibold">Hi {first || 'there'},</p>
              <p className="text-sm text-muted">{invite.inviter_name} has asked you to serve on the worship team.</p>
            </div>
            <div className="rounded-xl border border-border p-4 space-y-2 text-sm">
              <p className="font-semibold text-base">{invite.set_name}</p>
              {dateText && <p className="flex items-center gap-2 text-muted"><CalendarDays size={14} />{dateText}{invite.service_time ? ` · ${formatSetTime(invite.service_time)}` : ''}</p>}
              {(invite.venue_name || invite.location_address) && <p className="flex items-center gap-2 text-muted"><MapPin size={14} />{[invite.venue_name, invite.location_address].filter(Boolean).join(', ')}</p>}
              {extraTimes(invite).map((t, i) => <p key={i} className="flex items-center gap-2 text-muted"><Clock3 size={14} />{t.label}: {timeText(t)}</p>)}
              <p className="flex items-center gap-2"><Music size={14} className="text-accent-light" />{invite.position_name}</p>
            </div>

            {answered && (
              <p className={`flex items-center gap-2 text-sm font-medium ${invite.status === 'accepted' ? 'text-green-400' : 'text-red-400'}`}>
                {invite.status === 'accepted' ? <Check size={16} /> : <X size={16} />}
                {invite.status === 'accepted' ? "You're in. Thank you!" : "You've declined. Thanks for letting us know."}
              </p>
            )}
            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="space-y-2">
              {!answered && <p className="text-sm">Can you make it?</p>}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => answer('accepted')} disabled={state === 'saving' || invite.status === 'accepted'}
                  className={`h-11 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${
                    suggested === 'accepted' && !answered ? 'bg-green-600 text-white ring-2 ring-green-400/60' : 'bg-green-600/90 text-white hover:bg-green-600'}`}>
                  <Check size={16} /> {answered && invite.status !== 'accepted' ? 'Accept instead' : 'Accept'}
                </button>
                <button onClick={() => answer('declined')} disabled={state === 'saving' || invite.status === 'declined'}
                  className={`h-11 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${
                    suggested === 'declined' && !answered ? 'bg-red-600 text-white ring-2 ring-red-400/60' : 'bg-red-600/90 text-white hover:bg-red-600'}`}>
                  <X size={16} /> {answered && invite.status !== 'declined' ? 'Decline instead' : 'Decline'}
                </button>
              </div>
              {answered && <p className="text-[11px] text-muted">Plans changed? You can change your answer here any time.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
