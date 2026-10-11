import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Mail, Phone, X, Check, Contact, UserPlus, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import SwipeToDelete from '../components/common/SwipeToDelete'
import { posLabel, sortPositions, ensureStandardPositions } from '../lib/positions'
import { formatPhone, formatPhoneTyping, telHref } from '../lib/phone'
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
  const [contactHelp, setContactHelp] = useState(false)
  const [newPos, setNewPos] = useState(null)
  const [swipedId, setSwipedId] = useState(null)   // member row swiped open on a phone

  useEffect(() => {
    if (!swipedId) return
    const close = e => { if (!e.target.closest('[data-swiped-row]')) setSwipedId(null) }
    document.addEventListener('touchstart', close, { passive: true })
    return () => document.removeEventListener('touchstart', close)
  }, [swipedId])
  const removeNow = async m => {
    setSwipedId(null)
    await supabase.from('team_members').delete().eq('id', m.id)
    setMembers(prev => prev.filter(x => x.id !== m.id))
  }   // text of a position being added from the form, or null   // shown where the browser can't open the contact list
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

  // "+ Add" bubble: creates a new position and selects it for this person.
  const addPosition = async () => {
    const name = (newPos || '').trim()
    if (!name) { setNewPos(null); return }
    const existing = positions.find(p => p.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      setForm(f => (f.position_ids.includes(existing.id) ? f : { ...f, position_ids: [...f.position_ids, existing.id] }))
      setNewPos(null); return
    }
    const { data, error } = await supabase.from('positions').insert({ user_id: user.id, name, category: 'Other', level: null }).select().single()
    if (error) { setError('Could not add that position.'); return }
    setPositions(prev => sortPositions([...prev, data]))
    setForm(f => ({ ...f, position_ids: [...f.position_ids, data.id] }))
    setNewPos(null)
  }

  const togglePos = id => setForm(f => ({
    ...f, position_ids: f.position_ids.includes(id) ? f.position_ids.filter(x => x !== id) : [...f.position_ids, id],
  }))

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true); setError(null)
    const payload = { user_id: user.id, name: form.name.trim(), email: form.email.trim() || null, phone: formatPhone(form.phone) || null, position_ids: form.position_ids }
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
    setForm(f => ({ ...f, name: c.name || f.name, email: c.email || f.email, phone: c.phone ? formatPhone(c.phone) : f.phone }))
    setImportNote(null); setContactHelp(false)
  }
  const importContact = async () => {
    setImportNote(null)
    if (canPickContacts()) {
      try { fillFromContact(await pickContact()); return } catch { /* picker closed or failed: show the other options */ }
    }
    setContactHelp(v => !v)
  }
  const isApple = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document
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
              {contactHelp && (
                <div className="rounded-lg border border-border bg-card p-3 space-y-2 text-xs text-muted">
                  <p className="text-primary font-medium">This browser can't open your contacts list yet.</p>
                  {isApple ? (
                    <p><span className="text-primary">To pick straight from Contacts:</span> open the iPhone <b>Settings</b> app → <b>Apps</b> → <b>Safari</b> → <b>Advanced</b> → <b>Feature Flags</b> and turn on <b>Contact Picker API</b>. Then reopen PresentGO and tap Import from Contacts again.</p>
                  ) : (
                    <p>Picking straight from contacts works in Chrome on Android.</p>
                  )}
                  <p><span className="text-primary">Or use a contact card:</span> in Contacts open the person → <b>Share Contact</b> → <b>Save to Files</b>, then choose it here.</p>
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => vcfInput.current?.click()} className="btn-ghost !py-1 !px-2.5 text-xs border border-border">Choose contact card…</button>
                    <button type="button" onClick={() => setContactHelp(false)} className="btn-ghost !py-1 !px-2.5 text-xs">Close</button>
                  </div>
                </div>
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
                  <input className="input !h-10" type="tel" inputMode="tel" placeholder="555.555.5555" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: formatPhoneTyping(e.target.value) }))}
                    onBlur={() => setForm(f => ({ ...f, phone: formatPhone(f.phone) }))} />
                </label>
              </div>

              <div>
                <span className="label !mb-1.5">Positions</span>
                {(
                  <div className="flex flex-wrap gap-1">
                    {positions.map(p => {
                      const on = form.position_ids.includes(p.id)
                      return (
                        <button key={p.id} type="button" onClick={() => togglePos(p.id)} aria-pressed={on}
                          className={`flex items-center gap-1 px-2.5 h-7 rounded-full border text-xs font-medium transition-colors ${
                            on ? 'border-accent bg-accent/20 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5] hover:border-accent/40'
                          }`}>
                          {on && <Check size={12} />}{posLabel(p)}
                        </button>
                      )
                    })}
                    {newPos === null ? (
                      <button type="button" onClick={() => setNewPos('')}
                        className="flex items-center gap-1 px-2.5 h-7 rounded-full border border-dashed border-accent/50 text-xs font-medium text-accent-light hover:bg-accent/10 transition-colors">
                        <Plus size={12} /> Add
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full border border-accent bg-accent/10">
                        <input autoFocus className="bg-transparent outline-none text-xs w-28 text-primary placeholder:text-muted" placeholder="New position"
                          value={newPos} onChange={e => setNewPos(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPosition() } if (e.key === 'Escape') setNewPos(null) }}
                          onBlur={() => { if (!newPos.trim()) setNewPos(null) }} />
                        <button type="button" onMouseDown={e => e.preventDefault()} onClick={addPosition} disabled={!newPos.trim()}
                          className="w-5 h-5 rounded-full flex items-center justify-center text-accent-light hover:bg-accent/20 disabled:opacity-40" aria-label="Add position"><Check size={12} /></button>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={save} disabled={saving || !form.name.trim()} className="btn-primary !py-2 !px-5 text-sm">{saving ? 'Saving…' : form.id ? 'Save changes' : 'Add member'}</button>
                <button onClick={() => { setForm(null); setImportNote(null); setContactHelp(false); setNewPos(null) }} className="btn-ghost text-sm">Cancel</button>
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
                    <SwipeToDelete key={m.id} open={swipedId === m.id} onOpenChange={o => setSwipedId(o ? m.id : null)}
                      onDelete={() => removeNow(m)} label={`Delete ${m.name}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 hover:bg-[#1a1a1a] group">
                      <span className="text-sm font-medium w-40 truncate">{m.name}</span>
                      <span className="flex-1 min-w-[8rem] flex flex-wrap gap-0.5">
                        {mine.map(p => <span key={p.id} className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted">{posLabel(p)}</span>)}
                      </span>
                      <span className="flex items-center gap-3 text-xs text-muted">
                        {m.email && <a href={`mailto:${m.email}`} className="flex items-center gap-1 hover:text-accent-light"><Mail size={11} />{m.email}</a>}
                        {m.phone && <a href={telHref(m.phone)} className="flex items-center gap-1 hover:text-accent-light"><Phone size={11} />{formatPhone(m.phone)}</a>}
                      </span>
                      <span className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setForm({ id: m.id, name: m.name, email: m.email || '', phone: formatPhone(m.phone) || '', position_ids: m.position_ids || [] }); setError(null) }}
                          className="p-1.5 rounded-lg hover:bg-[#2e2e2e] text-muted hover:text-[#f5f5f5]" title="Edit"><Pencil size={13} /></button>
                        <button onClick={() => saveVCard({ name: m.name, email: m.email, phone: formatPhone(m.phone), note: memberNote(m) })}
                          className="p-1.5 rounded-lg hover:bg-[#2e2e2e] text-muted hover:text-[#f5f5f5]" title="Save to phone contacts" aria-label="Save to phone contacts"><Download size={13} /></button>
                        <button onClick={() => remove(m)} title={deleting === m.id ? 'Click again to confirm delete' : 'Delete'}
                          className={`hidden sm:block p-1.5 rounded-lg transition-colors ${deleting === m.id ? 'bg-red-700 text-white' : 'hover:bg-[#2e2e2e] text-muted hover:text-red-400'}`}><Trash2 size={13} /></button>
                      </span>
                    </SwipeToDelete>
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
