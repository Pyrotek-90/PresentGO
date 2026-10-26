// Billing for a team: Stripe Checkout (start Solo or Pro) and the Stripe customer portal
// (change plan, update card, cancel, see invoices). Only the team's Admins can use it.
//
//   POST { action: 'checkout', church, plan: 'solo' | 'pro', interval: 'month' | 'year' } → { url }
//   POST { action: 'portal', church }                                                   → { url }
//
// The plan itself is set by the Stripe webhook (api/stripe-webhook.js) once payment goes through,
// never here, so the database only ever reflects what Stripe has confirmed.

import {
  PLAN_KEYS, stripe, billingConfigured, currentUser, getChurch, isChurchAdmin, updateChurch, appOrigin,
} from './_lib/billing.js'

const UUID = /^[0-9a-f-]{36}$/i
const LIVE = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete'])

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  if (!billingConfigured()) return res.status(501).json({ error: "Billing isn't set up yet." })

  const { action, church: churchId, plan, interval } = req.body || {}
  if (!UUID.test(churchId || '')) return res.status(400).json({ error: 'bad_request' })

  try {
    const user = await currentUser(req)
    if (!user) return res.status(401).json({ error: 'Please sign in again.' })
    if (!(await isChurchAdmin(churchId, user.id))) {
      return res.status(403).json({ error: "Only your team's Admin can change the plan." })
    }
    const church = await getChurch(churchId)
    if (!church) return res.status(404).json({ error: 'Team not found.' })

    const s = stripe()
    const back = `${appOrigin(req)}/settings`

    const portal = async () => {
      const session = await s.billingPortal.sessions.create({
        customer: church.stripe_customer_id,
        return_url: `${back}#plans`,
      })
      return res.status(200).json({ url: session.url, portal: true })
    }

    if (action === 'portal') {
      if (!church.stripe_customer_id) return res.status(400).json({ error: 'This team has no billing account yet.' })
      return portal()
    }

    if (action !== 'checkout') return res.status(400).json({ error: 'bad_request' })
    const lookupKey = PLAN_KEYS[plan]?.[interval]
    if (!lookupKey) return res.status(400).json({ error: 'Choose Solo or Pro, monthly or yearly.' })

    // Already subscribed: switching plans happens in the portal, so a team never pays twice.
    if (church.stripe_subscription_id && LIVE.has(church.billing_status) && church.stripe_customer_id) {
      return portal()
    }

    // One Stripe customer per team, remembered on the church.
    let customer = church.stripe_customer_id
    if (!customer) {
      const c = await s.customers.create({
        email: user.email,
        name: church.name,
        metadata: { church_id: church.id, created_by: user.id },
      })
      customer = c.id
      await updateChurch(`id=eq.${church.id}`, { stripe_customer_id: customer })
    }

    const prices = await s.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
    const price = prices.data[0]
    if (!price) return res.status(500).json({ error: `Stripe price "${lookupKey}" not found. Run scripts/stripe-setup.mjs.` })

    const tax = process.env.STRIPE_AUTOMATIC_TAX === '1'
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: church.id,
      metadata: { church_id: church.id },
      subscription_data: { metadata: { church_id: church.id } },
      allow_promotion_codes: true,
      ...(tax ? { automatic_tax: { enabled: true }, customer_update: { address: 'auto', name: 'auto' } } : {}),
      success_url: `${back}?billing=success#plans`,
      cancel_url: `${back}?billing=cancelled#plans`,
    })
    return res.status(200).json({ url: session.url })
  } catch (e) {
    console.error('billing', e)
    return res.status(500).json({ error: 'Something went wrong talking to Stripe. Please try again.' })
  }
}
