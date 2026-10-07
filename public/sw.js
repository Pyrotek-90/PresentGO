// PresentGO offline support. Registered only when Offline mode is on in Settings.
const APP = 'presentgo-app-v1'
const MEDIA = 'presentgo-media-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

async function networkFirstShell(req) {
  const cache = await caches.open(APP)
  try {
    const res = await fetch(req)
    if (res.ok) cache.put('/', res.clone())
    return res
  } catch (err) {
    const shell = await cache.match('/')
    if (shell) return shell
    throw err
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(APP)
  const hit = await cache.match(req)
  const refresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res }).catch(() => null)
  return hit || (await refresh) || Response.error()
}

async function cacheFirstCors(req) {
  const cache = await caches.open(MEDIA)
  const hit = await cache.match(req.url)
  if (hit) return hit
  const res = await fetch(req.url, { mode: 'cors' })
  if (res.ok) cache.put(req.url, res.clone())
  return res
}

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET' || req.headers.has('range')) return
  const url = new URL(req.url)

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return
    if (req.mode === 'navigate') return e.respondWith(networkFirstShell(req))
    if (url.pathname.startsWith('/assets/') || url.pathname === '/icon.svg') return e.respondWith(staleWhileRevalidate(req))
    return
  }
  if (url.pathname.includes('/storage/v1/object/public/')) e.respondWith(cacheFirstCors(req))
})
