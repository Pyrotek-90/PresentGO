import { useRef, useState } from 'react'
import SongViewer from './SongViewer'
import NoteViewer from './NoteViewer'

// Plays the songs of a set back to back: reaching the end of one song continues into the next.
// Entries are { song, key } or { note } (a Worship Leader Note, shown before its song).
export default function SetSongViewer({ entries, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex)
  const [fromEnd, setFromEnd] = useState(false)   // came back from the next song: land on the last page
  const mode = useRef(null)                        // keep Lyrics / Chord Chart across songs

  const go = (i, backwards = false) => {
    if (i < 0 || i >= entries.length) return
    setFromEnd(backwards)
    setIndex(i)
  }

  const entry = entries[index]
  const setNav = {
    index,
    total: entries.length,
    titles: entries.map(e => (e.note ? `${e.note.song_title} — Leader Note`
      : [e.song.title, e.key && e.key.replace(' Major', '').replace(' Minor', 'm'), e.lead].filter(Boolean).join(' · '))),
    onNext: () => go(index + 1),
    onPrev: () => go(index - 1, true),
    onJump: i => go(i),
  }

  if (entry.note) return <NoteViewer key={`note-${index}`} note={entry.note} onClose={onClose} setNav={setNav} />

  return (
    <SongViewer
      key={`${index}-${entry.song.id}`}
      song={entry.song}
      initialKey={entry.key}
      lead={entry.lead}
      onClose={onClose}
      initialMode={mode.current}
      onModeChange={m => { mode.current = m }}
      startAtEnd={fromEnd}
      setNav={setNav}
    />
  )
}
