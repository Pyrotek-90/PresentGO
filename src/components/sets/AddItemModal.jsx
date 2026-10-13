import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { X, Music, Star, Megaphone, Search, Plus, FolderOpen, Monitor, Image, Folder, Upload, Loader2, Trash2, Filter } from 'lucide-react'
import { filesToSlideImages } from '../../lib/importSlides'
import { ACCEPT, readImports, saveImport, itemSlides, setItemContent } from '../../lib/contentLibrary'
import TitleSlide from '../TitleSlide'
import TitleSlideToolbar from '../TitleSlideToolbar'
import SongEditor from '../songs/SongEditor'
import { songLanguage, songThemes, songOccasions, THEMES, DEFAULT_LIBRARY_LANGUAGE } from '../../lib/songTags'

// Text slides and the separate Presentation tab were retired: slides come from the Content Library
// (PDFs and images). Existing text / presentation items in sets can still be edited.
const ITEM_TYPES = [
  { id: 'welcome',      label: 'Title Slide',   icon: Star },
  { id: 'song',         label: 'Song',          icon: Music },
  { id: 'content',      label: 'Content',       icon: FolderOpen },
]

const MEDIA_ICONS  = { presentation: Monitor, image: Image }
const MEDIA_COLORS = {
  presentation: 'text-blue-400 bg-blue-400/10',
  image:        'text-green-400 bg-green-400/10',
}

