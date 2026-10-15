import { useState, useEffect, useMemo } from 'react'
import { loadArchiveInfo, archiveCandidates, deleteLibraryItem, itemBytes, formatBytes, ARCHIVE_CHOICES } from '../../lib/contentLibrary'
import { getPref, setPref } from '../../lib/prefs'
import { X, Archive, Trash2, Loader2, Check } from 'lucide-react'

// ─── Archive policy ───────────────────────────────────────────────────────────
// Pick how many recent sets to keep content for. Files whose latest set is further back than that are
// listed here, and can be deleted in one go to free up storage.

export const archiveKeep = () => Number(getPref('archiveKeep', 0)) || 0
export const archiveUnused = () => !!getPref('archiveUnused', false)

const fmtDate = d => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

export default function ArchivePolicy({ user, items, setItems, onClose, onPolicyChange }) {
  const [keep, setKeep] = useState(archiveKeep)                 // 0 = off
  const [unused, setUnused] = useState(archiveUnused)
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [skip, setSkip] = useState(() => new Set())             // files unticked by the user
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(null)

  // Re-read set usage when the policy length changes (it sets the cut-off date).
  useEffect(() => {
    if (!keep) { setInfo(null); return }
    let live = true
    setError(null)
    loadArchiveInfo(user.id, keep).then(r => { if (live) setInfo(r) }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [user.id, keep])

  const choose = n => { setKeep(n); setPref('archiveKeep', n); setSkip(new Set()); setConfirm(false); onPolicyChange?.() }
  const chooseUnused = v => { setUnused(v); setPref('archiveUnused', v); setConfirm(false); onPolicyChange?.() }

  const candidates = useMemo(() => (keep && info ? archiveCandidates(items, info, keep, unused) : []), [items, info, keep, unused])
  const chosen = candidates.filter(c => !skip.has(c.item.id))
  const bytes = chosen.reduce((n, c) => n + itemBytes(c.item), 0)
  const toggle = id => { setConfirm(false); setSkip(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  const run = async () => {
    if (!confirm) { setConfirm(true); setTimeout(() => setConfirm(false), 5000); return }
    setConfirm(false); setError(null)
    const gone = new Set()
    try {
      for (let i = 0; i < chosen.length; i++) {
        setBusy(`Deleting ${i + 1} of ${chosen.length}…`)
        await deleteLibraryItem(chosen[i].item)
        gone.add(chosen[i].item.id)
      }
    } catch (e) { setError(e.message || 'Could not delete every file.') }
    setItems(prev => prev.filter(i => !gone.has(i.id)))
    setBusy(null)
  }

  const opt = on => `flex-1 h-9 rounded-lg border text-sm transition-colors ${on ? 'bg-accent/20 border-accent text-accent-light font-medium' : 'border-border text-muted hover:text-[#f5f5f5]'}`

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-black/80" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-xl max-h-[calc(100dvh-1.5rem)] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <p className="font-semibold flex items-center gap-2"><Archive size={16} className="text-accent-light" /> Archive policy</p>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          <div className="space-y-2">
            <p className="text-sm">Keep Content Library files only while they’ve been used in one of the most recent sets. Older files can be deleted to free up storage.</p>
            <div className="flex gap-2">
              <button onClick={() => choose(0)} className={opt(!keep)}>Off</button>
              {ARCHIVE_CHOICES.map(n => <button key={n} onClick={() => choose(n)} className={opt(keep === n)}>Last {n} sets</button>)}
            </div>
          </div>

          {keep > 0 && (
            <>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={unused} onChange={e => chooseUnused(e.target.checked)} className="mt-1" />
                <span>Also include files that were never used in a set<span className="block text-[11px] text-muted">Only those added before your {keep}th most recent set.</span></span>
              </label>

              {!info && !error && <p className="text-xs text-muted flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Checking your sets…</p>}
              {info && info.pastCount < keep && (
                <p className="text-sm text-muted">You have {info.pastCount} past set{info.pastCount === 1 ? '' : 's'} so far — nothing is old enough to archive yet.</p>
              )}
              {info && info.pastCount >= keep && !candidates.length && (
                <p className="text-sm text-muted">Nothing to archive. Every file was used in the last {keep} sets (or in an upcoming one).</p>
              )}
              {candidates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{candidates.length} file{candidates.length === 1 ? '' : 's'} outside the last {keep} sets</p>
                  <ul className="rounded-lg border border-border divide-y divide-border/60 max-h-64 overflow-y-auto">
                    {candidates.map(({ item, use }) => {
                      const on = !skip.has(item.id)
                      return (
                        <li key={item.id}>
                          <button onClick={() => toggle(item.id)} className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left hover:bg-[#2e2e2e]" aria-pressed={on}>
                            <span className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-accent border-accent text-white' : 'border-[#666] text-transparent'}`}><Check size={12} strokeWidth={3} /></span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm truncate">{item.name}</span>
                              <span className="block text-[11px] text-muted truncate">
                                {use ? `Last used ${fmtDate(use.date)} · ${use.setName}` : 'Never used in a set'}
                              </span>
                            </span>
                            <span className="text-[11px] text-muted shrink-0">{formatBytes(itemBytes(item))}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <p className="text-[11px] text-muted">Deleting removes the files for good. Those older sets will lose these slides.</p>
                </div>
              )}
            </>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {chosen.length > 0 && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
            <button onClick={onClose} disabled={!!busy} className="btn-ghost text-sm">Not now</button>
            <button onClick={run} disabled={!!busy}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 ${confirm ? 'bg-red-700 text-white' : 'bg-red-500/15 text-red-300 hover:bg-red-500/25'}`}>
              {busy ? <><Loader2 size={14} className="animate-spin" /> {busy}</>
                : <><Trash2 size={14} /> {confirm ? `Tap to confirm — delete ${chosen.length}` : `Delete ${chosen.length} file${chosen.length === 1 ? '' : 's'} · frees ${formatBytes(bytes)}`}</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
