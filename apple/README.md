# StaffList for iPad and iPhone (SwiftUI)

The native app. Architecture and roadmap: [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

- **SwiftUI, iOS / iPadOS 17+**, Observation (`@Observable`), async/await.
- **Data and sign-in:** [supabase-swift](https://github.com/supabase/supabase-swift) (Swift
  Package, added to the project), talking to the same Supabase project as the web app.
- **Heavy work:** `StaffListAPI` → `https://stafflist.app/api/v1/…` (transposing, chart
  import, slides, AI, email). Don't re-implement those rules in Swift; add an endpoint instead.
- **Project:** `StaffList.xcodeproj` uses folder-synced groups, so any file you add under
  `StaffList/` is part of the app automatically.

```
StaffList/
  StaffListApp.swift      app entry, theme
  Core/                   AppConfig (URLs, keys), Backend (Supabase + API clients), SessionStore
  Models/                 Song, ServiceSet, SetItem, Team, API request/reply types
  Features/               RootView, SignInView, LibraryView, SongView, SetsView, SettingsView
  Resources/              Assets (icon, accent color)
  StaffList.entitlements  Sign in with Apple
```

## First run (on the Mac)

1. `git pull` (or clone https://github.com/Pyrotek-90/PresentGO.git), then open
   `apple/StaffList.xcodeproj` in Xcode. It downloads the Supabase package the first time.
2. In `StaffList/Core/AppConfig.swift`, paste the Supabase URL and anon key: the same values
   as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel → Settings → Environment
   Variables.
3. Click the blue **StaffList** project → **StaffList** target → **Signing & Capabilities**,
   choose your Team, and add the **Sign in with Apple** capability if Xcode asks.
4. Choose an iPad simulator or your iPad and press ▶.

**Sign in with Apple** also needs the Apple provider turned on in Supabase → Authentication →
Providers → Apple, with the bundle id `app.stafflist` as an authorized client ID.

## Working with the Claude Agent in Xcode

Point it at this README and `docs/ARCHITECTURE.md`, then ask for one roadmap step at a time.
Have it build (⌘B) and run after each change; it can read the compiler errors and fix them.
Ground rules for the agent:

- Plain records → Supabase directly; logic both apps need → a new `/api/v1` endpoint (in the
  repo's `api/_handlers/`, reusing `src/lib/`), called through `StaffListAPI`.
- Modern SwiftUI only: `NavigationStack`, `@Observable`, `.task`, `ContentUnavailableView`,
  SF Symbols, Dynamic Type, dark mode first. No UIKit unless SwiftUI can't do it (the AirPlay
  external-display scene is the expected exception).
- iPad first: test in landscape on a 13" iPad simulator as well as on an iPhone.

## Relationship to `ios/`

`ios/` is the interim Capacitor shell around the website. It can go to TestFlight now; this
native app replaces it in the App Store under the same bundle id once it covers Sunday use.
