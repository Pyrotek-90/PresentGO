import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import SetsPane from '../components/home/SetsPane'
import SongsPane from '../components/home/SongsPane'
import SongEditor from '../components/songs/SongEditor'
import { groupSets, createSet as insertSet } from '../lib/sets'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sets, setSets] = useState([])
  const [songs, setSongs] = useState([])
  const [loadingSets, setLoadingSets] = useState(true)
  const [loadingSongs, setLoadingSongs] = useState(true)
  const [targetSetId, setTargetSetId] = useState(null)
  const [editing, setEditing] = useState(null) // song, or true for new

  useEffect(() => {
    supabase.from('sets').select('*, set_items(type)').eq('user_id', user.id)
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

  const createSet = async fields => {
    const { data, error } = await insertSet(supabase, user.id, fields)
    if (error) return 'Could not create set. Make sure the latest Supabase migration has been run.'
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
      ? { ...s, set_items: [...(s.set_items || []), { type: 'song' }] } : s))
  }

  const deleteSong = async song => {
    await supabase.from('songs').delete().eq('id', song.id)
    setSongs(prev => prev.filter(s => s.id !== song.id))
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-4 md:p-6 flex flex-col gap-3 h-[calc(100dvh-4.5rem)]">
        <SetsPane sets={sets} loading={loadingSets} targetSetId={targetSetId}
          onOpen={id => navigate(`/sets/${id}`)} onCreate={createSet} />
        <SongsPane songs={songs} loading={loadingSongs} sets={sets} targetSetId={targetSetId}
          onTargetChange={setTargetSetId} onAdd={addToSet} onEdit={setEditing}
          onDelete={deleteSong} onNew={() => setEditing(true)} />
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
