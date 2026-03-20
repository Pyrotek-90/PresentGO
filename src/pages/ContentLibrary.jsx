import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import {
  Upload, Image, FolderOpen, Monitor,
  Trash2, ExternalLink, Plus, X, Folder,
  Clock, GalleryHorizontal, Pencil, Check, ChevronLeft,
  HardDrive,
} from 'lucide-react'

// ─── Apple Photos icon ─────────────────────────────────────────────────────────
function ApplePhotosIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ap1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FD3750"/><stop offset="100%" stopColor="#FF9B00"/></linearGradient>
        <linearGradient id="ap2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#01B1FB"/><stop offset="100%" stopColor="#3366FF"/></linearGradient>
        <linearGradient id="ap3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#6BDB76"/><stop offset="100%" stopColor="#01B1FB"/></linearGradient>
        <linearGradient id="ap4" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FF9B00"/><stop offset="100%" stopColor="#FFCF00"/></linearGradient>
        <linearGradient id="ap5" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FD3750"/><stop offset="100%" stopColor="#C644FC"/></linearGradient>
        <linearGradient id="ap6" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#C644FC"/><stop offset="100%" stopColor="#3366FF"/></linearGradient>
        <linearGradient id="ap7" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#6BDB76"/><stop offset="100%" stopColor="#FFCF00"/></linearGradient>
      </defs>
      <path d="M12 2 L12 8" stroke="url(#ap1)" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M12 16 L12 22" stroke="url(#ap2)" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M2 12 L8 12" stroke="url(#ap3)" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M16 12 L22 12" stroke="url(#ap4)" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M4.93 4.93 L9.17 9.17" stroke="url(#ap5)" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M14.83 14.83 L19.07 19.07" stroke="url(#ap6)" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M19.07 4.93 L14.83 9.17" stroke="url(#ap7)" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M9.17 14.83 L4.93 19.07" stroke="url(#ap1)" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  )
}

// ─── Google Drive icon (SVG) ───────────────────────────────────────────────────
function GoogleDriveIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47"/>
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  )
}

// ─── Google Photos icon (SVG) ──────────────────────────────────────────────────
function GooglePhotosIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
      <circle cx="96" cy="96" r="30" fill="#fbbc04"/>
      <path d="M96 66a30 30 0 0 1 30-30h60v60H126A30 30 0 0 1 96 66z" fill="#ea4335"/>
      <path d="M66 96a30 30 0 0 1-30 30H0V66h60a30 30 0 0 1 30 30z" fill="#34a853" transform="rotate(180 96 96)"/>
      <path d="M96 126a30 30 0 0 1-30 30H6v-60h60a30 30 0 0 1 30 30z" fill="#4285f4"/>
      <path d="M126 96a30 30 0 0 1 30-30h30v60h-60a30 30 0 0 1-30-30z" fill="#fbbc04" transform="rotate(180 96 96)"/>
    </svg>
  )
}

// ─── Google Photos Picker modal ────────────────────────────────────────────────

