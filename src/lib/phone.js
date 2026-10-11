// US phone numbers shown and saved as XXX.XXX.XXXX. Anything that isn't a 10-digit
// number (after dropping a leading +1 / 1) is left exactly as entered.
export function formatPhone(v) {
  const raw = String(v || '').trim()
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d[0] === '1') d = d.slice(1)
  return d.length === 10 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}` : raw
}

// While typing: digits only, dots added as the number grows (max 10 digits).
export function formatPhoneTyping(v) {
  const raw = String(v || '')
  if (/[a-z]/i.test(raw) || raw.trim().startsWith('+') && !raw.trim().startsWith('+1')) return raw   // extensions / international: leave alone
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d[0] === '1') d = d.slice(1)
  if (d.length > 10) return raw
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
}

export const telHref = v => `tel:${String(v || '').replace(/[^\d+]/g, '')}`
