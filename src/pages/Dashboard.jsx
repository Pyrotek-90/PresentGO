import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import SetsPane from '../components/home/SetsPane'
import WeeklyThought from '../components/home/WeeklyThought'
import SongsPane from '../components/home/SongsPane'
import SongEditor from '../components/songs/SongEditor'
import SongViewer from '../components/songs/SongViewer'
import { groupSets, createSet as insertSet, todayISO } from '../lib/sets'
import { DEFAULT_LIBRARY_LANGUAGE, songLanguage } from '../lib/songTags'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sets, setSets] = useState([])
  const [songs, setSongs] = useState([])
  const [loadingSets, setLoadingSets] = useState(true)
  const [loadingSongs, setLoadingSongs] = useState(true)
  const [targetSetId, setTargetSetId] = useState(null)
  const [editing, setEditing] = useState(null) // song, or true for new
  const [viewing, setViewing] = useState(null)

  useEffect(() => {
    supabase.from('sets').select('*, set_items(type, content)').eq('user_id', user.id)
      .then(({ data }) => setSets(data || []))
      .catch(() => {})
      .finally(() => setLoadingSets(false))
    supabase.from('songs').select('*').eq('user_id', user.id)
      .then(({ data }) => setSongs(data || []))
      .catch(() => {})
      .finally(() => setLoadingSongs(false))
  }, [user.id])

  // Most recent set date each song was used in (for "Recently used" sorting).
  const lastUsed = useMemo(() => {
    const m = {}
    for (const set of sets) {
      const d = set.service_date || set.created_at || ''
      for (const it of set.set_items || []) {
        const id = it.type === 'song' && it.content?.song_id
        if (id && d > (m[id] || '')) m[id] = d
      }
    }
    return m
  }, [sets])

  const libraryLanguages = useMemo(() => [...new Set(songs.map(songLanguage))].sort(), [songs])

  // Default "add songs to" target: next upcoming set, else the most recent one
  useEffect(() => {
    if (targetSetId && sets.some(s => s.id === targetSetId)) return
    const { upcoming, past } = groupSets(sets)
    setTargetSetId((upcoming[0] || past[0])?.id || null)
  }, [sets, targetSetId])

  // "+ New Set": create the set right away and open it with Edit details showing.
  const createSet = async () => {
    const { data, error } = await insertSet(supabase, user.id, { name: 'New Set', date: todayISO() })
    if (error) return 'Could not create set. Please try again.'
    navigate(`/sets/${data.id}`, { state: { newSet: true } })
    return null
  }

  // "+ New Set" from the Song Library: create the set, make it the add-to target, stay here.
  const createTargetSet = async fields => {
    const { data, error } = await insertSet(supabase, user.id, fields)
    if (error) return 'Could not create set. Please try again.'
    setSets(prev => [...prev, { ...data, set_items: [] }])
    setTargetSetId(data.id)
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
      ? { ...s, set_items: [...(s.set_items || []), { type: 'song', content: { song_id: song.id } }] } : s))
  }

  const deleteSong = async song => {
    await supabase.from('songs').delete().eq('id', song.id)
    setSongs(prev => prev.filter(s => s.id !== song.id))
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-4 md:p-6 flex flex-col gap-3 h-[calc(100dvh-4.5rem)]">
        <WeeklyThought />
        <SetsPane sets={sets} loading={loadingSets} targetSetId={targetSetId}
          onOpen={id => navigate(`/sets/${id}`)} onCreate={createSet} />
        <SongsPane songs={songs} loading={loadingSongs} sets={sets} targetSetId={targetSetId}
          onTargetChange={setTargetSetId} onCreateSet={createTargetSet} onAdd={addToSet} onEdit={setEditing}
          onView={setViewing} onNew={() => setEditing(true)}
          lastUsed={lastUsed} mainLanguage={user.user_metadata?.library_language || DEFAULT_LIBRARY_LANGUAGE} />
      </div>

      {viewing && <SongViewer song={viewing} onClose={() => setViewing(null)} />}

      {editing && (
        <SongEditor
          libraryLanguages={libraryLanguages}
          song={editing === true ? null : editing}
          onClose={() => setEditing(null)}
          onDelete={deleteSong}
          onSaved={saved => { setViewing(v => (v && v.id === saved.id ? saved : v)); setSongs(prev =>
            prev.find(s => s.id === saved.id) ? prev.map(s => s.id === saved.id ? saved : s) : [...prev, saved]
          ) }}
        />
      )}
    </Layout>
  )
}
