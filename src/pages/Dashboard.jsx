import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import SetsPane from '../components/home/SetsPane'
import SongsPane from '../components/home/SongsPane'
import SongEditor from '../components/songs/SongEditor'
import { groupSets, todayISO } from '../lib/sets'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sets, setSets] = useState([])
  const [songs, setSongs] = useState([])
  const [loadingSets, setLoadingSets] = useState(true)
  const [loadingSongs, setLoadingSongs] = useState(true)
  const [targetSetId, setTargetSetId] = useState(null)
  const [editing, setEditing] = useState(null) // song, or true for new
  const [tab, setTab] = useState('sets')       // small screens: one pane at a time

  useEffect(() => {
    supabase.from('sets').select('*, set_items(count)').eq('user_id', user.id)
      .then(({ data }) => setSets(data || []))
      .catch(() => {})
      .finally(() => setLoadingSets(false))
    supabase.from('songs').select('*').eq('user_id', user.id)
      .then(({ data }) => setSongs(data || []))
      .catch(() => {})
      .finally(() => setLoadingSongs(false))
  }, [user.id])

  // Default "add songs to" target: next upcoming set, else the most recent one
  useEffect(() => {
    if (targetSetId && sets.some(s => s.id === targetSetId)) return
    const { upcoming, past } = groupSets(sets)
    setTargetSetId((upcoming[0] || past[0])?.id || null)
  }, [sets, targetSetId])

  const createSet = async name => {
    const { data, error } = await supabase
      .from('sets')
      .insert({ user_id: user.id, name, service_date: todayISO() })
      .select().single()
    if (error) return 'Could not create set. Make sure the Supabase schema has been run.'
    navigate(`/sets/${data.id}`)
    return null
  }

  const addToSet = async song => {
    const { count } = await supabase.from('set_items').select('id', { count: 'exact', head: true }).eq('set_id', targetSetId)
    const { error } = await supabase.from('set_items').insert({
      set_id: targetSetId,
      type: 'song',
      content: { song_id: song.id, song_title: song.title, song_artist: song.artist },
      position: count || 0,
    })
    if (error) throw error
    setSets(prev => prev.map(s => s.id === targetSetId
      ? { ...s, set_items: [{ count: (s.set_items?.[0]?.count || 0) + 1 }] } : s))
  }

  const deleteSong = async song => {
    await supabase.from('songs').delete().eq('id', song.id)
    setSongs(prev => prev.filter(s => s.id !== song.id))
  }

  const tabBtn = (id, label) => (
    <button onClick={() => setTab(id)}
      className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === id ? 'bg-accent text-white' : 'bg-card text-muted hover:text-[#f5f5f5]'}`}>
      {label}
    </button>
  )

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-3">
        <div className="lg:hidden flex rounded-lg overflow-hidden border border-border">
          {tabBtn('sets', 'Set Lists')}
          {tabBtn('songs', 'Song Library')}
        </div>
        <div className="grid lg:grid-cols-2 gap-4 h-[calc(100dvh-11rem)] lg:h-[calc(100dvh-8rem)]">
          <div className={`${tab === 'sets' ? 'block' : 'hidden'} lg:block min-h-0`}>
            <SetsPane sets={sets} loading={loadingSets} targetSetId={targetSetId}
              onOpen={id => navigate(`/sets/${id}`)} onCreate={createSet} />
          </div>
          <div className={`${tab === 'songs' ? 'block' : 'hidden'} lg:block min-h-0`}>
            <SongsPane songs={songs} loading={loadingSongs} sets={sets} targetSetId={targetSetId}
              onTargetChange={setTargetSetId} onAdd={addToSet} onEdit={setEditing}
              onDelete={deleteSong} onNew={() => setEditing(true)} />
          </div>
        </div>
      </div>

      {editing && (
        <SongEditor
          song={editing === true ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={saved => setSongs(prev =>
            prev.find(s => s.id === saved.id) ? prev.map(s => s.id === saved.id ? saved : s) : [...prev, saved]
          )}
        />
      )}
    </Layout>
  )
}
