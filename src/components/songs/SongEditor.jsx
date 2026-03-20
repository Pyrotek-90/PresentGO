import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatLyrics } from '../../lib/lyricFormatter'
import {
  X, Wand2, Plus, Trash2, SplitSquareHorizontal,
  ArrowUp, ArrowDown, Search, Loader2, Lock, ChevronDown, Tag,
} from 'lucide-react'

// ─── Section label picker ─────────────────────────────────────────────────────

const PRESET_LABELS = [
  'Verse 1', 'Verse 2', 'Verse 3', 'Verse 4',
  'Chorus', 'Pre-Chorus', 'Bridge', 'Outro', 'Intro', 'Tag',
]

function LabelPicker({ onSelect, onClose }) {
  const [custom, setCustom] = useState('')
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 z-50 w-64 bg-surface border border-border rounded-xl shadow-xl overflow-hidden"
    >
      {/* Preset grid */}
      <div className="p-2 grid grid-cols-2 gap-1">
        {PRESET_LABELS.map(label => (
          <button
            key={label}
            onClick={() => { onSelect(label); onClose() }}
            className="text-left px-3 py-1.5 rounded-lg text-sm hover:bg-accent/20 hover:text-accent-light transition-colors text-muted"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Custom input */}
      <div className="p-2 flex gap-1.5">
        <input
          autoFocus
          className="input text-sm py-1 flex-1"
          placeholder="Custom label…"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && custom.trim()) { onSelect(custom.trim()); onClose() }
            if (e.key === 'Escape') onClose()
          }}
        />
        <button
          onClick={() => { if (custom.trim()) { onSelect(custom.trim()); onClose() } }}
          className="btn-primary px-3 py-1 text-sm shrink-0"
        >
          Add
        </button>
      </div>
    </div>
  )
}

// ─── Lyrics search via lyrics.ovh (free, no key required) ────────────────────

