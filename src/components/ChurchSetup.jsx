import { useEffect, useState } from 'react'
import { Church, Users, LogOut, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useChurch } from '../contexts/ChurchContext'
import Wordmark from './Wordmark'

// First sign-in for someone who isn't on a team yet: answer a team invitation, start a team,
// or ask to be added.
export default function ChurchSetup() {
  const { user, signOut } = useAuth()
  const { refresh } = useChurch()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [invites, setInvites] = useState([])
  const [busy, setBusy] = useState(null)

  const loadInvites = () => supabase.rpc('my_team_invites').then(({ data }) => setInvites(Array.isArray(data) ? data : [])).catch(() => {})
  useEffect(() => { loadInvites() }, [])
  const answer = async (inv, response) => {
    setBusy(inv.member_id); setError('')
    const { data, error: err } = await supabase.rpc('respond_team_member', { p_member: inv.member_id, p_response: response })
    setBusy(null)
    if (err || !data) { setError('Could not save your answer. Please try again.'); return }
    if (data === 'accepted') await refresh()
    else setInvites(list => list.filter(x => x.member_id !== inv.member_id))
  }

  const create = async e => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('create_church', { p_name: name.trim() })
    if (err) { setError('Could not create your team. Please try again.'); setSaving(false); return }
    await refresh()
  }

  const checkAgain = async () => { setChecking(true); await Promise.all([refresh(), loadInvites()]); setChecking(false) }

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-bg">
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center gap-3 justify-center">
          <Wordmark className="text-[28px] text-primary" />
        </div>

        {invites.map(inv => (
          <div key={inv.member_id} className="card space-y-3 border-accent/50">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-accent/20 text-accent-light flex items-center justify-center"><Users size={16} /></span>
              <h2 className="font-semibold">{inv.inviter || 'A worship leader'} invited you to join {inv.team}</h2>
            </div>
            {(inv.details?.church_name || inv.details?.location) && <p className="text-sm text-muted">{[inv.details.church_name, inv.details.location].filter(Boolean).join(' · ')}</p>}
            {inv.details?.welcome && <p className="text-sm whitespace-pre-line">{inv.details.welcome}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => answer(inv, 'accepted')} disabled={busy === inv.member_id} className="btn-primary flex items-center justify-center gap-1.5"><Check size={15} /> Join the team</button>
              <button onClick={() => answer(inv, 'declined')} disabled={busy === inv.member_id} className="btn-ghost border border-border rounded-lg flex items-center justify-center gap-1.5 text-sm"><X size={15} /> No thanks</button>
            </div>
          </div>
        ))}

        <form onSubmit={create} className="card space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-accent/20 text-accent-light flex items-center justify-center"><Church size={16} /></span>
            <h1 className="font-semibold">{invites.length ? 'Or start your own team' : 'Start your team'}</h1>
          </div>
          <p className="text-sm text-muted">For worship leaders: your song library, sets and team live together, so the people you schedule can open their sets and charts.</p>
          <label className="label !mb-1" htmlFor="church-name">Team name</label>
          <input id="church-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Grace Worship Team" autoFocus={!invites.length} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={!name.trim() || saving} className="btn-primary w-full">{saving ? 'Creating…' : 'Create team'}</button>
        </form>

        <div className="card space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-accent/20 text-accent-light flex items-center justify-center"><Users size={16} /></span>
            <h2 className="font-semibold">Joining a worship team?</h2>
          </div>
          <p className="text-sm text-muted">
            Ask your worship leader to invite <span className="text-primary">{user?.email}</span> to the team in StaffList.
            Their invitation email has a Join button, and it shows up here too.
          </p>
          <button onClick={checkAgain} disabled={checking} className="btn-ghost text-sm border border-border rounded-lg w-full">{checking ? 'Checking…' : "I've been invited — check again"}</button>
        </div>

        <button onClick={signOut} className="mx-auto flex items-center gap-1.5 text-xs text-muted hover:text-primary"><LogOut size={12} /> Sign out</button>
      </div>
    </div>
  )
}
