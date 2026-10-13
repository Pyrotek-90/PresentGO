import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X, Pencil, Trash2, KeyRound, Check, ListOrdered, ChevronDown, Mic } from 'lucide-react'
import { transposeKeyOptions, parseKey } from '../../lib/chords'
import { songSections, sameArrangement } from '../../lib/arrangement'
import ArrangementBuilder from '../songs/ArrangementBuilder'

const shortKey = k => (k || '').replace(' Major', '').replace(' Minor', 'm')
const toEntries = labels => labels.map(label => ({ id: crypto.randomUUID(), label }))

// Opened from a program item: key and arrangement for this set (songs), edit, or remove it from the set.
export default function ItemOptionsDialog({ item, title, song, onClose, onSetKey, onSetArrangement, team = [], onSetLead, onEdit, onRemove }) {
  const [confirm, setConfirm] = useState(false)
  const isSong = item.type === 'song'
  const meta = song?.metadata || {}
  const original = meta.original_key || meta.key || ''
  const preferred = meta.preferred_key || ''
  const notes = meta.key_notes || {}
  const chosen = item.content?.key || ''
  const songKeys = [...new Set([original, ...(meta.transposed_keys || [])].filter(Boolean))]
  const mode = parseKey(original)?.mode
  const otherKeys = original ? transposeKeyOptions(original, mode).filter(k => !songKeys.includes(k)) : []
  const current = chosen || preferred || original
  const canEdit = item.type !== 'blank' && !(isSong && !song)

  // Arrangement for this set: starts from the song's own, changes stay with this set.
  const sections = isSong ? songSections(song) : null
  const setArr = item.content?.arrangement
  const [arrOpen, setArrOpen] = useState(!!setArr?.length)
  const [arr, setArr2] = useState(() => toEntries(setArr?.length ? setArr : sections?.sequence || []))
  const changeArr = next => {
    setArr2(next)
    const labels = next.map(e => e.label)
    onSetArrangement?.(sameArrangement(labels, sections.sequence) ? null : labels)
  }
  const lead = item.content?.lead || null
  const [leadOpen, setLeadOpen] = useState(false)
  const custom = arr.length > 0 && !sameArrangement(arr.map(e => e.label), sections?.sequence)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 pt-3 sm:pt-8 bg-black/70" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg max-h-[calc(100dvh-1.5rem)] sm:max-h-[85dvh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-border shrink-0">
          <div className="min-w-0 flex items-center gap-1">
            <div className="min-w-0">
              <h2 className="font-semibold truncate">{title}</h2>
              {isSong && song?.artist && <p className="text-xs text-muted truncate">{song.artist}</p>}
            </div>
            {canEdit && (
              <button onClick={onEdit} title={isSong ? 'Edit song' : 'Edit'} aria-label={isSong ? 'Edit song' : 'Edit'}
                className="shrink-0 p-1.5 rounded-lg text-muted hover:text-accent-light hover:bg-card"><Pencil size={15} /></button>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg shrink-0" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5 space-y-5">
          {isSong && (
            <section className="space-y-2">
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
                  <ul className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border/60" role="radiogroup" aria-label="Key for this set">
                    {songKeys.map(k => {
                      const on = current === k
                      const tags = [k === original && 'Original', k === preferred && 'Preferred'].filter(Boolean)
                      return (
                        <li key={k}>
                          <button role="radio" aria-checked={on} onClick={() => onSetKey(k === (preferred || original) ? null : k)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${on ? 'bg-accent/15' : 'hover:bg-[#1a1a1a]'}`}>
                            <span className={`w-[18px] h-[18px] shrink-0 rounded-full border-2 flex items-center justify-center ${on ? 'border-accent' : 'border-[#555]'}`}>
                              {on && <span className="w-2 h-2 rounded-full bg-accent" />}
                            </span>
                            <span className={`w-9 shrink-0 text-base font-bold ${on ? 'text-accent-light' : ''}`}>{shortKey(k)}</span>
                            <span className="flex-1 min-w-0 flex flex-wrap items-center gap-1">
                              {tags.map(t => (
                                <span key={t} className={`px-1.5 rounded text-[10px] font-semibold leading-4 ${t === 'Preferred' ? 'bg-accent/20 text-accent-light' : 'bg-[#2a2a2a] text-muted'}`}>{t}</span>
                              ))}
                              {notes[k] && <span className="text-xs text-muted truncate">{notes[k]}</span>}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
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
                  <p className="text-[11px] text-muted">Opens in {shortKey(current)} in the Song Viewer for this set. The song itself isn't changed.</p>
                </>
              )}
            </section>
          )}

          {isSong && sections?.order.length > 0 && (
            <section className="space-y-2">
              <button onClick={() => setArrOpen(o => !o)} aria-expanded={arrOpen} className="w-full flex items-center gap-2 text-left">
                <ListOrdered size={14} className="text-accent-light" />
                <span className="text-sm font-medium">Arrangement for this set</span>
                <span className="text-xs text-muted truncate">{custom ? 'Custom' : "Song's arrangement"}</span>
                <ChevronDown size={14} className={`ml-auto text-muted transition-transform ${arrOpen ? 'rotate-180' : ''}`} />
              </button>
              {!arrOpen && (
                <p className="text-xs text-muted leading-relaxed">{arr.map(e => e.label).join(' → ')}</p>
              )}
              {arrOpen && (
                <>
                  <ArrangementBuilder
                    sections={sections.order}
                    slideCounts={Object.fromEntries(sections.order.map(l => [l, sections.slidesBy[l].length]))}
                    arrangement={arr}
                    onChange={changeArr}
                    canReset={custom}
                    onReset={() => changeArr(toEntries(sections.sequence))}
                  />
                  <p className="text-[11px] text-muted">Used in the Song Viewer and on the screen for this set only. Reset goes back to the song's arrangement.</p>
                </>
              )}
            </section>
          )}

          {isSong && (
            <section className="space-y-2">
              <button onClick={() => setLeadOpen(o => !o)} aria-expanded={leadOpen} className="w-full flex items-center gap-2 text-left">
                <Mic size={14} className="text-accent-light" />
                <span className="text-sm font-medium">Song Leader</span>
                <span className={`text-xs truncate ${lead ? 'text-accent-light font-medium' : 'text-muted'}`}>{lead ? lead.name : 'None'}</span>
                <ChevronDown size={14} className={`ml-auto text-muted transition-transform ${leadOpen ? 'rotate-180' : ''}`} />
              </button>
              {leadOpen && (team.length === 0 ? (
                <p className="text-xs text-muted leading-relaxed">No one is assigned to this set yet. Add the team on the <Link to="/schedule" className="text-accent-light underline">Schedule</Link> page, then pick a Song Leader here.</p>
              ) : (
                <>
                  <ul className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border/60" role="radiogroup" aria-label="Song Leader">
                    {[{ id: null, name: 'No Song Leader' }, ...team].map(m => {
                      const on = (lead?.member_id || null) === m.id
                      return (
                        <li key={m.id || 'none'}>
                          <button role="radio" aria-checked={on} onClick={() => onSetLead?.(m.id ? { member_id: m.id, name: m.name } : null)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${on ? 'bg-accent/15' : 'hover:bg-[#1a1a1a]'}`}>
                            <span className={`w-[18px] h-[18px] shrink-0 rounded-full border-2 flex items-center justify-center ${on ? 'border-accent' : 'border-[#555]'}`}>
                              {on && <span className="w-2 h-2 rounded-full bg-accent" />}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className={`block text-sm truncate ${m.id ? 'font-medium' : 'text-muted'} ${on ? 'text-accent-light' : ''}`}>{m.name}</span>
                              {m.id && <span className="block text-[11px] text-muted truncate">{m.positions.join(', ')}</span>}
                            </span>
                            {m.status === 'declined' && <span className="shrink-0 text-[10px] text-red-300">Declined</span>}
                            {m.status === 'invited' && <span className="shrink-0 text-[10px] text-amber-300/90">Waiting</span>}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <p className="text-[11px] text-muted">From the team on this set; singers are listed first. Shows on the set list and in the Song Viewer.</p>
                </>
              ))}
            </section>
          )}

          <section>
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
