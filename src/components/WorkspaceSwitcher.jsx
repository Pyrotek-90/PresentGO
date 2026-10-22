import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Check } from 'lucide-react'
import { useChurch } from '../contexts/ChurchContext'

// Header pill: the workspace (Main Service, Youth…) the app is working in, and a menu to switch
// workspace or church. Members, who only see their own sets, get the church name.
export default function WorkspaceSwitcher() {
  const { legacy, churches, church, workspace, choose } = useChurch()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  if (legacy || !church) return null

  // every place this person can switch to: a workspace they lead, or a church they're a member of
  const options = churches.flatMap(c => {
    const leads = (c.workspaces || []).filter(w => w.lead)
    return c.editor && leads.length
      ? leads.map(w => ({ key: w.id, churchId: c.id, workspaceId: w.id, church: c.name, label: c.plan === 'ultimate' ? w.name : c.name }))
      : [{ key: c.id, churchId: c.id, workspaceId: null, church: c.name, label: c.name }]
  })
  // Free / Pro: the team's name. Ultimate: the workspace (Main Service, Youth…).
  const label = (church.plan === 'ultimate' && workspace?.name) || church.name
  const current = workspace?.id || church.id
  const manyChurches = churches.some(c => c.plan === 'ultimate') && churches.length > 1

  // Only shown when there's somewhere to switch to; the header otherwise just says StaffList.
  if (options.length < 2) return null

  return (
    <div className="relative min-w-0" ref={ref}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu" title="Switch team"
        className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-card max-w-[10rem] sm:max-w-[16rem]">
        <span className="truncate">{label}</span>
        <ChevronDown size={13} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full mt-1 w-64 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden py-1">
          {churches.map(c => {
            const opts = options.filter(o => o.churchId === c.id)
            return (
              <div key={c.id}>
                {manyChurches && <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">{c.name}</p>}
                {opts.map(o => (
                  <button key={o.key} role="menuitem"
                    onClick={() => { setOpen(false); if (o.key !== current) { choose(o.churchId, o.workspaceId); navigate('/') } }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface">
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.key === current && <Check size={14} className="text-accent-light shrink-0" />}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
