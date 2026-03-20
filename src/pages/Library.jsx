import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import SongEditor from '../components/songs/SongEditor'
import { Plus, Search, Music, Pencil, Trash2 } from 'lucide-react'

export default function Library() {
  const { user } = useAuth()
  const [songs, setSongs] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // song or true (new)
  const [deleting, setDeleting] = useState(null)

  const load = async () => {
    const { data } = await supabase
      .from('songs')
      .select('*')
      .eq('user_id', user.id)
      .order('title')
    setSongs(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [user.id])

  const filtered = songs.filter(s =>
    s.title.toLowerCase().includes(query.toLowerCase()) ||
    (s.artist || '').toLowerCase().includes(query.toLowerCase()) ||
    (s.ccli_number || '').includes(query)
  )

  const handleDelete = async (song) => {
    if (deleting === song.id) {
      await supabase.from('songs').delete().eq('id', song.id)
      setSongs(prev => prev.filter(s => s.id !== song.id))
      setDeleting(null)
    } else {
      setDeleting(song.id)
    }
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Song Library</h1>
            <p className="text-muted text-sm mt-1">{songs.length} song{songs.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setEditing(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            Add Song
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-9"
            placeholder="Search by title, artist, or CCLI #…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {/* Songs */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Music size={40} className="text-muted mx-auto" />
            <p className="text-muted">
              {query ? 'No songs match your search.' : 'No songs yet. Add your first song to get started.'}
            </p>
            {!query && (
              <button onClick={() => setEditing(true)} className="btn-primary mx-auto">
                <Plus size={16} className="inline mr-2" />Add Song
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(song => (
              <div
                key={song.id}
                className="card flex items-center gap-4 group"
              >
                <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                  <Music size={16} className="text-accent-light" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{song.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {song.artist && <span className="text-xs text-muted">{song.artist}</span>}
                    {song.ccli_number && (
                      <span className="text-xs text-muted">CCLI #{song.ccli_number}</span>
                    )}
                    {song.slides?.length > 0 && (
                      <span className="text-xs text-muted">{song.slides.length} slides</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditing(song)}
                    className="p-2 rounded-lg hover:bg-[#2e2e2e] text-muted hover:text-[#f5f5f5] transition-colors"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(song)}
                    className={`p-2 rounded-lg transition-colors ${
                      deleting === song.id
                        ? 'bg-red-700 text-white'
                        : 'hover:bg-[#2e2e2e] text-muted hover:text-red-400'
                    }`}
                    title={deleting === song.id ? 'Click again to confirm delete' : 'Delete'}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <SongEditor
          song={editing === true ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setSongs(prev =>
              prev.find(s => s.id === saved.id)
                ? prev.map(s => s.id === saved.id ? saved : s)
                : [...prev, saved]
            )
          }}
        />
      )}
    </Layout>
  )
}
