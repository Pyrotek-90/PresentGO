import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import PositionsPanel from '../components/calendar/PositionsPanel'
import { todayISO, formatSetTime, createSet } from '../lib/sets'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Calendar() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sets, setSets] = useState([])
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selected, setSelected] = useState(todayISO())
  const [name, setName] = useState('')
  const [time, setTime] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.from('sets').select('id, name, service_date, service_time').eq('user_id', user.id)
      .then(({ data }) => setSets(data || []))
      .catch(() => {})
  }, [user.id])

  const setsByDate = useMemo(() => {
    const m = {}
    for (const s of sets) if (s.service_date) (m[s.service_date] ||= []).push(s)
    for (const k in m) m[k].sort((a, b) => (a.service_time || '').localeCompare(b.service_time || ''))
    return m
  }, [sets])

  const days = useMemo(() => {
    const first = cursor.getDay()
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - first + i)
      return { iso: d.toLocaleDateString('en-CA'), day: d.getDate(), inMonth: d.getMonth() === cursor.getMonth() }
    })
  }, [cursor])

  const today = todayISO()
  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const shift = n => setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1))
  const goToday = () => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(todayISO()) }

  const selectedSets = setsByDate[selected] || []
  const selectedLabel = new Date(selected + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const create = async () => {
    if (!name.trim()) return
    setCreating(true); setError(null)
    const { data, error } = await createSet(supabase, user.id, { name: name.trim(), date: selected, time })
    setCreating(false)
    if (error) { setError('Could not create set. Make sure the latest Supabase migration has been run.'); return }
    navigate(`/sets/${data.id}`)
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-4 md:p-6 grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-4 items-start">
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <h1 className="font-semibold">{monthLabel}</h1>
              <div className="flex items-center gap-1">
                <button onClick={goToday} className="btn-ghost !py-1 !px-2.5 text-xs">Today</button>
                <button onClick={() => shift(-1)} className="btn-ghost p-1.5" aria-label="Previous month"><ChevronLeft size={16} /></button>
                <button onClick={() => shift(1)} className="btn-ghost p-1.5" aria-label="Next month"><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 border-b border-border">
              {WEEKDAYS.map(w => <div key={w} className="py-1 text-center text-[10px] uppercase tracking-widest text-muted">{w}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map(({ iso, day, inMonth }) => {
                const daySets = setsByDate[iso] || []
                const isSel = iso === selected
                return (
                  <button key={iso} onClick={() => setSelected(iso)}
                    className={`h-14 sm:h-20 p-1 border-b border-r border-border/50 text-left align-top flex flex-col gap-0.5 transition-colors ${
                      isSel ? 'bg-accent/10 ring-1 ring-inset ring-accent/60' : 'hover:bg-[#1a1a1a]'
                    } ${inMonth ? '' : 'opacity-35'}`}>
                    <span className={`text-xs w-5 h-5 flex items-center justify-center rounded-full ${iso === today ? 'bg-accent text-white font-semibold' : 'text-muted'}`}>{day}</span>
                    <div className="hidden sm:flex flex-col gap-0.5 min-w-0">
                      {daySets.slice(0, 2).map(s => (
                        <span key={s.id} className="truncate text-[10px] px-1 py-0.5 rounded bg-accent/25 text-accent-light">{s.name}</span>
                      ))}
                      {daySets.length > 2 && <span className="text-[10px] text-muted px-1">+{daySets.length - 2} more</span>}
                    </div>
                    {daySets.length > 0 && (
                      <div className="sm:hidden flex gap-0.5 px-0.5">
                        {daySets.slice(0, 3).map(s => <span key={s.id} className="w-1.5 h-1.5 rounded-full bg-accent-light" />)}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <h2 className="font-semibold">{selectedLabel}</h2>
            </div>
            <div className="px-3 py-2 space-y-2">
              {selectedSets.length === 0 ? (
                <p className="text-xs text-muted">No sets on this day.</p>
              ) : (
                <ul className="space-y-0.5">
                  {selectedSets.map(s => (
                    <li key={s.id}>
                      <button onClick={() => navigate(`/sets/${s.id}`)}
                        className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-[#1a1a1a] text-left">
                        <span className="flex-1 min-w-0 truncate text-sm font-medium">{s.name}</span>
                        <span className="text-xs text-muted">{formatSetTime(s.service_time)}</span>
                        <ChevronRight size={14} className="text-muted" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <input className="input flex-1 min-w-[12rem] !h-9" placeholder="New set name for this day"
                  value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} />
                <input type="time" className="input !h-9 !w-auto" value={time} onChange={e => setTime(e.target.value)} aria-label="Service time" />
                <button onClick={create} disabled={creating || !name.trim()} className="btn-primary flex items-center gap-1 shrink-0">
                  <Plus size={14} /> {creating ? 'Creating…' : 'New Set'}
                </button>
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>
          </section>
        </div>

        <PositionsPanel />
      </div>
    </Layout>
  )
}
