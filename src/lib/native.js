// True inside the StaffList iPad / iPhone app (the Capacitor shell, see native/README.md).
// The app skips the public landing page and opens straight to sign-in or the user's Home.
export function isNativeApp() {
  try { return !!window.Capacitor?.isNativePlatform?.() } catch { return false }
}
