// Stripe webhook: keeps each team's plan in step with its Stripe subscription.
//
// In Stripe → Developers → Webhooks, add an endpoint at  https://<your app>/api/stripe-webhook
// listening for:
//   checkout.session.completed
//   customer.subscription.created
//   customer.subscription.updated
//   customer.subscription.deleted
// and put its signing secret in Vercel as STRIPE_WEBHOOK_SECRET.
//
// Every event re-reads the subscription from Stripe, so events arriving out of order or twice
// still leave the team on the right plan.

import { stripe, planFromLookupKey, admin, updateChurch } from './_lib/billing.js'

// Stripe needs the exact bytes it signed, so Vercel must not parse the body.
export const config = { api: { bodyParser: false } }

// Still paying (past_due gets Stripe's retry period before access is removed).
const PAID = new Set(['active', 'trialing', 'past_due'])

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body)
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks)
}

async function churchFor(sub) {
  const id = sub.metadata?.church_id
  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    const rows = await admin(`churches?id=eq.${id}&select=id,plan,stripe_subscription_id`)
    if (rows?.[0]) return rows[0]
  }
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  const rows = await admin(`churches?stripe_customer_id=eq.${encodeURIComponent(customer)}&select=id,plan,stripe_subscription_id`)
  return rows?.[0] || null
}

async function syncSubscription(subId) {
  const s = stripe()
  const sub = await s.subscriptions.retrieve(subId, { expand: ['items.data.price'] })
  const church = await churchFor(sub)
  if (!church) { console.warn('stripe-webhook: no team for subscription', sub.id); return }

  // A newer subscription already owns this team: ignore events about an older one.
  if (church.stripe_subscription_id && church.stripe_subscription_id !== sub.id && !PAID.has(sub.status)) return

  const item = sub.items?.data?.[0]
  const mapped = planFromLookupKey(item?.price?.lookup_key)
  const periodEnd = item?.current_period_end ?? sub.current_period_end
  const paid = PAID.has(sub.status) && mapped

  await updateChurch(`id=eq.${church.id}`, {
    // Ultimate is set by hand for now; Stripe never moves a team off it.
    plan: church.plan === 'ultimate' ? 'ultimate' : (paid ? mapped.plan : 'free'),
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    stripe_subscription_id: sub.id,
    billing_status: sub.status,
    billing_interval: mapped?.interval || item?.price?.recurring?.interval || null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('method')
  const s = stripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!s || !secret || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(501).send('not configured')

  let event
  try {
    event = s.webhooks.constructEvent(await rawBody(req), req.headers['stripe-signature'], secret)
  } catch (e) {
    console.warn('stripe-webhook: bad signature', e.message)
    return res.status(400).send('bad signature')
  }

  try {
    const obj = event.data.object
    switch (event.type) {
      case 'checkout.session.completed':
        if (obj.mode === 'subscription' && obj.subscription) {
          // Link the customer to the team first, in case the subscription has no metadata.
          if (obj.client_reference_id && obj.customer) {
            await updateChurch(`id=eq.${obj.client_reference_id}`, { stripe_customer_id: obj.customer })
          }
          await syncSubscription(obj.subscription)
        }
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(obj.id)
        break
      default:
        break
    }
    return res.status(200).json({ received: true })
  } catch (e) {
    console.error('stripe-webhook', event.type, e)
    return res.status(500).send('error')   // Stripe retries
  }
}
