import { useRef, useState } from 'react'
import SongViewer from './SongViewer'

// Plays the songs of a set back to back: reaching the end of one song continues into the next.
export default function SetSongViewer({ songs, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex)
  const [fromEnd, setFromEnd] = useState(false)   // came back from the next song: land on the last page
  const mode = useRef(null)                        // keep Lyrics / Chord Chart across songs

  const go = (i, backwards = false) => {
    if (i < 0 || i >= songs.length) return
    setFromEnd(backwards)
    setIndex(i)
  }

  return (
    <SongViewer
      key={`${index}-${songs[index].id}`}
      song={songs[index]}
      onClose={onClose}
      initialMode={mode.current}
      onModeChange={m => { mode.current = m }}
      startAtEnd={fromEnd}
      setNav={{
        index,
        total: songs.length,
        titles: songs.map(s => s.title),
        onNext: () => go(index + 1),
        onPrev: () => go(index - 1, true),
        onJump: i => go(i),
      }}
    />
  )
}
