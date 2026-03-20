import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { X, Music, Star, Megaphone, Search, Plus, FolderOpen, Monitor, Image, Folder } from 'lucide-react'
import SongEditor from '../songs/SongEditor'

const ITEM_TYPES = [
  { id: 'welcome',      label: 'Title Slide',   icon: Star },
  { id: 'song',         label: 'Song',          icon: Music },
  { id: 'content',      label: 'Content',       icon: FolderOpen },
  { id: 'announcement', label: 'Presentation',  icon: Megaphone },
]

const MEDIA_ICONS  = { presentation: Monitor, image: Image }
const MEDIA_COLORS = {
  presentation: 'text-blue-400 bg-blue-400/10',
  image:        'text-green-400 bg-green-400/10',
}

export default function AddItemModal({ onClose, onAdd }) {
  const { user } = useAuth()
  const [type, setType] = useState('welcome')
  const [songs, setSongs] = useState([])
  const [query, setQuery] = useState('')
  const [showNewSong, setShowNewSong] = useState(false)

  // Content library state
  const [mediaItems, setMediaItems]   = useState([])
  const [mediaQuery, setMediaQuery]   = useState('')
  const [mediaLoaded, setMediaLoaded] = useState(false)

  // Welcome slide state
  const [welcomeTitle, setWelcomeTitle] = useState('Welcome')
  const [welcomeSubtitle, setWelcomeSubtitle] = useState('')

  // Announcement state
  const [announcementTitle, setAnnouncementTitle] = useState('Announcements')
  const [announcementSlides, setAnnouncementSlides] = useState([{ lines: [''] }])

  useEffect(() => {
    supabase
      .from('songs')
      .select('id, title, artist, slides, raw_lyrics, lines_per_slide')
      .eq('user_id', user.id)
      .order('title')
      .then(({ data }) => setSongs(data || []))
  }, [user.id])

  // Load media items when Content tab is selected
  useEffect(() => {
    if (type !== 'content' || mediaLoaded) return
    supabase
      .from('media_items')
      .select('id, name, category, file_size, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setMediaItems(data || []); setMediaLoaded(true) })
  }, [type, user.id, mediaLoaded])

  const filtered = songs.filter(s =>
    s.title.toLowerCase().includes(query.toLowerCase()) ||
    (s.artist || '').toLowerCase().includes(query.toLowerCase())
  )

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
      content: { title: welcomeTitle, subtitle: welcomeSubtitle },
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
    onAdd({
      type: 'media',
      content: { media_id: item.id, media_name: item.name, media_category: item.category },
    })
    onClose()
  }

  const updateAnnouncementSlide = (idx, lineIdx, value) => {
    setAnnouncementSlides(prev => {
      const next = prev.map((s, i) =>
        i === idx ? { ...s, lines: s.lines.map((l, j) => j === lineIdx ? value : l) } : s
      )
      return next
    })
  }

  if (showNewSong) {
    return (
      <SongEditor
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
          <h2 className="text-lg font-semibold">Add to Set</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={18} /></button>
        </div>

        {/* Type tabs */}
        <div className="flex gap-1 px-4 pt-4 shrink-0 flex-wrap">
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
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Song picker */}
          {type === 'song' && (
            <>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  className="input pl-9"
                  placeholder="Search library…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <button
                onClick={() => setShowNewSong(true)}
                className="btn-secondary w-full flex items-center gap-2 justify-center"
              >
                <Plus size={16} /> New Song
              </button>
              <div className="space-y-1.5">
                {filtered.map(song => (
                  <button
                    key={song.id}
                    onClick={() => handleAddSong(song)}
                    className="w-full text-left card hover:border-accent/50 transition-colors"
                  >
                    <p className="font-medium text-sm">{song.title}</p>
                    {song.artist && <p className="text-xs text-muted mt-0.5">{song.artist}</p>}
                  </button>
                ))}
                {!filtered.length && (
                  <p className="text-muted text-sm text-center py-4">No songs found.</p>
                )}
              </div>
            </>
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
              <div className="rounded-xl bg-black aspect-video flex flex-col items-center justify-center p-6 border border-border">
                <p className="text-white text-2xl font-bold text-center">{welcomeTitle || 'Welcome'}</p>
                {welcomeSubtitle && <p className="text-gray-400 text-base mt-2 text-center">{welcomeSubtitle}</p>}
              </div>
              <button onClick={handleAddWelcome} className="btn-primary w-full">Add Welcome Slide</button>
            </div>
          )}

          {/* Announcement */}
          {type === 'announcement' && (
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
              <button onClick={handleAddAnnouncement} className="btn-primary w-full">Add Announcement</button>
            </div>
          )}

          {/* Content library picker */}
          {type === 'content' && (
            <>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  className="input pl-9"
                  placeholder="Search content library…"
                  value={mediaQuery}
                  onChange={e => setMediaQuery(e.target.value)}
                  autoFocus
                />
              </div>
              {!mediaLoaded ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : mediaItems.filter(m =>
                  m.name.toLowerCase().includes(mediaQuery.toLowerCase()) ||
                  m.category.toLowerCase().includes(mediaQuery.toLowerCase())
                ).length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <FolderOpen size={28} className="mx-auto text-muted" />
                  <p className="text-muted text-sm">
                    {mediaQuery ? 'No matches found.' : 'Your Content Library is empty.'}
                  </p>
                  {!mediaQuery && (
                    <p className="text-xs text-muted">Upload files in the Content Library tab first.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {mediaItems
                    .filter(m =>
                      m.name.toLowerCase().includes(mediaQuery.toLowerCase()) ||
                      m.category.toLowerCase().includes(mediaQuery.toLowerCase())
                    )
                    .map(item => {
                      const Icon = MEDIA_ICONS[item.category] || Folder
                      const colorClass = MEDIA_COLORS[item.category] || 'text-accent-light bg-accent/10'
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleAddMedia(item)}
                          className="w-full text-left card hover:border-accent/50 transition-colors flex items-center gap-3"
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                            <Icon size={15} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{item.name}</p>
                            <p className="text-xs text-muted capitalize">{item.category}</p>
                          </div>
                        </button>
                      )
                    })
                  }
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  )
}
