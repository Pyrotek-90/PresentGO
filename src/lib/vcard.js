// Minimal vCard (.vcf) read/write for importing and saving team contacts.

const unescape = v => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim()
const esc = v => String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')

// Returns the contacts in a .vcf file: [{ name, email, phone }]
export function parseVCards(text) {
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
  const cards = []
  for (const block of unfolded.split(/BEGIN:VCARD/i).slice(1)) {
    const c = { name: '', email: '', phone: '' }
    let n = ''
    for (const line of block.split('\n')) {
      const i = line.indexOf(':')
      if (i < 0) continue
      const key = line.slice(0, i).split(';')[0].split('.').pop().toUpperCase()
      const val = line.slice(i + 1)
      if (key === 'FN' && !c.name) c.name = unescape(val)
      else if (key === 'N' && !n) {
        const [last, first, middle] = val.split(';').map(unescape)
        n = [first, middle, last].filter(Boolean).join(' ')
      } else if (key === 'EMAIL' && !c.email) c.email = unescape(val)
      else if (key === 'TEL' && !c.phone) c.phone = unescape(val.replace(/^tel:/i, ''))
    }
    if (!c.name) c.name = n
    if (c.name || c.email || c.phone) cards.push(c)
  }
  return cards
}

export function buildVCard({ name, email, phone, note }) {
  const parts = (name || '').trim().split(/\s+/)
  const last = parts.length > 1 ? parts.pop() : ''
  const first = parts.join(' ')
  return [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:${esc(last)};${esc(first)};;;`,
    `FN:${esc(name)}`,
    email && `EMAIL;TYPE=INTERNET:${esc(email)}`,
    phone && `TEL;TYPE=CELL:${esc(phone)}`,
    note && `NOTE:${esc(note)}`,
    'END:VCARD', '',
  ].filter(Boolean).join('\r\n')
}

// Opens the contact for saving: phones show their "Add to Contacts" screen for a .vcf.
export function saveVCard(contact) {
  const blob = new Blob([buildVCard(contact)], { type: 'text/vcard;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(contact.name || 'contact').replace(/[^\w\s-]+/g, '').trim() || 'contact'}.vcf`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// Android Chrome (and some others) can open the phone's contact picker directly.
export const canPickContacts = () => typeof navigator !== 'undefined' && 'contacts' in navigator && typeof navigator.contacts?.select === 'function'

export async function pickContact() {
  const [c] = await navigator.contacts.select(['name', 'email', 'tel'], { multiple: false })
  if (!c) return null
  return { name: c.name?.[0] || '', email: c.email?.[0] || '', phone: c.tel?.[0] || '' }
}