function GooglePhotosPicker({ onSelect, onClose }) {
  const [step, setStep]           = useState('loading') // loading | signin | albums | photos
  const [token, setToken]         = useState(null)
  const [albums, setAlbums]       = useState([])
  const [photos, setPhotos]       = useState([])
  const [activeAlbum, setActiveAlbum] = useState(null)
  const [selected, setSelected]   = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [nextAlbumPage, setNextAlbumPage] = useState(null)
  const [nextPhotoPage, setNextPhotoPage] = useState(null)

  // On mount: pull the Google provider_token from the active Supabase session.
  // This is the access token obtained when the user signed in with Google —
  // no separate sign-in or Client ID needed.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const t = session?.provider_token
      if (t) {
        setToken(t)
        fetchAlbums(t)
      } else {
        // Not signed in with Google (e.g. mock/email mode)
        setStep('signin')
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAlbums = async (accessToken, pageToken = null) => {
    setLoading(true)
    try {
      const url = new URL('https://photoslibrary.googleapis.com/v1/albums')
      url.searchParams.set('pageSize', '50')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setAlbums(prev => pageToken ? [...prev, ...(data.albums || [])] : (data.albums || []))
      setNextAlbumPage(data.nextPageToken || null)
      setStep('albums')
    } catch (e) {
      setError('Could not load albums. Check that the Photos Library API is enabled in Google Cloud Console.')
    }
    setLoading(false)
  }

  const fetchPhotos = async (album, pageToken = null) => {
    setActiveAlbum(album)
    setLoading(true)
    try {
      const res = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumId: album.id, pageSize: 50, ...(pageToken ? { pageToken } : {}) }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setPhotos(prev => pageToken ? [...prev, ...(data.mediaItems || [])] : (data.mediaItems || []))
      setNextPhotoPage(data.nextPageToken || null)
      setStep('photos')
    } catch (e) {
      setError('Could not load photos from this album.')
    }
    setLoading(false)
  }

  const togglePhoto = (photo) => {
    setSelected(prev =>
      prev.find(p => p.id === photo.id)
        ? prev.filter(p => p.id !== photo.id)
        : [...prev, photo]
    )
  }

  const confirmSelection = () => {
    const imgs = selected.map(p => ({
      id: p.id,
      name: p.filename || p.id,
      // =w1920-h1080 requests a sized version; Google Photos serves it as-is
      url: `${p.baseUrl}=w1920-h1080`,
    }))
    onSelect(imgs)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            {step === 'photos' && (
              <button
                onClick={() => { setStep('albums'); setPhotos([]); setActiveAlbum(null); setSelected([]) }}
                className="btn-ghost p-1 rounded-lg mr-1"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            <GooglePhotosIcon size={20} />
            <h3 className="font-semibold text-sm">
              {step === 'photos' ? activeAlbum?.title : 'Google Photos'}
            </h3>
            {step === 'albums' && <span className="text-xs text-muted">Select an album</span>}
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Step: Loading */}
          {step === 'loading' && (
            <div className="flex justify-center items-center py-16">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Step: Not signed in with Google */}
          {step === 'signin' && (
            <div className="flex flex-col items-center justify-center py-10 gap-5 text-center">
              <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center">
                <GooglePhotosIcon size={32} />
              </div>
              <div className="space-y-1.5">
                <p className="font-medium">Google account required</p>
                <p className="text-sm text-muted max-w-sm">
                  Google Photos access uses the same Google account you sign in to PresentGO with.
                  Sign out and sign back in with Google to enable this.
                </p>
              </div>
              <div className="w-full card border-amber-500/30 bg-amber-500/5 text-left space-y-2">
                <p className="text-sm font-medium text-amber-400">Also: enable Photos Library API</p>
                <ol className="text-xs text-muted space-y-1 list-decimal list-inside">
                  <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-accent-light underline">console.cloud.google.com</a></li>
                  <li>APIs &amp; Services → Enable <strong className="text-primary">Photos Library API</strong></li>
                  <li>Add the scope <code className="bg-card px-1 rounded text-accent-light">photoslibrary.readonly</code> to your OAuth consent screen</li>
                  <li>Sign in to PresentGO with Google — Photos access is automatic</li>
                </ol>
              </div>
            </div>
          )}

          {/* Step: Albums */}
          {step === 'albums' && (
            <div className="space-y-3">
              {loading && albums.length === 0 ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : albums.length === 0 ? (
                <p className="text-center text-muted text-sm py-8">No albums found in your Google Photos.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {albums.map(album => (
                    <button
                      key={album.id}
                      onClick={() => fetchPhotos(album)}
                      className="text-left card hover:border-accent/40 transition-colors group p-3 space-y-2"
                    >
                      {album.coverPhotoBaseUrl ? (
                        <div className="aspect-video rounded-lg overflow-hidden bg-card">
                          <img
                            src={`${album.coverPhotoBaseUrl}=w400-h225-c`}
                            alt={album.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="aspect-video rounded-lg bg-card flex items-center justify-center">
                          <Image size={24} className="text-muted" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium truncate group-hover:text-accent-light transition-colors">{album.title}</p>
                        {album.mediaItemsCount && (
                          <p className="text-xs text-muted">{album.mediaItemsCount} items</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {nextAlbumPage && (
                <button
                  onClick={() => fetchAlbums(token, nextAlbumPage)}
                  className="btn-secondary w-full text-sm"
                  disabled={loading}
                >
                  {loading ? 'Loading…' : 'Load more albums'}
                </button>
              )}
            </div>
          )}

          {/* Step: Photos */}
          {step === 'photos' && (
            <div className="space-y-3">
              {loading && photos.length === 0 ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : photos.length === 0 ? (
                <p className="text-center text-muted text-sm py-8">No photos in this album.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map(photo => {
                    const isSel = selected.find(p => p.id === photo.id)
                    return (
                      <button
                        key={photo.id}
                        onClick={() => togglePhoto(photo)}
                        className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all ${
                          isSel ? 'border-accent shadow-lg shadow-accent/20' : 'border-transparent hover:border-border'
                        }`}
                      >
                        <img
                          src={`${photo.baseUrl}=w400-h225-c`}
                          alt={photo.filename}
                          className="w-full h-full object-cover"
                        />
                        {isSel && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                            <Check size={11} className="text-white" />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
              {nextPhotoPage && (
                <button
                  onClick={() => fetchPhotos(activeAlbum, nextPhotoPage)}
                  className="btn-secondary w-full text-sm"
                  disabled={loading}
                >
                  {loading ? 'Loading…' : 'Load more photos'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0">
          <span className="text-xs text-muted">
            {selected.length > 0 ? `${selected.length} photo${selected.length !== 1 ? 's' : ''} selected` : ' '}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            {step === 'photos' && (
              <button
                onClick={confirmSelection}
                disabled={selected.length === 0}
                className="btn-primary text-sm flex items-center gap-1.5"
              >
                <Check size={14} /> Add {selected.length > 0 ? selected.length : ''} photo{selected.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Fixed system categories — cannot be removed
const FIXED_TABS = [
  { id: 'all',          label: 'All' },
  { id: 'presentation', label: 'Presentations' },
  { id: 'image',        label: 'Images' },
  { id: 'loop',         label: 'Loops' },
]

const FIXED_ICONS  = { presentation: Monitor, image: Image, loop: GalleryHorizontal }
const FIXED_COLORS = {
  presentation: 'text-blue-400 bg-blue-400/10',
  image:        'text-green-400 bg-green-400/10',
  loop:         'text-purple-400 bg-purple-400/10',
}

// Slide durations available for loops
const LOOP_DURATIONS = [
  { value: 5,  label: '5s' },
  { value: 10, label: '10s' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
]

// ─── Loop creator / editor modal ───────────────────────────────────────────────

function LoopEditor({ loop, onSave, onClose }) {
  const [name, setName]         = useState(loop?.name || '')
  const [duration, setDuration] = useState(loop?.duration || 10)
  const [images, setImages]     = useState(loop?.images || [])
  const [showGPhotos, setShowGPhotos] = useState(false)
  const fileRef = useRef(null)

  const addImages = (files) => {
    const newImgs = Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .map(f => ({ id: `${Date.now()}-${f.name}`, name: f.name, url: URL.createObjectURL(f) }))
    setImages(prev => [...prev, ...newImgs])
  }

  const removeImage = (id) => setImages(prev => prev.filter(img => img.id !== id))

  const moveUp   = (i) => setImages(prev => { const a = [...prev]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a })
  const moveDown = (i) => setImages(prev => { const a = [...prev]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold">{loop ? 'Edit Loop' : 'New Loop'}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Name */}
          <div>
            <label className="label">Loop name</label>
            <input
              className="input"
              placeholder="e.g. Sunday Morning Welcome"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Slide duration */}
          <div>
            <label className="label flex items-center gap-1.5">
              <Clock size={13} /> Slide duration
            </label>
            <div className="flex gap-2">
              {LOOP_DURATIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setDuration(value)}
                  className={`px-5 py-2 rounded-lg border font-medium text-sm transition-colors ${
                    duration === value
                      ? 'border-accent bg-accent/20 text-accent-light'
                      : 'border-border bg-card text-muted hover:text-primary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted mt-1.5">Each image will display for {duration} seconds before advancing.</p>
          </div>

          {/* Images */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Images ({images.length})</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowGPhotos(true)}
                  className="flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors"
                  title="Import from Google Photos"
                >
                  <GooglePhotosIcon size={13} /> Google Photos
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors"
                  title="Import from Apple Photos or device"
                >
                  <ApplePhotosIcon size={13} /> Apple Photos
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-accent-light hover:text-accent transition-colors"
                >
                  <Plus size={13} /> Add images
                </button>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={e => { addImages(e.target.files); e.target.value = '' }}
            />

            {images.length === 0 ? (
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-accent/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Image size={28} className="mx-auto text-muted mb-2" />
                <p className="text-sm text-muted">Click to add images, or drag & drop</p>
                <p className="text-xs text-muted/60 mt-1">JPG, PNG, WebP, GIF</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {images.map((img, i) => (
                  <div key={img.id} className="relative group/img rounded-xl overflow-hidden border border-border bg-card aspect-video">
                    <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                    {/* Order badge */}
                    <span className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                      {i + 1}
                    </span>
                    {/* Controls */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <button
                        disabled={i === 0}
                        onClick={() => moveUp(i)}
                        className="p-1 rounded bg-black/40 text-white hover:bg-accent/60 disabled:opacity-30 text-xs"
                        title="Move left"
                      >←</button>
                      <button
                        onClick={() => removeImage(img.id)}
                        className="p-1.5 rounded bg-red-700/70 text-white hover:bg-red-600"
                        title="Remove"
                      ><X size={12} /></button>
                      <button
                        disabled={i === images.length - 1}
                        onClick={() => moveDown(i)}
                        className="p-1 rounded bg-black/40 text-white hover:bg-accent/60 disabled:opacity-30 text-xs"
                        title="Move right"
                      >→</button>
                    </div>
                  </div>
                ))}
                {/* Add more tile */}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="aspect-video rounded-xl border-2 border-dashed border-border flex items-center justify-center text-muted hover:border-accent/50 hover:text-accent-light transition-colors"
                >
                  <Plus size={22} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            disabled={!name.trim() || images.length === 0}
            onClick={() => onSave({ id: loop?.id || Date.now().toString(), name: name.trim(), duration, images })}
            className="btn-primary flex items-center gap-2"
          >
            <Check size={15} /> {loop ? 'Save Changes' : 'Create Loop'}
          </button>
        </div>
      </div>

      {/* Google Photos picker — layered above the loop editor */}
      {showGPhotos && (
        <GooglePhotosPicker
          onSelect={imgs => setImages(prev => [...prev, ...imgs])}
          onClose={() => setShowGPhotos(false)}
        />
      )}
    </div>
  )
}

// ─── Loops panel ───────────────────────────────────────────────────────────────

function LoopsPanel({ storageKey }) {
  const loopsKey = `${storageKey}-loops`
  const [loops, setLoops] = useState(() => {
    try { return JSON.parse(localStorage.getItem(loopsKey) || '[]') } catch { return [] }
  })
  const [editing, setEditing] = useState(null)   // null | 'new' | loop object
  const [preview, setPreview] = useState(null)   // loop being previewed

  useEffect(() => {
    localStorage.setItem(loopsKey, JSON.stringify(loops))
  }, [loops, loopsKey])

  const saveLoop = (loop) => {
    setLoops(prev => {
      const exists = prev.find(l => l.id === loop.id)
      return exists ? prev.map(l => l.id === loop.id ? loop : l) : [...prev, loop]
    })
    setEditing(null)
  }

  const deleteLoop = (id) => setLoops(prev => prev.filter(l => l.id !== id))

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {loops.length === 0 ? 'No loops yet.' : `${loops.length} loop${loops.length !== 1 ? 's' : ''}`}
        </p>
        <button
          onClick={() => setEditing('new')}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus size={14} /> New Loop
        </button>
      </div>

      {/* Loop cards */}
      {loops.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <GalleryHorizontal size={36} className="text-muted mx-auto" />
          <p className="text-muted text-sm">Create a loop to display a slideshow of images during services.</p>
          <button onClick={() => setEditing('new')} className="btn-primary mx-auto flex items-center gap-2">
            <Plus size={14} /> Create your first loop
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {loops.map(loop => (
            <div key={loop.id} className="card group hover:border-purple-500/30 transition-colors space-y-3">
              {/* Thumbnail strip */}
              <div className="flex gap-1 h-16 overflow-hidden rounded-lg">
                {loop.images.slice(0, 4).map((img, i) => (
                  <div key={img.id} className="flex-1 relative overflow-hidden rounded">
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                    {i === 3 && loop.images.length > 4 && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs font-medium">
                        +{loop.images.length - 4}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Info */}
              <div>
                <p className="font-medium text-sm">{loop.name}</p>
                <p className="text-xs text-muted flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-1"><Image size={11} />{loop.images.length} image{loop.images.length !== 1 ? 's' : ''}</span>
                  <span className="flex items-center gap-1"><Clock size={11} />{loop.duration}s per slide</span>
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setEditing(loop)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg border border-border text-muted hover:text-primary hover:border-accent transition-colors"
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  onClick={() => deleteLoop(loop.id)}
                  className="p-1.5 rounded-lg border border-border text-muted hover:text-red-400 hover:border-red-500/30 transition-colors"
                  title="Delete loop"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor modal */}
      {editing && (
        <LoopEditor
          loop={editing === 'new' ? null : editing}
          onSave={saveLoop}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function guessCategory(filename) {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (['pptx', 'ppt', 'key', 'keynote'].includes(ext)) return 'presentation'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  return null // will use activeCategory or 'other'
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ContentLibrary() {
  const { user } = useAuth()
  const storageKey = `presentgo-folders-${user.id}`

  const [items, setItems]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [activeCategory, setActiveCategory] = useState('all')
  const [uploading, setUploading]       = useState(false)
  const [dragOver, setDragOver]         = useState(false)
  const [showGDriveInfo, setShowGDriveInfo] = useState(false)
  const [showGPhotosImages, setShowGPhotosImages] = useState(false)
  const [customFolders, setCustomFolders] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]') } catch { return [] }
  })
  const [addingFolder, setAddingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const fileInputRef      = useRef(null)
  const folderInputRef    = useRef(null)
  const applePhotosRef    = useRef(null)

  useEffect(() => { loadItems() }, [user.id])

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(customFolders))
  }, [customFolders, storageKey])

  // Focus folder name input when shown
  useEffect(() => {
    if (addingFolder) folderInputRef.current?.focus()
  }, [addingFolder])

  const loadItems = async () => {
    const { data } = await supabase
      .from('media_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  const handleFiles = async (files) => {
    if (!files?.length) return
    setUploading(true)
    for (const file of Array.from(files)) {
      // Use auto-detection, fall back to the active custom folder or 'other'
      const guessed = guessCategory(file.name)
      const category = guessed
        || (activeCategory !== 'all' ? activeCategory : 'other')
      const path = `${user.id}/${Date.now()}-${file.name}`
      const { error: storageError } = await supabase.storage.from('media').upload(path, file)
      if (storageError) { console.error(storageError); continue }
      await supabase.from('media_items').insert({
        user_id: user.id,
        name: file.name,
        category,
        file_path: path,
        file_size: file.size,
        mime_type: file.type,
        source: 'upload',
      })
    }
    setUploading(false)
    loadItems()
  }

  const handleGPhotosImages = (imgs) => {
    const newItems = imgs.map(img => ({
      id: `gphotos-${img.id}`,
      name: img.name,
      category: 'image',
      file_path: null,
      source_url: img.url,
      created_at: new Date().toISOString(),
    }))
    setItems(prev => [...newItems, ...prev])
    setShowGPhotosImages(false)
  }

  const handleDelete = async (item) => {
    await supabase.storage.from('media').remove([item.file_path])
    await supabase.from('media_items').delete().eq('id', item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
  }

  const createFolder = () => {
    const name = newFolderName.trim()
    if (!name) return
    if (customFolders.includes(name)) { setNewFolderName(''); setAddingFolder(false); return }
    const updated = [...customFolders, name]
    setCustomFolders(updated)
    setActiveCategory(name)
    setNewFolderName('')
    setAddingFolder(false)
  }

  const deleteFolder = (folder) => {
    setCustomFolders(prev => prev.filter(f => f !== folder))
    if (activeCategory === folder) setActiveCategory('all')
  }

  const getPublicUrl = (item) => {
    const { data } = supabase.storage.from('media').getPublicUrl(item.file_path)
    return data.publicUrl
  }

  const getCategoryLabel = (catId) => {
    const fixed = FIXED_TABS.find(t => t.id === catId)
    return fixed ? fixed.label.replace(/s$/, '') : catId
  }

  const filtered = activeCategory === 'all'
    ? items
    : items.filter(i => i.category === activeCategory)

  const countFor = (id) => id === 'all' ? items.length : items.filter(i => i.category === id).length

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Content Library</h1>
            <p className="text-muted text-sm mt-1">Presentations, images and custom folders</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Google Drive button */}
            <button
              onClick={() => setShowGDriveInfo(o => !o)}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <GoogleDriveIcon size={15} /> Google Drive
            </button>

            {/* Upload from Desktop */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary flex items-center gap-2 text-sm"
              disabled={uploading}
            >
              <Upload size={15} />
              {uploading ? 'Uploading…' : 'Upload from Desktop'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pptx,.ppt,.key,.keynote,.pdf,.jpg,.jpeg,.png,.gif,.webp,.svg"
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
          </div>
        </div>

        {/* Google Drive info banner */}
        {showGDriveInfo && (
          <div className="card border-accent/30 bg-accent/5 flex items-start gap-3">
            <GoogleDriveIcon size={18} />
            <div className="flex-1 text-sm space-y-1">
              <p className="font-medium text-accent-light">Google Drive import</p>
              <p className="text-muted">Sign in with Google to import PowerPoint (.pptx), Keynote (.key), PDF, or Google Slides files directly from your Drive. Drive API integration will be enabled in an upcoming update.</p>
            </div>
            <button onClick={() => setShowGDriveInfo(false)} className="text-muted hover:text-[#f5f5f5] mt-0.5 shrink-0"><X size={14} /></button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-end gap-1 border-b border-border overflow-x-auto">
          {/* Fixed tabs */}
          {FIXED_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveCategory(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex items-center gap-1.5 ${
                activeCategory === tab.id
                  ? 'border-accent text-accent-light'
                  : 'border-transparent text-muted hover:text-[#f5f5f5]'
              }`}
            >
              {tab.label}
              {countFor(tab.id) > 0 && (
                <span className="text-[10px] bg-card px-1.5 py-0.5 rounded-full">{countFor(tab.id)}</span>
              )}
            </button>
          ))}

          {/* Custom folder tabs */}
          {customFolders.map(folder => (
            <div key={folder} className="relative group/tab flex items-end">
              <button
                onClick={() => setActiveCategory(folder)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex items-center gap-1.5 pr-2 ${
                  activeCategory === folder
                    ? 'border-accent text-accent-light'
                    : 'border-transparent text-muted hover:text-[#f5f5f5]'
                }`}
              >
                <Folder size={12} />
                {folder}
                {countFor(folder) > 0 && (
                  <span className="text-[10px] bg-card px-1.5 py-0.5 rounded-full">{countFor(folder)}</span>
                )}
              </button>
              <button
                onClick={() => deleteFolder(folder)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-card border border-border flex items-center justify-center opacity-0 group-hover/tab:opacity-100 transition-opacity hover:bg-red-700/30 hover:text-red-400 text-muted"
                title="Remove folder"
              >
                <X size={8} />
              </button>
            </div>
          ))}

          {/* New folder input or + button */}
          <div className="flex items-center pb-1 ml-1 shrink-0">
            {addingFolder ? (
              <div className="flex items-center gap-1">
                <input
                  ref={folderInputRef}
                  className="bg-card border border-border rounded-lg px-2 py-1 text-sm w-32 focus:outline-none focus:border-accent"
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') createFolder()
                    if (e.key === 'Escape') { setAddingFolder(false); setNewFolderName('') }
                  }}
                />
                <button onClick={createFolder} className="btn-primary px-2 py-1 text-xs">Add</button>
                <button onClick={() => { setAddingFolder(false); setNewFolderName('') }} className="btn-ghost p-1 rounded"><X size={13} /></button>
              </div>
            ) : (
              <button
                onClick={() => setAddingFolder(true)}
                className="flex items-center gap-1 text-xs text-muted hover:text-[#f5f5f5] px-2 py-1 rounded-lg hover:bg-card transition-colors"
                title="New folder"
              >
                <Plus size={13} /> New Folder
              </button>
            )}
          </div>
        </div>

        {/* Photo import row — Images tab only */}
        {activeCategory === 'image' && (
          <div className="flex items-center gap-3 py-1">
            <span className="text-xs text-muted font-medium uppercase tracking-wider">Import from</span>
            <button
              onClick={() => setShowGPhotosImages(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-muted hover:text-primary hover:border-accent/50 transition-colors"
            >
              <GooglePhotosIcon size={14} /> Google Photos
            </button>
            <button
              onClick={() => applePhotosRef.current?.click()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-muted hover:text-primary hover:border-accent/50 transition-colors"
            >
              <ApplePhotosIcon size={14} /> Apple Photos
            </button>
            <input
              ref={applePhotosRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
            />
          </div>
        )}

        {/* Drop zone — hidden on Loops tab */}
        {activeCategory !== 'loop' && <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer ${
            dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-[#444]'
          }`}
        >
          <Upload size={28} className="mx-auto text-muted mb-3" />
          <p className="text-sm text-muted">
            Drag & drop files here, or <span className="text-accent-light">browse to upload</span>
            {activeCategory !== 'all' && (
              <span className="text-muted"> into <span className="text-[#f5f5f5]">{getCategoryLabel(activeCategory)}</span></span>
            )}
          </p>
          <p className="text-xs text-muted/60 mt-1">PowerPoint (.pptx), Keynote (.key), PDF, JPG, PNG and more</p>
        </div>}

        {/* Loops panel — replaces file grid when Loops tab is active */}
        {activeCategory === 'loop' && <LoopsPanel storageKey={storageKey} />}

        {/* Items */}
        {activeCategory !== 'loop' && loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeCategory !== 'loop' && filtered.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <FolderOpen size={36} className="text-muted mx-auto" />
            <p className="text-muted text-sm">
              {activeCategory === 'all' ? 'No files yet.' : `No files in ${getCategoryLabel(activeCategory)} yet.`}
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary mx-auto flex items-center gap-2"
            >
              <Plus size={14} /> Upload a file
            </button>
          </div>
        ) : activeCategory !== 'loop' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(item => {
              const Icon = FIXED_ICONS[item.category] || Folder
              const colorClass = FIXED_COLORS[item.category] || 'text-accent-light bg-accent/10'
              return (
                <div key={item.id} className="card flex items-center gap-3 group hover:border-[#444] transition-colors">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted">
                      {getCategoryLabel(item.category)}
                      {item.file_size ? ` · ${formatSize(item.file_size)}` : ''}
                      {' · '}{formatDate(item.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <a
                      href={getPublicUrl(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-[#333] text-muted hover:text-primary"
                      title="Open file"
                    >
                      <ExternalLink size={13} />
                    </a>
                    <button
                      onClick={() => handleDelete(item)}
                      className="p-1.5 rounded hover:bg-red-700/30 text-muted hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>

      {/* Google Photos picker for Images tab */}
      {showGPhotosImages && (
        <GooglePhotosPicker
          onSelect={handleGPhotosImages}
          onClose={() => setShowGPhotosImages(false)}
        />
      )}
    </Layout>
  )
}
