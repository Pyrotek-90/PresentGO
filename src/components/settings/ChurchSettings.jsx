import { useCallback, useEffect, useState } from 'react'
import { Church, Plus, Trash2, Check, X, UserPlus, ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useChurch } from '../../contexts/ChurchContext'

const PLAN_LABEL = { free: 'Free', pro: 'Pro', ultimate: 'Ultimate' }
const workspaceLimit = plan => (plan === 'ultimate' ? 5 : 1)

// Settings → Church. Admins rename the church, manage workspaces (Main Service, Youth, Kids…)
// and decide who is an Admin, who leads which workspace, and who is a Member.
export default function ChurchSettings() {
  const { user } = useAuth()
  const { legacy, church, isAdmin, refresh, unitLabel } = useChurch()
  if (legacy || !church) return null

  if (!isAdmin) {
    const leads = (church.workspaces || []).filter(w => w.lead).map(w => w.name)
    return (
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">{unitLabel}</h2>
        <div className="card flex items-start gap-3">
          <Church size={18} className="text-accent-light shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">{church.name}</p>
            <p className="text-muted">
              {leads.length ? `You lead ${leads.join(', ')}.` : 'You see the sets you’ve accepted, with their songs and charts.'}
              {' '}Your {unitLabel.toLowerCase()}'s admins manage {church.plan === 'ultimate' ? 'workspaces and ' : ''}roles.
            </p>
          </div>
        </div>
      </section>
    )
  }
  return <AdminChurch church={church} meId={user.id} refresh={refresh} unit={unitLabel} />
}

