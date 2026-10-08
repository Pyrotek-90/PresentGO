import { useState } from 'react'
import { X, Pencil, Trash2, KeyRound, Check } from 'lucide-react'
import { transposeKeyOptions, parseKey } from '../../lib/chords'

const shortKey = k => (k || '').replace(' Major', '').replace(' Minor', 'm')

// Opened from the pencil on a program item: set the key (songs), edit, or remove it from the set.
export default function ItemOptionsDialog({ item, title, song, onClose, onSetKey, onEdit, onRemove }) {
  const [confirm, setConfirm] = useState(false)
  const isSong = item.type === 'song'
  const meta = song?.metadata || {}
  const original = meta.original_key || meta.key || ''
  const chosen = item.content?.key || ''
  const songKeys = [original, ...(meta.transposed_keys || [])].filter(Boolean)
  const mode = parseKey(original)?.mode
  const otherKeys = original ? transposeKeyOptions(original, mode).filter(k => !songKeys.includes(k)) : []
  const current = chosen || original
  const canEdit = item.type !== 'blank' && !(isSong && !song)

  const chip = (k, label = shortKey(k)) => (
    <button key={k} onClick={() => onSetKey(k === original ? null : k)} title={k}
      className={`min-w-[2.75rem] h-9 px-3 rounded-lg border text-sm font-semibold transition-colors ${
        current === k ? 'border-accent bg-accent/25 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5] hover:border-accent/40'
      }`}>{label}</button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold truncate">{title}</h2>
            {isSong && song?.artist && <p className="text-xs text-muted truncate">{song.artist}</p>}
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg shrink-0" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {isSong && (
            <section className="space-y-2.5">
              <div className="flex items-center gap-2">
                <KeyRound size={14} className="text-accent-light" />
                <p className="text-sm font-medium">Key for this set</p>
                {chosen && (
                  <button onClick={() => onSetKey(null)} className="ml-auto text-xs text-muted hover:text-[#f5f5f5]">Use song's key</button>
                )}
              </div>
              {!original ? (
                <p className="text-xs text-muted">Set this song's original key on its Chords step first, then you can choose a key here.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {songKeys.map(k => chip(k, k === original ? `${shortKey(k)} · original` : shortKey(k)))}
                  </div>
                  {otherKeys.length > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted shrink-0" htmlFor="other-key">Other key</label>
                      <select id="other-key" className="input !h-9 !py-0 !px-2 text-sm !w-auto"
                        value={songKeys.includes(current) ? '' : current} onChange={e => e.target.value && onSetKey(e.target.value)}>
                        <option value="">Choose…</option>
                        {otherKeys.map(k => <option key={k} value={k}>{shortKey(k)}</option>)}
                      </select>
                    </div>
                  )}
                  <p className="text-[11px] text-muted">Opens in {current || original} in the Song Viewer and for anyone this set is shared with. The song itself isn't changed.</p>
                </>
              )}
            </section>
          )}

          <section className="space-y-1.5">
            {canEdit && (
              <button onClick={onEdit}
                className="w-full flex items-center gap-3 px-3 h-11 rounded-lg border border-border hover:border-accent/50 hover:bg-card text-sm font-medium transition-colors">
                <Pencil size={15} className="text-accent-light" /> {isSong ? 'Edit Song' : 'Edit'}
              </button>
            )}
            <button onClick={() => (confirm ? onRemove() : setConfirm(true))}
              className={`w-full flex items-center gap-3 px-3 h-11 rounded-lg border text-sm font-medium transition-colors ${
                confirm ? 'border-red-600 bg-red-700 text-white' : 'border-border text-red-400 hover:border-red-500/60 hover:bg-red-500/10'
              }`}>
              <Trash2 size={15} /> {confirm ? 'Click again to remove' : 'Remove from Set'}
              {confirm && <Check size={14} className="ml-auto" />}
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
