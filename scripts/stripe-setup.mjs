// Creates StaffList's products and prices in Stripe. Safe to run again: prices that already
// exist (by lookup key) are left alone.
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
//
// Run it once with your test key, and again with your live key when you go live.

import Stripe from 'stripe'

const key = process.env.STRIPE_SECRET_KEY
if (!key) { console.error('Set STRIPE_SECRET_KEY first.'); process.exit(1) }
const stripe = new Stripe(key)

const PLANS = [
  { id: 'solo', name: 'StaffList Solo', description: 'Presenting, CCLI Report and 500 MB Content Library.',
    prices: [{ lookup: 'solo_month', amount: 500, interval: 'month' }, { lookup: 'solo_year', amount: 5000, interval: 'year' }] },
  { id: 'pro', name: 'StaffList Pro', description: 'AI tools, team scheduling and 1 GB Content Library.',
    prices: [{ lookup: 'pro_month', amount: 1200, interval: 'month' }, { lookup: 'pro_year', amount: 10000, interval: 'year' }] },
]

const mode = key.startsWith('sk_live') ? 'LIVE' : 'test'
console.log(`Stripe ${mode} mode\n`)

for (const plan of PLANS) {
  const existing = await stripe.prices.list({ lookup_keys: plan.prices.map(p => p.lookup), active: true, expand: ['data.product'] })
  let product = existing.data[0]?.product
  if (!product) {
    const found = await stripe.products.search({ query: `metadata['stafflist_plan']:'${plan.id}'` }).catch(() => ({ data: [] }))
    product = found.data[0] || await stripe.products.create({
      name: plan.name, description: plan.description, metadata: { stafflist_plan: plan.id },
    })
  }
  for (const p of plan.prices) {
    const have = existing.data.find(x => x.lookup_key === p.lookup)
    if (have) { console.log(`✓ ${p.lookup.padEnd(11)} exists   ${have.id}`); continue }
    const created = await stripe.prices.create({
      product: product.id, currency: 'usd', unit_amount: p.amount,
      recurring: { interval: p.interval }, lookup_key: p.lookup, transfer_lookup_key: true,
      metadata: { stafflist_plan: plan.id },
    })
    console.log(`+ ${p.lookup.padEnd(11)} created  ${created.id}  $${(p.amount / 100).toFixed(2)}/${p.interval}`)
  }
}
console.log('\nDone.')
