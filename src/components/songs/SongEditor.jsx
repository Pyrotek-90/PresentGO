import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  X, Wand2, Plus, Trash2, SplitSquareHorizontal,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Search, Loader2, Lock,
  ChevronDown, Tag, Sparkles, ListOrdered, Check, Music2, ChevronRight,
} from 'lucide-react'

// ─── Wizard steps ─────────────────────────────────────────────────────────────
const STEPS = [
  { num: 1, label: 'Lyrics'      },
  { num: 2, label: 'Slides'      },
  { num: 3, label: 'Arrangement' },
  { num: 4, label: 'Chords'      },
  { num: 5, label: 'Details'     },
]

// ─── Chord chart data ─────────────────────────────────────────────────────────
const KEYS = ['C', 'C#/Db', 'D', 'Eb', 'E', 'F', 'F#/Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const NUMERALS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']
const DIATONIC = {
  'C':     ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'],
  'C#/Db': ['Db', 'Ebm', 'Fm', 'Gb', 'Ab', 'Bbm', 'Cdim'],
  'D':     ['D', 'Em', 'F#m', 'G', 'A', 'Bm', 'C#dim'],
  'Eb':    ['Eb', 'Fm', 'Gm', 'Ab', 'Bb', 'Cm', 'Ddim'],
  'E':     ['E', 'F#m', 'G#m', 'A', 'B', 'C#m', 'D#dim'],
  'F':     ['F', 'Gm', 'Am', 'Bb', 'C', 'Dm', 'Edim'],
  'F#/Gb': ['F#', 'G#m', 'A#m', 'B', 'C#', 'D#m', 'Fdim'],
  'G':     ['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#dim'],
  'Ab':    ['Ab', 'Bbm', 'Cm', 'Db', 'Eb', 'Fm', 'Gdim'],
  'A':     ['A', 'Bm', 'C#m', 'D', 'E', 'F#m', 'G#dim'],
  'Bb':    ['Bb', 'Cm', 'Dm', 'Eb', 'F', 'Gm', 'Adim'],
  'B':     ['B', 'C#m', 'D#m', 'E', 'F#', 'G#m', 'A#dim'],
}
const PRESET_THEMES = [
  'Worship', 'Praise', 'Communion', 'Offering', 'Closing', 'Opening',
  'Christmas', 'Easter', 'Baptism', 'Prayer', 'Salvation', 'Healing',
]
const PRESET_LABELS = [
  'Verse 1', 'Verse 2', 'Verse 3', 'Verse 4',
  'Chorus', 'Pre-Chorus', 'Bridge', 'Outro', 'Intro', 'Tag',
]