// Free / Pro: one Team (its single workspace stays out of sight). Ultimate: a Church with workspaces.
function AdminChurch({ church, meId, refresh, unit }) {
  const [name, setName] = useState(church.name)
  const [nameState, setNameState] = useState(null)
  const [people, setPeople] = useState(null)
  const [error, setError] = useState(null)
  const [newWs, setNewWs] = useState('')
  const [editing, setEditing] = useState(null)        // { id, name } workspace being renamed
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [email, setEmail] = useState('')
  const [addMsg, setAddMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const workspaces = church.workspaces || []
  const limit = workspaceLimit(church.plan)
  const multi = church.plan === 'ultimate'
  const u = unit.toLowerCase()

  const loadPeople = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('church_people', { p_church: church.id })
    if (err) setError(err.message); else setPeople(data || [])
  }, [church.id])
  useEffect(() => { setName(church.name); loadPeople() }, [church.id, church.name, loadPeople])

  const run = async (fn, fail = 'Something went wrong. Please try again.') => {
    setBusy(true); setError(null)
    try {
      const { error: err } = await fn()
      if (err) setError(/last_admin/.test(err.message) ? 'A church needs at least one Admin. Make someone else an Admin first.'
        : /workspace_limit/.test(err.message) ? `Your plan allows ${limit} workspace${limit > 1 ? 's' : ''}.` : fail)
    } finally { setBusy(false) }
    await Promise.all([refresh(), loadPeople()])
  }

  const saveName = async () => {
    if (!name.trim() || name.trim() === church.name) return
    setNameState('saving')
    const { error: err } = await supabase.from('churches').update({ name: name.trim() }).eq('id', church.id)
    setNameState(err ? 'error' : 'saved')
    if (!err) refresh()
  }

  const renameWs = () => {
    if (!editing?.name.trim()) return
    const { id, name: n } = editing
    run(() => supabase.from('workspaces').update({ name: n.trim() }).eq('id', id)).then(() => setEditing(null))
  }

  const addPerson = async e => {
    e.preventDefault()
    if (!email.trim()) return
    setAddMsg(null)
    const { data, error: err } = await supabase.rpc('add_church_person', { p_church: church.id, p_email: email.trim() })
    if (err) { setAddMsg({ bad: true, text: 'Could not add them. Please try again.' }); return }
    if (data === 'no_account') setAddMsg({ bad: true, text: "No StaffList account uses that email yet. Add them on the Team page with this email — they'll join your church when they sign up." })
    else { setAddMsg({ text: data === 'already' ? `Already in your ${u}.` : 'Added as a Member.' }); setEmail(''); loadPeople() }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">{unit}</h2>

      <div className="card space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label className="label !mb-1" htmlFor="church-name-setting">{unit} name</label>
            <input id="church-name-setting" className="input" value={name}
              onChange={e => { setName(e.target.value); setNameState(null) }}
              onBlur={saveName} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
          </div>
          <span className="text-xs text-muted pb-2.5 shrink-0 w-12">{nameState === 'saving' ? 'Saving…' : nameState === 'saved' ? 'Saved' : nameState === 'error' ? 'Error' : ''}</span>
        </div>
        <p className="text-xs text-muted">Plan: <span className="text-primary font-medium">{PLAN_LABEL[church.plan] || church.plan}</span> · {multi ? `up to ${limit} workspaces` : 'one team. Ultimate turns it into a church with up to 5 teams (Youth, Kids, Women\u2019s Fellowship…), each with its own leaders.'}</p>

        {/* Workspaces (Ultimate) */}
        {multi && <div className="space-y-2">
          <p className="text-sm font-medium">Workspaces</p>
          <p className="text-xs text-muted">Each ministry gets its own sets and schedule, with its own leaders. Songs, team and content are shared across the church.</p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {workspaces.map(w => (
              <li key={w.id} className="flex items-center gap-2 px-3 py-2">
                {editing?.id === w.id ? (
                  <>
                    <input className="input !h-8 !py-0 text-sm flex-1" value={editing.name} autoFocus
                      onChange={e => setEditing({ ...editing, name: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') renameWs(); if (e.key === 'Escape') setEditing(null) }} aria-label="Workspace name" />
                    <button className="p-1.5 rounded-lg text-accent-light hover:bg-surface" aria-label="Save name" disabled={busy || !editing.name.trim()}
                      onClick={renameWs}><Check size={15} /></button>
                    <button className="p-1.5 rounded-lg text-muted hover:bg-surface" aria-label="Cancel" onClick={() => setEditing(null)}><X size={15} /></button>
                  </>
                ) : (
                  <>
                    <button className="flex-1 min-w-0 text-left text-sm truncate hover:text-accent-light" title="Rename" onClick={() => setEditing({ id: w.id, name: w.name })}>{w.name}</button>
                    {workspaces.length > 1 && (confirmDelete === w.id ? (
                      <button className="h-7 px-2.5 rounded-md bg-red-700 text-white text-xs font-medium" disabled={busy}
                        onClick={() => run(() => supabase.from('workspaces').delete().eq('id', w.id)).then(() => setConfirmDelete(null))}>
                        Delete with its sets
                      </button>
                    ) : (
                      <button className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-surface" aria-label={`Delete ${w.name}`} onClick={() => setConfirmDelete(w.id)}><Trash2 size={14} /></button>
                    ))}
                  </>
                )}
              </li>
            ))}
          </ul>
          {workspaces.length < limit ? (
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (newWs.trim()) run(() => supabase.rpc('add_workspace', { p_church: church.id, p_name: newWs.trim() })).then(() => setNewWs('')) }}>
              <input className="input !h-9 text-sm flex-1" placeholder="e.g. Youth Service" value={newWs} onChange={e => setNewWs(e.target.value)} aria-label="New workspace name" />
              <button type="submit" disabled={!newWs.trim() || busy} className="btn-primary !h-9 !py-0 text-sm flex items-center gap-1"><Plus size={14} /> Add</button>
            </form>
          ) : (
            <p className="text-xs text-muted">You're using all {limit} workspaces.</p>
          )}
        </div>}

        {/* People and roles */}
        <div className="space-y-2">
          <p className="text-sm font-medium">People and roles</p>
          <ul className="text-xs text-muted space-y-0.5">
            <li><span className="text-primary font-medium">Admin</span> — the whole {u}: {multi ? 'every workspace, ' : 'sets, '}songs, people and these settings.</li>
            <li><span className="text-primary font-medium">Leader</span> — {multi ? 'tick the workspaces they lead: they build those sets' : 'they build sets'}, schedule the team and edit songs.</li>
            <li><span className="text-primary font-medium">Member</span> — musicians and singers: they see the sets they've accepted, with charts and lyrics.</li>
          </ul>
          <p className="text-xs text-muted">People you invite on the Team page join as Members once they accept the invitation.</p>

          {people === null ? (
            <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {people.map(p => (
                <li key={p.user_id} className="px-3 py-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}{p.user_id === meId && <span className="text-muted font-normal"> (you)</span>}</p>
                      <p className="text-xs text-muted truncate">{p.email}</p>
                    </div>
                    <select className="input !w-auto !h-8 !py-0 text-sm" value={p.role} disabled={busy} aria-label={`Role for ${p.name}`}
                      onChange={e => run(() => supabase.rpc('set_church_role', { p_church: church.id, p_user: p.user_id, p_role: e.target.value }))}>
                      <option value="admin">Admin</option>
                      <option value="member">{p.leads.length ? 'Leader' : 'Member'}</option>
                    </select>
                    {p.user_id !== meId && (
                      <button className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-surface" aria-label={`Remove ${p.name}`} title={`Remove from ${u}`} disabled={busy}
                        onClick={() => run(() => supabase.rpc('remove_church_person', { p_church: church.id, p_user: p.user_id }))}><X size={14} /></button>
                    )}
                  </div>
                  {p.role === 'admin' ? (
                    <p className="text-xs text-muted flex items-center gap-1"><ShieldCheck size={12} className="text-accent-light" /> {multi ? 'Leads every workspace' : 'Runs the team'}</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted">{multi ? 'Leads:' : 'Leader:'}</span>
                      {workspaces.map(w => {
                        const on = p.leads.includes(w.id)
                        return (
                          <button key={w.id} disabled={busy} aria-pressed={on}
                            onClick={() => run(() => supabase.rpc('set_workspace_leader', { p_workspace: w.id, p_user: p.user_id, p_on: !on }))}
                            className={`h-7 px-2.5 rounded-full border text-xs font-medium transition-colors ${on ? 'border-accent bg-accent/20 text-accent-light' : 'border-border text-muted hover:text-primary'}`}>
                            {on && <Check size={11} className="inline -mt-0.5 mr-1" />}{multi ? w.name : on ? 'Leads the team' : 'Make leader'}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={addPerson} className="flex gap-2">
            <input type="email" className="input !h-9 text-sm flex-1" placeholder="Add someone by email" value={email} onChange={e => { setEmail(e.target.value); setAddMsg(null) }} aria-label="Email to add" />
            <button type="submit" disabled={!email.trim()} className="btn-ghost !h-9 text-sm border border-border rounded-lg flex items-center gap-1.5"><UserPlus size={14} /> Add</button>
          </form>
          {addMsg && <p className={`text-xs ${addMsg.bad ? 'text-amber-300' : 'text-accent-light'}`}>{addMsg.text}</p>}
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    </section>
  )
}
