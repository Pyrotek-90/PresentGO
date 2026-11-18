import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useChurch } from '../contexts/ChurchContext'
import Layout from '../components/Layout'
import WeeklyThought from '../components/home/WeeklyThought'
import SetsPane, { SetRow } from '../components/home/SetsPane'
import SetsCalendar from '../components/calendar/SetsCalendar'
import { createSet as insertSet, todayISO } from '../lib/sets'
import { loadServingSets, mergeServing, setHref } from '../lib/serving'

// Sets tab: this week's thought, the calendar (Month / Week), then Upcoming and Past sets.
export default function Sets() {
  const { user } = useAuth()
  const { scope, isEditor, canEditSet, legacy } = useChurch()
  const [serving, setServing] = useState([])   // sets I serve on in other teams (and requests)
  const scopeKey = `${scope.churchId}|${scope.workspaceId}`
  const navigate = useNavigate()
  const [sets, setSets] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(todayISO())

  useEffect(() => {
    setLoading(true)
    scope.sets(supabase.from('sets').select('*, set_items(type, content)'))
      .then(({ data }) => setSets(data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
    if (!legacy) loadServingSets().then(setServing)
  }, [user.id, scopeKey])   // eslint-disable-line react-hooks/exhaustive-deps

  const all = legacy ? sets : mergeServing(sets, serving, canEditSet)
  const open = (id, set) => navigate(set ? setHref(set) : `/sets/${id}`)
  const onDay = all.filter(s => s.service_date === selected)
    .sort((a, b) => (a.service_time || '').localeCompare(b.service_time || ''))

  // "+ New Set": create the set right away and open it with Edit details showing.
  const createSet = async (date = todayISO()) => {
    const { data, error } = await insertSet(supabase, scope, { name: 'New Set', date })
    if (error) return 'Could not create set. Please try again.'
    navigate(`/sets/${data.id}`, { state: { newSet: true } })
    return null
  }

  const dayLabel = new Date(selected + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-4 md:p-6 flex flex-col gap-3">
        <WeeklyThought />
        <SetsCalendar sets={all} selected={selected} onSelect={setSelected} onOpen={s => open(s.id, s)} />

        {(onDay.length > 0 || selected !== todayISO()) && (
          <section className="rounded-xl border border-border bg-card overflow-hidden shrink-0">
            <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border">
              <h2 className="font-semibold">{dayLabel}</h2>
              {onDay.length === 0 && isEditor && (
                <button onClick={() => createSet(selected)} className="btn-ghost flex items-center gap-1.5 !py-1 !px-2.5 text-xs border border-border rounded-lg">
                  <Plus size={12} /> New Set
                </button>
              )}
            </div>
            <div className="px-2 py-1">
              {onDay.length === 0
                ? <p className="text-sm text-muted px-3 py-2">No sets on this day</p>
                : onDay.map(s => <SetRow key={s.id} set={s} onOpen={open} />)}
            </div>
          </section>
        )}

        <SetsPane readOnly={!isEditor} sets={all} loading={loading} targetSetId={null} onOpen={open} onCreate={() => createSet()} />
      </div>
    </Layout>
  )
}
