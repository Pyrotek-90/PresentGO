import { useState } from 'react'
import { Check, Minus, X, Bell } from 'lucide-react'
import { PLAN_LABEL, PLAN_ORDER, PLAN_PRICE, PLAN_MATRIX } from '../../lib/plans'

// Settings → Account → Plan: what each plan includes, side by side, with the team's plan
// highlighted. Billing isn't built yet, so changing plans offers "Notify me".
export default function PlanMatrix({ current = 'free', onClose }) {
  const [pick, setPick] = useState(null)
  const [notified, setNotified] = useState({})
  const cur = PLAN_ORDER.includes(current) ? current : 'free'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-black/75" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-3xl max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <p className="font-semibold flex-1">Plans &amp; features</p>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-panel"><X size={18} /></button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-surface z-10">
              <tr>
                <th className="text-left font-medium text-muted px-3 py-2 w-[40%]"></th>
                {PLAN_ORDER.map(p => (
                  <th key={p} className={`px-2 py-2 text-center align-bottom ${p === cur ? 'bg-accent/15' : ''}`}>
                    <button onClick={() => setPick(p)} className={`w-full rounded-lg py-1 ${pick === p ? 'ring-1 ring-accent' : ''}`}>
                      <div className={`font-semibold ${p === cur ? 'text-accent-light' : 'text-primary'}`}>{PLAN_LABEL[p]}</div>
                      <div className="text-[11px] text-muted font-normal">{PLAN_PRICE[p]}</div>
                      {p === cur && <div className="text-[10px] text-accent-light font-medium">Current</div>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLAN_MATRIX.map(g => [
                <tr key={g.group}><td colSpan={5} className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.group}</td></tr>,
                ...g.rows.map(([label, on]) => (
                  <tr key={label} className="border-t border-border/50">
                    <td className="px-3 py-1.5 text-primary">{label}</td>
                    {on.map((v, i) => (
                      <td key={i} className={`px-2 py-1.5 text-center ${PLAN_ORDER[i] === cur ? 'bg-accent/15' : ''}`}>
                        {v === true ? <Check size={16} className="inline text-accent-light" />
                          : v === false ? <Minus size={14} className="inline text-muted/50" />
                          : <span className="text-xs text-primary">{v}</span>}
                      </td>
                    ))}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-3 flex items-center gap-3">
          {pick && pick !== cur ? (
            <>
              <p className="text-xs text-muted flex-1">Changing to <b className="text-primary">{PLAN_LABEL[pick]}</b> isn't available yet — paid plans are coming soon.</p>
              <button onClick={() => setNotified(n => ({ ...n, [pick]: true }))} disabled={notified[pick]}
                className={`h-9 px-3 rounded-lg text-sm font-medium border flex items-center gap-2 ${notified[pick] ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-border text-muted hover:text-primary hover:border-accent'}`}>
                {notified[pick] ? <><Check size={14} /> You're on the list!</> : <><Bell size={14} /> Notify me</>}
              </button>
            </>
          ) : (
            <p className="text-xs text-muted">You're on <b className="text-primary">{PLAN_LABEL[cur]}</b>. Tap a plan above to change.</p>
          )}
        </div>
      </div>
    </div>
  )
}
