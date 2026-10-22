import { useState } from 'react'
import { Church, Users, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useChurch } from '../contexts/ChurchContext'
import Logo from './Logo'

// First sign-in for someone who isn't part of a church yet: start one, or ask to be added.
export default function ChurchSetup() {
  const { user, signOut } = useAuth()
  const { refresh } = useChurch()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  const create = async e => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('create_church', { p_name: name.trim() })
    if (err) { setError('Could not create your church. Please try again.'); setSaving(false); return }
    await refresh()
  }

  const checkAgain = async () => { setChecking(true); await refresh(); setChecking(false) }

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-bg">
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center gap-3 justify-center">
          <Logo className="text-accent" size={30} />
          <span className="text-xl font-semibold tracking-tight">StaffList</span>
        </div>

        <form onSubmit={create} className="card space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-accent/20 text-accent-light flex items-center justify-center"><Church size={16} /></span>
            <h1 className="font-semibold">Start your church's StaffList</h1>
          </div>
          <p className="text-sm text-muted">For worship leaders: your song library, sets and team live in your church, so the people you schedule can open their sets and charts.</p>
          <label className="label !mb-1" htmlFor="church-name">Church name</label>
          <input id="church-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Grace Community Church" autoFocus />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={!name.trim() || saving} className="btn-primary w-full">{saving ? 'Creating…' : 'Create church'}</button>
        </form>

        <div className="card space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-accent/20 text-accent-light flex items-center justify-center"><Users size={16} /></span>
            <h2 className="font-semibold">Joining a worship team?</h2>
          </div>
          <p className="text-sm text-muted">
            Ask your worship leader to add <span className="text-primary">{user?.email}</span> to the team in StaffList.
            You'll see the sets you're scheduled on as soon as they do.
          </p>
          <button onClick={checkAgain} disabled={checking} className="btn-ghost text-sm border border-border rounded-lg w-full">{checking ? 'Checking…' : "I've been added — check again"}</button>
        </div>

        <button onClick={signOut} className="mx-auto flex items-center gap-1.5 text-xs text-muted hover:text-primary"><LogOut size={12} /> Sign out</button>
      </div>
    </div>
  )
}
