import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatModified, formatSetTime } from '../lib/sets'
import { buildIcs } from '../lib/ics'
import Layout from '../components/Layout'
import AddItemModal from '../components/sets/AddItemModal'
import SongEditor from '../components/songs/SongEditor'
import { formatLyrics } from '../lib/lyricFormatter'
import {
  Plus, MonitorPlay, Music, Star, Megaphone, Square,
  Trash2, ChevronUp, ChevronDown, ArrowLeft, Layers, FolderOpen, Pencil, CalendarPlus, MapPin,
} from 'lucide-react'

const ITEM_ICONS  = { song: Music, welcome: Star, announcement: Megaphone, blank: Square, media: FolderOpen }
const ITEM_LABELS = { song: 'Song', welcome: 'Welcome', announcement: 'Announcement', blank: 'Blank', media: 'Content' }
const ITEM_COLORS = {
  song:         'text-accent-light bg-accent/20',
  welcome:      'text-yellow-400 bg-yellow-400/10',
  announcement: 'text-orange-400 bg-orange-400/10',
  blank:        'text-gray-500 bg-gray-500/10',
  media:        'text-purple-400 bg-purple-400/10',
}

export default function SetEditor() {
  const { setId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [set, setSet]       = useState(null)
  const [items, setItems]   = useState([])
  const [songs, setSongs]   = useState({})
  const [editItem, setEditItem] = useState(null)
  const [editSong, setEditSong] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [details, setDetails] = useState(null)   // form state while editing set details
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [detailsError, setDetailsError] = useState(null)
  const [showAdd, setShowAdd]   = useState(false)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      // Mock data for preview
      if (setId === 'mock') {
        setSet({ id: 'mock', name: 'Sunday Morning — March 23', service_date: '2026-03-23' })
        const mockSongId = 'mock-song-1'
        const mockSong = {
          id: mockSongId, title: 'Holy Forever', artist: 'Bethel Music', lines_per_slide: 2,
          raw_lyrics: '[Verse 1]\nA thousand generations falling down in worship\nTo sing the song of ages to the Lamb\n\n[Chorus]\nHoly forever\nA story never ending\nHoly forever\nTo sing Your praise unceasing',
          slides: [],
        }
        setSongs({ [mockSongId]: mockSong })
        setItems([
          { id: 'i1', type: 'welcome',      position: 0, content: { title: 'Welcome', subtitle: "Glad you're here!" } },
          { id: 'i2', type: 'song',         position: 1, content: { song_id: mockSongId, song_title: 'Holy Forever', song_artist: 'Bethel Music' } },
          { id: 'i3', type: 'announcement', position: 2, content: { title: 'Announcements', slides: [{ lines: ['Join us for small groups', 'Every Wednesday at 7pm'] }] } },
          { id: 'i4', type: 'blank',        position: 3, content: {} },
        ])
        setLoading(false)
        return
      }

      const [{ data: setData }, { data: itemsData }] = await Promise.all([
        supabase.from('sets').select('*').eq('id', setId).single(),
        supabase.from('set_items').select('*').eq('set_id', setId).order('position'),
      ])
      if (!setData) { navigate('/'); return }
      setSet(setData)
      setItems(itemsData || [])

      const songIds = (itemsData || []).filter(i => i.type === 'song').map(i => i.content?.song_id).filter(Boolean)
      if (songIds.length) {
        const { data: songData } = await supabase.from('songs').select('*').in('id', songIds)
        const map = {}
        for (const s of (songData || [])) map[s.id] = s
        setSongs(map)
      }
      setLoading(false)
    }
    load()
  }, [setId])

  const handleAddItem = async (item) => {
    if (setId === 'mock') return // no-op in mock mode
    const pos = items.length
    const { data } = await supabase
      .from('set_items')
      .insert({ set_id: setId, type: item.type, content: item.content, position: pos })
      .select().single()
    if (data) {
      setItems(prev => [...prev, data])
      if (item.type === 'song' && item.content.song_id) {
        const { data: song } = await supabase.from('songs').select('*').eq('id', item.content.song_id).single()
        if (song) setSongs(prev => ({ ...prev, [song.id]: song }))
      }
    }
  }

  const handleDelete = async item => {
    if (deleting !== item.id) { setDeleting(item.id); return }
    if (setId !== 'mock') await supabase.from('set_items').delete().eq('id', item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
    setDeleting(null)
  }

  const DURATIONS = [30, 45, 60, 75, 90, 105, 120, 150, 180, 240]
  const durationLabel = m => (m % 60 === 0 ? `${m / 60} hr` : m > 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`)

  const openDetails = () => {
    setDetailsError(null)
    setDetails({
      name: set?.name || '',
      date: set?.service_date || '',
      time: set?.service_time ? set.service_time.slice(0, 5) : '',
      duration: set?.duration_min || 90,
      venue: set?.venue_name || '',
      address: set?.location_address || '',
      room: set?.location_details || '',
    })
  }

  const saveDetails = async () => {
    if (!details.name.trim()) { setDetailsError('Set name is required.'); return }
    setDetailsSaving(true); setDetailsError(null)
    const patch = {
      name: details.name.trim(),
      service_date: details.date || null,
      service_time: details.time || null,
      duration_min: Number(details.duration) || 90,
      venue_name: details.venue.trim() || null,
      location_address: details.address.trim() || null,
      location_details: details.room.trim() || null,
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    }
    if (setId !== 'mock') {
      const { error } = await supabase.from('sets').update(patch).eq('id', setId)
      if (error) { setDetailsSaving(false); setDetailsError('Could not save. Make sure the latest Supabase migration has been run.'); return }
    }
    setSet(prev => ({ ...prev, ...patch, updated_at: new Date().toISOString() }))
    setDetailsSaving(false); setDetails(null)
  }

  const downloadIcs = () => {
    const ics = buildIcs([{ ...set, id: set.id }], { baseUrl: window.location.origin, calendarName: set.name })
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${(set.name || 'set').replace(/[^\w-]+/g, '_')}.ics`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleEdit = item => {
    if (item.type === 'song') {
      const song = songs[item.content?.song_id]
      if (song) setEditSong(song)
    } else if (item.type !== 'blank') {
      setEditItem(item)
    }
  }

  const handleSaveEdit = async ({ content }) => {
    if (setId !== 'mock') await supabase.from('set_items').update({ content }).eq('id', editItem.id)
    setItems(prev => prev.map(i => i.id === editItem.id ? { ...i, content } : i))
  }

  const handleSongSaved = async saved => {
    setSongs(prev => ({ ...prev, [saved.id]: saved }))
    const touched = items.filter(i => i.type === 'song' && i.content?.song_id === saved.id)
    const content = i => ({ ...i.content, song_title: saved.title, song_artist: saved.artist })
    setItems(prev => prev.map(i => touched.includes(i) ? { ...i, content: content(i) } : i))
    if (setId !== 'mock') await Promise.all(touched.map(i => supabase.from('set_items').update({ content: content(i) }).eq('id', i.id)))
  }

  const moveItem = async (idx, dir) => {
    const next = [...items]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setItems(next)
    if (setId !== 'mock') {
      await Promise.all([
        supabase.from('set_items').update({ position: swap }).eq('id', next[swap].id),
        supabase.from('set_items').update({ position: idx  }).eq('id', next[idx].id),
      ])
    }
  }

  const getSlidesForItem = (item) => {
    if (item.type === 'song') {
      const song = songs[item.content?.song_id]
      if (!song) return []
      return (song.slides?.length ? song.slides : null) || formatLyrics(song.raw_lyrics, song.lines_per_slide || 2)
    }
    if (item.type === 'welcome')      return [{ lines: [item.content.title, item.content.subtitle].filter(Boolean), label: 'Welcome' }]
    if (item.type === 'announcement') return (item.content.slides || [])
    if (item.type === 'blank')        return [{ lines: [], label: 'Blank' }]
    if (item.type === 'media' && item.content?.images?.length) return item.content.images.map(img => ({ image: img.url, lines: [] }))
    if (item.type === 'media')        return [{ lines: [item.content?.media_name || 'Media file'], label: item.content?.media_category || 'Content' }]
    return []
  }

  const openPresent = () => {
    navigate(`/sets/${setId}/control`)
  }

  const formatDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''

  const itemTitle = item =>
    item.type === 'song'  ? item.content?.song_title :
    item.type === 'media' ? item.content?.media_name :
    item.content?.title || ITEM_LABELS[item.type]

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-3">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="btn-ghost p-1.5 rounded-lg shrink-0" aria-label="Back to Home">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold text-lg truncate">{set?.name || '…'}</h1>
            <p className="text-xs text-muted">{[set?.service_date && formatDate(set.service_date), set?.service_time && formatSetTime(set.service_time), set?.updated_at && `Updated ${formatModified(set.updated_at)}`].filter(Boolean).join(' · ')}</p>
            {(set?.venue_name || set?.location_address) && (
              <p className="text-xs text-muted flex items-center gap-1 truncate"><MapPin size={11} className="shrink-0" />{[set.venue_name, set.location_address].filter(Boolean).join(', ')}{set.location_details ? ` · ${set.location_details}` : ''}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={openDetails} className="btn-ghost flex items-center gap-1.5 text-sm !px-2.5 !py-1.5"><Pencil size={13} /> Edit details</button>
            <button onClick={downloadIcs} disabled={!set?.service_date} title={set?.service_date ? 'Download an event file for Apple, Google or Outlook calendar' : 'Add a date first'}
              className="btn-ghost flex items-center gap-1.5 text-sm !px-2.5 !py-1.5 disabled:opacity-40"><CalendarPlus size={14} /> Add to calendar</button>
          </div>
        </div>

        {details && (
          <section className="rounded-xl border border-border bg-card p-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 sm:col-span-4">
                <label className="label !mb-1">Set name</label>
                <input className="input" value={details.name} onChange={e => setDetails(d => ({ ...d, name: e.target.value }))} />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="label !mb-1">Date</label>
                <input type="date" className="input" value={details.date} onChange={e => setDetails(d => ({ ...d, date: e.target.value }))} />
              </div>
              <div>
                <label className="label !mb-1">Start time</label>
                <input type="time" className="input" value={details.time} onChange={e => setDetails(d => ({ ...d, time: e.target.value }))} />
              </div>
              <div>
                <label className="label !mb-1">Length</label>
                <select className="input" value={details.duration} onChange={e => setDetails(d => ({ ...d, duration: e.target.value }))}>
                  {(DURATIONS.includes(Number(details.duration)) ? DURATIONS : [...DURATIONS, Number(details.duration)].sort((a, b) => a - b)).map(m => <option key={m} value={m}>{durationLabel(m)}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label !mb-1">Venue name</label>
                <input className="input" placeholder="First Baptist Church" value={details.venue} onChange={e => setDetails(d => ({ ...d, venue: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label !mb-1">Address</label>
                <input className="input" placeholder="123 Main St, Dallas, TX 75201" value={details.address} onChange={e => setDetails(d => ({ ...d, address: e.target.value }))} />
              </div>
              <div className="col-span-2 sm:col-span-4">
                <label className="label !mb-1">Room / details (optional)</label>
                <input className="input" placeholder="Main Sanctuary" value={details.room} onChange={e => setDetails(d => ({ ...d, room: e.target.value }))} />
              </div>
            </div>
            {detailsError && <p className="text-red-400 text-xs">{detailsError}</p>}
            <div className="flex items-center gap-2">
              <button onClick={saveDetails} disabled={detailsSaving} className="btn-primary !py-1.5 !px-4 text-sm">{detailsSaving ? 'Saving…' : 'Save details'}</button>
              <button onClick={() => setDetails(null)} className="btn-ghost text-sm">Cancel</button>
              <span className="ml-auto text-[11px] text-muted hidden sm:block">Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
            </div>
          </section>
        )}

        {/* Program card */}
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border">
            <div className="flex items-baseline gap-2">
              <h2 className="font-semibold">Set Program</h2>
              <span className="text-xs text-muted">{items.length} item{items.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowAdd(true)} className="btn-secondary flex items-center gap-1.5 !py-1 !px-3 text-sm">
                <Plus size={14} /> Add Item
              </button>
              <button onClick={openPresent} disabled={items.length === 0}
                className="btn-primary flex items-center gap-1.5 !py-1 !px-3 text-sm disabled:opacity-40">
                <MonitorPlay size={14} /> Presentation Mode
              </button>
            </div>
          </div>

          <div className="p-2">
            {loading ? (
              <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
            ) : items.length === 0 ? (
              <div className="text-center py-12 space-y-3 px-4">
                <Layers size={32} className="text-muted mx-auto" />
                <p className="text-muted text-sm">Build your program: add songs, title slides, announcements and content in the order they'll run.</p>
                <button onClick={() => setShowAdd(true)} className="btn-primary mx-auto flex items-center gap-1.5 text-sm">
                  <Plus size={14} /> Add Item
                </button>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {items.map((item, idx) => {
                  const ItemIcon = ITEM_ICONS[item.type] || Square
                  const colorClass = ITEM_COLORS[item.type] || ITEM_COLORS.blank
                  const slideCount = getSlidesForItem(item).length
                  const editable = item.type !== 'blank' && !(item.type === 'song' && !songs[item.content?.song_id])
                  return (
                    <li key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#1a1a1a] group">
                      <span className="text-xs text-muted w-5 shrink-0 text-center">{idx + 1}</span>
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${colorClass}`}><ItemIcon size={13} /></div>
                      <button onClick={() => editable && handleEdit(item)} className="flex-1 min-w-0 text-left" disabled={!editable}>
                        <p className="text-sm font-medium truncate">{itemTitle(item)}</p>
                        <p className="text-xs text-muted truncate">
                          {item.type === 'media' && item.content?.media_category === 'presentation' ? 'Presentation' : ITEM_LABELS[item.type]}
                          {item.type === 'song' && item.content?.song_artist ? ` · ${item.content.song_artist}` : ''}
                          {slideCount > 0 ? ` · ${slideCount} slide${slideCount !== 1 ? 's' : ''}` : ''}
                        </p>
                      </button>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} aria-label="Move up"
                          className="p-1.5 rounded-lg hover:bg-[#2e2e2e] text-muted hover:text-[#f5f5f5] disabled:opacity-20"><ChevronUp size={14} /></button>
                        <button onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} aria-label="Move down"
                          className="p-1.5 rounded-lg hover:bg-[#2e2e2e] text-muted hover:text-[#f5f5f5] disabled:opacity-20"><ChevronDown size={14} /></button>
                        <button onClick={() => handleEdit(item)} disabled={!editable} aria-label="Edit item" title={editable ? 'Edit' : 'Nothing to edit'}
                          className="p-1.5 rounded-lg hover:bg-[#2e2e2e] text-muted hover:text-[#f5f5f5] disabled:opacity-20"><Pencil size={14} /></button>
                        <button onClick={() => handleDelete(item)} aria-label="Delete item" title={deleting === item.id ? 'Click again to confirm delete' : 'Delete'}
                          className={`p-1.5 rounded-lg transition-colors ${deleting === item.id ? 'bg-red-700 text-white' : 'hover:bg-[#2e2e2e] text-muted hover:text-red-400'}`}><Trash2 size={14} /></button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        {items.length > 0 && (
          <p className="text-xs text-muted text-center">When your program is ready, open <strong className="text-[#f5f5f5]">Presentation Mode</strong> to connect a TV and run the slides.</p>
        )}
      </div>

      {showAdd && <AddItemModal onClose={() => setShowAdd(false)} onAdd={handleAddItem} />}
      {editItem && <AddItemModal item={editItem} onClose={() => setEditItem(null)} onAdd={handleSaveEdit} />}
      {editSong && <SongEditor song={editSong} onClose={() => setEditSong(null)} onSaved={handleSongSaved} />}
    </Layout>
  )
}
