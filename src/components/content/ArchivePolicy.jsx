import { useState, useEffect, useMemo } from 'react'
import {
  loadArchiveInfo, archiveCandidates, deleteLibraryItem, itemBytes, formatBytes, ARCHIVE_CHOICES, MAX_ARCHIVE_SETS,
} from '../../lib/contentLibrary'
import { X, Archive, Trash2, Loader2, Check } from 'lucide-react'

// ─── Archive policy ───────────────────────────────────────────────────────────
// The user picks how many recent sets to keep content for (10, 20 or any number), and whether older
// files are cleared automatically or reviewed first. Files whose latest set is further back than that
// are listed here and can be deleted in one go to free up storage.

const fmtDate = d => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

export default function ArchivePolicy({ user, policy, items, setItems, onChange, onClose }) {
  const { keep, unused, auto } = policy
  const custom = keep > 0 && !ARCHIVE_CHOICES.includes(keep)
  const [customOpen, setCustomOpen] = useState(custom)
  const [customText, setCustomText] = useState(custom ? String(keep) : '')
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

  const update = patch => { setConfirm(false); onChange({ ...policy, ...patch }) }
  const choose = n => { setCustomOpen(false); setSkip(new Set()); update({ keep: n, ...(n ? {} : { auto: false }) }) }
  const commitCustom = text => {
    setCustomText(text)
    const n = Math.floor(Number(text))
    if (n >= 1 && n <= MAX_ARCHIVE_SETS) { setSkip(new Set()); update({ keep: n }) }
  }

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

  const opt = on => `flex-1 min-w-[4.5rem] h-9 rounded-lg border text-sm transition-colors ${on ? 'bg-accent/20 border-accent text-accent-light font-medium' : 'border-border text-muted hover:text-[#f5f5f5]'}`

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-black/80" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-xl max-h-[calc(100dvh-1.5rem)] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <p className="font-semibold flex items-center gap-2"><Archive size={16} className="text-accent-light" /> Archive policy</p>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          <div className="space-y-2">
            <p className="text-sm">Keep Content Library files only while they’ve been used in one of your most recent sets. Older files can be deleted to free up storage. Your choice is saved to your account.</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => choose(0)} className={opt(!keep)}>Off</button>
              {ARCHIVE_CHOICES.map(n => <button key={n} onClick={() => choose(n)} className={opt(keep === n && !customOpen)}>Last {n}</button>)}
              <button onClick={() => { setCustomOpen(true); if (!customText && keep) setCustomText(String(keep)) }} className={opt(customOpen)}>Custom</button>
            </div>
            {customOpen && (
              <label className="flex items-center gap-2 text-sm">
                Keep the last
                <input type="number" min={1} max={MAX_ARCHIVE_SETS} inputMode="numeric" autoFocus value={customText} onChange={e => commitCustom(e.target.value)}
                  className="input !h-8 !py-0 w-20 text-sm" aria-label="Number of sets to keep" />
                sets
              </label>
            )}
          </div>

          {keep > 0 && (
            <>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={unused} onChange={e => update({ unused: e.target.checked })} className="mt-1" />
                <span>Also include files that were never used in a set<span className="block text-[11px] text-muted">Only those added before your {keep === 1 ? 'most recent' : `${keep}th most recent`} set.</span></span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={auto} onChange={e => update({ auto: e.target.checked })} className="mt-1" />
                <span>Clear old files automatically<span className="block text-[11px] text-muted">When you open the Content Library, files outside the policy are deleted for you. Off means you review the list first.</span></span>
              </label>

              {!info && !error && <p className="text-xs text-muted flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Checking your sets…</p>}
              {info && info.pastCount < keep && (
                <p className="text-sm text-muted">You have {info.pastCount} past set{info.pastCount === 1 ? '' : 's'} so far — nothing is old enough to archive yet.</p>
              )}
              {info && info.pastCount >= keep && !candidates.length && (
                <p className="text-sm text-muted">Nothing to archive. Every file was used in your last {keep} set{keep === 1 ? '' : 's'} (or in an upcoming one).</p>
              )}
              {candidates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{candidates.length} file{candidates.length === 1 ? '' : 's'} outside the last {keep} set{keep === 1 ? '' : 's'}</p>
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
