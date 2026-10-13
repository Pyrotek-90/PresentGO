import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, Music, ChevronRight, Check, X, ListPlus, Upload, Filter, ArrowUpDown } from 'lucide-react'
import { THEMES, OCCASIONS, songThemes, songOccasions, songLanguage, DEFAULT_LIBRARY_LANGUAGE } from '../../lib/songTags'
import { getPref, setPref } from '../../lib/prefs'
import { Link } from 'react-router-dom'
import { formatSetDate, todayISO } from '../../lib/sets'

// "G Major" -> "G", "E Minor" -> "Em"; original key first, then any transposed keys.
const shortKey = k => (k || '').replace(' Major', '').replace(' Minor', 'm')
const songKeys = song => {
  const m = song.metadata || {}
  const pref = m.preferred_key ? shortKey(m.preferred_key) : ''
  return [...new Set([m.original_key || m.key, ...(m.transposed_keys || [])].filter(Boolean).map(shortKey))]
    .map(k => ({ k, pref: k === pref }))
}

// Small popover menu that closes on an outside tap.
function Menu({ open, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-30 w-60 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl shadow-black/50 py-1.5">
      {children}
    </div>
  )
}

const MenuHeading = ({ children }) => <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">{children}</p>
const MenuItem = ({ on, onClick, children, count }) => (
  <button onClick={onClick} className="w-full flex items-center gap-2 px-3 h-9 text-sm text-left hover:bg-[#232323]">
    <span className="w-4 shrink-0 text-accent-light">{on && <Check size={14} />}</span>
    <span className="flex-1 truncate">{children}</span>
    {count != null && <span className="text-[11px] text-muted">{count}</span>}
  </button>
)

