// Standard worship-team positions every account starts with, in display order.
export const STANDARD_POSITIONS = [
  { name: 'Singer', category: 'Singers' },
  { name: 'Keys', category: 'Band Musicians' },
  { name: 'Acoustic', category: 'Band Musicians' },
  { name: 'Electric', category: 'Band Musicians' },
  { name: 'Bass', category: 'Band Musicians' },
  { name: 'Drums', category: 'Band Musicians' },
  { name: 'Audio', category: 'Audio' },
  { name: 'Presenter', category: 'Presenter' },
]
// Standard positions that earlier versions added and were later dropped (removed if nobody has them).
const RETIRED = ['Worship Leader', 'Lead Singer', 'Cajón', 'Djembe']
// Standard positions that were renamed: old name -> new name.
const RENAMED = { 'Acoustic Guitar': 'Acoustic', 'Electric Guitar': 'Electric', 'Bass Guitar': 'Bass' }
// Everything any version offered, so positions you deleted aren't added back.
const EVER_OFFERED = ['Worship Leader', 'Lead Singer', 'Singer', 'Keys', 'Acoustic Guitar', 'Electric Guitar', 'Bass Guitar',
  'Drums', 'Cajón', 'Djembe', 'Audio', 'Presenter', 'Acoustic', 'Electric', 'Bass']

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const ORDER = new Map(STANDARD_POSITIONS.map((p, i) => [norm(p.name), i]))

// Kept for older code paths; standard positions no longer include drum alternatives.
export const drumAltOf = () => null

export const posLabel = p => `${p.name}${p.level ? ` (${p.level})` : ''}`

// Standard positions first in their set order, then the account's own positions as created.
export const sortPositions = list => [...list].sort((a, b) => {
  const ia = ORDER.get(norm(a.name)) ?? 1e3, ib = ORDER.get(norm(b.name)) ?? 1e3
  return ia - ib || String(a.created_at || '').localeCompare(String(b.created_at || ''))
})

const isUnused = async (supabase, id) => {
  const [{ count: inTeam }, { count: inSets }] = await Promise.all([
    supabase.from('team_members').select('id', { count: 'exact', head: true }).contains('position_ids', [id]),
    supabase.from('set_assignments').select('id', { count: 'exact', head: true }).eq('position_id', id),
  ])
  return !inTeam && !inSets
}

// Brings an account's positions up to the current standard list, once per change:
// adds standard positions it has never been offered, renames old standard names, and
// removes retired standard positions that nobody has been given.
let pending = null
export function ensureStandardPositions(supabase, user, positions) {
  const md = user?.user_metadata || {}
  if (md.std_positions_v3) return Promise.resolve(positions)
  if (!pending) pending = (async () => {
    const offered = new Set((md.std_positions_offered || []).map(norm))
    if (md.std_positions_v1 && !md.std_positions_offered) ['Worship Leader', 'Lead Singer', 'Singer', 'Keys', 'Acoustic Guitar', 'Electric Guitar', 'Bass Guitar', 'Drums', 'Cajón', 'Djembe'].forEach(n => offered.add(norm(n)))
    const removed = [], renamed = {}, added = []

    for (const p of positions) {
      const to = Object.entries(RENAMED).find(([from]) => norm(from) === norm(p.name))?.[1]
      if (to && !positions.some(q => norm(q.name) === norm(to))) {
        const { error } = await supabase.from('positions').update({ name: to }).eq('id', p.id)
        if (!error) { renamed[p.id] = to; offered.add(norm(to)) }
      }
      if (RETIRED.some(r => norm(r) === norm(p.name)) && await isUnused(supabase, p.id)) {
        const { error } = await supabase.from('positions').delete().eq('id', p.id)
        if (!error) removed.push(p.id)
      }
    }

    const have = new Set(positions.map(p => norm(renamed[p.id] || p.name)))
    const missing = STANDARD_POSITIONS.filter(s => !have.has(norm(s.name)) && !offered.has(norm(s.name)))
      .map(s => ({ user_id: user.id, name: s.name, category: s.category, level: null }))
    if (missing.length) {
      const { data, error } = await supabase.from('positions').insert(missing).select()
      if (!error) added.push(...(data || []))
    }

    await supabase.auth.updateUser({ data: {
      std_positions_v1: true, std_positions_v2: true, std_positions_v3: true,
      std_positions_offered: [...new Set([...offered, ...EVER_OFFERED.map(norm)])],
    } }).catch(() => {})
    return { removed, renamed, added }
  })()
  return pending.then(({ removed, renamed, added }) => [
    ...positions.filter(p => !removed.includes(p.id)).map(p => (renamed[p.id] ? { ...p, name: renamed[p.id] } : p)),
    ...added.filter(a => !positions.some(p => p.id === a.id)),
  ])
}
