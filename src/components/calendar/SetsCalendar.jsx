import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { useChurch } from '../../contexts/ChurchContext'
import { todayISO, formatSetTime } from '../../lib/sets'
import { chipStyle, dotStyle } from '../../lib/teamColors'
import TeamColorKey from '../TeamColorKey'

// Weeks start on Monday, so the weekend sits together at the end.
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const COLLAPSE_KEY = 'presentgo.calendarCollapsed'
const MODE_KEY = 'presentgo.calendarMode'

const iso = d => d.toLocaleDateString('en-CA')
const fromISO = s => new Date(s + 'T00:00:00')
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const dow = d => (d.getDay() + 6) % 7   // Monday = 0
const startOfWeek = d => addDays(d, -dow(d))

// The sets on a calendar: Month or Week, Today and ‹ ›. Month opens on this week and the three
// after it; ‹ › then go a whole month at a time (Today comes back to the four weeks). Upcoming sets are highlighted, past sets
// are dimmed, today is circled. Clicking a day selects it; clicking a set opens it.
// `sets` carry a `serving` block when they belong to a team I serve on (shown in that team's color).
export default function SetsCalendar({ sets, selected, onSelect, onOpen }) {
  const { teamColor, isEditor, church } = useChurch()
  const [mode, setMode] = useState(() => { try { return localStorage.getItem(MODE_KEY) === 'week' ? 'week' : 'month' } catch { return 'month' } })
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false } })
  const [cursor, setCursor] = useState(() => (selected ? fromISO(selected) : new Date()))
  const [rolling, setRolling] = useState(true)   // month view: this week + 3, until ‹ › is used
  const today = todayISO()

  const pickMode = m => { setMode(m); try { localStorage.setItem(MODE_KEY, m) } catch { /* ignore */ } }
  const toggle = () => setCollapsed(c => { try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1') } catch { /* ignore */ } return !c })

  const byDate = useMemo(() => {
    const m = {}
    for (const s of sets) if (s.service_date) (m[s.service_date] ||= []).push(s)
    for (const k in m) m[k].sort((a, b) => (a.service_time || '').localeCompare(b.service_time || ''))
    return m
  }, [sets])

  const monthDays = useMemo(() => {
    if (rolling) {
      const start = startOfWeek(new Date())
      return Array.from({ length: 28 }, (_, i) => { const d = addDays(start, i); return { iso: iso(d), day: d.getDate(), inMonth: true } })
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const lead = dow(first)
    const count = Math.ceil((lead + new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()) / 7) * 7
    return Array.from({ length: count }, (_, i) => {
      const d = addDays(first, i - lead)
      return { iso: iso(d), day: d.getDate(), inMonth: d.getMonth() === cursor.getMonth() }
    })
  }, [cursor, rolling])

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor)
    return Array.from({ length: 7 }, (_, i) => { const d = addDays(start, i); return { iso: iso(d), day: d.getDate(), wd: WEEKDAYS[dow(d)] } })
  }, [cursor])

  const title = useMemo(() => {
    if (mode === 'month' && rolling) {
      const a = fromISO(monthDays[0].iso), b = fromISO(monthDays[monthDays.length - 1].iso)
      return `${a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    }
    if (mode === 'month') return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const a = fromISO(weekDays[0].iso), b = fromISO(weekDays[6].iso)
    return a.getMonth() === b.getMonth()
      ? `${a.toLocaleDateString('en-US', { month: 'long' })} ${a.getDate()}–${b.getDate()}, ${b.getFullYear()}`
      : `${a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }, [mode, cursor, weekDays, rolling, monthDays])

  const shift = n => {
    if (mode === 'month' && rolling) {
      // From the four weeks: › goes to next month, ‹ to this whole month.
      const t = new Date()
      setRolling(false); setCursor(new Date(t.getFullYear(), t.getMonth() + (n > 0 ? 1 : 0), 1)); return
    }
    setCursor(c => (mode === 'week' ? addDays(c, 7 * n) : new Date(c.getFullYear(), c.getMonth() + n, 1)))
  }
  const goToday = () => { setCursor(new Date()); setRolling(true); onSelect(today) }
  const pick = d => { onSelect(d) }

  const isUpcoming = s => !s.service_date || s.service_date >= today
  // A chip: accent for upcoming, grey for past; sets from teams I serve on use that team's color.
  const chipProps = s => {
    const up = isUpcoming(s)
    if (s.serving) return { style: up ? chipStyle(teamColor(s.serving.churchId)) : undefined, cls: up ? '' : 'bg-white/10 text-muted', dashed: s.serving.status === 'invited' }
    return { cls: up ? 'bg-accent/25 text-accent-light' : 'bg-white/10 text-muted' }
  }
  const open = (e, s) => { e.stopPropagation(); onOpen(s) }
  const onChipKey = (e, s) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e, s) } }

  const servingTeams = [...new Set(sets.filter(s => s.serving).map(s => s.serving.churchId))]

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden shrink-0">
      <div className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-3 py-2 ${collapsed ? '' : 'border-b border-border'}`}>
        <button onClick={toggle} aria-expanded={!collapsed} className="flex items-center gap-2 min-w-0 text-left">
          <ChevronDown size={16} className={`text-muted transition-transform shrink-0 ${collapsed ? '-rotate-90' : ''}`} />
          <h2 className="font-semibold truncate">{collapsed ? 'Calendar' : title}</h2>
          {collapsed && <span className="text-xs text-muted truncate">· {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>}
        </button>
        {!collapsed && (
          <div className="flex items-center gap-1">
            <div className="flex rounded-lg border border-border overflow-hidden mr-1" role="group" aria-label="Calendar view">
              {['month', 'week'].map(m => (
                <button key={m} onClick={() => pickMode(m)} aria-pressed={mode === m}
                  className={`px-2.5 h-7 text-xs font-medium capitalize transition-colors ${mode === m ? 'bg-accent/25 text-accent-light' : 'text-muted hover:text-primary'}`}>{m}</button>
              ))}
            </div>
            <button onClick={goToday} className="btn-ghost !py-1 !px-2.5 text-xs">Today</button>
            <button onClick={() => shift(-1)} className="btn-ghost p-1.5" aria-label={mode === 'week' ? 'Previous week' : 'Previous month'}><ChevronLeft size={16} /></button>
            <button onClick={() => shift(1)} className="btn-ghost p-1.5" aria-label={mode === 'week' ? 'Next week' : 'Next month'}><ChevronRight size={16} /></button>
          </div>
        )}
      </div>

      {!collapsed && mode === 'month' && (
        <>
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAYS.map(w => <div key={w} className="py-1 text-center text-[10px] uppercase tracking-widest text-muted">{w}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map(d => {
              const list = byDate[d.iso] || []
              const sel = d.iso === selected
              return (
                <button key={d.iso} onClick={() => pick(d.iso)}
                  className={`h-14 sm:h-20 p-1 border-b border-r border-border/50 text-left align-top flex flex-col gap-0.5 transition-colors ${
                    sel ? 'bg-accent/10 ring-1 ring-inset ring-accent/60' : 'hover:bg-[#1a1a1a]'
                  } ${d.inMonth ? '' : 'opacity-35'}`}>
                  <span className={`text-xs w-5 h-5 flex items-center justify-center rounded-full ${d.iso === today ? 'bg-accent text-white font-semibold' : 'text-muted'}`}>{d.day}</span>
                  <div className="hidden sm:flex flex-col gap-0.5 min-w-0">
                    {list.slice(0, 2).map(s => {
                      const c = chipProps(s)
                      return (
                        <span key={s.id} role="link" tabIndex={0} onClick={e => open(e, s)} onKeyDown={e => onChipKey(e, s)} title={s.name}
                          className={`truncate text-[10px] px-1 py-0.5 rounded cursor-pointer hover:brightness-125 ${c.cls} ${c.dashed ? 'border border-dashed border-current' : ''}`} style={c.style}>{s.name}</span>
                      )
                    })}
                    {list.length > 2 && <span className="text-[10px] text-muted px-1">+{list.length - 2} more</span>}
                  </div>
                  {list.length > 0 && (
                    <div className="sm:hidden flex gap-0.5 px-0.5">
                      {list.slice(0, 3).map(s => (s.serving && isUpcoming(s)
                        ? <span key={s.id} className="w-1.5 h-1.5 rounded-full" style={dotStyle(teamColor(s.serving.churchId))} />
                        : <span key={s.id} className={`w-1.5 h-1.5 rounded-full ${isUpcoming(s) ? 'bg-accent-light' : 'bg-muted'}`} />))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}

      {!collapsed && mode === 'week' && (
        <div className="grid grid-cols-7">
          {weekDays.map(d => {
            const list = byDate[d.iso] || []
            const sel = d.iso === selected
            return (
              <div key={d.iso} role="button" tabIndex={0} onClick={() => pick(d.iso)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(d.iso) } }}
                aria-label={`${d.wd} ${d.day}${list.length ? `, ${list.length} set${list.length === 1 ? '' : 's'}` : ''}`}
                className={`flex flex-col gap-1 sm:gap-1.5 p-1 sm:p-2 border-r border-border/50 last:border-0 cursor-pointer transition-colors ${
                  sel ? 'bg-accent/10 ring-1 ring-inset ring-accent/60' : 'hover:bg-[#1a1a1a]'
                }`}>
                <div className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1.5 shrink-0 text-muted">
                  <span className="text-[10px] uppercase tracking-widest">{d.wd}</span>
                  <span className={`text-xs w-5 h-5 flex items-center justify-center rounded-full ${d.iso === today ? 'bg-accent text-white font-semibold' : ''}`}>{d.day}</span>
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  {list.map(s => {
                    const c = chipProps(s)
                    return (
                      <span key={s.id} role="link" tabIndex={0} onClick={e => open(e, s)} onKeyDown={e => onChipKey(e, s)} title={s.name} aria-label={s.name}
                        className={`block rounded-md h-5 sm:h-auto sm:px-1.5 sm:py-1 text-xs font-medium cursor-pointer hover:brightness-125 ${c.cls} ${c.dashed ? 'border border-dashed border-current' : ''}`} style={c.style}>
                        {/* Phones: just the colored box. Wider screens: name and time. */}
                        <span className="hidden sm:block line-clamp-2">{s.name}</span>
                        {s.service_time && <span className="hidden sm:block text-[10px] font-normal opacity-80">{formatSetTime(s.service_time)}</span>}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!collapsed && servingTeams.length > 0 && (
        <TeamColorKey ids={[...new Set([...(isEditor && church ? [church.id] : []), ...servingTeams])]} label="Tap a color to change it" className="px-3 py-2 border-t border-border" />
      )}
    </section>
  )
}
