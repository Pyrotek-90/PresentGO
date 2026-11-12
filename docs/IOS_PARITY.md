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

## Phase 2 — Sunday: present and play ✅ (Nov 12, 2026)
- ✅ Present on the iPad: controller (current / next slide, slides by song, blank), tap or
  Bluetooth foot pedal (arrows, Space, Page Up/Down), B to blank, full-screen slide
- ✅ TV (AirPlay Screen Mirroring or HDMI) shows only the slide (external-display scene); mirrors
  when nothing is presenting
- ✅ Live sync with the web Controller / Present screen (Supabase Realtime, same messages)
- ✅ Charts: the set's chord charts in order and key, page turns by swipe or pedal
- ✅ Offline: library, sets and the next 4 upcoming sets' slides and charts saved on the device
- API: `sets/slides` builds a set's slides on the server (same builder as the web)

## Phase 3 — Editing extras ✅
- ✅ Song editor: Song Order (arrangement, built on the server), other keys + preferred key,
  translations and the slide translation line, YouTube link, themes
- ✅ Set: song order for one set, Worship Leader Notes view, Add Media
- ✅ Media tab (Content Library): add photos or PDFs (each page a slide), delete
- ✅ Import Charts: many ChordPro / text / PDF charts at once

## Phase 4 — Team and schedule ✅
- ✅ Team tab: members, positions, add / edit / remove, invite to join, Message Team
- ✅ Team for This Set: people per position, Waiting / Accepted / Declined, Send Requests
- ✅ Notifications (bell): Accept / Decline requests, reminders, messages, team invitations
- ⏳ Push notifications — needs an APNs key from the Apple Developer account and a server
  sender; in-app notifications work now

## Phase 5 — Pro tools and account ✅
- ✅ AI (Pro): look up key / tempo / writers, Smart Cleanup, Translate, Worship Leader Notes
- ✅ CCLI Report (API `reports/ccli`): share CSV, copy numbers; Export songbook (PDF)
- ✅ Settings: team details, plan and role, calendar subscription, offline copies, delete account
- ⏳ Buying a plan in the app (StoreKit 2 / RevenueCat) — needs subscription products in App Store
  Connect and the LLC / banking set up; the app shows the plan and never links to web checkout

## Phase 6 — Release
- Test on iPads with an Apple TV and the band, then TestFlight, then the App Store
  (screenshots, privacy labels, review notes with a demo account)
