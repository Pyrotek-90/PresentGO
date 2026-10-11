import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Pencil, Trash2, Mail, Phone, X, Check, Contact, UserPlus, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import { posLabel, sortPositions, drumAltOf, ensureStandardPositions } from '../lib/positions'
import { parseVCards, saveVCard, canPickContacts, pickContact } from '../lib/vcard'
const EMPTY = { id: null, name: '', email: '', phone: '', position_ids: [] }

export default function Team() {
  const { user } = useAuth()
  const [members, setMembers] = useState([])
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [query, setQuery] = useState('')
  const [filterPos, setFilterPos] = useState('')
  const [form, setForm] = useState(null) // member being added/edited
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [importNote, setImportNote] = useState(null)
  const vcfInput = useRef(null)

  useEffect(() => {
    Promise.all([
      supabase.from('team_members').select('*').eq('user_id', user.id).order('name'),
      supabase.from('positions').select('*').eq('user_id', user.id).order('created_at'),
    ]).then(async ([m, p]) => {
      if (m.error || p.error) setLoadError('Team features are not set up yet. Run the latest Supabase migration.')
      setMembers(m.data || [])
      const list = p.error ? [] : await ensureStandardPositions(supabase, user, p.data || [])
      setPositions(sortPositions(list))
    }).catch(() => setLoadError('Could not load team data.')).finally(() => setLoading(false))
  }, [user.id])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return members
      .filter(m => !q || m.name.toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q))
      .filter(m => !filterPos || m.position_ids?.includes(filterPos))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [members, query, filterPos])

  const togglePos = id => setForm(f => ({
    ...f, position_ids: f.position_ids.includes(id) ? f.position_ids.filter(x => x !== id) : [...f.position_ids, id],
  }))

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true); setError(null)
    const payload = { user_id: user.id, name: form.name.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null, position_ids: form.position_ids }
    const { data, error } = form.id
      ? await supabase.from('team_members').update(payload).eq('id', form.id).select().single()
      : await supabase.from('team_members').insert(payload).select().single()
    setSaving(false)
    if (error) { setError('Could not save. Make sure the latest Supabase migration has been run.'); return }
    setMembers(prev => form.id ? prev.map(m => m.id === data.id ? data : m) : [...prev, data])
    setForm(null)
  }

  // Fills the form from a phone contact: the contact picker where the browser has one
  // (Android), otherwise a contact card (.vcf) file — e.g. iPhone: Contacts > Share Contact > Save to Files.
  const fillFromContact = c => {
    if (!c) return
    setForm(f => ({ ...f, name: c.name || f.name, email: c.email || f.email, phone: c.phone || f.phone }))
    setImportNote(null)
  }
  const importContact = async () => {
    setImportNote(null)
    if (canPickContacts()) {
      try { fillFromContact(await pickContact()); return } catch { /* fall back to a file */ }
    }
    vcfInput.current?.click()
  }
  const onVcf = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const [c] = parseVCards(await file.text())
    if (c) fillFromContact(c)
    else setImportNote("That file doesn't contain a contact card.")
  }
  const memberNote = m => {
    const names = positions.filter(p => m.position_ids?.includes(p.id)).map(p => p.name)
    return names.length ? `Worship team: ${names.join(', ')}` : 'Worship team'
  }

  const remove = async m => {
    if (deleting !== m.id) { setDeleting(m.id); return }
    await supabase.from('team_members').delete().eq('id', m.id)
    setMembers(prev => prev.filter(x => x.id !== m.id))
    setDeleting(null)
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-3">
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border">
            <div className="flex items-baseline gap-2">
              <h1 className="font-semibold">Manage Team</h1>
              <span className="text-xs text-muted">{members.length}</span>
            </div>
            <button onClick={() => { setForm({ ...EMPTY }); setError(null) }} className="btn-primary flex items-center gap-1.5 !py-1 !px-3 text-sm">
              <UserPlus size={14} /> Add Member
            </button>
          </div>

          {loadError && <p className="px-3 py-2 text-red-400 text-xs">{loadError}</p>}

          {form && (
            <div className="px-4 py-4 border-b border-border space-y-4 bg-[#161616]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{form.id ? 'Edit team member' : 'Add team member'}</h2>
                <div className="flex items-center gap-1">
                  {form.id && (
                    <button type="button" onClick={() => saveVCard({ ...form, note: memberNote(form) })}
                      className="btn-ghost flex items-center gap-1.5 !py-1 !px-2.5 text-xs" title="Save this person to your phone's contacts">
                      <Download size={13} /> Save to Contacts
                    </button>
                  )}
                  <button type="button" onClick={importContact}
                    className="btn-ghost flex items-center gap-1.5 !py-1 !px-2.5 text-xs" title="Fill in from a phone contact">
                    <Contact size={13} /> Import from Contacts
                  </button>
                  <input ref={vcfInput} type="file" accept=".vcf,text/vcard,text/x-vcard" className="hidden" onChange={onVcf} />
                </div>
              </div>
              {importNote && <p className="text-xs text-amber-300">{importNote}</p>}
              {!canPickContacts() && !form.name && !form.id && (
                <p className="text-[11px] text-muted -mt-2">On iPhone, choose a contact card file: in Contacts open the person → Share Contact → Save to Files.</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem] gap-3">
                <label className="sm:col-span-2 block">
                  <span className="label !mb-1">Name</span>
                  <input className="input !h-10" placeholder="Full name" autoFocus value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="label !mb-1">Email</span>
                  <input className="input !h-10" type="email" placeholder="name@example.com" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="label !mb-1">Phone</span>
                  <input className="input !h-10" type="tel" placeholder="(555) 555-5555" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </label>
              </div>

              <div>
                <span className="label !mb-1.5">Positions</span>
                {positions.length === 0 ? (
                  <p className="text-xs text-muted">No positions yet. Create them on the <Link to="/calendar" className="text-accent-light underline">Calendar</Link> page.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {positions.map(p => {
                      const on = form.position_ids.includes(p.id)
                      return (
                        <button key={p.id} type="button" onClick={() => togglePos(p.id)} aria-pressed={on}
                          title={drumAltOf(p) ? `Alternative to ${drumAltOf(p)}` : undefined}
                          className={`flex items-center gap-1 px-3 h-8 rounded-full border text-xs font-medium transition-colors ${
                            on ? 'border-accent bg-accent/20 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5] hover:border-accent/40'
                          }`}>
                          {on && <Check size={12} />}{posLabel(p)}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={save} disabled={saving || !form.name.trim()} className="btn-primary !py-2 !px-5 text-sm">{saving ? 'Saving…' : form.id ? 'Save changes' : 'Add member'}</button>
                <button onClick={() => { setForm(null); setImportNote(null) }} className="btn-ghost text-sm">Cancel</button>
              </div>
            </div>
          )}

          <div className="px-3 py-2 border-b border-border flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[10rem]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input !pl-9 !h-8 text-sm" placeholder="Search name or email…" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
            <select className="input !h-8 !py-0 !px-2 text-sm !w-auto max-w-[14rem]" value={filterPos} onChange={e => setFilterPos(e.target.value)}>
              <option value="">All positions</option>
              {positions.map(p => <option key={p.id} value={p.id}>{posLabel(p)}</option>)}
            </select>
            {filterPos && <button onClick={() => setFilterPos('')} className="text-xs text-muted hover:text-[#f5f5f5] flex items-center gap-0.5"><X size={10} /> Clear</button>}
          </div>

          <div className="px-2 py-1">
            {loading ? (
              <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-muted text-sm text-center py-8">{members.length === 0 ? 'No team members yet. Add your first one.' : 'No members match your search.'}</p>
            ) : (
              <ul>
                {filtered.map(m => {
                  const mine = positions.filter(p => m.position_ids?.includes(p.id))
                  return (
                    <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 rounded-lg hover:bg-[#1a1a1a] group">
                      <span className="text-sm font-medium w-40 truncate">{m.name}</span>
                      <span className="flex-1 min-w-[8rem] flex flex-wrap gap-1">
                        {mine.map(p => <span key={p.id} className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted">{posLabel(p)}</span>)}
                      </span>
                      <span className="flex items-center gap-3 text-xs text-muted">
                        {m.email && <a href={`mailto:${m.email}`} className="flex items-center gap-1 hover:text-accent-light"><Mail size={11} />{m.email}</a>}
                        {m.phone && <a href={`tel:${m.phone}`} className="flex items-center gap-1 hover:text-accent-light"><Phone size={11} />{m.phone}</a>}
                      </span>
                      <span className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setForm({ id: m.id, name: m.name, email: m.email || '', phone: m.phone || '', position_ids: m.position_ids || [] }); setError(null) }}
                          className="p-1.5 rounded-lg hover:bg-[#2e2e2e] text-muted hover:text-[#f5f5f5]" title="Edit"><Pencil size={13} /></button>
                        <button onClick={() => saveVCard({ name: m.name, email: m.email, phone: m.phone, note: memberNote(m) })}
                          className="p-1.5 rounded-lg hover:bg-[#2e2e2e] text-muted hover:text-[#f5f5f5]" title="Save to phone contacts" aria-label="Save to phone contacts"><Download size={13} /></button>
                        <button onClick={() => remove(m)} title={deleting === m.id ? 'Click again to confirm delete' : 'Delete'}
                          className={`p-1.5 rounded-lg transition-colors ${deleting === m.id ? 'bg-red-700 text-white' : 'hover:bg-[#2e2e2e] text-muted hover:text-red-400'}`}><Trash2 size={13} /></button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </Layout>
  )
}
