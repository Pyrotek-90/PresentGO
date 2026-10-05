const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const NOTE_PC = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}
const FLAT_MAJOR_PCS = new Set([5, 10, 3, 8, 1, 6])

const CHORD_RE = /^([A-G][#b♭]?)((?:m|maj|min|dim|aug|sus|add|M|\d|\+|°|ø|-|\(|\)|#|b|♭)*)(?:\/([A-G][#b♭]?))?$/

const normNote = n => n.replace('♭', 'b')

export function parseKey(str) {
  const m = (str || '').match(/^([A-G])([#♭b]?)\s*(Major|Minor)?/i)
  if (!m) return null
  const accidental = m[2] === '♭' ? 'b' : m[2]
  const mode = /minor/i.test(m[3] || '') ? 'Minor' : 'Major'
  return { root: m[1], accidental, mode }
}

export function formatKey(root, accidental, mode) {
  const note = accidental === 'b' ? `${root}♭` : accidental === '#' ? `${root}#` : root
  return `${note} ${mode}`
}

function tonicPc(key) {
  const k = parseKey(key)
  return k ? NOTE_PC[k.root + k.accidental] : null
}

function useFlats(key) {
  const k = parseKey(key)
  if (!k) return false
  const pc = NOTE_PC[k.root + k.accidental]
  const majorPc = k.mode === 'Minor' ? (pc + 3) % 12 : pc
  return FLAT_MAJOR_PCS.has(majorPc)
}

export function transposeKeyOptions(originalKey) {
  const k = parseKey(originalKey)
  if (!k) return []
  const origPc = tonicPc(originalKey)
  const names = k.mode === 'Minor'
    ? ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']
    : ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
  return names
    .map((n, pc) => ({ pc, label: `${n.replace('b', '♭')} ${k.mode}` }))
    .filter(o => o.pc !== origPc)
    .map(o => o.label)
}

function transposeNote(note, semis, flats) {
  const pc = NOTE_PC[normNote(note)]
  return (flats ? FLAT : SHARP)[(pc + semis + 120) % 12]
}

function isChordLine(line) {
  const t = line.trim()
  if (!t || t.startsWith('[')) return false
  return t.split(/\s+/).every(tok => CHORD_RE.test(tok))
}

export function hasChords(chart) {
  return (chart || '').split('\n').some(isChordLine)
}

export function transposeChart(chart, fromKey, toKey) {
  const from = tonicPc(fromKey)
  const to = tonicPc(toKey)
  if (from === null || to === null || !chart) return chart || ''
  const semis = (to - from + 12) % 12
  const flats = useFlats(toKey)

  const shiftToken = tok => {
    const m = tok.match(CHORD_RE)
    const root = transposeNote(m[1], semis, flats)
    const bass = m[3] ? `/${transposeNote(m[3], semis, flats)}` : ''
    return `${root}${m[2]}${bass}`
  }

  return chart.split('\n').map(line => {
    if (!isChordLine(line)) return line
    const parts = line.split(/(\s+)/)
    for (let i = 0; i < parts.length; i += 2) {
      const old = parts[i]
      if (!old) continue
      const next = shiftToken(old)
      parts[i] = next
      const diff = next.length - old.length
      const gap = parts[i + 1]
      if (gap !== undefined && diff !== 0) {
        parts[i + 1] = ' '.repeat(Math.max(1, gap.length - diff))
      }
    }
    return parts.join('')
  }).join('\n')
}
