import { useMemo, useState } from 'react'
import { Plus, Search, Music, ChevronRight, Check, X, ListPlus, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatSetDate, todayISO } from '../../lib/sets'

// "G Major" -> "G", "E Minor" -> "Em"; original key first, then any transposed keys.
const shortKey = k => (k || '').replace(' Major', '').replace(' Minor', 'm')
const songKeys = song => {
  const m = song.metadata || {}
  return [...new Set([m.original_key || m.key, ...(m.transposed_keys || [])].filter(Boolean).map(shortKey))]
}

export default function SongsPane({ songs, loading, sets, targetSetId, onTargetChange, onCreateSet, onAdd, onEdit, onView, onNew }) {
  const [query, setQuery] = useState('')
  const [activeThemes, setActiveThemes] = useState([])
  const [addMode, setAddMode] = useState(false)
  const [justAdded, setJustAdded] = useState(null)
  const [addError, setAddError] = useState(null)
  const [newSetOpen, setNewSetOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState(todayISO)
  const [creatingSet, setCreatingSet] = useState(false)
  const [newSetError, setNewSetError] = useState(null)

  const themeCounts = useMemo(() => {
    const m = {}
    for (const s of songs) for (const t of s.metadata?.themes || []) m[t] = (m[t] || 0) + 1
    return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [songs])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return songs
      .filter(s => !q || s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q) || (s.ccli_number || '').includes(q))
      .filter(s => !activeThemes.length || (s.metadata?.themes || []).some(t => activeThemes.includes(t)))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
  }, [songs, query, activeThemes])

  const toggleTheme = t => setActiveThemes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const handleAdd = async song => {
    setAddError(null)
    try {
      await onAdd(song)
      setJustAdded(song.id)
      setTimeout(() => setJustAdded(id => (id === song.id ? null : id)), 1800)
    } catch {
      setAddError(`Could not add "${song.title}" to the set.`)
    }
  }

  const noSets = sets.length === 0

  const closeNewSet = () => { setNewSetOpen(false); setNewName(''); setNewDate(todayISO()); setNewSetError(null) }
  const submitNewSet = async () => {
    if (!newName.trim() || creatingSet) return
    setCreatingSet(true); setNewSetError(null)
    const err = await onCreateSet({ name: newName.trim(), date: newDate })
    setCreatingSet(false)
    if (err) setNewSetError(err)
    else closeNewSet()
  }
  const toggleAddMode = () => {
    const on = !addMode
    setAddMode(on)
    if (on && noSets) setNewSetOpen(true)   // nothing to add to yet: start with the new-set form
    if (!on) closeNewSet()
  }

  return (
    <section className="flex flex-col min-h-0 flex-1 rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="font-semibold whitespace-nowrap">Song Library</h2>
          <span className="text-xs text-muted">{songs.length}</span>
        </div>
        {/* On phones the buttons show icons only so the header stays on one row. */}
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={toggleAddMode}
            title={addMode ? 'Done adding to set' : 'Add songs to a set'}
            aria-label={addMode ? 'Done adding to set' : 'Add songs to a set'}
            className={`flex items-center justify-center gap-1.5 h-8 w-8 sm:w-auto sm:px-3 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors ${
              addMode ? 'border-accent bg-accent/20 text-accent-light' : 'border-accent/50 text-accent-light hover:bg-accent/10'
            }`}>
            {addMode
              ? <><Check size={14} /> <span className="hidden sm:inline">Done</span></>
              : <><ListPlus size={14} /> <span className="hidden sm:inline">+ To Set</span></>}
          </button>
          <Link to="/get-started" title="Import a folder of ChordPro or PDF charts" aria-label="Import songs"
            className="flex items-center justify-center gap-1.5 h-8 w-8 sm:w-auto sm:px-3 rounded-lg border border-accent/50 text-sm font-medium text-accent-light whitespace-nowrap hover:bg-accent/10 transition-colors">
            <Upload size={14} /> <span className="hidden sm:inline">Import</span>
          </Link>
          <button onClick={onNew} title="New song" aria-label="New song"
            className="btn-primary flex items-center justify-center gap-1.5 h-8 w-8 sm:w-auto !p-0 sm:!px-3 text-sm whitespace-nowrap">
            <Plus size={14} /> <span className="hidden sm:inline">New Song</span>
          </button>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-border space-y-2 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[10rem]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !pl-9 !h-8 text-sm" placeholder="Search title, artist, or CCLI #…" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          {addMode && <span className="text-[10px] uppercase tracking-widest text-muted">Add to</span>}
          {addMode && <select className="input !h-8 !py-0 !px-2 text-sm !w-auto max-w-[14rem]" value={newSetOpen ? '__new' : targetSetId || ''}
            onChange={e => { if (e.target.value === '__new') setNewSetOpen(true); else { closeNewSet(); onTargetChange(e.target.value) } }}>
            {noSets && !newSetOpen && <option value="">No sets yet</option>}
            {sets.map(s => <option key={s.id} value={s.id}>{s.name}{s.service_date ? ` · ${formatSetDate(s.service_date)}` : ''}</option>)}
            <option value="__new">+ New Set…</option>
          </select>}
        </div>
        {addMode && newSetOpen && (
          <div className="space-y-1.5">
            {newSetError && <p className="text-red-400 text-xs">{newSetError}</p>}
            <div className="flex flex-wrap gap-2">
              <input className="input flex-1 min-w-[10rem] !h-8 text-sm" placeholder="New set name, e.g. Sunday Morning Worship" autoFocus
                value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitNewSet(); if (e.key === 'Escape') closeNewSet() }} />
              <input type="date" className="input !h-8 !py-0 text-sm !w-auto" value={newDate} onChange={e => setNewDate(e.target.value)} aria-label="Service date" />
              <button onClick={submitNewSet} disabled={creatingSet || !newName.trim()} className="btn-primary !py-0 h-8 !px-3 text-sm shrink-0">
                {creatingSet ? 'Creating…' : 'Create'}
              </button>
              <button onClick={closeNewSet} className="btn-ghost !py-0 h-8 !px-3 text-sm shrink-0">Cancel</button>
            </div>
          </div>
        )}
        {themeCounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {themeCounts.map(([t, n]) => (
              <button key={t} onClick={() => toggleTheme(t)}
                className={`px-2 h-6 rounded-full border text-[11px] transition-colors ${
                  activeThemes.includes(t) ? 'border-accent bg-accent/20 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5] hover:border-accent/40'
                }`}>{t} <span className="opacity-60">{n}</span></button>
            ))}
            {activeThemes.length > 0 && (
              <button onClick={() => setActiveThemes([])} className="flex items-center gap-0.5 px-1.5 h-6 text-[11px] text-muted hover:text-[#f5f5f5]">
                <X size={10} /> Clear
              </button>
            )}
          </div>
        )}
        {addError && <p className="text-red-400 text-xs">{addError}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1">
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <Music size={36} className="text-muted mx-auto" />
            <p className="text-muted text-sm">{songs.length === 0 ? 'No songs yet. Add your first song to get started.' : 'No songs match your search or filters.'}</p>
            {songs.length === 0 && (
              <Link to="/get-started" className="btn-primary text-sm inline-flex items-center gap-2 mt-2">
                <Upload size={14} /> Import your existing charts
              </Link>
            )}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map(song => (
              <li key={song.id} className="flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-[#1a1a1a] group">
                <button onClick={() => onView(song)} className="flex-1 min-w-0 py-1 text-left truncate text-sm">
                  <span className="font-medium">{song.title}</span>
                  {song.artist && <span className="text-xs text-muted"> · {song.artist}</span>}
                  {songKeys(song).map((k, i) => (
                    <span key={k} title={i === 0 ? 'Original key' : 'Transposed key'}
                      className={`ml-1.5 inline-flex items-center px-1.5 rounded text-[10px] font-semibold align-[1px] ${i === 0 ? 'bg-accent/20 text-accent-light' : 'border border-border text-muted'}`}>{k}</span>
                  ))}
                </button>
                {addMode && (
                  <button onClick={() => handleAdd(song)} disabled={noSets || !targetSetId}
                    className={`shrink-0 h-7 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      justAdded === song.id ? 'border-green-500/50 bg-green-500/15 text-green-400' : 'border-accent/50 bg-accent/10 text-accent-light hover:bg-accent/20'
                    }`}>
                    {justAdded === song.id ? <><Check size={11} /> Added</> : <><Plus size={11} /> Add</>}
                  </button>
                )}
                <button onClick={() => onEdit(song)} className="p-1.5 rounded-lg text-muted hover:text-[#f5f5f5] hover:bg-[#2e2e2e] shrink-0" title="Edit song" aria-label={`Edit ${song.title}`}>
                  <ChevronRight size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
