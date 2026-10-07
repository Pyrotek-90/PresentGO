import { supabase } from './supabase'

// Link between the Controller and the display window. It always uses Supabase Realtime and,
// when both windows are in the same browser, also a BroadcastChannel so it keeps working offline.
export function openControlChannel(setId, { onControl, onStatus } = {}) {
  const seen = new Set()
  const fresh = id => {
    if (!id) return true
    if (seen.has(id)) return false
    seen.add(id)
    if (seen.size > 200) seen.delete(seen.values().next().value)
    return true
  }

  const ch = supabase.channel(`presentgo-${setId}`)
  ch.on('broadcast', { event: 'control' }, ({ payload }) => { if (fresh(payload?.id)) onControl?.(payload) })
    .on('broadcast', { event: 'status' }, ({ payload }) => { if (fresh(payload?.id)) onStatus?.(payload) })
    .subscribe()

  let local = null
  try {
    local = new BroadcastChannel(`presentgo-${setId}`)
    local.onmessage = e => {
      const { event, payload } = e.data || {}
      if (!fresh(payload?.id)) return
      if (event === 'control') onControl?.(payload)
      else if (event === 'status') onStatus?.(payload)
    }
  } catch { /* BroadcastChannel unavailable */ }

  const send = (event, payload) => {
    const msg = { ...payload, id: crypto.randomUUID() }
    try { local?.postMessage({ event, payload: msg }) } catch { /* ignore */ }
    Promise.resolve(ch.send({ type: 'broadcast', event, payload: msg })).catch(() => {})
  }

  return {
    sendControl: payload => send('control', payload),
    sendStatus: payload => send('status', payload),
    close() { supabase.removeChannel(ch); local?.close() },
  }
}
