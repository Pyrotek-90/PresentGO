import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useChurch } from '../../contexts/ChurchContext'
import { useScheduling } from '../../lib/useScheduling'
import { sortPositions, ensureStandardPositions } from '../../lib/positions'
import SchedulePane from '../calendar/SchedulePane'

const OPEN_KEY = 'stafflist.setTeamOpen'

// Set page: who's serving this set. Assign people to positions, see who has answered and email
// the requests (the same tools as the Team tab's Who's Serving, for this one set).
export default function SetTeamPane({ set, onChanged }) {
  const { user } = useAuth()
  const { scope } = useChurch()
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(OPEN_KEY) !== '0' } catch { return true } })
  const toggle = () => setOpen(o => { try { localStorage.setItem(OPEN_KEY, o ? '0' : '1') } catch { /* ignore */ } return !o })
  const [members, setMembers] = useState([])
  const [positions, setPositions] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const sets = useMemo(() => [set], [set])
  const sched = useScheduling({ members, setMembers, positions, sets, setId: set.id, onChange: onChanged })

  useEffect(() => {
    Promise.all([
      scope.church(supabase.from('team_members').select('*')).order('name'),
      scope.church(supabase.from('positions').select('*')).order('created_at'),
    ]).then(async ([m, p]) => {
      if (m.error || p.error) setLoadError('Team features are not set up yet. Run the latest Supabase migration.')
      setMembers(m.data || [])
      const list = p.error ? [] : await ensureStandardPositions(supabase, user, p.data || [], scope)
      setPositions(sortPositions(list))
    }).catch(() => setLoadError('Could not load team data.')).finally(() => setLoaded(true))
  }, [user.id, scope.churchId, scope.workspaceId])   // eslint-disable-line react-hooks/exhaustive-deps

  const count = sched.assignments.length

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <button onClick={toggle} aria-expanded={open} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <ChevronDown size={16} className={`text-muted transition-transform shrink-0 ${open ? '' : '-rotate-90'}`} />
        <h2 className="font-semibold whitespace-nowrap">Who's Serving</h2>
        {count > 0 && <span className="text-xs text-muted">{count}</span>}
      </button>
      {open && (
        <div className="border-t border-border p-3">
          {(loadError || sched.error) && <p className="text-red-400 text-xs pb-2">{loadError || sched.error}</p>}
          {!loaded ? (
            <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <SchedulePane bare set={set} index={0} total={1} showPrev={false} showNext={false}
              positions={positions} members={members} assignments={sched.assignments}
              onAdd={(pid, mid) => sched.addAssignment(set.id, pid, mid)} onRemove={sched.removeAssignment}
              onSend={sched.sendInvites} sending={sched.sending}
              sendResult={sched.sendResult?.setId === set.id ? sched.sendResult : null} onRefresh={sched.refresh} />
          )}
        </div>
      )}
    </section>
  )
}
