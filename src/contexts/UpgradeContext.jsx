import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, X } from 'lucide-react'
import { useChurch } from './ChurchContext'

// Pro features stay visible but grayed out on the Free plan. Tapping one explains it's part of
// Pro and offers the plans. Use:
//   const { pro, requirePro } = useUpgrade()
//   <button className={locked(pro)} onClick={() => requirePro('Smart Cleanup') && doIt()}>
const UpgradeContext = createContext({ pro: true, requirePro: () => true })

// Grayed-out look for a Pro feature on Free (the button stays tappable so it can explain itself).
export const locked = pro => (pro ? '' : 'opacity-40 grayscale')

export function UpgradeProvider({ children }) {
  const { pro, isAdmin, unitLabel } = useChurch()
  const navigate = useNavigate()
  const [feature, setFeature] = useState(null)

  const requirePro = useCallback(name => {
    if (pro) return true
    setFeature(name || 'This')
    return false
  }, [pro])

  useEffect(() => {
    if (!feature) return
    const key = e => { if (e.key === 'Escape') setFeature(null) }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [feature])

  return (
    <UpgradeContext.Provider value={{ pro, requirePro }}>
      {children}
      {feature && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={() => setFeature(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="upgrade-title" onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 space-y-3 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0"><Lock size={17} /></span>
              <div className="flex-1 min-w-0">
                <h2 id="upgrade-title" className="font-semibold leading-snug">{feature} is part of Pro</h2>
                <p className="text-sm text-muted mt-1">
                  {isAdmin
                    ? `Upgrade your ${unitLabel.toLowerCase()} to Pro ($12 a month or $100 a year) to use it.`
                    : `Ask your ${unitLabel.toLowerCase()}'s admin about upgrading to Pro.`}
                  {' '}Free keeps your songs, charts, sets and schedule.
                </p>
              </div>
              <button onClick={() => setFeature(null)} aria-label="Close" className="p-1 rounded-md text-muted hover:text-primary"><X size={16} /></button>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setFeature(null); navigate('/settings#plans') }} className="btn-primary flex-1">See plans</button>
              <button onClick={() => setFeature(null)} className="btn-ghost border border-border rounded-lg flex-1 text-sm">Not now</button>
            </div>
          </div>
        </div>
      )}
    </UpgradeContext.Provider>
  )
}

export const useUpgrade = () => useContext(UpgradeContext)