async function suggestSongs(query) {
  const res = await fetch(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error('Search failed')
  const json = await res.json()
  return (json.data || []).slice(0, 8).map(item => ({
    title:  item.title,
    artist: item.artist?.name || '',
  }))
}

async function fetchLyrics(artist, title) {
  const res = await fetch(
    `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
  )
  if (!res.ok) throw new Error('Lyrics not found')
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json.lyrics || ''
}

// ─── Search panel ─────────────────────────────────────────────────────────────

function LyricsSearch({ onSongFound }) {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [fetching, setFetching]   = useState(null)
  const [searchErr, setSearchErr] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSearch = async (e) => {
    e?.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setSearchErr(null)
    setResults([])
    try {
      const hits = await suggestSongs(query.trim())
      setResults(hits)
      if (hits.length === 0) setSearchErr('No results found — try a different title or artist.')
    } catch {
      setSearchErr('Search unavailable. Check your connection and try again.')
    } finally {
      setSearching(false)
    }
  }

  const handlePick = async (result) => {
    const key = `${result.artist}–${result.title}`
    setFetching(key)
    setSearchErr(null)
    try {
      const lyrics = await fetchLyrics(result.artist, result.title)
      onSongFound({ title: result.title, artist: result.artist, lyrics })
    } catch {
      setSearchErr(`Couldn't retrieve lyrics for "${result.title}". Try another result.`)
    } finally {
      setFetching(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          ref={inputRef}
          className="input flex-1"
          placeholder="Search by song title or artist…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="btn-primary px-4 flex items-center gap-1.5 shrink-0"
        >
          {searching
            ? <Loader2 size={15} className="animate-spin" />
            : <Search size={15} />}
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {/* Results list */}
      {results.length > 0 && (
        <ul className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {results.map((r, i) => {
            const key = `${r.artist}–${r.title}`
            const isFetching = fetching === key
            return (
              <li key={i}>
                <button
                  onClick={() => handlePick(r)}
                  disabled={!!fetching}
                  className="w-full text-left px-4 py-2.5 hover:bg-[#222] transition-colors flex items-center justify-between gap-3 group"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-[#f5f5f5] truncate">{r.title}</span>
                    <span className="block text-xs text-muted truncate">{r.artist}</span>
                  </span>
                  {isFetching
                    ? <Loader2 size={13} className="animate-spin text-accent-light shrink-0" />
                    : <span className="text-xs text-muted group-hover:text-accent-light shrink-0 transition-colors">
                        Select →
                      </span>
                  }
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {searchErr && <p className="text-xs text-red-400">{searchErr}</p>}

      {/* Licensing note */}
      <div className="flex items-start gap-2">
        <Lock size={11} className="text-muted shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted leading-snug">
          Song lyrics are protected by copyright regardless of use.{' '}
          <span className="text-[#f5f5f5]">Churches</span> should verify coverage via{' '}
          <a href="https://ccli.com" target="_blank" rel="noreferrer"
             className="underline hover:text-accent-light">CCLI</a>.{' '}
          <span className="text-[#f5f5f5]">Other public or commercial use</span> requires a
          separate performance license (ASCAP, BMI, or SESAC).
          Personal private use is generally permitted.{' '}
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
  const [activeTab, setActiveTab]       = useState('lyrics')

  // Search section: open by default for new songs, collapsible for edits
  const [showSearch, setShowSearch]     = useState(isNew)
  // Which slide's label picker is open (-1 = none)
  const [pickerIdx, setPickerIdx]       = useState(-1)

  useEffect(() => {
    if (song?.slides) setSlides(song.slides)
  }, [song])

  // Re-format whenever lines-per-slide changes (if we have raw lyrics)
  useEffect(() => {
    if (rawLyrics.trim()) {
      setSlides(formatLyrics(rawLyrics, linesPerSlide))
      setActiveTab('preview')
    }
  }, [linesPerSlide]) // eslint-disable-line react-hooks/exhaustive-deps

  // Called when user selects a song from search results
  const handleSongFound = ({ title: t, artist: a, lyrics }) => {
    if (t) setTitle(t)
    if (a) setArtist(a)
    setRawLyrics(lyrics)
    const formatted = formatLyrics(lyrics, linesPerSlide)
    setSlides(formatted)
    setShowSearch(false)
    setActiveTab('preview')
  }

  const handleFormat = () => {
    const formatted = formatLyrics(rawLyrics, linesPerSlide)
    setSlides(formatted)
    setActiveTab('preview')
  }

  const handleSave = async () => {
    if (!title.trim()) { setError('Song title is required.'); return }
    setSaving(true)
    setError(null)

    const payload = {
      user_id:        user.id,
      title:          title.trim(),
      artist:         artist.trim(),
      ccli_number:    ccliNumber.trim(),
      raw_lyrics:     rawLyrics,
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

          {/* ── 1. Search Lyrics Online ───────────────────────────────────── */}
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
              <ChevronDown
                size={15}
                className={`text-muted transition-transform ${showSearch ? 'rotate-180' : ''}`}
              />
            </button>

            {showSearch && (
              <div className="px-4 pb-4 pt-1 border-t border-border">
                <LyricsSearch onSongFound={handleSongFound} />
              </div>
            )}
          </div>

          {/* ── 2. Song details ───────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="label">Title *</label>
                <input
                  className="input"
                  placeholder="Amazing Grace"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="label">CCLI #</label>
                <input
                  className="input"
                  placeholder="1234567"
                  value={ccliNumber}
                  onChange={e => setCcliNumber(e.target.value)}
                />
              </div>
              <div className="md:col-span-3">
                <label className="label">Artist / Author</label>
                <input
                  className="input"
                  placeholder="John Newton"
                  value={artist}
                  onChange={e => setArtist(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── 3. Lines per slide ────────────────────────────────────────── */}
          <div>
            <label className="label">Lines per slide</label>
            <div className="flex gap-2">
              {[2, 3, 4].map(n => (
                <button
                  key={n}
                  onClick={() => setLinesPerSlide(n)}
                  className={`px-4 py-2 rounded-lg border font-medium text-sm transition-colors ${
                    linesPerSlide === n
                      ? 'border-accent bg-accent/20 text-accent-light'
                      : 'border-border bg-card text-muted hover:text-[#f5f5f5]'
                  }`}
                >
                  {n} lines
                </button>
              ))}
            </div>
          </div>

          {/* ── 4. Lyrics / Preview tabs ──────────────────────────────────── */}
          <div>
            <div className="flex gap-1 mb-3 border-b border-border">
              {['lyrics', 'preview'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                    activeTab === tab
                      ? 'border-accent text-accent-light'
                      : 'border-transparent text-muted hover:text-[#f5f5f5]'
                  }`}
                >
                  {tab}
                  {tab === 'preview' && slides.length > 0 && (
                    <span className="ml-1.5 text-[10px] text-muted">({slides.length})</span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === 'lyrics' && (
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  Paste or edit lyrics below. Use blank lines to separate sections and labels like{' '}
                  <code className="bg-card px-1 rounded">[Verse 1]</code>,{' '}
                  <code className="bg-card px-1 rounded">[Chorus]</code>.
                </p>
                <textarea
                  className="input h-52 resize-none font-mono text-sm leading-relaxed"
                  placeholder={`[Verse 1]\nAmazing grace how sweet the sound\nThat saved a wretch like me\n\n[Chorus]\nMy chains are gone I've been set free\nMy God my Savior has ransomed me`}
                  value={rawLyrics}
                  onChange={e => setRawLyrics(e.target.value)}
                />
                <button onClick={handleFormat} className="btn-primary flex items-center gap-2">
                  <Wand2 size={16} />
                  Format into Slides
                </button>
              </div>
            )}

            {activeTab === 'preview' && (
              <div className="space-y-2">
                {slides.length === 0 ? (
                  <p className="text-muted text-sm">
                    No slides yet — search for a song above or paste lyrics and click "Format into Slides".
                  </p>
                ) : (<>
                  <p className="text-xs text-muted">
                    Click any line to edit. Use controls to split, reorder, or delete slides.
                  </p>
                  {slides.map((slide, i) => (
                    <div key={i} className="card space-y-2 group/slide">
                      {/* Section label row — editable badge, or prompt to add one */}
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
                              setSlides(prev => prev.map((s, si) =>
                                si === i ? { ...s, label } : s
                              ))
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
                          <button
                            title="Move up" disabled={i === 0}
                            onClick={() => setSlides(prev => { const n=[...prev]; [n[i-1],n[i]]=[n[i],n[i-1]]; return n })}
                            className="p-1 rounded hover:bg-[#333] text-muted hover:text-[#f5f5f5] disabled:opacity-20"
                          ><ArrowUp size={12} /></button>
                          <button
                            title="Move down" disabled={i === slides.length - 1}
                            onClick={() => setSlides(prev => { const n=[...prev]; [n[i],n[i+1]]=[n[i+1],n[i]]; return n })}
                            className="p-1 rounded hover:bg-[#333] text-muted hover:text-[#f5f5f5] disabled:opacity-20"
                          ><ArrowDown size={12} /></button>
                          <button
                            title="Delete slide"
                            onClick={() => setSlides(prev => prev.filter((_, si) => si !== i))}
                            className="p-1 rounded hover:bg-red-700/30 text-muted hover:text-red-400"
                          ><Trash2 size={12} /></button>
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
                              <button
                                title="Split before this line"
                                onClick={() => setSlides(prev => {
                                  const s = prev[i]
                                  const before = { ...s, lines: s.lines.slice(0, j) }
                                  const after  = { ...s, lines: s.lines.slice(j), label: null }
                                  return [...prev.slice(0, i), before, after, ...prev.slice(i + 1)]
                                })}
                                className="p-1 rounded hover:bg-[#333] text-muted hover:text-accent-light"
                              ><SplitSquareHorizontal size={11} /></button>
                            )}
                            <button
                              title="Remove line"
                              onClick={() => setSlides(prev => prev.map((s, si) =>
                                si === i ? { ...s, lines: s.lines.filter((_, li) => li !== j) } : s
                              ).filter(s => s.lines.length > 0))}
                              className="p-1 rounded hover:bg-red-700/30 text-muted hover:text-red-400"
                            ><X size={11} /></button>
                          </div>
                        </div>
                      ))}

                      <button
                        onClick={() => setSlides(prev => prev.map((s, si) =>
                          si === i ? { ...s, lines: [...s.lines, ''] } : s
                        ))}
                        className="flex items-center gap-1 text-[10px] text-muted hover:text-accent-light transition-colors pl-6"
                      >
                        <Plus size={10} /> add line
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() => setSlides(prev => [...prev, { lines: [''], label: null }])}
                    className="btn-secondary w-full text-sm flex items-center justify-center gap-2"
                  >
                    <Plus size={14} /> Add Slide
                  </button>
                </>)}
              </div>
            )}
          </div>

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