export default function SongsPane({ songs, loading, sets, targetSetId, onTargetChange, onCreateSet, onAdd, onEdit, onView, onNew,
  mainLanguage = DEFAULT_LIBRARY_LANGUAGE, lastUsed = {} }) {
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
  const [showFilters, setShowFilters] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [sort, setSort] = useState(() => getPref('librarySort', 'az'))   // 'az' | 'recent'
  const [rotationOnly, setRotationOnly] = useState(false)
  const [include, setInclude] = useState([])                             // e.g. ['occ:Christmas', 'lang:Hindi']

  const pickSort = v => { setSort(v); setPref('librarySort', v) }
  const [only, setOnly] = useState([])   // bubbles filled in: show only these occasions / languages
  const toggleInclude = k => {
    setInclude(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]))
    setOnly(prev => prev.filter(x => x !== k))
  }
  const toggleOnly = k => setOnly(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]))

  // Tags per song, worked out once per list change.
  const tagged = useMemo(() => songs.map(song => ({
    song, themes: songThemes(song), occasions: songOccasions(song), language: songLanguage(song),
  })), [songs])

  // Songs left out of the main list: occasions, and languages other than the library's main one.
  const visibleByDefault = t => !t.occasions.length && t.language === mainLanguage
  const included = t =>
    (!t.occasions.length || t.occasions.some(o => include.includes(`occ:${o}`))) &&
    (t.language === mainLanguage || include.includes(`lang:${t.language}`))
  // A filled-in occasion / language bubble narrows the list to songs with any of the filled ones.
  const matchesOnly = t => !only.length || only.some(k =>
    k.startsWith('occ:') ? t.occasions.includes(k.slice(4)) : t.language === k.slice(5))

  const occasionCounts = useMemo(() => {
    const m = {}
    for (const t of tagged) for (const o of t.occasions) m[o] = (m[o] || 0) + 1
    return [...OCCASIONS.filter(o => m[o]), ...Object.keys(m).filter(o => !OCCASIONS.includes(o)).sort()].map(o => [o, m[o]])
  }, [tagged])
  const languageCounts = useMemo(() => {
    const m = {}
    for (const t of tagged) if (t.language !== mainLanguage) m[t.language] = (m[t.language] || 0) + 1
    return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [tagged, mainLanguage])

  const inView = useMemo(() => tagged.filter(included), [tagged, include, mainLanguage])  // eslint-disable-line react-hooks/exhaustive-deps

  const themeCounts = useMemo(() => {
    const m = {}
    for (const t of inView) for (const th of t.themes) m[th] = (m[th] || 0) + 1
    const custom = Object.keys(m).filter(t => !THEMES.includes(t)).sort()
    return [...THEMES, ...custom].map(t => [t, m[t] || 0])
  }, [inView])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    // A search looks through every song, including hidden ones, so nothing is ever lost.
    const pool = q ? tagged : inView
    const byTitle = (a, b) => a.song.title.localeCompare(b.song.title, undefined, { sensitivity: 'base' })
    return pool
      .filter(({ song: s }) => !q || s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q) || (s.ccli_number || '').includes(q))
      .filter(t => !rotationOnly || t.song.metadata?.rotation)
      .filter(matchesOnly)
      .filter(t => !activeThemes.length || t.themes.some(th => activeThemes.includes(th)))
      .sort(sort === 'recent'
        ? (a, b) => (lastUsed[b.song.id] || '').localeCompare(lastUsed[a.song.id] || '') || byTitle(a, b)
        : byTitle)
  }, [tagged, inView, query, activeThemes, rotationOnly, only, sort, lastUsed])  // eslint-disable-line react-hooks/exhaustive-deps
  const rotationCount = inView.filter(t => t.song.metadata?.rotation).length

  const hiddenCount = tagged.length - inView.length

  // Occasions / languages added from the sort menu get a bubble under Filter, like Rotation List:
  // tap to fill it in and show only those songs.
  const includeBubbles = include.map(k => {
    const name = k.slice(k.indexOf(':') + 1)
    const n = inView.filter(t => (k.startsWith('occ:') ? t.occasions.includes(name) : t.language === name)).length
    const on = only.includes(k)
    return (
      <button key={k} onClick={() => toggleOnly(k)} aria-pressed={on} title={on ? `Showing only ${name}` : `Show only ${name}`}
        className={`px-2.5 h-6 rounded-full border text-[11px] font-medium transition-colors ${
          on ? 'border-accent bg-accent text-white' : 'border-accent/50 text-accent-light hover:bg-accent/10'
        }`}>{name} <span className="opacity-70">{n}</span></button>
    )
  })

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
          <span className="text-xs text-muted">{filtered.length}</span>
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
          <button onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters} title="Filter" aria-label="Filter songs"
            className={`relative shrink-0 flex items-center justify-center gap-1.5 h-8 w-8 sm:w-auto sm:px-2.5 rounded-lg border text-sm transition-colors ${
              showFilters || activeThemes.length || rotationOnly || only.length ? 'border-accent bg-accent/15 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5]'
            }`}>
            <Filter size={14} /> <span className="hidden sm:inline text-xs">Filter</span>
            {activeThemes.length + rotationOnly + only.length > 0 && <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 rounded-full bg-accent text-white text-[10px] leading-4 text-center">{activeThemes.length + rotationOnly + only.length}</span>}
          </button>
        <div className="relative shrink-0">
          <button onClick={() => setSortOpen(o => !o)} title="Sort and show more songs" aria-label="Sort and show more songs" aria-expanded={sortOpen}
            className={`relative flex items-center justify-center gap-1.5 h-8 w-8 sm:w-auto sm:px-2.5 rounded-lg border text-sm transition-colors ${
              include.length ? 'border-accent bg-accent/15 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5]'
            }`}>
            <ArrowUpDown size={14} /> <span className="hidden sm:inline text-xs">{sort === 'recent' ? 'Recent' : 'A–Z'}</span>
            {include.length > 0 && <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 rounded-full bg-accent text-white text-[10px] leading-4 text-center">{include.length}</span>}
          </button>
          <Menu open={sortOpen} onClose={() => setSortOpen(false)}>
            <MenuHeading>Sort</MenuHeading>
            <MenuItem on={sort === 'recent'} onClick={() => pickSort('recent')}>Recently used in a set</MenuItem>
            <MenuItem on={sort === 'az'} onClick={() => pickSort('az')}>A–Z</MenuItem>
            {(occasionCounts.length > 0 || languageCounts.length > 0) && (
              <div className="border-t border-border mt-1.5 pt-0.5">
                <MenuHeading>Also show</MenuHeading>
                {occasionCounts.map(([o, n]) => (
                <MenuItem key={o} on={include.includes(`occ:${o}`)} count={n} onClick={() => toggleInclude(`occ:${o}`)}>{o}</MenuItem>
                ))}
                {languageCounts.map(([l, n]) => (
                <MenuItem key={l} on={include.includes(`lang:${l}`)} count={n} onClick={() => toggleInclude(`lang:${l}`)}>{l}</MenuItem>
                ))}
                {include.length > 0 && (
                <button onClick={() => { setInclude([]); setOnly([]) }} className="w-full px-3 h-8 text-left text-xs text-muted hover:text-[#f5f5f5]">Back to the main list</button>
                )}
              </div>
            )}
          </Menu>
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
        {showFilters && (
          <div className="flex flex-wrap items-center gap-1">
            <button onClick={() => setRotationOnly(v => !v)} aria-pressed={rotationOnly}
              className={`px-2.5 h-6 rounded-full border text-[11px] font-medium transition-colors ${
                rotationOnly ? 'border-accent bg-accent text-white' : 'border-accent/50 text-accent-light hover:bg-accent/10'
              }`}>Rotation List <span className="opacity-70">{rotationCount}</span></button>
            {includeBubbles}
            <span className="w-px h-4 bg-border mx-0.5" />
            {themeCounts.map(([t, n]) => (
              <button key={t} onClick={() => toggleTheme(t)} disabled={!n && !activeThemes.includes(t)}
                className={`px-2 h-6 rounded-full border text-[11px] transition-colors ${
                  activeThemes.includes(t) ? 'border-accent bg-accent/20 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5] hover:border-accent/40'
                } disabled:opacity-35 disabled:cursor-default`}>{t} <span className="opacity-60">{n}</span></button>
            ))}
            {(activeThemes.length > 0 || rotationOnly || only.length > 0) && (
              <button onClick={() => { setActiveThemes([]); setRotationOnly(false); setOnly([]) }} className="flex items-center gap-0.5 px-1.5 h-6 text-[11px] text-muted hover:text-[#f5f5f5]">
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
            {songs.length > 0 && !query && hiddenCount > 0 && <p className="text-muted text-xs">{hiddenCount} occasion or other-language song{hiddenCount > 1 ? 's are' : ' is'} hidden — show them from the ⇅ menu.</p>}
            {songs.length === 0 && (
              <Link to="/get-started" className="btn-primary text-sm inline-flex items-center gap-2 mt-2">
                <Upload size={14} /> Import your existing charts
              </Link>
            )}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map(({ song, ...t }) => (
              <li key={song.id} className="flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-[#1a1a1a] group">
                <button onClick={() => onView(song)} className="flex-1 min-w-0 flex items-baseline gap-2 py-1 text-left text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{song.title}</span>
                    {song.artist && <span className="text-xs text-muted"> · {song.artist}</span>}
                    {!visibleByDefault(t) && (
                      <span className="ml-1.5 inline-block align-middle px-1.5 rounded border border-amber-500/40 text-[10px] text-amber-300/90 leading-4">
                        {[...t.occasions, ...(t.language !== mainLanguage ? [t.language] : [])].join(' · ')}
                      </span>
                    )}
                  </span>
                  {/* keys stay visible: they sit at the right and never get cut off */}
                  {songKeys(song).length > 0 && (
                    <span className="ml-auto shrink-0 text-xs text-muted">
                      {songKeys(song).map(({ k }) => k).join(', ')}
                    </span>
                  )}
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
