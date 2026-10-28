// Billing for the signed-in person's OWN team: Stripe Checkout (start Solo or Pro) and the Stripe
// customer portal (change plan, update card, cancel, see invoices).
//
// Anyone can upgrade. The plan goes on the team they started; if they haven't started one yet,
// checkout starts one for them (named `teamName`). Teams they joined as a member are never billed
// and stay as they are — they keep seeing the sets they're scheduled on, for free.
//
//   POST { action: 'checkout', plan: 'solo' | 'pro', interval: 'month' | 'year', teamName? } → { url }
//   POST { action: 'portal' }                                                              → { url }
//
// The plan itself is set by the Stripe webhook (api/stripe-webhook.js) once payment goes through,
// never here, so the database only ever reflects what Stripe has confirmed.

import {
  PLAN_KEYS, stripe, billingConfigured, currentUser, ownTeam, createTeam, updateChurch, appOrigin,
} from './_lib/billing.js'

const LIVE = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete'])

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  if (!billingConfigured()) return res.status(501).json({ error: "Billing isn't set up yet." })

  const { action, plan, interval, teamName } = req.body || {}

  try {
    const user = await currentUser(req)
    if (!user) return res.status(401).json({ error: 'Please sign in again.' })

    const s = stripe()
    const back = `${appOrigin(req)}/settings`
    let church = await ownTeam(user.id)

    const portal = async () => {
      const session = await s.billingPortal.sessions.create({
        customer: church.stripe_customer_id,
        return_url: `${back}#plans`,
      })
      return res.status(200).json({ url: session.url, portal: true })
    }

    if (action === 'portal') {
      if (!church?.stripe_customer_id) return res.status(400).json({ error: "You don't have a subscription yet." })
      return portal()
    }

    if (action !== 'checkout') return res.status(400).json({ error: 'bad_request' })
    const lookupKey = PLAN_KEYS[plan]?.[interval]
    if (!lookupKey) return res.status(400).json({ error: 'Choose Solo or Pro, monthly or yearly.' })

    // Already subscribed: switching plans happens in the portal, so nobody pays twice.
    if (church?.stripe_subscription_id && LIVE.has(church.billing_status) && church.stripe_customer_id) {
      return portal()
    }

    // No team of their own yet: start one (it stays Free until Stripe confirms the payment).
    if (!church) church = await createTeam(user, teamName)

    // One Stripe customer per team, remembered on the team.
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
      success_url: `${back}?billing=success&team=${church.id}#plans`,
      cancel_url: `${back}?billing=cancelled#plans`,
    })
    return res.status(200).json({ url: session.url, church: church.id })
  } catch (e) {
    console.error('billing', e)
    return res.status(500).json({ error: 'Something went wrong talking to Stripe. Please try again.' })
  }
}
