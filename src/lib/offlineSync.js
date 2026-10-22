import { supabase } from './supabase'
import { MEDIA_CACHE } from './offline'
import { setPref } from './prefs'

let running = null

// Downloads everything the app needs to work without a connection. It issues the same queries the
// pages use, so each response lands in the offline cache under the URL the page will ask for later.
// `scope` (lib/scope.js): the same church / workspace filters the pages use.
export function downloadForOffline(scope, onProgress) {
  if (running) return running
  running = (async () => {
    const steps = []
    const report = label => onProgress?.({ done: steps.length, label })
    const run = async (label, fn) => { try { await fn() } catch { /* keep going */ } steps.push(label); report(label) }

    report('Starting…')
    let sets = []
    let songs = []
    await run('Sets', async () => {
      await scope.sets(supabase.from('sets').select('*, set_items(type, content)'))
      const { data } = await scope.sets(supabase.from('sets').select('*, set_items(type)'))
      sets = data || []
    })
    await run('Songs', async () => {
      const { data } = await scope.church(supabase.from('songs').select('*'))
      songs = data || []
    })
    await run('Calendar', async () => {
      await scope.sets(supabase.from('sets').select('id, name, service_date, service_time'))
      await supabase.from('set_assignments').select('*')
    })
    await run('Team', async () => {
      await scope.church(supabase.from('positions').select('*')).order('created_at')
      await scope.church(supabase.from('team_members').select('*')).order('name')
    })

    const imageUrls = new Set()
    for (const set of sets) {
      await run(`Set: ${set.name}`, async () => {
        await supabase.from('sets').select('*').eq('id', set.id).single()
        await supabase.from('sets').select('name').eq('id', set.id).single()
        const { data: items } = await supabase.from('set_items').select('*').eq('set_id', set.id).order('position')
        const songIds = (items || []).filter(i => i.type === 'song').map(i => i.content?.song_id).filter(Boolean)
        if (songIds.length) await supabase.from('songs').select('*').in('id', songIds)
        for (const item of items || []) for (const img of item.content?.images || []) if (img.url) imageUrls.add(img.url)
      })
    }

    let n = 0
    for (const url of imageUrls) {
      n++
      await run(`Slide images ${n} of ${imageUrls.size}`, async () => {
        const cache = await caches.open(MEDIA_CACHE)
        if (await cache.match(url)) return
        const res = await fetch(url, { mode: 'cors' })
        if (res.ok) await cache.put(url, res)
      })
    }

    setPref('offlineSyncedAt', new Date().toISOString())
    return { sets: sets.length, songs: songs.length, images: imageUrls.size }
  })().finally(() => { running = null })
  return running
}
