# iPad / iPhone app — matching the web app

The order the SwiftUI app (`apple/`) catches up with the web app (`src/`). Each phase ships as
something you can install on the iPad and use. ✅ = in the app now.

## Phase 1 — Library and sets ✅ (Nov 12, 2026)
- ✅ Sign in: email, Apple, Google; team picker
- ✅ Song library: search, chord chart / lyrics view, transpose (API), text size
- ✅ New / edit / delete songs (API `songs/save`); import ChordPro, text or PDF chart from Files
- ✅ Sets: Upcoming / Past, new / edit details / delete
- ✅ Order of service: add songs, Welcome, Announcement, Blank; drag to reorder; swipe to remove;
  key for this set

## Phase 2 — Sunday: present and play
- Present on the iPad: full-screen slides for the whole set (songs, welcome, announcements, blank),
  tap / swipe / Bluetooth foot pedal to move
- AirPlay / HDMI TV shows only the current slide (external-display scene); the iPad shows the
  controller with next slide and set list
- Musician view: chord charts for the set in order, page turns by pedal, per-set keys
- Live sync with the web controller (Supabase Realtime)
- Offline: songs and upcoming sets saved on the iPad (SwiftData), synced when online

## Phase 3 — Editing extras
- Song editor extras: arrangement (song order), transposed keys and preferred key, key notes,
  themes, YouTube link, translations and the translation line on slides
- Set item options: arrangement for this set, Worship Leader Notes
- Media items and the Content Library (images, backgrounds)
- Bulk import from Files (many charts at once) — Get Started page

## Phase 4 — Team and schedule
- Team: members, positions, invite to team
- Calendar / schedule per set: assign people, send invites, Accepted / Declined status
- Respond to invites in the app; push notifications (APNs) for new requests
- Message Team; calendar sync link

## Phase 5 — Pro tools and account
- AI: Translate, Smart Cleanup, key / BPM lookup, Worship Leader Notes (Pro)
- CCLI Report; Export songbook (PDF)
- Settings: church settings, my teams, offline mode, delete account
- Subscriptions with StoreKit 2 (RevenueCat), same plans as Stripe on the web

## Phase 6 — Release
- TestFlight for the worship team, then the App Store (screenshots, privacy labels, review notes)
