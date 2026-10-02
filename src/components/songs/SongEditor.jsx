import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatLyrics } from '../../lib/lyricFormatter'
import {
  X, Wand2, Plus, Trash2, SplitSquareHorizontal,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Search, Loader2, Lock, ChevronDown, Tag, Sparkles, ListOrdered,
} from 'lucide-react'

const PRESET_LABELS = [
  'Verse 1', 'Verse 2', 'Verse 3', 'Verse 4',
  'Chorus', 'Pre-Chorus', 'Bridge', 'Outro', 'Intro', 'Tag',
]

// ─── Label picker dropdown (for slide preview) ───────────────────────────────
function LabelPicker({ onSelect, onClose }) {
  const [custom, setCustom] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="absolute left-0 top-full mt-1 z-50 w-64 bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
      <div className="p-2 grid grid-cols-2 gap-1">
        {PRESET_LABELS.map(label => (
          <button key={label} onClick={() => { onSelect(label); onClose() }}
            className="text-left px-3 py-1.5 rounded-lg text-sm hover:bg-accent/20 hover:text-accent-light transition-colors text-muted">
            {label}
          </button>
        ))}
      </div>
      <div className="border-t border-border" />
      <div className="p-2 flex gap-1.5">
        <input autoFocus className="input text-sm py-1 flex-1" placeholder="Custom label…"
          value={custom} onChange={e => setCustom(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && custom.trim()) { onSelect(custom.trim()); onClose() }
            if (e.key === 'Escape') onClose()
          }}
        />
        <button onClick={() => { if (custom.trim()) { onSelect(custom.trim()); onClose() } }}
          className="btn-primary px-3 py-1 text-sm shrink-0">Add</button>
      </div>
    </div>
  )
}

// ─── Insert-section-label dropdown (for raw lyrics textarea) ─────────────────
function InsertLabelMenu({ onInsert, onClose }) {
  const [custom, setCustom] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="absolute left-0 top-full mt-1 z-50 w-56 bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
      <p className="text-[10px] text-muted px-3 pt-2 pb-1 uppercase tracking-wider">Insert section label</p>
      <div className="p-1.5 grid grid-cols-2 gap-0.5">
        {PRESET_LABELS.map(label => (
          <button key={label} onClick={() => { onInsert(label); onClose() }}
            className="text-left px-2.5 py-1.5 rounded-lg text-sm hover:bg-accent/20 hover:text-accent-light transition-colors text-muted">
            {label}
          </button>
        ))}
      </div>
      <div className="border-t border-border p-2 flex gap-1.5">
        <input autoFocus className="input text-sm py-1 flex-1" placeholder="Custom…"
          value={custom} onChange={e => setCustom(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && custom.trim()) { onInsert(custom.trim()); onClose() }
            if (e.key === 'Escape') onClose()
          }}
        />
        <button onClick={() => { if (custom.trim()) { onInsert(custom.trim()); onClose() } }}
          className="btn-primary px-2.5 py-1 text-sm shrink-0">Add</button>
      </div>
    </div>
  )
}

// ─── Lyrics search — tries lrclib.net then lyrics.ovh as fallback ────────────
async function tryLrclib(query) {
  const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error('lrclib down')
  const json = await res.json()
  return (json || []).slice(0, 10).map(item => ({
    title:       item.trackName,
    artist:      item.artistName || '',
    album:       item.albumName  || '',
    plainLyrics: item.plainLyrics || '',
  }))
}

