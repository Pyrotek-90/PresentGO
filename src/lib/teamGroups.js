// Who's Serving groups: Production, Singers and Musicians (like the app's matrix and team table).
// Positions are placed by name first, then by category, then by keyword; custom positions land
// in whichever group fits (otherwise Musicians).
const SECTIONS = [
  { id: 'production', label: 'Production', names: ['Presenter', 'Audio'], categories: ['Presenter', 'Audio'] },
  { id: 'singers', label: 'Singers', names: ['Singer'], categories: ['Singers'] },
  { id: 'musicians', label: 'Musicians', names: ['Keys', 'Acoustic', 'Electric', 'Bass', 'Drums'], categories: ['Band Musicians'] },
  { id: 'other', label: 'Other', names: [], categories: [] },
]
const lc = s => (s || '').toLowerCase()

export const sectionOf = p => (SECTIONS.find(sec => sec.names.some(n => lc(n) === lc(p.name)))
  || SECTIONS.find(sec => sec.categories.includes(p.category)) || SECTIONS[3]).id

const PRODUCTION_WORDS = ['presenter', 'audio', 'sound', 'light', 'video', 'camera', 'stream', 'slide', 'lyric', 'media', 'tech', 'production', 'stage', 'broadcast', 'projection', 'propresenter', 'mix', 'director', 'producer', 'graphics', 'photo']
const SINGER_WORDS = ['sing', 'vocal', 'voice', 'choir', 'bgv', 'worship leader', 'lead']
const RANK = ['presenter', 'audio', 'singer', 'keys', 'acoustic', 'electric', 'bass', 'drums']

export const GROUPS = [{ id: 'production', label: 'Production' }, { id: 'singers', label: 'Singers' }, { id: 'musicians', label: 'Musicians' }]

export function groupOf(p) {
  const s = sectionOf(p)
  if (s !== 'other') return s
  const n = lc(p.name)
  if (PRODUCTION_WORDS.some(w => n.includes(w))) return 'production'
  if (SINGER_WORDS.some(w => n.includes(w))) return 'singers'
  return 'musicians'
}
export const rankOf = p => { const i = RANK.indexOf(lc(p.name)); return i < 0 ? 100 : i }

// Positions in group order (Presenter, Audio… Singer… Keys, Acoustic…), then the team's own.
export const sortByGroup = positions => {
  const order = Object.fromEntries(positions.map((p, i) => [p.id, i]))
  return [...positions].sort((a, b) => GROUPS.findIndex(g => g.id === groupOf(a)) - GROUPS.findIndex(g => g.id === groupOf(b))
    || rankOf(a) - rankOf(b) || (order[a.id] ?? 0) - (order[b.id] ?? 0))
}

export const STATUS_DOT = { accepted: 'bg-green-500', declined: 'bg-red-500', invited: 'bg-orange-400', draft: 'bg-[#8a8a8a]' }
