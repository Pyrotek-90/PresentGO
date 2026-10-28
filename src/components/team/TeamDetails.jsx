import { useEffect, useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useChurch } from '../../contexts/ChurchContext'
import { formatPhone, formatPhoneTyping } from '../../lib/phone'

// church_name is shown as Organization. (Rehearsals now live on each set.)
const FIELDS = ['church_name', 'location', 'contact_name', 'contact_email', 'contact_phone', 'welcome']
const KEY = 'stafflist.teamDetailsOpen'

// Team page: the details every invitation email carries (organization, location, contact, a
// welcome note). Admins also rename the team here.
export default function TeamDetails() {
  const { user } = useAuth()
  const { legacy, church, isAdmin, unitLabel, refresh } = useChurch()
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })
  const [name, setName] = useState('')
  const [d, setD] = useState({})
  const [saved, setSaved] = useState(null)   // last saved { name, d }
  const [state, setState] = useState(null)   // null | 'saving' | 'saved' | 'error'

  useEffect(() => {
    if (legacy || !church) return
    supabase.from('churches').select('name, details').eq('id', church.id).single().then(({ data }) => {
      if (!data) return
      const det = Object.fromEntries(FIELDS.map(k => [k, data.details?.[k] || '']))
      setName(data.name); setD(det); setSaved({ name: data.name, d: det })
      // A brand-new team opens its details so they get filled in.
      if (!FIELDS.some(k => det[k])) setOpen(true)
    })
  }, [legacy, church?.id])   // eslint-disable-line react-hooks/exhaustive-deps

  if (legacy || !church || !saved) return null
  const toggle = () => setOpen(o => { try { localStorage.setItem(KEY, o ? '0' : '1') } catch { /* ignore */ } return !o })
  const dirty = name !== saved.name || FIELDS.some(k => (d[k] || '') !== (saved.d[k] || ''))
  const set = k => e => { setD(x => ({ ...x, [k]: e.target.value })); setState(null) }
  // Example text only guides the first entry; once details are saved the empty boxes stay empty.
  const hasSaved = state === 'saved' || FIELDS.some(k => saved.d[k])
  const hint = t => (hasSaved ? undefined : t)
  const me = user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''

  const save = async () => {
    setState('saving')
    const details = { ...d, contact_phone: formatPhone(d.contact_phone || '') }
    const { data, error } = await supabase.rpc('save_team_details', { p_church: church.id, p_name: name.trim(), p_details: details })
    if (error || !data) { setState('error'); return }
    setD(details); setSaved({ name: isAdmin ? name.trim() : saved.name, d: details }); setState('saved')
    if (isAdmin && name.trim() !== saved.name) refresh()
  }

  const summary = [d.church_name, d.location].filter(Boolean).join(' · ') || 'Add your organization, location and contact for invitation emails'
  const label = unitLabel.toLowerCase()

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <button onClick={toggle} aria-expanded={open} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <ChevronDown size={16} className={`text-muted transition-transform shrink-0 ${open ? '' : '-rotate-90'}`} />
        <span className="font-semibold whitespace-nowrap">{unitLabel} Details</span>
        <span className="text-xs text-muted truncate">{summary}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border space-y-3">
          <p className="text-xs text-muted flex items-start gap-1.5 pt-2"><Info size={13} className="shrink-0 mt-0.5" /> These details go in every invitation email: the invitation to join the {label}, and each set request.</p>
          {/* Organization · Team name · Location, then the contact, then the welcome note */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="label !mb-1">Organization</span>
              <input className="input !h-10" value={d.church_name} onChange={set('church_name')} placeholder={hint("Grace Community Church")} />
            </label>
            <label className="block">
              <span className="label !mb-1">{unitLabel} name</span>
              <input className="input !h-10" value={name} onChange={e => { setName(e.target.value); setState(null) }} disabled={!isAdmin}
                placeholder={hint("Grace Worship Team")} title={isAdmin ? undefined : 'Only Admins can rename the team'} />
            </label>
            <label className="block">
              <span className="label !mb-1">Location</span>
              <input className="input !h-10" value={d.location} onChange={set('location')} placeholder={hint("123 Main St, Schaumburg, IL")} />
            </label>
            <label className="block">
              <span className="label !mb-1">Contact name</span>
              <input className="input !h-10" value={d.contact_name} onChange={set('contact_name')} placeholder={hint(me)} />
            </label>
            <label className="block">
              <span className="label !mb-1">Contact phone</span>
              <input className="input !h-10" type="tel" inputMode="tel" value={d.contact_phone} placeholder={hint("555.555.5555")}
                onChange={e => { setD(x => ({ ...x, contact_phone: formatPhoneTyping(e.target.value) })); setState(null) }}
                onBlur={() => setD(x => ({ ...x, contact_phone: formatPhone(x.contact_phone || '') }))} />
            </label>
            <label className="block">
              <span className="label !mb-1">Contact email</span>
              <input className="input !h-10" type="email" value={d.contact_email} onChange={set('contact_email')} placeholder={hint(user?.email || '')} title="Replies to invitation emails go here" />
            </label>
            <label className="block sm:col-span-3">
              <span className="label !mb-1">Welcome message</span>
              <textarea className="input !h-auto py-2 min-h-[3.5rem]" rows={2} value={d.welcome} onChange={set('welcome')} maxLength={1000}
                placeholder={hint("Glad you're joining us! We prepare with StaffList: your sets, charts and lyrics will be waiting for you.")} />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={!dirty || state === 'saving'} className="btn-primary !py-2 !px-5 text-sm">{state === 'saving' ? 'Saving…' : 'Save details'}</button>
            {state === 'saved' && !dirty && <span className="text-xs text-green-400">Saved</span>}
            {state === 'error' && <span className="text-xs text-red-400">Could not save. Please try again.</span>}
          </div>
        </div>
      )}
    </section>
  )
}
