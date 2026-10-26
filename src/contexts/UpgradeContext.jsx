import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, X } from 'lucide-react'
import { useChurch } from './ChurchContext'

// Paid features stay visible but grayed out on lower plans. Tapping one explains which plan it's
// part of and offers the plans. Use:
//   const { pro, requirePro } = useUpgrade()          // Pro features (AI, scheduling, team)
//   const { present, requirePresent } = useUpgrade()  // Solo and up (presenting)
//   <button className={locked(pro)} onClick={() => requirePro('Smart Cleanup') && doIt()}>
const UpgradeContext = createContext({ pro: true, present: true, requirePro: () => true, requirePresent: () => true })

const TIERS = {
  solo: { name: 'Solo', price: '$5 a month or $50 a year', also: 'Solo and Pro' },
  pro: { name: 'Pro', price: '$12 a month or $100 a year', also: 'Pro' },
}

// Grayed-out look for a paid feature on a lower plan (the button stays tappable so it can explain itself).
export const locked = pro => (pro ? '' : 'opacity-40 grayscale')

export function UpgradeProvider({ children }) {
  const { pro, present, isAdmin, unitLabel } = useChurch()
  const navigate = useNavigate()
  const [feature, setFeature] = useState(null)

  const requirePro = useCallback(name => {
    if (pro) return true
    setFeature({ name: name || 'This', tier: 'pro' })
    return false
  }, [pro])

  const requirePresent = useCallback(name => {
    if (present) return true
    setFeature({ name: name || 'This', tier: 'solo' })
    return false
  }, [present])

  const tier = feature && TIERS[feature.tier]

  useEffect(() => {
    if (!feature) return
    const key = e => { if (e.key === 'Escape') setFeature(null) }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [feature])

  return (
    <UpgradeContext.Provider value={{ pro, present, requirePro, requirePresent }}>
      {children}
      {feature && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={() => setFeature(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="upgrade-title" onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 space-y-3 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0"><Lock size={17} /></span>
              <div className="flex-1 min-w-0">
                <h2 id="upgrade-title" className="font-semibold leading-snug">{feature.name} is part of {tier.also}</h2>
                <p className="text-sm text-muted mt-1">
                  {isAdmin
                    ? `Upgrade your ${unitLabel.toLowerCase()} to ${tier.name} (${tier.price}) to use it.`
                    : `Ask your ${unitLabel.toLowerCase()}'s admin about upgrading to ${tier.name}.`}
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
