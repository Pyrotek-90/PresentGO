// TV output in the StaffList iPad / iPhone app.
//
// In the native app (a Capacitor shell around this web app, see native/README.md), an AirPlay
// TV is used as a second screen: the app puts the presentation page (/present/:setId?tv=1) on
// the TV, so the TV shows only the Now Showing slide while the iPad / iPhone keeps the
// controller. The native side is the "ExternalDisplay" plugin (native/ios/ExternalDisplayPlugin.swift).
//
// In a plain browser none of this exists: AirPlay Screen Mirroring copies the whole screen.

function plugin() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null
  try {
    if (!cap?.isNativePlatform?.() || !cap.isPluginAvailable?.('ExternalDisplay')) return null
    return cap.Plugins?.ExternalDisplay || cap.registerPlugin?.('ExternalDisplay') || null
  } catch {
    return null
  }
}

// True inside the native app, where the TV can show just the slide.
export const hasNativeDisplay = () => !!plugin()

// { connected: boolean, name?: string } — name is the AirPlay device, e.g. "Sanctuary TV"
export async function displayStatus() {
  try { return (await plugin()?.getStatus()) || { connected: false } } catch { return { connected: false } }
}

// Calls cb({ connected, name }) whenever a TV connects or disconnects. Returns an unsubscribe.
export function onDisplayChange(cb) {
  const p = plugin()
  if (!p) return () => {}
  let handle = null, closed = false
  Promise.resolve(p.addListener('change', cb)).then(h => { if (closed) h?.remove?.(); else handle = h }).catch(() => {})
  return () => { closed = true; handle?.remove?.() }
}

// Shows `url` on the TV now, or as soon as one connects.
export function showOnDisplay(url) {
  try { return Promise.resolve(plugin()?.show({ url })).catch(() => {}) } catch { return Promise.resolve() }
}

export function hideDisplay() {
  try { return Promise.resolve(plugin()?.hide()).catch(() => {}) } catch { return Promise.resolve() }
}

// Hands a control message straight to the TV page (works without internet).
export function sendToDisplay(payload) {
  try { plugin()?.send({ payload })?.catch?.(() => {}) } catch { /* ignore */ }
}

// True on the page the app puts on the TV.
export const isTvScreen = () =>
  typeof window !== 'undefined' && (window.__STAFFLIST_TV__ === true || new URLSearchParams(window.location.search).get('tv') === '1')
