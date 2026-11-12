# StaffList architecture

*Decided November 12, 2026.*

StaffList has two front ends, the **web app** (React, `src/`) and the **iPad / iPhone app**
(SwiftUI, `apple/`), on one shared backend. The front ends stay light: they show data, take
input, and call the backend for anything that needs real work.

```
  Web app (React, Vercel)          iPad / iPhone app (SwiftUI, iOS 17+)
          │        │                         │        │
          │        └──── StaffList API ──────┘        │      heavy work
          │              /api/v1 (Vercel)              │
          │                     │                      │
          └──────────── Supabase ─────────────────────┘      data, sign-in, live updates
                (Postgres + row-level security, Auth, Storage, Realtime)
```

## Who does what

| Layer | Responsibilities |
|---|---|
| **Supabase** (both apps talk to it directly) | Sign-in (email, Apple, Google), plain reads and saves of songs, sets, set items, team, positions and media, file storage, and live updates (Realtime). Row-level security decides what each person can see and change, so neither app can bypass the rules. |
| **StaffList API** `/api/v1/*` (`api/v1.js` → `api/_handlers/`) | Anything with real logic: reading ChordPro and PDF charts, building slides, transposing, chart/lyrics sync, language checks, AI (Translate, Smart Cleanup, key/BPM lookup, Worship Leader Notes), team emails and invites, songbook PDF export, calendar feeds, and billing. One implementation, used by both apps. |
| **Web app** `src/` | Screens and editing. Calls Supabase for data and `src/lib/api.js` → `/api/v1` for work. |
| **iOS app** `apple/` | Native screens, offline use on Sunday, presenting to a TV (AirPlay), Apple Pencil, Sign in with Apple, and in-app purchase (StoreKit). Calls Supabase (`supabase-swift`) for data and `StaffListAPI` for work. |

**Rule of thumb:** if both apps would need the same non-trivial code, it belongs in the API. If
it's a simple read or save of a row, it goes straight to Supabase.

## API conventions

- One Vercel function (`api/v1.js`) routes every endpoint, so the Hobby plan's 12-function limit
  no longer matters. Handlers live in `api/_handlers/` and load only when called.
- Auth: `Authorization: Bearer <Supabase access token>`. Routes marked `auth: true` in the router
  are checked centrally (`api/_lib/auth.js`); plan checks for paid features use `api/_lib/plan.js`.
- JSON in, JSON out, snake_case fields, errors as `{ "error": "<message for the person>" }`.
  File uploads (PDF charts) are sent as the raw body with `Content-Type: application/octet-stream`.
- Old URLs (`/api/song-details`, `/api/calendar/<token>`, …) are rewritten to the router in
  `vercel.json`, so existing calendar subscriptions and links keep working.
- Shared logic is plain JavaScript in `src/lib/` with no browser APIs. The API imports it, so
  the web app and the API never drift. Imports there use `.js` extensions so Node can load them.

### Endpoints (v1)

| Route | Body | Returns |
|---|---|---|
| `songs/parse` | `{ text, filename?, lines_per_slide? }` (ChordPro or plain lyrics) | `{ status, song, message }` |
| `songs/import-pdf?filename=` | the PDF (≤ 4 MB) | `{ status, song, message }` |
| `songs/slides` | `{ raw_lyrics, lines_per_slide? }` | `{ slides }` |
| `songs/chart` | `{ raw_lyrics, chord_chart? }` | `{ chord_chart }` (lyrics and chart kept in step) |
| `songs/transpose` | `{ chord_chart, from_key, to_key }` | `{ chord_chart, key }` |
| `songs/keys` | `{ key }` | `{ keys }` (keys to transpose to) |
| `songs/language` | `{ text }` | `{ non_english, language }` |
| `song-details`, `cleanup-lyrics`, `translate-lyrics`, `worship-note`, `youtube-search` | as before | AI tools (Pro) |
| `send-invites`, `send-team-message`, `export-songbook`, `support` | as before | email, export, forms |
| `calendar/<token>.ics` | GET | team calendar feed |

A `song` is `{ title, artist, author, ccli_number, key, bpm, copyright, raw_lyrics, chord_chart,
slides, language, translations }`, ready to save into the `songs` table (`chord_chart`, `key`,
`bpm`, `author`, `copyright`, `language`, `translations` go in `metadata`).

## Roadmap

1. **Foundation (done Nov 12):** API router, song endpoints, PDF import moved to the server,
   SwiftUI app with sign-in, team picker, song library, chart viewer with server transposition,
   and upcoming sets.
2. **Web app on the API:** song editor's Format Slides / chart sync / transpose and ChordPro
   import call the API; remove the browser copies where they're no longer used.
3. **iOS: Sunday-ready:** offline library and sets (SwiftData cache, synced on launch), set
   view with per-song keys, Apple Pencil annotations on charts, page turning by foot pedal
   (Bluetooth page turners send arrow keys).
4. **iOS: Present:** controller on the iPad, slide-only output on the AirPlay TV through an
   external-display scene, live sync with the web controller over Supabase Realtime.
5. **iOS: Editing and team:** song editor, set builder, team schedule, invites, notifications
   (APNs).
6. **iOS: Purchases:** StoreKit 2 subscriptions through RevenueCat, linked to the same team
   plans as Stripe on the web; the Stripe webhook and the App Store server notifications both
   set `churches.plan`.
7. **Release:** TestFlight with the worship team, then the App Store. The native app replaces
   the Capacitor shell (`ios/`) under the same bundle id, `app.stafflist`.
