import { supabase } from './supabase'

// Sets I serve on in every team I've joined (accepted, plus requests waiting for my answer),
// shaped like set rows with a `serving` block: { status, token, positions, churchId }.
// Empty until the team-invites database update has been run.
export async function loadServingSets() {
  try {
    const { data, error } = await supabase.rpc('my_serving_sets')
    if (error || !Array.isArray(data)) return []
    return data.map(r => ({
      id: r.set_id, church_id: r.church_id, workspace_id: r.workspace_id, name: r.name,
      service_date: r.service_date, service_time: r.service_time, venue_name: r.venue_name, location_address: r.location_address,
      song_count: r.song_count ?? 0,
      serving: { status: r.status, token: r.invite_token, positions: r.positions || [], churchId: r.church_id },
    }))
  } catch { return [] }
}

// My own sets plus the sets I serve on that I don't lead. A set I can edit stays a plain set.
export function mergeServing(own, serving, canEditSet) {
  const mine = own.filter(s => canEditSet(s))
  const ids = new Set(mine.map(s => s.id))
  const extra = serving.filter(s => !ids.has(s.id))
  const extraIds = new Set(extra.map(s => s.id))
  // sets visible to me (e.g. as a Member) that aren't in my serving list stay as they are
  const rest = own.filter(s => !ids.has(s.id) && !extraIds.has(s.id))
  return [...mine, ...extra, ...rest]
}

// Where a set opens: a request waiting for my answer opens its Accept / Decline page.
export const setHref = set => (set.serving?.status === 'invited' && set.serving.token ? `/respond/${set.serving.token}` : `/sets/${set.id}`)
