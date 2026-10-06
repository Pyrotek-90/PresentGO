import { useMemo, useState } from 'react'
import { Plus, Search, Music, Pencil, Trash2, Check, X } from 'lucide-react'
import { formatSetDate } from '../../lib/sets'

export default function SongsPane({ songs, loading, sets, targetSetId, onTargetChange, onAdd, onEdit, onDelete, onNew }) {
  const [query, setQuery] = useState('')
  const [activeThemes, setActiveThemes] = useState([])
  const [deleting, setDeleting] = useState(null)
  const [justAdded, setJustAdded] = useState(null)
  const [addError, setAddError] = useState(null)

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

  const handleDelete = song => {
    if (deleting === song.id) { onDelete(song); setDeleting(null) } else setDeleting(song.id)
  }

  const noSets = sets.length === 0

  return (
    <section className="flex flex-col min-h-0 h-full rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
        <div>
          <h2 className="font-semibold">Song Library</h2>
          <p className="text-xs text-muted">{songs.length} song{songs.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={onNew} className="btn-primary flex items-center gap-1.5 !py-1.5 !px-3 text-sm">
          <Plus size={14} /> New Song
        </button>
      </div>

      <div className="px-4 py-3 border-b border-border space-y-2.5 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted">Add songs to</span>
          <select className="input !h-8 !py-0 !px-2 text-sm flex-1 min-w-[10rem]" value={targetSetId || ''} disabled={noSets}
            onChange={e => onTargetChange(e.target.value)}>
            {noSets && <option value="">Create a set first</option>}
            {sets.map(s => <option key={s.id} value={s.id}>{s.name}{s.service_date ? ` · ${formatSetDate(s.service_date)}` : ''}</option>)}
          </select>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input !pl-9 !h-9 text-sm" placeholder="Search by title, artist, or CCLI #…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
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

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <Music size={36} className="text-muted mx-auto" />
            <p className="text-muted text-sm">{songs.length === 0 ? 'No songs yet. Add your first song to get started.' : 'No songs match your search or filters.'}</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map(song => (
              <li key={song.id} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[#1a1a1a] group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{song.title}</p>
                  <p className="text-xs text-muted truncate">
                    {[song.artist, song.metadata?.original_key || song.metadata?.key, ...(song.metadata?.themes || []).slice(0, 2)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onEdit(song)} className="p-2 rounded-lg hover:bg-[#2e2e2e] text-muted hover:text-[#f5f5f5]" title="Edit"><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(song)} title={deleting === song.id ? 'Click again to confirm delete' : 'Delete'}
                    className={`p-2 rounded-lg transition-colors ${deleting === song.id ? 'bg-red-700 text-white' : 'hover:bg-[#2e2e2e] text-muted hover:text-red-400'}`}><Trash2 size={14} /></button>
                </div>
                <button onClick={() => handleAdd(song)} disabled={noSets || !targetSetId}
                  className={`shrink-0 h-8 px-3 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    justAdded === song.id ? 'border-green-500/50 bg-green-500/15 text-green-400' : 'border-accent/50 bg-accent/10 text-accent-light hover:bg-accent/20'
                  }`}>
                  {justAdded === song.id ? <><Check size={12} /> Added</> : <><Plus size={12} /> Add</>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
