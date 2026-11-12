// StaffList API — one Vercel function for every endpoint, shared by the web app and the iOS app.
//
// URLs: /api/v1/<route>. vercel.json rewrites them here as ?__route=<route>, and also sends the
// older URLs (/api/song-details, /api/calendar/<token>, …) here so existing links keep working.
// Handlers live in api/_handlers (folders starting with "_" are not deployed as their own
// functions), and are loaded only when called, so a request never loads code it doesn't use.
//
// Auth: send the Supabase access token as "Authorization: Bearer <token>". Routes marked
// auth: true are checked here; the others check for themselves (plan checks, public forms,
// calendar feeds that use their own token).

import { requireUser } from './_lib/auth.js'

// route -> { load, auth?, action? }
const ROUTES = {
  // Song processing (new)
  'songs/parse':      { load: () => import('./_handlers/songs.js'), action: 'parse', auth: true },
  'songs/slides':     { load: () => import('./_handlers/songs.js'), action: 'slides', auth: true },
  'songs/chart':      { load: () => import('./_handlers/songs.js'), action: 'chart', auth: true },
  'songs/transpose':  { load: () => import('./_handlers/songs.js'), action: 'transpose', auth: true },
  'songs/keys':       { load: () => import('./_handlers/songs.js'), action: 'keys', auth: true },
  'songs/language':   { load: () => import('./_handlers/songs.js'), action: 'language', auth: true },
  'songs/import-pdf': { load: () => import('./_handlers/import-pdf.js'), auth: true },
  'reports/ccli':     { load: () => import('./_handlers/ccli-report.js'), auth: true },
  'sets/slides':      { load: () => import('./_handlers/set-slides.js'), auth: true },
  'songs/save':       { load: () => import('./_handlers/song-save.js'), auth: true },

  // AI tools (Pro plan checked inside)
  'song-details':     { load: () => import('./_handlers/song-details.js') },
  'cleanup-lyrics':   { load: () => import('./_handlers/cleanup-lyrics.js') },
  'translate-lyrics': { load: () => import('./_handlers/translate-lyrics.js') },
  'worship-note':     { load: () => import('./_handlers/worship-note.js') },
  'youtube-search':   { load: () => import('./_handlers/youtube-search.js') },

  // Team, email, exports
  'send-invites':      { load: () => import('./_handlers/send-invites.js') },
  'send-team-message': { load: () => import('./_handlers/send-team-message.js') },
  'export-songbook':   { load: () => import('./_handlers/export-songbook.js') },
  'support':           { load: () => import('./_handlers/support.js') },

  // Public calendar feed: calendar/<token>.ics
  'calendar/:token':   { load: () => import('./_handlers/calendar.js') },
}

function match(path) {
  if (ROUTES[path]) return { route: ROUTES[path], params: {} }
  const m = path.match(/^calendar\/([^/]+)$/)
  if (m) return { route: ROUTES['calendar/:token'], params: { token: m[1] } }
  return null
}

export default async function handler(req, res) {
  const path = String(req.query.__route || '').replace(/^\/+|\/+$/g, '')
  delete req.query.__route

  if (!path) {
    return res.status(200).json({ name: 'StaffList API', version: 1, routes: Object.keys(ROUTES) })
  }
  const found = match(path)
  if (!found) return res.status(404).json({ error: 'Not found' })
  Object.assign(req.query, found.params)

  if (found.route.auth) {
    const who = await requireUser(req)
    if (!who.user) return res.status(who.status).json({ error: who.error })
    req.user = who.user
  }

  try {
    const mod = await found.route.load()
    return await mod.default(req, res, found.route.action)
  } catch (err) {
    console.error(`api/v1/${path} failed`, err)
    if (!res.headersSent) res.status(500).json({ error: 'Something went wrong. Try again.' })
  }
}
