import { useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { thoughtForWeek } from '../../lib/worshipThoughts'

const COLLAPSE_KEY = 'presentgo.thoughtCollapsed'

// Home page: a thought on authentic worship with a supporting scripture, new each Sunday.
export default function WeeklyThought() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })
  const t = thoughtForWeek()
  const toggle = () => setCollapsed(c => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1') } catch { /* ignore */ }
    return !c
  })

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden shrink-0">
      <button onClick={toggle} aria-expanded={!collapsed} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <ChevronDown size={16} className={`text-muted transition-transform shrink-0 ${collapsed ? '-rotate-90' : ''}`} />
        <h2 className="font-semibold shrink-0">This Week</h2>
        <span className="text-xs text-muted truncate min-w-0">· {t.title}</span>
        <Sparkles size={14} className="ml-auto text-accent-light shrink-0" />
      </button>
      {!collapsed && (
        <div className="px-4 pb-3 space-y-2 border-t border-border pt-2.5">
          <p className="text-sm leading-relaxed">{t.thought}</p>
          <blockquote className="border-l-2 border-accent/60 pl-3 space-y-0.5">
            <p className="text-sm italic text-muted leading-relaxed">“{t.text}”</p>
            <footer className="text-xs font-semibold text-accent-light">{t.ref} <span className="font-normal text-muted">KJV</span></footer>
          </blockquote>
        </div>
      )}
    </section>
  )
}
