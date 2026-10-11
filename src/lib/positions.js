// Standard worship-team positions every account starts with, in display order.
// Cajón and Djembe are alternatives a drummer can play instead of a kit.
export const STANDARD_POSITIONS = [
  { name: 'Worship Leader', category: 'Singers' },
  { name: 'Lead Singer', category: 'Singers' },
  { name: 'Singer', category: 'Singers' },
  { name: 'Keys', category: 'Band Musicians' },
  { name: 'Acoustic Guitar', category: 'Band Musicians' },
  { name: 'Electric Guitar', category: 'Band Musicians' },
  { name: 'Bass Guitar', category: 'Band Musicians' },
  { name: 'Drums', category: 'Band Musicians' },
  { name: 'Cajón', category: 'Band Musicians', altOf: 'Drums' },
  { name: 'Djembe', category: 'Band Musicians', altOf: 'Drums' },
]

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const ORDER = new Map(STANDARD_POSITIONS.map((p, i) => [norm(p.name), i]))

// "Cajón" / "Djembe" -> "Drums"; anything else -> null
export const drumAltOf = p => STANDARD_POSITIONS.find(s => s.altOf && norm(s.name) === norm(p?.name))?.altOf || null

export const posLabel = p => `${p.name}${p.level ? ` (${p.level})` : ''}`

// Standard positions first in their set order, then the account's own positions as created.
export const sortPositions = list => [...list].sort((a, b) => {
  const ia = ORDER.get(norm(a.name)) ?? 1e3, ib = ORDER.get(norm(b.name)) ?? 1e3
  return ia - ib || String(a.created_at || '').localeCompare(String(b.created_at || ''))
})

// Adds any missing standard positions, once per account (so ones you delete stay deleted).
let pending = null
export function ensureStandardPositions(supabase, user, positions) {
  if (user?.user_metadata?.std_positions_v1) return Promise.resolve(positions)
  if (pending) return pending.then(added => [...positions, ...added.filter(a => !positions.some(p => p.id === a.id))])
  pending = (async () => {
    const have = new Set(positions.map(p => norm(p.name)))
    const missing = STANDARD_POSITIONS.filter(s => !have.has(norm(s.name)))
      .map(s => ({ user_id: user.id, name: s.name, category: s.category, level: null }))
    let added = []
    if (missing.length) {
      const { data, error } = await supabase.from('positions').insert(missing).select()
      if (error) { pending = null; return [] }
      added = data || []
    }
    await supabase.auth.updateUser({ data: { std_positions_v1: true } }).catch(() => {})
    return added
  })()
  return pending.then(added => [...positions, ...added])
}