// ─── Progress stepper ─────────────────────────────────────────────────────────
function Stepper({ current, maxReached }) {
  return (
    <div className="flex items-center px-4 py-3 border-b border-border bg-card/50 shrink-0">
      {STEPS.map((s, i) => (
        <div key={s.num} className="flex items-center flex-1 min-w-0 last:flex-none">
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
              s.num < current  ? 'bg-accent text-white' :
              s.num === current ? 'bg-accent/20 border-2 border-accent text-accent-light' :
                                  'bg-transparent border border-border text-muted'
            }`}>
              {s.num < current ? <Check size={11} /> : s.num}
            </div>
            <span className={`text-[9px] tracking-wide uppercase font-medium transition-colors ${
              s.num === current ? 'text-accent-light' :
              s.num < current  ? 'text-[#aaa]' : 'text-muted/50'
            }`}>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-1.5 mb-3.5 transition-colors ${s.num < current ? 'bg-accent/60' : 'bg-border'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Label picker (slide preview label) ───────────────────────────────────────
function LabelPicker({ onSelect, onClose }) {
  const [custom, setCustom] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  return (
    <div ref={ref} className="absolute left-0 top-full mt-1 z-50 w-56 bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
      <div className="p-2 grid grid-cols-2 gap-1">
        {PRESET_LABELS.map(l => (
          <button key={l} onClick={() => { onSelect(l); onClose() }}
            className="text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-accent/20 hover:text-accent-light transition-colors text-muted">
            {l}
          </button>
        ))}
      </div>
      <div className="border-t border-border p-2 flex gap-1.5">
        <input autoFocus className="input text-xs py-1 flex-1" placeholder="Custom…"
          value={custom} onChange={e => setCustom(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && custom.trim()) { onSelect(custom.trim()); onClose() }
            if (e.key === 'Escape') onClose()
          }} />
        <button onClick={() => { if (custom.trim()) { onSelect(custom.trim()); onClose() } }}
          className="btn-primary px-2.5 py-1 text-xs shrink-0">Add</button>
      </div>
    </div>
  )
}

// ─── Insert section label dropdown (lyrics textarea) ──────────────────────────
function InsertLabelMenu({ onInsert, onClose }) {
  const [custom, setCustom] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  return (
    <div ref={ref} className="absolute left-0 top-full mt-1 z-50 w-52 bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
      <p className="text-[10px] text-muted px-3 pt-2 pb-1 uppercase tracking-wider">Insert section label</p>
      <div className="p-1.5 grid grid-cols-2 gap-0.5">
        {PRESET_LABELS.map(l => (
          <button key={l} onClick={() => { onInsert(l); onClose() }}
            className="text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-accent/20 hover:text-accent-light transition-colors text-muted">
            {l}
          </button>
        ))}
      </div>
      <div className="border-t border-border p-2 flex gap-1.5">
        <input autoFocus className="input text-xs py-1 flex-1" placeholder="Custom…"
          value={custom} onChange={e => setCustom(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && custom.trim()) { onInsert(custom.trim()); onClose() }
            if (e.key === 'Escape') onClose()
          }} />
        <button onClick={() => { if (custom.trim()) { onInsert(custom.trim()); onClose() } }}
          className="btn-primary px-2.5 py-1 text-xs shrink-0">Add</button>
      </div>
    </div>
  )
}

// ─── Lyrics search ─────────────────────────────────────────────────────────────
async function tryLrclib(query) {
  const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error('lrclib down')
  const json = await res.json()
  return (json || []).slice(0, 10).map(item => ({
    title: item.trackName, artist: item.artistName || '',
    album: item.albumName || '', plainLyrics: item.plainLyrics || '',
  }))
}
async function tryLyricsOvh(query) {
  const res = await fetch(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error('lyrics.ovh down')
  const json = await res.json()
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
  } catch { /* fall through */ }
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
  const [showGoogle, setShowGoogle] = useState(false)
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSearch = async e => {
    e?.preventDefault()
    if (!query.trim()) return
    setSearching(true); setSearchErr(null); setResults([]); setShowGoogle(false)
    try {
      const { hits } = await searchSongs(query.trim())
      setResults(hits)
      if (hits.length === 0) { setSearchErr('No results found.'); setShowGoogle(true) }
    } catch (err) {
      setSearchErr(err.message === 'all_down' ? 'Both lyrics services are down right now.' : 'Search failed — check your connection.')
      setShowGoogle(true)
    } finally { setSearching(false) }
  }

  const handlePick = result => {
    if (!result.plainLyrics) {
      setSearchErr(`No lyrics found for "${result.title}". Try another result or paste manually.`)
      setShowGoogle(true)
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
                  <span className="block text-xs text-muted truncate">{r.artist}{r.album ? ` · ${r.album}` : ''}</span>
                </span>
                <span className={`text-xs shrink-0 ${r.plainLyrics ? 'text-muted group-hover:text-accent-light' : 'text-red-400/60'}`}>
                  {r.plainLyrics ? 'Select →' : 'No lyrics'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchErr && (
        <div className="space-y-1.5">
          <p className="text-xs text-red-400">{searchErr}</p>
          {showGoogle && query.trim() && (
            <button onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(query + ' lyrics')}`, '_blank')}
              className="flex items-center gap-2 text-xs text-accent-light hover:underline">
              <Search size={12} /> Search "{query} lyrics" on Google — then paste below
            </button>
          )}
        </div>
      )}
      <div className="flex items-start gap-2">
        <Lock size={11} className="text-muted shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted leading-snug">
          Song lyrics are protected by copyright.{' '}
          <span className="text-[#f5f5f5]">Churches</span> should verify coverage via{' '}
          <a href="https://ccli.com" target="_blank" rel="noreferrer" className="underline hover:text-accent-light">CCLI</a>.
        </p>
      </div>
    </div>
  )
}