export default function AddItemModal({ onClose, onAdd, item, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const editing = !!item
  const { user } = useAuth()
  const [type, setType] = useState(item ? (item.type === 'media' ? (item.content?.media_category === 'presentation' ? 'announcement' : 'content') : item.type) : 'welcome')
  const [songs, setSongs] = useState([])
  const [query, setQuery] = useState('')
  const [showNewSong, setShowNewSong] = useState(false)
  const [showSongFilters, setShowSongFilters] = useState(false)
  const [songFilters, setSongFilters] = useState([])   // e.g. ['rotation', 'theme:Praise', 'occ:Easter', 'lang:Hindi']

  // Content library state
  const [mediaItems, setMediaItems]   = useState([])
  const [mediaQuery, setMediaQuery]   = useState('')
  const [mediaLoaded, setMediaLoaded] = useState(false)
  const [cImport, setCImport] = useState(null)   // one file read for import: { group, name }
  const [cBusy, setCBusy]     = useState(null)
  const [cErr, setCErr]       = useState(null)

  // Welcome slide state
  const [welcomeTitle, setWelcomeTitle] = useState(item?.type === 'welcome' ? item.content?.title || '' : 'Welcome')
  const [welcomeSubtitle, setWelcomeSubtitle] = useState(item?.type === 'welcome' ? item.content?.subtitle || '' : '')
  const [fmtTarget, setFmtTarget] = useState(null)
  const [welcomeStyle, setWelcomeStyle] = useState(item?.type === 'welcome' ? item.content?.style || null : null)

  // Presentation import state (PDF / images → slide images)
  const editingPresentation = item?.type === 'media' && item.content?.media_category === 'presentation'
  const [presMode, setPresMode] = useState(item?.type === 'announcement' ? 'text' : 'import')
  const [presName, setPresName] = useState(editingPresentation ? item.content.media_name || '' : '')
  const [pages, setPages] = useState(editingPresentation ? item.content.images.map(im => ({ ...im, existing: true })) : [])
  const [removed, setRemoved] = useState([])
  const [busy, setBusy] = useState(null)   // progress message while converting / uploading
  const [importErr, setImportErr] = useState(null)

  // Announcement state
  const [announcementTitle, setAnnouncementTitle] = useState(item?.type === 'announcement' ? item.content?.title || '' : 'Announcements')
  const [announcementSlides, setAnnouncementSlides] = useState(
    item?.type === 'announcement' && item.content?.slides?.length ? item.content.slides.map(sl => ({ lines: [...sl.lines] })) : [{ lines: [''] }]
  )

  useEffect(() => {
    supabase
      .from('songs')
      .select('id, title, artist, slides, raw_lyrics, lines_per_slide, metadata')
      .eq('user_id', user?.id)
      .order('title')
      .then(({ data }) => setSongs(data || []))
  }, [user?.id])

  // Load media items when Content tab is selected
  useEffect(() => {
    if (type !== 'content' || mediaLoaded) return
    supabase
      .from('media_items')
      .select('*')
      .eq('user_id', user?.id)
      .in('type', ['image', 'presentation'])
      .order('created_at', { ascending: false })
      .then(({ data }) => { setMediaItems(data || []); setMediaLoaded(true) })
  }, [type, user?.id, mediaLoaded])

  const mainLanguage = user?.user_metadata?.library_language || DEFAULT_LIBRARY_LANGUAGE
  const shortKey = k => (k || '').replace(' Major', '').replace(' Minor', 'm')
  const tagged = useMemo(() => songs.map(song => {
    const m = song.metadata || {}
    return {
      song, themes: songThemes(song), occasions: songOccasions(song), language: songLanguage(song), rotation: !!m.rotation,
      keys: [...new Set([m.original_key || m.key, ...(m.transposed_keys || [])].filter(Boolean).map(shortKey))],
    }
  }), [songs])  // eslint-disable-line react-hooks/exhaustive-deps

  // Filter chips: Rotation List, then themes, occasions and other languages found in the library.
  const filterChips = useMemo(() => {
    const count = pred => tagged.filter(pred).length
    const chips = [['rotation', 'Rotation List', count(t => t.rotation)]]
    const themes = [...new Set([...THEMES, ...tagged.flatMap(t => t.themes)])]
    themes.forEach(th => chips.push([`theme:${th}`, th, count(t => t.themes.includes(th))]))
    ;[...new Set(tagged.flatMap(t => t.occasions))].sort().forEach(o => chips.push([`occ:${o}`, o, count(t => t.occasions.includes(o))]))
    ;[...new Set(tagged.map(t => t.language))].filter(l => l !== mainLanguage).sort().forEach(l => chips.push([`lang:${l}`, l, count(t => t.language === l)]))
    return chips.filter(([k, , n]) => n > 0 || songFilters.includes(k))
  }, [tagged, mainLanguage, songFilters])

  const toggleSongFilter = k => setSongFilters(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]))

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    const themeSel = songFilters.filter(k => k.startsWith('theme:')).map(k => k.slice(6))
    const tagSel = songFilters.filter(k => k.startsWith('occ:') || k.startsWith('lang:'))
    return tagged
      .filter(({ song: s }) => !q || s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q))
      .filter(t => !songFilters.includes('rotation') || t.rotation)
      .filter(t => !themeSel.length || t.themes.some(th => themeSel.includes(th)))
      .filter(t => !tagSel.length || tagSel.some(k => (k.startsWith('occ:') ? t.occasions.includes(k.slice(4)) : t.language === k.slice(5))))
      .sort((a, b) => a.song.title.localeCompare(b.song.title, undefined, { sensitivity: 'base' }))
  }, [tagged, query, songFilters])

  const handleAddSong = (song) => {
    onAdd({
      type: 'song',
      content: { song_id: song.id, song_title: song.title, song_artist: song.artist },
    })
    onClose()
  }

  const handleAddWelcome = () => {
    onAdd({
      type: 'welcome',
      content: { title: welcomeTitle, subtitle: welcomeSubtitle, ...(welcomeStyle ? { style: welcomeStyle } : {}) },
    })
    onClose()
  }

  const handleAddAnnouncement = () => {
    const validSlides = announcementSlides.filter(s => s.lines.some(l => l.trim()))
    if (!validSlides.length) return
    onAdd({
      type: 'announcement',
      content: { title: announcementTitle, slides: validSlides },
    })
    onClose()
  }

  const handleAddMedia = (item) => {
    if (!itemSlides(item).length) return
    onAdd({ type: 'media', content: setItemContent(item) })
    onClose()
  }

  // Import one PDF or image into the Content Library, then add it to the set.
  const pickContentFile = async files => {
    if (!files?.length) return
    setCErr(null); setCBusy('Reading…')
    try {
      const [group] = await readImports([files[0]], msg => setCBusy(`Reading ${msg}…`))
      setCImport({ group, name: group.name })
    } catch (e) { setCErr(e.message || 'Could not read that file.') } finally { setCBusy(null) }
  }
  const saveContentImport = async () => {
    setCErr(null)
    try {
      const saved = await saveImport(user.id, cImport.group, cImport.name, (i, n) => setCBusy(`Uploading slide ${i} of ${n}…`))
      cImport.group.pages.forEach(p => URL.revokeObjectURL(p.url))
      setCImport(null); setCBusy(null)
      handleAddMedia(saved)
    } catch (e) { setCBusy(null); setCErr(`${e.message || 'Upload failed'} — try again.`) }
  }

  const updateAnnouncementSlide = (idx, lineIdx, value) => {
    setAnnouncementSlides(prev => {
      const next = prev.map((s, i) =>
        i === idx ? { ...s, lines: s.lines.map((l, j) => j === lineIdx ? value : l) } : s
      )
      return next
    })
  }

  const handleFiles = async fileList => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setImportErr(null); setBusy('Reading files…')
    try {
      const converted = await filesToSlideImages(files, msg => setBusy(`Converting ${msg}…`))
      setPages(prev => [...prev, ...converted])
      if (!presName) setPresName(files[0].name.replace(/\.[^.]+$/, ''))
    } catch (e) {
      setImportErr(e.message || 'Could not read that file.')
    } finally { setBusy(null) }
  }

  const removePage = idx => {
    const p = pages[idx]
    if (p.existing && p.storage_path) setRemoved(r => [...r, p.storage_path])
    if (p.url?.startsWith('blob:')) URL.revokeObjectURL(p.url)
    setPages(prev => prev.filter((_, i) => i !== idx))
  }

  const handleAddPresentation = async () => {
    if (!pages.length) return
    setImportErr(null)
    try {
      const images = []
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i]
        if (p.existing) { images.push({ url: p.url, storage_path: p.storage_path }); continue }
        setBusy(`Uploading slide ${i + 1} of ${pages.length}…`)
        const path = `${user?.id}/presentations/${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from('media').upload(path, p.blob, { contentType: 'image/jpeg', upsert: false })
        if (error) throw new Error(error.message)
        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path)
        images.push({ url: publicUrl, storage_path: path })
      }
      if (removed.length) await supabase.storage.from('media').remove(removed)
      onAdd({
        type: 'media',
        content: { media_name: presName.trim() || 'Presentation', media_category: 'presentation', images },
      })
      onClose()
    } catch (e) {
      setImportErr(e.message || 'Upload failed — try again.')
    } finally { setBusy(null) }
  }

  if (showNewSong) {
    return (
      <SongEditor
        libraryLanguages={[...new Set(songs.map(songLanguage))]}
        onClose={() => setShowNewSong(false)}
        onSaved={(saved) => {
          setSongs(prev => [...prev, saved])
          setShowNewSong(false)
        }}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold">{editing ? 'Edit Item' : 'Add to Set'}</h2>
          <div className="flex items-center gap-1">
            {item && onDelete && (
              <button onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))} onBlur={() => setConfirmDelete(false)}
                aria-label="Delete item" title={confirmDelete ? 'Click again to delete' : 'Delete from set'}
                className={`flex items-center gap-1.5 h-9 px-2.5 rounded-lg border text-sm transition-colors ${
                  confirmDelete ? 'border-red-600 bg-red-700 text-white' : 'border-transparent text-muted hover:text-red-400 hover:bg-red-500/10'
                }`}>
                <Trash2 size={16} />{confirmDelete && <span>Click again to delete</span>}
              </button>
            )}
            <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg" aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        {/* Type tabs */}
        {!editing && <div className="flex gap-1 px-4 pt-4 shrink-0 flex-wrap">
          {ITEM_TYPES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setType(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                type === id
                  ? 'bg-accent/20 text-accent-light border border-accent/40'
                  : 'bg-card text-muted hover:text-[#f5f5f5] border border-border'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Song picker */}
          {type === 'song' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input className="input !pl-9 !h-9 text-sm" placeholder="Search title or artist…" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
                </div>
                <button onClick={() => setShowSongFilters(v => !v)} aria-expanded={showSongFilters} title="Filter" aria-label="Filter songs"
                  className={`relative shrink-0 flex items-center justify-center gap-1.5 h-9 w-9 sm:w-auto sm:px-2.5 rounded-lg border text-sm transition-colors ${
                    showSongFilters || songFilters.length ? 'border-accent bg-accent/15 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5]'}`}>
                  <Filter size={14} /> <span className="hidden sm:inline text-xs">Filter</span>
                  {songFilters.length > 0 && <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 rounded-full bg-accent text-white text-[10px] leading-4 text-center">{songFilters.length}</span>}
                </button>
                <button onClick={() => setShowNewSong(true)} title="New song" aria-label="New song"
                  className="btn-primary shrink-0 flex items-center justify-center gap-1.5 h-9 w-9 sm:w-auto !p-0 sm:!px-3 text-sm">
                  <Plus size={14} /> <span className="hidden sm:inline">New Song</span>
                </button>
              </div>
              {showSongFilters && (
                <div className="flex flex-wrap items-center gap-1">
                  {filterChips.map(([k, label, n]) => {
                    const on = songFilters.includes(k)
                    const strong = k === 'rotation' || k.startsWith('occ:') || k.startsWith('lang:')
                    return (
                      <button key={k} onClick={() => toggleSongFilter(k)} aria-pressed={on}
                        className={`px-2.5 h-6 rounded-full border text-[11px] transition-colors ${
                          on ? (strong ? 'border-accent bg-accent text-white font-medium' : 'border-accent bg-accent/20 text-accent-light')
                             : strong ? 'border-accent/50 text-accent-light font-medium hover:bg-accent/10' : 'border-border text-muted hover:text-[#f5f5f5] hover:border-accent/40'
                        }`}>{label} <span className="opacity-60">{n}</span></button>
                    )
                  })}
                  {songFilters.length > 0 && (
                    <button onClick={() => setSongFilters([])} className="flex items-center gap-0.5 px-1.5 h-6 text-[11px] text-muted hover:text-[#f5f5f5]"><X size={10} /> Clear</button>
                  )}
                </div>
              )}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {filtered.length ? (
                  <ul className="divide-y divide-border/60">
                    {filtered.map(({ song, keys, occasions, language }) => {
                      const tags = [...occasions, ...(language !== mainLanguage ? [language] : [])]
                      return (
                        <li key={song.id}>
                          <button onClick={() => handleAddSong(song)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#1a1a1a] transition-colors group">
                            <span className="min-w-0 flex-1 truncate">
                              <span className="font-medium">{song.title}</span>
                              {song.artist && <span className="text-xs text-muted"> · {song.artist}</span>}
                              {tags.length > 0 && (
                                <span className="ml-1.5 inline-block align-middle px-1.5 rounded border border-amber-500/40 text-[10px] text-amber-300/90 leading-4">{tags.join(' · ')}</span>
                              )}
                            </span>
                            {keys.length > 0 && <span className="shrink-0 text-xs text-muted">{keys.join(', ')}</span>}
                            <Plus size={14} className="shrink-0 text-muted group-hover:text-accent-light" />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="text-muted text-sm text-center py-6">{songs.length ? 'No songs match.' : 'No songs yet.'}</p>
                )}
              </div>
              <p className="text-[11px] text-muted text-center">{filtered.length} of {songs.length} songs · tap a song to add it</p>
            </div>
          )}

          {/* Welcome slide */}
          {type === 'welcome' && (
            <div className="space-y-4">
              <div>
                <label className="label">Title</label>
                <input className="input" value={welcomeTitle} onChange={e => setWelcomeTitle(e.target.value)} />
              </div>
              <div>
                <label className="label">Subtitle (optional)</label>
                <input className="input" placeholder="Join us as we worship together" value={welcomeSubtitle} onChange={e => setWelcomeSubtitle(e.target.value)} />
              </div>
              {/* Preview */}
              <div className="space-y-2">
                <TitleSlideToolbar style={welcomeStyle} onChange={setWelcomeStyle} target={fmtTarget} />
                <div className="rounded-xl bg-black aspect-video flex items-center justify-center p-3 border border-border" style={{ containerType: 'inline-size' }}>
                  <TitleSlide title={welcomeTitle} subtitle={welcomeSubtitle} style={welcomeStyle} unit="cqw" target={fmtTarget} onTarget={setFmtTarget} />
                </div>
                <p className="text-[11px] text-muted">Preview of the full-screen slide.</p>
              </div>
              <button onClick={handleAddWelcome} className="btn-primary w-full">{editing ? 'Save Changes' : 'Add Slide'}</button>
            </div>
          )}

          {/* Presentation: import or text */}

          {type === 'announcement' && presMode === 'import' && (
            <div className="space-y-3">
              <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border hover:border-accent/50 p-6 text-center cursor-pointer transition-colors ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
                {busy ? <Loader2 size={24} className="animate-spin text-accent-light" /> : <Upload size={24} className="text-accent-light" />}
                <span className="text-sm font-medium">{busy || (pages.length ? 'Add more PDF or image files' : 'Choose a PDF or images')}</span>
                <span className="text-xs text-muted">Each PDF page or image becomes one slide.</span>
                <input type="file" multiple accept="application/pdf,image/*,.pdf" className="hidden"
                  onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
              </label>
              <p className="text-[11px] text-muted">
                Using PowerPoint or Keynote? Export first: PowerPoint → File → Save As → PDF; Keynote → File → Export To → PDF.
              </p>
              {importErr && <p className="text-xs text-red-400">{importErr}</p>}

              {pages.length > 0 && (
                <>
                  <div>
                    <label className="label">Name</label>
                    <input className="input" placeholder="Sermon slides" value={presName} onChange={e => setPresName(e.target.value)} />
                  </div>
                  <p className="text-xs text-muted">{pages.length} slide{pages.length !== 1 ? 's' : ''}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {pages.map((p, i) => (
                      <div key={p.url + i} className="relative group aspect-video rounded-md overflow-hidden border border-border bg-black">
                        <img src={p.url} alt="" className="w-full h-full object-contain" />
                        <span className="absolute bottom-0.5 left-1 text-[9px] text-white/70">{i + 1}</span>
                        <button onClick={() => removePage(i)} aria-label={`Remove slide ${i + 1}`}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white/80 hover:bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"><X size={11} /></button>
                      </div>
                    ))}
                  </div>
                  <button onClick={handleAddPresentation} disabled={!!busy} className="btn-primary w-full disabled:opacity-50">
                    {busy && busy.startsWith('Uploading') ? busy : editing ? 'Save Changes' : `Add ${pages.length} Slide${pages.length !== 1 ? 's' : ''} to Set`}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Announcement */}
          {type === 'announcement' && presMode === 'text' && (
            <div className="space-y-4">
              <div>
                <label className="label">Title</label>
                <input className="input" value={announcementTitle} onChange={e => setAnnouncementTitle(e.target.value)} />
              </div>
              {announcementSlides.map((slide, idx) => (
                <div key={idx} className="card space-y-2">
                  <p className="text-xs text-muted font-medium">Slide {idx + 1}</p>
                  {slide.lines.map((line, j) => (
                    <input
                      key={j}
                      className="input text-sm"
                      placeholder={`Line ${j + 1}`}
                      value={line}
                      onChange={e => updateAnnouncementSlide(idx, j, e.target.value)}
                    />
                  ))}
                  <button
                    className="text-xs text-accent-light hover:underline"
                    onClick={() =>
                      setAnnouncementSlides(prev =>
                        prev.map((s, i) => i === idx ? { ...s, lines: [...s.lines, ''] } : s)
                      )
                    }
                  >
                    + Add line
                  </button>
                </div>
              ))}
              <button
                className="btn-secondary w-full"
                onClick={() => setAnnouncementSlides(prev => [...prev, { lines: [''] }])}
              >
                + Add slide
              </button>
              <button onClick={handleAddAnnouncement} className="btn-primary w-full">{editing ? 'Save Changes' : 'Add Announcement'}</button>
            </div>
          )}

          {/* Content: Content Library items, or import a PDF / image */}
          {type === 'content' && (() => {
            const q = mediaQuery.toLowerCase()
            const list = mediaItems.filter(m => !q || m.name.toLowerCase().includes(q))
            return (
              <div className="space-y-2">
                {editing && <p className="text-xs text-muted">Choose something else to replace <strong className="text-[#f5f5f5]">{item.content?.media_name}</strong>.</p>}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input className="input !pl-9 !h-9 text-sm" placeholder="Search Content Library…" value={mediaQuery} onChange={e => setMediaQuery(e.target.value)} />
                  </div>
                  <label title="Import a PDF or image" aria-label="Import a PDF or image"
                    className={`btn-primary shrink-0 flex items-center justify-center gap-1.5 h-9 w-9 sm:w-auto !p-0 sm:!px-3 text-sm cursor-pointer ${cBusy || cImport ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload size={14} /> <span className="hidden sm:inline">PDF or Image</span>
                    <input type="file" accept={ACCEPT} className="hidden" onChange={e => { pickContentFile(e.target.files); e.target.value = '' }} />
                  </label>
                </div>

                {cBusy && !cImport && <p className="text-xs text-muted flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> {cBusy}</p>}
                {cErr && <p className="text-xs text-red-400">{cErr}</p>}
                {cImport && (
                  <div className="rounded-xl border border-accent/40 bg-card p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      {cImport.group.pages.length > 1 ? <Folder size={15} className="text-blue-400 shrink-0" /> : <Image size={15} className="text-green-400 shrink-0" />}
                      <input autoFocus className="input !h-8 !py-0 text-sm flex-1 min-w-0" value={cImport.name} onChange={e => setCImport(c => ({ ...c, name: e.target.value }))}
                        placeholder={cImport.group.pages.length > 1 ? 'Folder name' : 'Name'} aria-label="Name" />
                      <span className="text-[11px] text-muted shrink-0">{cImport.group.pages.length} slide{cImport.group.pages.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {cImport.group.pages.slice(0, 10).map((p, i) => <img key={i} src={p.url} alt="" className="h-11 aspect-video object-contain rounded border border-border bg-black shrink-0" />)}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={saveContentImport} disabled={!!cBusy} className="btn-primary !h-8 !py-0 !px-3 text-sm flex items-center gap-1.5 disabled:opacity-60">
                        {cBusy ? <><Loader2 size={13} className="animate-spin" /> {cBusy}</> : <><Plus size={13} /> Save &amp; add to set</>}
                      </button>
                      {!cBusy && <button onClick={() => { cImport.group.pages.forEach(p => URL.revokeObjectURL(p.url)); setCImport(null) }} className="btn-ghost text-sm">Cancel</button>}
                    </div>
                    <p className="text-[10px] text-muted">Saved to your Content Library too, so you can reuse it.</p>
                  </div>
                )}

                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  {!mediaLoaded ? (
                    <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
                  ) : list.length ? (
                    <ul className="divide-y divide-border/60">
                      {list.map(m => {
                        const slides = itemSlides(m)
                        const folder = m.type === 'presentation'
                        return (
                          <li key={m.id}>
                            <button onClick={() => handleAddMedia(m)} disabled={!slides.length}
                              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left hover:bg-[#1a1a1a] transition-colors group disabled:opacity-50 disabled:cursor-not-allowed">
                              <span className="w-14 aspect-video rounded bg-black border border-border overflow-hidden shrink-0 flex items-center justify-center">
                                {slides.length ? <img src={slides[0].url} alt="" className="w-full h-full object-contain" loading="lazy" /> : <Monitor size={14} className="text-muted" />}
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-medium truncate">{m.name}</span>
                                <span className="block text-[11px] text-muted">{!slides.length ? 'Old file — re-import as a PDF' : folder ? `Slide folder · ${slides.length} slides` : 'Image'}</span>
                              </span>
                              {slides.length > 0 && <Plus size={14} className="shrink-0 text-muted group-hover:text-accent-light" />}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <div className="text-center py-8 px-4 space-y-1">
                      <FolderOpen size={26} className="mx-auto text-muted" />
                      <p className="text-muted text-sm">{mediaQuery ? 'No matches.' : 'Your Content Library is empty.'}</p>
                      {!mediaQuery && <p className="text-xs text-muted">Import a PDF or an image above.</p>}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

        </div>
      </div>
    </div>
  )
}