async function tryLyricsOvh(query) {
  const res = await fetch(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error('lyrics.ovh down')
  const json = await res.json()
  // lyrics.ovh suggest doesn't return lyrics — fetch them per result
  const results = (json.data || []).slice(0, 8)
  const withLyrics = await Promise.allSettled(
    results.map(async item => {
      try {
        const lr = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(item.artist.name)}/${encodeURIComponent(item.title)}`)
        const lj = await lr.json()
        return { title: item.title, artist: item.artist?.name || '', album: '', plainLyrics: lj.lyrics || '' }
      } catch {
        return { title: item.title, artist: item.artist?.name || '', album: '', plainLyrics: '' }
      }
    })
  )
  return withLyrics.filter(r => r.status === 'fulfilled').map(r => r.value)
}

async function searchSongs(query) {
  try {
    const hits = await tryLrclib(query)
    if (hits.length > 0) return { hits, source: 'lrclib' }
  } catch { /* fall through to backup */ }

  try {
    const hits = await tryLyricsOvh(query)
    return { hits, source: 'lyrics.ovh' }
  } catch { /* fall through */ }

  throw new Error('all_down')
}

function LyricsSearch({ onSongFound }) {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState(null)
  const [showGoogleFallback, setShowGoogleFallback] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSearch = async (e) => {
    e?.preventDefault()
    if (!query.trim()) return
    setSearching(true); setSearchErr(null); setResults([]); setShowGoogleFallback(false)
    try {
      const { hits } = await searchSongs(query.trim())
      setResults(hits)
      if (hits.length === 0) {
        setSearchErr('No results found.')
        setShowGoogleFallback(true)
      }
    } catch (err) {
      if (err.message === 'all_down') {
        setSearchErr('Both lyrics services are down right now.')
      } else {
        setSearchErr('Search failed — check your connection.')
      }
      setShowGoogleFallback(true)
    } finally {
      setSearching(false)
    }
  }

  const openGoogleSearch = () => {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query + ' lyrics')}`, '_blank')
  }

  const handlePick = (result) => {
    if (!result.plainLyrics) {
      setSearchErr(`No lyrics found for "${result.title}". Try another result or paste lyrics manually.`)
      setShowGoogleFallback(true)
      return
    }
    onSongFound({ title: result.title, artist: result.artist, lyrics: result.plainLyrics })
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input ref={inputRef} className="input flex-1" placeholder="Search by song title or artist…"
          value={query} onChange={e => setQuery(e.target.value)} />
        <button type="submit" disabled={searching || !query.trim()}
          className="btn-primary px-4 flex items-center gap-1.5 shrink-0">
          {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {results.length > 0 && (
        <ul className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {results.map((r, i) => (
            <li key={i}>
              <button onClick={() => handlePick(r)}
                className="w-full text-left px-4 py-2.5 hover:bg-[#222] transition-colors flex items-center justify-between gap-3 group">
                <span className="min-w-0">
                  <span className="block text-sm text-[#f5f5f5] truncate">{r.title}</span>
                  <span className="block text-xs text-muted truncate">
                    {r.artist}{r.album ? ` · ${r.album}` : ''}
                  </span>
                </span>
                <span className={`text-xs shrink-0 transition-colors ${r.plainLyrics ? 'text-muted group-hover:text-accent-light' : 'text-red-400/60'}`}>
                  {r.plainLyrics ? 'Select →' : 'No lyrics'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchErr && (
        <div className="space-y-2">
          <p className="text-xs text-red-400">{searchErr}</p>
          {showGoogleFallback && query.trim() && (
            <button
              onClick={openGoogleSearch}
              className="flex items-center gap-2 text-xs text-accent-light hover:underline"
            >
              <Search size={12} />
              Search "{query} lyrics" on Google — then paste below
            </button>
          )}
        </div>
      )}

      <div className="flex items-start gap-2">
        <Lock size={11} className="text-muted shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted leading-snug">
          Song lyrics are protected by copyright.{' '}
          <span className="text-[#f5f5f5]">Churches</span> should verify coverage via{' '}
          <a href="https://ccli.com" target="_blank" rel="noreferrer" className="underline hover:text-accent-light">CCLI</a>.{' '}
          <span className="text-accent-light">CCLI API integration</span> is planned as a premium feature.
        </p>
      </div>
    </div>
  )
}

// ─── Main editor ──────────────────────────────────────────────────────────────
export default function SongEditor({ song, onClose, onSaved }) {
  const { user } = useAuth()
  const isNew = !song

  const [title, setTitle]               = useState(song?.title || '')
  const [artist, setArtist]             = useState(song?.artist || '')
  const [ccliNumber, setCcliNumber]     = useState(song?.ccli_number || '')
  const [rawLyrics, setRawLyrics]       = useState(song?.raw_lyrics || '')
  const [linesPerSlide, setLinesPerSlide] = useState(song?.lines_per_slide || 2)
  const [slides, setSlides]             = useState(song?.slides || [])
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState(null)

  const [showSearch, setShowSearch]     = useState(isNew)
  const [cleaningUp, setCleaningUp]     = useState(false)
  const [cleanupErr, setCleanupErr]     = useState(null)
  const [showInsertMenu, setShowInsertMenu] = useState(false)
  const [pickerIdx, setPickerIdx]       = useState(-1)
  const [showSlides, setShowSlides]     = useState(!!song?.slides?.length)

  // Arrangement state
  const [sectionsMap, setSectionsMap]   = useState({})   // { 'Verse 1': [slides] }
  const [sectionOrder, setSectionOrder] = useState([])   // unique labels in order
  const [arrangement, setArrangement]   = useState([])   // [{ id, label }, ...]

  const lyricsRef = useRef(null)

  useEffect(() => {
    if (song?.slides) setSlides(song.slides)
  }, [song])

  // Generate final slides from arrangement × sectionsMap
  const buildSlidesFromArrangement = (map, arr) =>
    arr.flatMap(entry =>
      (map[entry.label] || []).map((s, i) => ({
        ...s,
        label: i === 0 ? entry.label : null,
      }))
    )

  const handleSongFound = ({ title: t, artist: a, lyrics }) => {
    if (t) setTitle(t)
    if (a) setArtist(a)
    setRawLyrics(lyrics)
    setSlides([])
    setShowSlides(false)
    setSectionsMap({})
    setSectionOrder([])
    setArrangement([])
    setShowSearch(false)
    setTimeout(() => lyricsRef.current?.focus(), 50)
  }

  // Insert a [Label] marker at cursor position in the textarea
  const insertSectionLabel = (label) => {
    const ta = lyricsRef.current
    if (!ta) return
    const start = ta.selectionStart
    const text = rawLyrics
    const lineStart = text.lastIndexOf('\n', start - 1) + 1
    const prefix = lineStart === 0 || text[lineStart - 1] === '\n' ? '' : '\n'
    const insertion = `${prefix}[${label}]\n`
    const newText = text.substring(0, start) + insertion + text.substring(start)
    setRawLyrics(newText)
    const newPos = start + insertion.length
    setTimeout(() => {
      ta.selectionStart = newPos
      ta.selectionEnd = newPos
      ta.focus()
    }, 0)
  }

  const handleSmartCleanup = async () => {
    if (!rawLyrics.trim()) return
    setCleaningUp(true)
    setCleanupErr(null)
    try {
      const res = await fetch('/api/cleanup-lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics: rawLyrics }),
      })

      let json
      try {
        json = await res.json()
      } catch {
        throw new Error(
          res.status === 404
            ? 'Smart Cleanup only runs on the deployed app (present-go-five.vercel.app), not locally.'
            : `Server error (${res.status}) — try again or paste lyrics manually.`
        )
      }

      if (!res.ok || json.error) throw new Error(json.error || 'Cleanup failed')
      setRawLyrics(json.cleaned)
      setSlides([])
      setShowSlides(false)
      setSectionsMap({})
      setSectionOrder([])
      setArrangement([])
    } catch (e) {
      setCleanupErr(e.message || 'Smart cleanup unavailable.')
    } finally {
      setCleaningUp(false)
    }
  }

  const handleFormatSong = () => {
    const lines = rawLyrics.split('\n')
    const sections = []   // [{ label, lines }]
    let currentLabel = null
    let buffer = []

    for (const line of lines) {
      const match = line.match(/^\[(.+?)\]$/)
      if (match) {
        if (currentLabel !== null) {
          sections.push({ label: currentLabel, lines: [...buffer] })
        } else if (buffer.some(l => l.trim())) {
          sections.push({ label: 'Intro', lines: [...buffer] })
        }
        currentLabel = match[1].trim()
        buffer = []
      } else {
        buffer.push(line)
      }
    }
    if (currentLabel !== null && buffer.some(l => l.trim())) {
      sections.push({ label: currentLabel, lines: [...buffer] })
    } else if (currentLabel === null && buffer.some(l => l.trim())) {
      sections.push({ label: 'Song', lines: buffer })
    }

    // Deduplicate identical section content (keep first occurrence)
    const seen = {}
    const uniqueSections = []
    for (const sec of sections) {
      const key = sec.lines.join('\n').trim()
      if (!seen[sec.label]) {
        seen[sec.label] = key
        uniqueSections.push(sec)
      } else if (seen[sec.label] !== key) {
        // Same label but different content → keep (e.g. Verse 1 vs Verse 2)
        uniqueSections.push(sec)
      }
      // exact duplicate of same label → skip
    }

    // Build sectionsMap: label → array of slide objects
    const map = {}
    const order = []
    for (const sec of uniqueSections) {
      if (map[sec.label]) continue   // already have this label
      order.push(sec.label)
      const contentLines = sec.lines.join('\n').trim().split('\n')
      const secSlides = []
      let cur = []
      for (const l of contentLines) {
        if (l.trim() === '') {
          if (cur.length > 0) { secSlides.push({ lines: cur, label: null }); cur = [] }
        } else {
          cur.push(l)
          if (cur.length >= linesPerSlide) { secSlides.push({ lines: cur, label: null }); cur = [] }
        }
      }
      if (cur.length > 0) secSlides.push({ lines: cur, label: null })
      if (secSlides.length > 0) {
        secSlides[0] = { ...secSlides[0], label: sec.label }
        map[sec.label] = secSlides
      }
    }

    setSectionsMap(map)
    setSectionOrder(order)

    const defaultArr = order.map(label => ({ id: crypto.randomUUID(), label }))
    setArrangement(defaultArr)
    const finalSlides = buildSlidesFromArrangement(map, defaultArr)
    setSlides(finalSlides)
    setShowSlides(true)
  }

  const handleSave = async () => {
    if (!title.trim()) { setError('Song title is required.'); return }
    setSaving(true); setError(null)

    const payload = {
      user_id: user.id,
      title: title.trim(),
      artist: artist.trim(),
      ccli_number: ccliNumber.trim(),
      raw_lyrics: rawLyrics,
      lines_per_slide: linesPerSlide,
      slides,
    }

    let result
    if (song?.id) {
      result = await supabase.from('songs').update(payload).eq('id', song.id).select().single()
    } else {
      result = await supabase.from('songs').insert(payload).select().single()
    }

    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    onSaved?.(result.data)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold">{isNew ? 'New Song' : 'Edit Song'}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">

          {/* ── 1. Search ─────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              onClick={() => setShowSearch(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1e1e1e] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Search size={15} className="text-accent-light" />
                <span className="text-sm font-medium">Search Lyrics Online</span>
                <span className="text-[10px] text-muted px-2 py-0.5 rounded-full border border-border hidden sm:inline">
                  Powered by lyrics.ovh
                </span>
              </div>
              <ChevronDown size={15} className={`text-muted transition-transform ${showSearch ? 'rotate-180' : ''}`} />
            </button>
            {showSearch && (
              <div className="px-4 pb-4 pt-1 border-t border-border">
                <LyricsSearch onSongFound={handleSongFound} />
              </div>
            )}
          </div>

          {/* ── 2. Song details ───────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="label">Title *</label>
              <input className="input" placeholder="Amazing Grace" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">CCLI #</label>
              <input className="input" placeholder="1234567" value={ccliNumber} onChange={e => setCcliNumber(e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <label className="label">Artist / Author</label>
              <input className="input" placeholder="John Newton" value={artist} onChange={e => setArtist(e.target.value)} />
            </div>
          </div>

          {/* ── 3. Lyrics editor ──────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="label mb-0">Lyrics</label>
              <div className="flex items-center gap-2">
                {/* Insert section label */}
                <div className="relative">
                  <button
                    onClick={() => setShowInsertMenu(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted hover:text-[#f5f5f5] border border-border rounded-lg px-2.5 py-1.5 hover:border-accent/50 transition-colors"
                  >
                    <Tag size={12} />
                    Insert Section
                    <ChevronDown size={11} className={`transition-transform ${showInsertMenu ? 'rotate-180' : ''}`} />
                  </button>
                  {showInsertMenu && (
                    <InsertLabelMenu
                      onInsert={insertSectionLabel}
                      onClose={() => setShowInsertMenu(false)}
                    />
                  )}
                </div>

                {/* Smart Cleanup */}
                <button
                  onClick={handleSmartCleanup}
                  disabled={cleaningUp || !rawLyrics.trim()}
                  className="flex items-center gap-1.5 text-xs bg-accent/10 hover:bg-accent/20 text-accent-light border border-accent/30 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-40"
                >
                  {cleaningUp
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Sparkles size={12} />}
                  {cleaningUp ? 'Cleaning…' : 'Smart Cleanup'}
                </button>
              </div>
            </div>

            {cleanupErr && <p className="text-xs text-amber-400">{cleanupErr}</p>}

            <textarea
              ref={lyricsRef}
              className="input h-64 resize-none font-mono text-sm leading-relaxed"
              placeholder={`[Verse 1]\nAmazing grace how sweet the sound\nThat saved a wretch like me\n\n[Chorus]\nMy chains are gone I've been set free\nMy God my Savior has ransomed me`}
              value={rawLyrics}
              onChange={e => {
                setRawLyrics(e.target.value)
                setShowSlides(false)
                setSectionsMap({})
                setSectionOrder([])
                setArrangement([])
              }}
            />

            <p className="text-[11px] text-muted">
              Use <code className="bg-card px-1 rounded">[Verse 1]</code>, <code className="bg-card px-1 rounded">[Chorus]</code> etc. to mark sections, or use <strong>Insert Section</strong> above to add them at your cursor.
              Use <strong>Smart Cleanup</strong> to remove metadata and deduplicate repeated sections automatically.
            </p>
          </div>

          {/* ── 4. Format into Slides ─────────────────────────────────────── */}
          {rawLyrics.trim() && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="text-sm font-medium">Format into Slides</p>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">Lines per slide</span>
                <div className="flex gap-2">
                  {[2, 3, 4].map(n => (
                    <button
                      key={n}
                      onClick={() => setLinesPerSlide(n)}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                        linesPerSlide === n
                          ? 'border-accent bg-accent/20 text-accent-light'
                          : 'border-border bg-surface text-muted hover:text-[#f5f5f5]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button onClick={handleFormatSong} className="btn-primary flex items-center gap-2 ml-auto">
                  <Wand2 size={15} />
                  Format Song
                </button>
              </div>
            </div>
          )}

          {/* ── 5. Song Arrangement ───────────────────────────────────────── */}
          {sectionOrder.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-2">
                  <ListOrdered size={15} className="text-accent-light" />
                  Song Arrangement
                </p>
                <button
                  onClick={() => { setArrangement([]); setSlides([]); setShowSlides(false) }}
                  className="text-xs text-muted hover:text-red-400 transition-colors"
                >
                  Clear
                </button>
              </div>

              {/* Section palette */}
              <div>
                <p className="text-[11px] text-muted mb-2">Tap a section to add it to the arrangement:</p>
                <div className="flex flex-wrap gap-1.5">
                  {sectionOrder.map(label => (
                    <button
                      key={label}
                      onClick={() => {
                        const newArr = [...arrangement, { id: crypto.randomUUID(), label }]
                        setArrangement(newArr)
                        setSlides(buildSlidesFromArrangement(sectionsMap, newArr))
                        setShowSlides(true)
                      }}
                      className="px-2.5 py-1 rounded-lg border border-accent/40 bg-accent/10 text-accent-light text-xs font-medium hover:bg-accent/20 transition-colors"
                    >
                      + {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Arrangement chips */}
              {arrangement.length > 0 ? (
                <div>
                  <p className="text-[11px] text-muted mb-2">
                    Order — {arrangement.length} section{arrangement.length !== 1 ? 's' : ''} · {slides.length} slides
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {arrangement.map((entry, i) => (
                      <span
                        key={entry.id}
                        className="inline-flex items-center gap-0.5 pl-1 pr-1.5 py-1 rounded-lg bg-surface border border-border text-xs text-[#f5f5f5]"
                      >
                        <button
                          disabled={i === 0}
                          onClick={() => {
                            const n = [...arrangement]; [n[i - 1], n[i]] = [n[i], n[i - 1]]
                            setArrangement(n); setSlides(buildSlidesFromArrangement(sectionsMap, n))
                          }}
                          className="p-0.5 rounded text-muted hover:text-[#f5f5f5] disabled:opacity-20 transition-colors"
                        >
                          <ArrowLeft size={10} />
                        </button>
                        <span className="px-1">{entry.label}</span>
                        <button
                          disabled={i === arrangement.length - 1}
                          onClick={() => {
                            const n = [...arrangement]; [n[i], n[i + 1]] = [n[i + 1], n[i]]
                            setArrangement(n); setSlides(buildSlidesFromArrangement(sectionsMap, n))
                          }}
                          className="p-0.5 rounded text-muted hover:text-[#f5f5f5] disabled:opacity-20 transition-colors"
                        >
                          <ArrowRight size={10} />
                        </button>
                        <button
                          onClick={() => {
                            const n = arrangement.filter((_, ai) => ai !== i)
                            setArrangement(n)
                            setSlides(buildSlidesFromArrangement(sectionsMap, n))
                            if (n.length === 0) setShowSlides(false)
                          }}
                          className="p-0.5 rounded text-muted hover:text-red-400 transition-colors"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted italic">Tap sections above to build your arrangement.</p>
              )}
            </div>
          )}

          {/* ── 6. Slide preview ──────────────────────────────────────────── */}
          {showSlides && slides.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Slide Preview
                  <span className="text-muted text-xs font-normal ml-2">({slides.length} slides)</span>
                </p>
              </div>

              {slides.map((slide, i) => (
                <div key={i} className="card space-y-2 group/slide">
                  {/* Section label row */}
                  <div className="relative flex items-center gap-2 -mt-1 mb-0.5 min-h-[22px]">
                    {slide.label !== null && slide.label !== undefined ? (
                      <input
                        className="text-[10px] font-semibold uppercase tracking-wider text-accent-light bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-full focus:outline-none focus:border-accent w-32"
                        value={slide.label}
                        placeholder="Section name"
                        onChange={e => setSlides(prev => prev.map((s, si) =>
                          si === i ? { ...s, label: e.target.value } : s
                        ))}
                      />
                    ) : (
                      <button
                        onClick={() => setPickerIdx(idx => idx === i ? -1 : i)}
                        className="flex items-center gap-1 text-[10px] text-muted hover:text-accent-light transition-colors opacity-0 group-hover/slide:opacity-100"
                      >
                        <Tag size={10} /> label section
                      </button>
                    )}
                    {pickerIdx === i && (
                      <LabelPicker
                        onSelect={label => {
                          setSlides(prev => prev.map((s, si) => si === i ? { ...s, label } : s))
                          setPickerIdx(-1)
                        }}
                        onClose={() => setPickerIdx(-1)}
                      />
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted w-5 shrink-0">{i + 1}</span>
                    <span className="flex-1" />
                    <div className="flex items-center gap-1 opacity-0 group-hover/slide:opacity-100 transition-opacity">
                      <button title="Move up" disabled={i === 0}
                        onClick={() => setSlides(prev => { const n=[...prev]; [n[i-1],n[i]]=[n[i],n[i-1]]; return n })}
                        className="p-1 rounded hover:bg-[#333] text-muted hover:text-[#f5f5f5] disabled:opacity-20">
                        <ArrowUp size={12} /></button>
                      <button title="Move down" disabled={i === slides.length - 1}
                        onClick={() => setSlides(prev => { const n=[...prev]; [n[i],n[i+1]]=[n[i+1],n[i]]; return n })}
                        className="p-1 rounded hover:bg-[#333] text-muted hover:text-[#f5f5f5] disabled:opacity-20">
                        <ArrowDown size={12} /></button>
                      <button title="Delete slide"
                        onClick={() => setSlides(prev => prev.filter((_, si) => si !== i))}
                        className="p-1 rounded hover:bg-red-700/30 text-muted hover:text-red-400">
                        <Trash2 size={12} /></button>
                    </div>
                  </div>

                  {slide.lines.map((line, j) => (
                    <div key={j} className="flex items-center gap-2 group/line">
                      <span className="text-[10px] text-gray-700 w-4 shrink-0 text-right">{j + 1}</span>
                      <input
                        className="flex-1 bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none text-sm py-0.5 text-[#f5f5f5]"
                        value={line}
                        onChange={e => setSlides(prev => prev.map((s, si) =>
                          si === i ? { ...s, lines: s.lines.map((l, li) => li === j ? e.target.value : l) } : s
                        ))}
                      />
                      <div className="flex gap-1 opacity-0 group-hover/line:opacity-100 transition-opacity shrink-0">
                        {j > 0 && (
                          <button title="Split before this line"
                            onClick={() => setSlides(prev => {
                              const s = prev[i]
                              const before = { ...s, lines: s.lines.slice(0, j) }
                              const after  = { ...s, lines: s.lines.slice(j), label: null }
                              return [...prev.slice(0, i), before, after, ...prev.slice(i + 1)]
                            })}
                            className="p-1 rounded hover:bg-[#333] text-muted hover:text-accent-light">
                            <SplitSquareHorizontal size={11} /></button>
                        )}
                        <button title="Remove line"
                          onClick={() => setSlides(prev => prev.map((s, si) =>
                            si === i ? { ...s, lines: s.lines.filter((_, li) => li !== j) } : s
                          ).filter(s => s.lines.length > 0))}
                          className="p-1 rounded hover:bg-red-700/30 text-muted hover:text-red-400">
                          <X size={11} /></button>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => setSlides(prev => prev.map((s, si) =>
                      si === i ? { ...s, lines: [...s.lines, ''] } : s
                    ))}
                    className="flex items-center gap-1 text-[10px] text-muted hover:text-accent-light transition-colors pl-6">
                    <Plus size={10} /> add line
                  </button>
                </div>
              ))}

              <button
                onClick={() => setSlides(prev => [...prev, { lines: [''], label: null }])}
                className="btn-secondary w-full text-sm flex items-center justify-center gap-2">
                <Plus size={14} /> Add Slide
              </button>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save Song'}
          </button>
        </div>
      </div>
    </div>
  )
}
