const KEY = 'presentgo.prefs'

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }

export const getPref = (name, fallback) => read()[name] ?? fallback

export function setPref(name, value) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...read(), [name]: value })) } catch { /* ignore */ }
}
