// Standard worship-team positions every account starts with, in display order.
// Cajón and Djembe are alternatives a drummer can play instead of a kit.
export const STANDARD_POSITIONS = [
  { name: 'Singer', category: 'Singers' },
  { name: 'Lead Singer', category: 'Singers' },
  { name: 'Keys', category: 'Band Musicians' },
  { name: 'Acoustic Guitar', category: 'Band Musicians' },
  { name: 'Electric Guitar', category: 'Band Musicians' },
  { name: 'Bass Guitar', category: 'Band Musicians' },
  { name: 'Drums', category: 'Band Musicians' },
  { name: 'Cajón', category: 'Band Musicians', altOf: 'Drums' },
  { name: 'Djembe', category: 'Band Musicians', altOf: 'Drums' },
]
// Positions earlier versions added that were later dropped from the standard list.
const RETIRED = ['Worship Leader']

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

// Adds any missing standard positions once per account (so ones you delete stay deleted),
// and removes retired standard positions that nobody has been given.
let pending = null
export function ensureStandardPositions(supabase, user, positions) {
  const md = user?.user_metadata || {}
  if (md.std_positions_v1 && md.std_positions_v2) return Promise.resolve(positions)
  if (!pending) pending = (async () => {
    const added = [], removed = []
    if (!md.std_positions_v1) {
      const have = new Set(positions.map(p => norm(p.name)))
      const missing = STANDARD_POSITIONS.filter(s => !have.has(norm(s.name)))
        .map(s => ({ user_id: user.id, name: s.name, category: s.category, level: null }))
      if (missing.length) {
        const { data, error } = await supabase.from('positions').insert(missing).select()
        if (error) { pending = null; return { added, removed } }
        added.push(...(data || []))
      }
    }
    for (const p of positions.filter(p => RETIRED.some(r => norm(r) === norm(p.name)))) {
      const [{ count: inTeam }, { count: inSets }] = await Promise.all([
        supabase.from('team_members').select('id', { count: 'exact', head: true }).contains('position_ids', [p.id]),
        supabase.from('set_assignments').select('id', { count: 'exact', head: true }).eq('position_id', p.id),
      ])
      if (!inTeam && !inSets) {
        const { error } = await supabase.from('positions').delete().eq('id', p.id)
        if (!error) removed.push(p.id)
      }
    }
    await supabase.auth.updateUser({ data: { std_positions_v1: true, std_positions_v2: true } }).catch(() => {})
    return { added, removed }
  })()
  return pending.then(({ added, removed }) => [
    ...positions.filter(p => !removed.includes(p.id)),
    ...added.filter(a => !positions.some(p => p.id === a.id)),
  ])
}
