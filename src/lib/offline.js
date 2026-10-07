import { getPref, setPref } from './prefs'

export const API_CACHE = 'presentgo-api-v1'
export const MEDIA_CACHE = 'presentgo-media-v1'
export const APP_CACHE = 'presentgo-app-v1'
const ALL_CACHES = [API_CACHE, MEDIA_CACHE, APP_CACHE]

let enabled = getPref('offlineMode', false)
export const isOfflineEnabled = () => enabled

const hasSW = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator

// fetch() replacement for the Supabase client: remembers successful reads and replays
// them when the network is unavailable. Writes are never cached.
export async function offlineFetch(input, init) {
  const req = new Request(input, init)
  if (!enabled || req.method !== 'GET' || !req.url.includes('/rest/v1/') || typeof caches === 'undefined') return fetch(input, init)

  const accept = req.headers.get('accept') || ''
  const key = `${req.url}${req.url.includes('?') ? '&' : '?'}__accept=${encodeURIComponent(accept)}`
  try {
    const res = await fetch(req)
    if (res.ok) caches.open(API_CACHE).then(c => c.put(key, res.clone())).catch(() => {})
    return res
  } catch (err) {
    const hit = await (await caches.open(API_CACHE)).match(key)
    if (hit) return hit
    throw err
  }
}

export async function enableOffline() {
  enabled = true
  setPref('offlineMode', true)
  if (hasSW()) await navigator.serviceWorker.register('/sw.js').catch(() => {})
  navigator.storage?.persist?.().catch?.(() => {})
}

export async function clearOfflineData() {
  if (typeof caches === 'undefined') return
  await Promise.all(ALL_CACHES.map(n => caches.delete(n)))
  setPref('offlineSyncedAt', null)
}

export async function disableOffline() {
  enabled = false
  setPref('offlineMode', false)
  if (hasSW()) {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map(r => r.unregister()))
  }
  await clearOfflineData()
}

// Called once at startup: keeps the service worker registered while the mode is on.
export function initOffline() {
  if (enabled && hasSW()) navigator.serviceWorker.register('/sw.js').catch(() => {})
}

export async function getOfflineUsage() {
  const out = { api: 0, media: 0, app: 0, counts: { api: 0, media: 0, app: 0 }, usage: null, quota: null }
  if (typeof caches !== 'undefined') {
    for (const [k, name] of [['api', API_CACHE], ['media', MEDIA_CACHE], ['app', APP_CACHE]]) {
      if (!(await caches.has(name))) continue
      const cache = await caches.open(name)
      for (const req of await cache.keys()) {
        const res = await cache.match(req)
        if (!res) continue
        out[k] += (await res.blob()).size
        out.counts[k]++
      }
    }
  }
  const est = await navigator.storage?.estimate?.().catch?.(() => null)
  if (est) { out.usage = est.usage; out.quota = est.quota }
  return out
}

export const formatBytes = n => {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
