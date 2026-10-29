import { LEGAL } from '../src/lib/legal.js'

// Support page forms (Feature Request and Contact Us). Emails the request with Resend, with
// Reply-To set to the sender so a reply goes straight back to them.
//
// Where each form goes (set in Vercel → Settings → Environment Variables):
//   SUPPORT_FEATURE_EMAIL  Feature Request form
//   SUPPORT_CONTACT_EMAIL  Contact Us form
//   SUPPORT_EMAIL          used for either one when its own address isn't set
// With none of them set, requests go to the contact address in src/lib/legal.js.
// Also needs RESEND_API_KEY and EMAIL_FROM, as for team invites.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const KINDS = {
  feature: { label: 'Feature Request', to: () => process.env.SUPPORT_FEATURE_EMAIL },
  contact: { label: 'Contact Us', to: () => process.env.SUPPORT_CONTACT_EMAIL },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const body = req.body || {}
  const kind = KINDS[body.kind]
  if (!kind) return res.status(400).json({ error: 'bad_request' })

  // Hidden field people never see; bots fill it in. Pretend it worked.
  if (body.website) return res.status(200).json({ ok: true })

  const email = String(body.email || '').trim().slice(0, 200)
  const title = String(body.title || '').trim().replace(/\s+/g, ' ').slice(0, 150)
  const message = String(body.message || '').trim().slice(0, 5000)
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'email' })
  if (!title || !message) return res.status(400).json({ error: 'missing' })

  const resendKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!resendKey || !from) return res.status(501).json({ error: 'not_configured' })
  const to = kind.to() || process.env.SUPPORT_EMAIL || LEGAL.contactEmail

  const subject = `[StaffList ${kind.label}] ${title}`
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0e7490">${esc(kind.label)}</p>
    <h1 style="margin:0 0 16px;font-size:20px">${esc(title)}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;white-space:pre-wrap">${esc(message)}</p>
    <p style="margin:20px 0 0;font-size:13px;color:#52525b">From: ${esc(email)}${body.signedIn ? ' (signed in to StaffList)' : ''}<br>Reply to this email to answer them.</p>
  </div></body></html>`
  const text = `${kind.label}: ${title}\n\n${message}\n\nFrom: ${email}`

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], reply_to: email, subject, html, text }),
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) {
      console.error('resend', r.status, await r.text().catch(() => ''))
      return res.status(502).json({ error: 'send' })
    }
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('support', e)
    return res.status(502).json({ error: 'send' })
  }
}
