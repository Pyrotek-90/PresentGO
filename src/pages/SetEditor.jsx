import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatModified, formatSetTime } from '../lib/sets'
import Layout from '../components/Layout'
import AddItemModal from '../components/sets/AddItemModal'
import SongEditor from '../components/songs/SongEditor'
import { formatLyrics } from '../lib/lyricFormatter'
import {
  Plus, MonitorPlay, Music, Star, Megaphone, Square,
  Trash2, ChevronUp, ChevronDown, ArrowLeft, Layers, FolderOpen, Pencil,
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
          </div>
        </div>

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