// ─── Main editor ──────────────────────────────────────────────────────────────
export default function SongEditor({ song, onClose, onSaved }) {
  const { user } = useAuth()
  const isNew = !song

  // Core song fields
  const [title, setTitle]           = useState(song?.title || '')
  const [artist, setArtist]         = useState(song?.artist || '')
  const [ccliNumber, setCcliNumber] = useState(song?.ccli_number || '')
  const [rawLyrics, setRawLyrics]   = useState(song?.raw_lyrics || '')
  const [linesPerSlide, setLinesPerSlide] = useState(song?.lines_per_slide || 2)
  const [slides, setSlides]         = useState(song?.slides || [])

  // Step navigation
  const [step, setStep]             = useState(1)
  const [maxReached, setMaxReached] = useState(song ? 5 : 1)

  // Lyrics step UI
  const [showSearch, setShowSearch] = useState(isNew)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [cleanupErr, setCleanupErr] = useState(null)
  const [showInsertMenu, setShowInsertMenu] = useState(false)

  // Slides step
  const [showSlides, setShowSlides] = useState(!!song?.slides?.length)
  const [pickerIdx, setPickerIdx]   = useState(-1)

  // Arrangement step
  const [sectionsMap, setSectionsMap]   = useState({})
  const [sectionOrder, setSectionOrder] = useState([])
  const [arrangement, setArrangement]   = useState([])
  const [sectionsRaw, setSectionsRaw]   = useState({})   // { label: string[] } raw lines per section
  const [sectionLPS, setSectionLPS]     = useState({})   // { label: number } lines-per-slide per section

  // Chords step
  const [songKey, setSongKey]   = useState(song?.metadata?.key || '')
  const [chordChart, setChordChart] = useState(song?.metadata?.chord_chart || '')
  const [chordInput, setChordInput] = useState('')  // chord being typed into chart

  // Details step
  const [bpm, setBpm]           = useState(song?.metadata?.bpm || '')
  const [themes, setThemes]     = useState(song?.metadata?.themes || [])
  const [themeInput, setThemeInput] = useState('')
  const [author, setAuthor]     = useState(song?.metadata?.author || '')

  // Save state
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)

  const lyricsRef = useRef(null)

  useEffect(() => {
    if (song?.slides) setSlides(song.slides)
  }, [song])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const buildSlidesFromArrangement = (map, arr) =>
    arr.flatMap(entry =>
      (map[entry.label] || []).map((s, i) => ({ ...s, label: i === 0 ? entry.label : null }))
    )

  const handleSongFound = ({ title: t, artist: a, lyrics }) => {
    if (t) setTitle(t)
    if (a) setArtist(a)
    setRawLyrics(lyrics)
    setSlides([]); setShowSlides(false)
    setSectionsMap({}); setSectionOrder([]); setArrangement([])
    setSectionsRaw({}); setSectionLPS({})
    setShowSearch(false)
    setTimeout(() => lyricsRef.current?.focus(), 50)
  }

  const insertSectionLabel = label => {
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
    setTimeout(() => { ta.selectionStart = newPos; ta.selectionEnd = newPos; ta.focus() }, 0)
  }

  const handleSmartCleanup = async () => {
    if (!rawLyrics.trim()) return
    setCleaningUp(true); setCleanupErr(null)
    try {
      const res = await fetch('/api/cleanup-lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics: rawLyrics }),
      })
      let json
      try { json = await res.json() } catch {
        throw new Error(
          res.status === 404
            ? 'Smart Cleanup only runs on the deployed app (present-go-five.vercel.app), not locally.'
            : `Server error (${res.status}) — try again or paste lyrics manually.`
        )
      }
      if (!res.ok || json.error) throw new Error(json.error || 'Cleanup failed')
      setRawLyrics(json.cleaned)
      setSlides([]); setShowSlides(false)
      setSectionsMap({}); setSectionOrder([]); setArrangement([])
      setSectionsRaw({}); setSectionLPS({})
    } catch (e) {
      setCleanupErr(e.message || 'Smart cleanup unavailable.')
    } finally { setCleaningUp(false) }
  }

  const handleFormatSong = () => {
    const lines = rawLyrics.split('\n')
    const sections = []
    let currentLabel = null, buffer = []

    for (const line of lines) {
      const match = line.match(/^\[(.+?)\]$/)
      if (match) {
        if (currentLabel !== null) sections.push({ label: currentLabel, lines: [...buffer] })
        else if (buffer.some(l => l.trim())) sections.push({ label: 'Intro', lines: [...buffer] })
        currentLabel = match[1].trim(); buffer = []
      } else { buffer.push(line) }
    }
    if (currentLabel !== null && buffer.some(l => l.trim())) sections.push({ label: currentLabel, lines: [...buffer] })
    else if (currentLabel === null && buffer.some(l => l.trim())) sections.push({ label: 'Song', lines: buffer })

    // Build sectionsMap (deduplicate same label with same content)
    const map = {}, order = [], raw = {}, lpsMap = {}
    for (const sec of sections) {
      if (map[sec.label]) continue
      order.push(sec.label)
      raw[sec.label] = sec.lines
      lpsMap[sec.label] = linesPerSlide
      map[sec.label] = parseSectionSlides(sec.label, sec.lines, linesPerSlide)
    }

    setSectionsRaw(raw); setSectionLPS(lpsMap)
    setSectionsMap(map); setSectionOrder(order)
    const defaultArr = order.map(label => ({ id: crypto.randomUUID(), label }))
    setArrangement(defaultArr)
    setSlides(buildSlidesFromArrangement(map, defaultArr))
    setShowSlides(true)
  }

  // Parse raw lines for one section into slide objects
  const parseSectionSlides = (label, rawLines, lps) => {
    const contentLines = rawLines.join('\n').trim().split('\n')
    const secSlides = []
    let cur = []
    for (const l of contentLines) {
      if (l.trim() === '') {
        if (cur.length > 0) { secSlides.push({ lines: cur, label: null }); cur = [] }
      } else {
        cur.push(l)
        if (cur.length >= lps) { secSlides.push({ lines: cur, label: null }); cur = [] }
      }
    }
    if (cur.length > 0) secSlides.push({ lines: cur, label: null })
    if (secSlides.length > 0) secSlides[0] = { ...secSlides[0], label }
    return secSlides
  }

  // Reformat a single section at a new LPS, keep all other sections intact
  const reformatSection = (label, lps) => {
    const newSlides = parseSectionSlides(label, sectionsRaw[label] || [], lps)
    const newMap = { ...sectionsMap, [label]: newSlides }
    setSectionsMap(newMap)
    setSectionLPS(prev => ({ ...prev, [label]: lps }))
    setSlides(buildSlidesFromArrangement(newMap, arrangement))
  }

  // Edit a line in sectionsMap directly
  const updateSecLine = (label, si, li, value) => {
    const newMap = {
      ...sectionsMap,
      [label]: sectionsMap[label].map((s, idx) =>
        idx === si ? { ...s, lines: s.lines.map((l, li2) => li2 === li ? value : l) } : s
      ),
    }
    setSectionsMap(newMap)
    setSlides(buildSlidesFromArrangement(newMap, arrangement))
  }

  // Remove a slide from a section
  const removeSecSlide = (label, si) => {
    const kept = sectionsMap[label].filter((_, idx) => idx !== si)
    const newMap = { ...sectionsMap, [label]: kept }
    setSectionsMap(newMap)
    setSlides(buildSlidesFromArrangement(newMap, arrangement))
  }

  // Reorder slides within a section
  const moveSecSlide = (label, si, dir) => {
    const arr = [...sectionsMap[label]]
    const target = si + dir
    if (target < 0 || target >= arr.length) return
    ;[arr[si], arr[target]] = [arr[target], arr[si]]
    const newMap = { ...sectionsMap, [label]: arr }
    setSectionsMap(newMap)
    setSlides(buildSlidesFromArrangement(newMap, arrangement))
  }

  const insertChordAtCursor = chord => {
    const ta = document.getElementById('chord-chart-area')
    if (!ta) { setChordChart(c => c + chord + ' '); return }
    const start = ta.selectionStart
    const newText = chordChart.substring(0, start) + chord + ' ' + chordChart.substring(start)
    setChordChart(newText)
    setTimeout(() => { ta.selectionStart = start + chord.length + 1; ta.selectionEnd = start + chord.length + 1; ta.focus() }, 0)
  }

  const addTheme = tag => {
    const t = tag.trim()
    if (t && !themes.includes(t)) setThemes(prev => [...prev, t])
    setThemeInput('')
  }

  // ── Navigation ───────────────────────────────────────────────────────────────
  const goTo = nextStep => {
    if (nextStep === 2 && !showSlides && rawLyrics.trim()) handleFormatSong()
    setStep(nextStep)
    setMaxReached(m => Math.max(m, nextStep))
  }

  const canAdvance = () => {
    if (step === 1) return !!rawLyrics.trim()
    return true
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!title.trim()) { setError('Song title is required.'); setStep(1); return }
    setSaving(true); setError(null)

    const payload = {
      user_id: user.id,
      title: title.trim(),
      artist: artist.trim(),
      ccli_number: ccliNumber.trim(),
      raw_lyrics: rawLyrics,
      lines_per_slide: linesPerSlide,
      slides,
      metadata: {
        key: songKey,
        chord_chart: chordChart,
        bpm,
        themes,
        author,
      },
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

  // ── Step content ─────────────────────────────────────────────────────────────
  const renderStep1 = () => (
    <div className="space-y-5">
      {/* Search */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button onClick={() => setShowSearch(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1e1e1e] transition-colors">
          <div className="flex items-center gap-2.5">
            <Search size={15} className="text-accent-light" />
            <span className="text-sm font-medium">Search Lyrics Online</span>
          </div>
          <ChevronDown size={15} className={`text-muted transition-transform ${showSearch ? 'rotate-180' : ''}`} />
        </button>
        {showSearch && (
          <div className="px-4 pb-4 pt-1 border-t border-border">
            <LyricsSearch onSongFound={handleSongFound} />
          </div>
        )}
      </div>

      {/* Song details */}
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

      {/* Lyrics editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="label mb-0">Lyrics</label>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setShowInsertMenu(v => !v)}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-[#f5f5f5] border border-border rounded-lg px-2.5 py-1.5 hover:border-accent/50 transition-colors">
                <Tag size={12} /> Insert Section
                <ChevronDown size={11} className={`transition-transform ${showInsertMenu ? 'rotate-180' : ''}`} />
              </button>
              {showInsertMenu && <InsertLabelMenu onInsert={insertSectionLabel} onClose={() => setShowInsertMenu(false)} />}
            </div>
            <button onClick={handleSmartCleanup} disabled={cleaningUp || !rawLyrics.trim()}
              className="flex items-center gap-1.5 text-xs bg-accent/10 hover:bg-accent/20 text-accent-light border border-accent/30 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-40">
              {cleaningUp ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {cleaningUp ? 'Cleaning…' : 'Smart Cleanup'}
            </button>
          </div>
        </div>
        {cleanupErr && <p className="text-xs text-amber-400">{cleanupErr}</p>}
        <textarea ref={lyricsRef}
          className="input h-64 resize-none font-mono text-sm leading-relaxed"
          placeholder={`[Verse 1]\nAmazing grace how sweet the sound\nThat saved a wretch like me\n\n[Chorus]\nMy chains are gone I've been set free`}
          value={rawLyrics}
          onChange={e => {
            setRawLyrics(e.target.value)
            setShowSlides(false); setSectionsMap({}); setSectionOrder([]); setArrangement([])
          }}
        />
        <p className="text-[11px] text-muted">
          Use <code className="bg-card px-1 rounded">[Verse 1]</code>, <code className="bg-card px-1 rounded">[Chorus]</code> etc. to label sections, or use <strong>Insert Section</strong> above.
        </p>
      </div>
    </div>
  )

  const renderStep2 = () => {
    if (!showSlides || sectionOrder.length === 0) {
      return (
        <div className="text-center py-12 text-muted space-y-4">
          <Wand2 size={36} className="mx-auto opacity-25" />
          <p className="text-sm">Go back and click <strong>Format Slides</strong> to generate your slides.</p>
          <button onClick={() => { handleFormatSong(); }} className="btn-primary mx-auto flex items-center gap-2">
            <Wand2 size={14} /> Format Now
          </button>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {/* Summary bar */}
        <div className="flex items-center justify-between text-xs text-muted px-1">
          <span>{sectionOrder.length} sections · {slides.length} total slides</span>
          <button onClick={handleFormatSong} className="flex items-center gap-1.5 hover:text-[#f5f5f5] transition-colors">
            <Wand2 size={12} /> Reset all sections
          </button>
        </div>

        {/* One card per section */}
        {sectionOrder.map(label => {
          const secSlides = sectionsMap[label] || []
          const lps = sectionLPS[label] || linesPerSlide
          return (
            <div key={label} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Section header — compact */}
              <div className="flex items-center justify-between px-3 py-2 bg-accent/5 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-accent-light">{label}</span>
                  <span className="text-[10px] text-muted">{secSlides.length} slide{secSlides.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted">Lines/slide</span>
                  <div className="flex gap-0.5">
                    {[2, 3, 4].map(n => (
                      <button key={n} onClick={() => reformatSection(label, n)}
                        className={`w-6 h-6 rounded border text-[11px] font-medium transition-colors ${
                          lps === n
                            ? 'border-accent bg-accent/20 text-accent-light'
                            : 'border-border text-muted hover:text-[#f5f5f5] hover:border-accent/40'
                        }`}>{n}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Slides grid — 2 columns */}
              <div className="p-2 grid grid-cols-2 gap-2">
                {secSlides.map((slide, si) => (
                  <div key={si} className="group/slide relative rounded-lg border border-border/60 bg-surface p-2.5 hover:border-accent/30 hover:bg-[#1a1a1a] transition-colors">
                    {/* Slide header */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted">Slide {si + 1}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover/slide:opacity-100 transition-opacity">
                        <button disabled={si === 0} onClick={() => moveSecSlide(label, si, -1)}
                          className="p-0.5 rounded hover:bg-[#333] text-muted hover:text-[#f5f5f5] disabled:opacity-20">
                          <ArrowLeft size={10} />
                        </button>
                        <button disabled={si === secSlides.length - 1} onClick={() => moveSecSlide(label, si, 1)}
                          className="p-0.5 rounded hover:bg-[#333] text-muted hover:text-[#f5f5f5] disabled:opacity-20">
                          <ArrowRight size={10} />
                        </button>
                        <button onClick={() => removeSecSlide(label, si)}
                          className="p-0.5 rounded hover:bg-red-700/30 text-muted hover:text-red-400">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                    {/* Editable lines */}
                    <div className="space-y-0.5">
                      {slide.lines.map((line, li) => (
                        <div key={li} className="flex items-center gap-1 group/line">
                          <input
                            className="flex-1 bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none text-xs py-0.5 text-[#f5f5f5] min-w-0"
                            value={line}
                            onChange={e => updateSecLine(label, si, li, e.target.value)}
                          />
                          <button
                            onClick={() => {
                              const newLines = slide.lines.filter((_, idx) => idx !== li)
                              if (newLines.length === 0) { removeSecSlide(label, si); return }
                              const newMap = {
                                ...sectionsMap,
                                [label]: sectionsMap[label].map((s, idx) => idx === si ? { ...s, lines: newLines } : s),
                              }
                              setSectionsMap(newMap)
                              setSlides(buildSlidesFromArrangement(newMap, arrangement))
                            }}
                            className="opacity-0 group-hover/line:opacity-100 p-0.5 rounded hover:bg-red-700/30 text-muted hover:text-red-400 shrink-0 transition-opacity">
                            <X size={9} />
                          </button>
                        </div>
                      ))}
                    </div>
                    {/* Add line */}
                    <button
                      onClick={() => {
                        const newMap = {
                          ...sectionsMap,
                          [label]: sectionsMap[label].map((s, idx) => idx === si ? { ...s, lines: [...s.lines, ''] } : s),
                        }
                        setSectionsMap(newMap)
                        setSlides(buildSlidesFromArrangement(newMap, arrangement))
                      }}
                      className="mt-1.5 flex items-center gap-0.5 text-[9px] text-muted hover:text-accent-light transition-colors">
                      <Plus size={8} /> add line
                    </button>
                  </div>
                ))}

                {/* Add slide — dashed grid cell */}
                <button
                  onClick={() => {
                    const newMap = {
                      ...sectionsMap,
                      [label]: [...sectionsMap[label], { lines: [''], label: null }],
                    }
                    setSectionsMap(newMap)
                    setSlides(buildSlidesFromArrangement(newMap, arrangement))
                  }}
                  className="rounded-lg border border-dashed border-border/50 bg-transparent flex flex-col items-center justify-center gap-1 text-[10px] text-muted hover:text-accent-light hover:border-accent/40 hover:bg-accent/5 transition-colors min-h-[64px]">
                  <Plus size={13} />
                  Add slide
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderStep3 = () => (
    <div className="space-y-5">
      {sectionOrder.length > 0 ? (
        <>
          {/* Section palette */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Section Palette</p>
              <p className="text-xs text-muted">Tap to add to arrangement</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {sectionOrder.map(label => (
                <button key={label}
                  onClick={() => {
                    const newArr = [...arrangement, { id: crypto.randomUUID(), label }]
                    setArrangement(newArr)
                    setSlides(buildSlidesFromArrangement(sectionsMap, newArr))
                  }}
                  className="px-3 py-1.5 rounded-lg border border-accent/40 bg-accent/10 text-accent-light text-sm font-medium hover:bg-accent/20 transition-colors">
                  + {label}
                </button>
              ))}
            </div>
          </div>

          {/* Arrangement builder */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2">
                <ListOrdered size={15} className="text-accent-light" />
                Song Order
                {arrangement.length > 0 && (
                  <span className="text-xs text-muted font-normal">
                    — {arrangement.length} sections · {slides.length} slides
                  </span>
                )}
              </p>
              {arrangement.length > 0 && (
                <button onClick={() => { setArrangement([]); setSlides([]); setShowSlides(false) }}
                  className="text-xs text-muted hover:text-red-400 transition-colors">Clear</button>
              )}
            </div>
            {arrangement.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {arrangement.map((entry, i) => (
                  <span key={entry.id}
                    className="inline-flex items-center gap-0.5 pl-1 pr-1.5 py-1 rounded-lg bg-surface border border-border text-xs text-[#f5f5f5]">
                    <button disabled={i === 0}
                      onClick={() => {
                        const n = [...arrangement]; [n[i-1], n[i]] = [n[i], n[i-1]]
                        setArrangement(n); setSlides(buildSlidesFromArrangement(sectionsMap, n))
                      }}
                      className="p-0.5 rounded text-muted hover:text-[#f5f5f5] disabled:opacity-20"><ArrowLeft size={10} /></button>
                    <span className="px-1">{entry.label}</span>
                    <button disabled={i === arrangement.length - 1}
                      onClick={() => {
                        const n = [...arrangement]; [n[i], n[i+1]] = [n[i+1], n[i]]
                        setArrangement(n); setSlides(buildSlidesFromArrangement(sectionsMap, n))
                      }}
                      className="p-0.5 rounded text-muted hover:text-[#f5f5f5] disabled:opacity-20"><ArrowRight size={10} /></button>
                    <button
                      onClick={() => {
                        const n = arrangement.filter((_, ai) => ai !== i)
                        setArrangement(n); setSlides(buildSlidesFromArrangement(sectionsMap, n))
                        if (n.length === 0) setShowSlides(false)
                      }}
                      className="p-0.5 rounded text-muted hover:text-red-400"><X size={10} /></button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted italic">Tap sections above to build your arrangement (e.g. V1 → C → V2 → C → B → C).</p>
            )}
          </div>

          {/* Compact preview */}
          {slides.length > 0 && (
            <p className="text-xs text-muted text-center">
              {slides.length} slides will be generated · go back to <strong>Slides</strong> to edit individual slides
            </p>
          )}
        </>
      ) : (
        <div className="text-center py-10 text-muted space-y-3">
          <ListOrdered size={32} className="mx-auto opacity-30" />
          <p className="text-sm">No sections detected. Go back to <strong>Lyrics</strong> and add <code className="bg-card px-1 rounded">[Verse 1]</code>, <code className="bg-card px-1 rounded">[Chorus]</code> etc., then reformat.</p>
        </div>
      )}
    </div>
  )

  const renderStep4 = () => {
    const diatonic = DIATONIC[songKey] || []
    return (
      <div className="space-y-5">
        {/* Key selector */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Song Key</p>
          <div className="flex flex-wrap gap-2">
            {KEYS.map(k => (
              <button key={k} onClick={() => setSongKey(k === songKey ? '' : k)}
                className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                  songKey === k ? 'border-accent bg-accent/20 text-accent-light font-semibold' : 'border-border text-muted hover:text-[#f5f5f5] hover:border-accent/40'
                }`}>{k}</button>
            ))}
          </div>
        </div>

        {/* Diatonic chord reference */}
        {songKey && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Chords in Key of {songKey} major</p>
              <p className="text-[11px] text-muted">Click a chord to insert into the chart below</p>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {diatonic.map((chord, i) => (
                <div key={chord} className="text-center">
                  <p className="text-[10px] text-muted mb-1">{NUMERALS[i]}</p>
                  <button onClick={() => insertChordAtCursor(chord)}
                    className="w-full py-1.5 rounded-lg border border-border bg-surface text-sm hover:bg-accent/10 hover:border-accent/40 hover:text-accent-light transition-colors font-medium">
                    {chord}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chord chart textarea */}
        <div className="space-y-2">
          <label className="label">Chord Chart</label>
          <p className="text-[11px] text-muted -mt-1">
            Type your chord chart here. Place chords above lyric lines using spaces to align them.
            {songKey && ' Click a chord above to insert at cursor.'}
          </p>
          <textarea id="chord-chart-area"
            className="input h-64 resize-none font-mono text-sm leading-relaxed"
            placeholder={`[Verse 1]\nG         D      Em    C\nAmazing grace how sweet the sound\nG         D         G\nThat saved a wretch like me\n\n[Chorus]\nC    G      D        Em\nMy chains are gone I've been set free`}
            value={chordChart}
            onChange={e => setChordChart(e.target.value)}
          />
        </div>

        <div className="rounded-xl border border-border/50 bg-card/50 p-3">
          <p className="text-[11px] text-muted leading-relaxed">
            <strong className="text-accent-light">Coming soon:</strong> auto-generated chord charts from your key selection,
            chord transposition, Nashville number system, and in-line chord positioning by clicking within lyrics.
          </p>
        </div>
      </div>
    )
  }

  const renderStep5 = () => (
    <div className="space-y-5">
      {/* BPM + Key summary */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Tempo (BPM)</label>
          <input className="input" type="number" min="40" max="240" placeholder="75"
            value={bpm} onChange={e => setBpm(e.target.value)} />
        </div>
        <div>
          <label className="label">Key / Mode</label>
          <input className="input" value={songKey} readOnly placeholder="Set on Chords step"
            className="input text-muted cursor-default" />
        </div>
      </div>

      {/* Author */}
      <div>
        <label className="label">Songwriter(s)</label>
        <input className="input" placeholder="Chris Tomlin, John Newton…"
          value={author} onChange={e => setAuthor(e.target.value)} />
        <p className="text-[11px] text-muted mt-1">Original composers or lyricists — separate from the performing artist.</p>
      </div>

      {/* Themes / categories */}
      <div className="space-y-2">
        <label className="label">Themes / Categories</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {PRESET_THEMES.map(t => (
            <button key={t} onClick={() => themes.includes(t) ? setThemes(prev => prev.filter(x => x !== t)) : addTheme(t)}
              className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                themes.includes(t) ? 'border-accent bg-accent/20 text-accent-light' : 'border-border text-muted hover:border-accent/40 hover:text-[#f5f5f5]'
              }`}>{t}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Add custom tag…"
            value={themeInput} onChange={e => setThemeInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTheme(themeInput) } }} />
          <button onClick={() => addTheme(themeInput)} disabled={!themeInput.trim()}
            className="btn-secondary px-4 shrink-0">Add</button>
        </div>
        {themes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {themes.map(t => (
              <span key={t} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-accent/15 border border-accent/30 text-xs text-accent-light">
                {t}
                <button onClick={() => setThemes(prev => prev.filter(x => x !== t))}
                  className="hover:text-red-400 transition-colors"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* CCLI reminder */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-3 flex items-start gap-3">
        <Lock size={13} className="text-muted shrink-0 mt-0.5" />
        <div>
          <p className="text-[11px] text-muted leading-relaxed">
            CCLI # <strong className="text-[#f5f5f5]">{ccliNumber || 'not set'}</strong> · set this on the <strong>Lyrics</strong> step.
            Verify your church's license at <a href="https://ccli.com" target="_blank" rel="noreferrer" className="underline hover:text-accent-light">ccli.com</a>.
          </p>
        </div>
      </div>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Music2 size={18} className="text-accent-light" />
            <h2 className="text-lg font-semibold">{isNew ? 'Add Song' : 'Edit Song'}</h2>
            {title && <span className="text-muted text-sm hidden sm:block">— {title}</span>}
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={18} /></button>
        </div>

        {/* Progress stepper */}
        <Stepper current={step} maxReached={maxReached} />

        {/* Step content */}
        <div className="overflow-y-auto flex-1 p-6">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
          {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 gap-3">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)} className="btn-secondary flex items-center gap-1.5">
                <ArrowLeft size={14} /> Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Save is always available once we have lyrics */}
            {rawLyrics.trim() && (
              <button onClick={handleSave} disabled={saving} className="btn-secondary">
                {saving ? 'Saving…' : 'Save Song'}
              </button>
            )}

            {step < 5 ? (
              <button onClick={() => goTo(step + 1)} disabled={!canAdvance()}
                className="btn-primary flex items-center gap-1.5 disabled:opacity-40">
                {step === 1 ? 'Format Slides' : step === 2 ? 'Arrange' : step === 3 ? 'Add Chords' : 'Song Details'}
                <ChevronRight size={15} />
              </button>
            ) : (
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save & Finish'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
