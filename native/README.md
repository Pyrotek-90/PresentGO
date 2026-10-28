# StaffList for iPad and iPhone

The iPad / iPhone app is a thin native shell (Capacitor) around the live web app. It loads
https://present-go-five.vercel.app, so every web update reaches the app without a new App Store
build. The shell adds one thing a browser can't do:

**TV output that shows only the Now Showing slide.** When the user turns on Screen Mirroring to
an Apple TV / AirPlay TV, the app gives the TV its own screen with the presentation page
(`/present/<set>?tv=1`) while the iPad / iPhone keeps the controller. In Safari, mirroring
copies the whole screen instead.

| Piece | Where |
|---|---|
| TV plugin (Swift) | `native/ios/ExternalDisplayPlugin.swift` |
| Plugin registration | `native/ios/MainViewController.swift` |
| JavaScript bridge | `src/lib/externalDisplay.js` |
| TV page | `src/pages/PresentMode.jsx` with `?tv=1` (no controls, follows the controller) |
| Controller + connect steps | `src/pages/Controller.jsx` |
| App config | `capacitor.config.json` |

## One-time setup (on a Mac with Xcode)

Needs: macOS, Xcode 16+, Node 20+, and an Apple Developer account ($99/year) to run on a device
and publish.

```bash
git clone https://github.com/Pyrotek-90/PresentGO.git && cd PresentGO
npm install
npm install @capacitor/core @capacitor/ios
npm install -D @capacitor/cli
npm run build                 # Capacitor wants a web build in dist/, even though the app loads the live site
npx cap add ios               # creates ios/App (the Xcode project)
cp native/ios/*.swift ios/App/App/
npx cap open ios              # opens Xcode
```

Then in Xcode:

1. **Add the Swift files to the target.** In the left sidebar, right-click the `App` folder →
   *Add Files to "App"…* → select `ExternalDisplayPlugin.swift` and `MainViewController.swift`
   (tick the *App* target).
2. **Use MainViewController.** Open `App/Main.storyboard`, select *Bridge View Controller*, and
   in the Identity inspector set **Class** to `MainViewController` (Module: App).
3. **Signing.** App target → *Signing & Capabilities* → choose your Team. Change the bundle id
   (`app.stafflist` in `capacitor.config.json`) if you prefer another.
4. **Run** on an iPad or iPhone (the simulator has no AirPlay; use *I/O → External Displays* in
   the simulator to try the TV screen).

After changing `capacitor.config.json`, run `npx cap sync ios`.

## How presenting works in the app

1. Open a set → **Present**. The connect screen shows app-specific steps and a live
   "TV connected — <name>" status.
2. Control Center → **Screen Mirroring** → choose the TV. The TV shows only the slide.
3. Run the service from the controller. Control messages go to the TV page directly through
   the app (no internet needed) and also over Supabase Realtime.
4. **End** removes the TV screen; the TV goes back to mirroring.

StaffList must stay in the foreground while presenting: if the user switches apps, iOS returns
the TV to plain mirroring until StaffList is opened again.

## Before submitting to the App Store

- **Google sign-in:** Google blocks its sign-in page inside embedded web views, so "Sign in with
  Google" will fail in the app. Email / password and Sign in with Apple work. Fix before release
  with a native sign-in plugin (e.g. `@capacitor-community/apple-sign-in`, a native Google
  sign-in plugin) or by opening the sign-in in Safari (`@capacitor/browser`) and returning via a
  deep link.
- **App Review guideline 4.2 (minimum functionality):** apps that are only a website in a wrapper
  can be rejected. The second-screen TV output and native sign-in help show it is an app; mention the TV output in the review notes.
- Icons and launch screen: see below.

## App icon and launch screen

The artwork is in `assets/`:

| File | What it is |
|---|---|
| `assets/icon-only.png` | 1024×1024 app icon (square, no transparency; iOS rounds the corners) |
| `assets/splash.png`, `assets/splash-dark.png` | 2732×2732 launch screen: the logo, "StaffList" and "To the Chief Musician" on the app's dark background, kept to the middle so it fits every iPad and iPhone shape |

After `npx cap add ios`, on the Mac:

```bash
npm install @capacitor/splash-screen
npx @capacitor/assets generate --ios     # writes every icon and launch-screen size into the Xcode project
npx cap sync ios
```

The launch screen stays up until StaffList has drawn its first screen, then fades out (at most
4 seconds, set in `capacitor.config.json`). If the artwork changes, replace the files in
`assets/` and run the generate command again.

## App Store description

Use this as the App Store subtitle / short description (same wording as the login page and the web meta description):

> Chord Charts, Set Lists & Presentation
