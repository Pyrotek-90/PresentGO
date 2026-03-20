import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import AddItemModal from '../components/sets/AddItemModal'
import { formatLyrics } from '../lib/lyricFormatter'
import {
  Plus, Play, Music, Star, Megaphone, Square,
  Trash2, ChevronUp, ChevronDown, ArrowLeft, Layers, FolderOpen,
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
  const [selected, setSelected] = useState(0)
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
      setSelected(items.length)
      if (item.type === 'song' && item.content.song_id) {
        const { data: song } = await supabase.from('songs').select('*').eq('id', item.content.song_id).single()
        if (song) setSongs(prev => ({ ...prev, [song.id]: song }))
      }
    }
  }

  const handleDelete = async (item, idx) => {
    if (setId !== 'mock') await supabase.from('set_items').delete().eq('id', item.id)
    setItems(prev => {
      const next = prev.filter(i => i.id !== item.id)
      setSelected(s => Math.min(s, Math.max(0, next.length - 1)))
      return next
    })
  }

  const moveItem = async (idx, dir) => {
    const next = [...items]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setItems(next)
    setSelected(swap)
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
    if (item.type === 'media')        return [{ lines: [item.content?.media_name || 'Media file'], label: item.content?.media_category || 'Content' }]
    return []
  }

  const openPresent = () => {
    navigate(`/sets/${setId}/control`)
  }

  const selectedItem = items[selected]
  const slides = selectedItem ? getSlidesForItem(selectedItem) : []

  const formatDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''

  return (
    <Layout>
      <div className="flex h-full flex-col">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate('/')} className="btn-ghost p-1.5 rounded-lg shrink-0">
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="font-semibold text-base truncate">{set?.name || '…'}</h1>
              {set?.service_date && <p className="text-xs text-muted">{formatDate(set.service_date)}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowAdd(true)} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Plus size={15} /> Add Item
            </button>
            <button
              onClick={openPresent}
              disabled={items.length === 0}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <Play size={15} fill="currentColor" /> Present
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">

          {/* Left: Set item list */}
          <aside className="w-60 border-r border-border flex flex-col shrink-0 overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase tracking-wider">Run Order</span>
              <span className="text-xs text-muted">{items.length} item{items.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
              {loading ? (
                <div className="flex justify-center pt-8">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-10 space-y-3 px-4">
                  <Layers size={28} className="text-muted mx-auto" />
                  <p className="text-muted text-sm">No items yet</p>
                  <button onClick={() => setShowAdd(true)} className="btn-primary text-sm w-full">
                    <Plus size={14} className="inline mr-1" />Add Item
                  </button>
                </div>
              ) : items.map((item, idx) => {
                const ItemIcon = ITEM_ICONS[item.type] || Square
                const colorClass = ITEM_COLORS[item.type] || ITEM_COLORS.blank
                const slideCount = getSlidesForItem(item).length
                const isSelected = selected === idx

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelected(idx)}
                    className={`flex items-center gap-2 px-2 py-2.5 rounded-lg cursor-pointer group transition-all ${
                      isSelected ? 'bg-accent/15 border border-accent/30' : 'hover:bg-card border border-transparent'
                    }`}
                  >
                    {/* Position number */}
                    <span className="text-xs text-muted w-4 shrink-0 text-center">{idx + 1}</span>

                    {/* Type icon */}
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${colorClass}`}>
                      <ItemIcon size={13} />
                    </div>

                    {/* Title + type */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-[#f5f5f5]' : ''}`}>
                        {item.type === 'song'  ? item.content?.song_title  :
                         item.type === 'media' ? item.content?.media_name  :
                         item.content?.title || ITEM_LABELS[item.type]}
                      </p>
                      <p className="text-xs text-muted">
                        {ITEM_LABELS[item.type]}{slideCount > 0 ? ` · ${slideCount} slide${slideCount !== 1 ? 's' : ''}` : ''}
                      </p>
                    </div>

                    {/* Actions — show on hover */}
                    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); moveItem(idx, -1) }}
                        disabled={idx === 0}
                        className="p-0.5 rounded hover:bg-[#333] text-muted hover:text-[#f5f5f5] disabled:opacity-20"
                      ><ChevronUp size={12} /></button>
                      <button
                        onClick={e => { e.stopPropagation(); moveItem(idx, 1) }}
                        disabled={idx === items.length - 1}
                        className="p-0.5 rounded hover:bg-[#333] text-muted hover:text-[#f5f5f5] disabled:opacity-20"
                      ><ChevronDown size={12} /></button>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(item, idx) }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-700/30 hover:text-red-400 text-muted transition-all shrink-0"
                    ><Trash2 size={12} /></button>
                  </div>
                )
              })}
            </div>
          </aside>

          {/* Right: Slide preview grid */}
          <div className="flex-1 overflow-y-auto bg-[#0a0a0a]">
            {!selectedItem ? (
              <div className="flex h-full items-center justify-center flex-col gap-3 text-muted">
                <Layers size={36} />
                <p className="text-sm">Select an item to preview slides</p>
              </div>
            ) : (
              <div className="p-5 space-y-4 max-w-3xl">
                {/* Item header */}
                <div className="flex items-center gap-2">
                  {(() => { const Icon = ITEM_ICONS[selectedItem.type] || Square; return <Icon size={15} className="text-muted" /> })()}
                  <span className="text-sm font-medium">
                    {selectedItem.type === 'song'  ? selectedItem.content?.song_title  :
                   selectedItem.type === 'media' ? selectedItem.content?.media_name  :
                   selectedItem.content?.title || ITEM_LABELS[selectedItem.type]}
                  </span>
                  {selectedItem.type === 'song' && selectedItem.content?.song_artist && (
                    <span className="text-xs text-muted">— {selectedItem.content.song_artist}</span>
                  )}
                  <span className="text-xs text-muted ml-auto">{slides.length} slide{slides.length !== 1 ? 's' : ''}</span>
                </div>

                {/* Slide grid */}
                <div className="grid grid-cols-3 gap-3">
                  {slides.map((slide, i) => (
                    <div
                      key={i}
                      className="aspect-video rounded-xl bg-black border border-[#1e1e1e] hover:border-[#333] flex flex-col items-center justify-center p-3 relative transition-colors group cursor-default"
                    >
                      {slide.label && (
                        <span className="absolute top-2 left-3 text-[9px] text-gray-700 uppercase tracking-widest font-medium">
                          {slide.label}
                        </span>
                      )}
                      <div className="text-center w-full">
                        {slide.lines?.map((line, j) => (
                          <p key={j} className="text-white text-xs leading-snug">{line}</p>
                        ))}
                        {(!slide.lines || slide.lines.length === 0) && (
                          <p className="text-gray-800 text-xs italic">Blank</p>
                        )}
                      </div>
                      <span className="absolute bottom-1.5 right-2.5 text-[9px] text-gray-800 group-hover:text-gray-600 transition-colors">{i + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAdd && (
        <AddItemModal
          onClose={() => setShowAdd(false)}
          onAdd={handleAddItem}
        />
      )}
    </Layout>
  )
}
