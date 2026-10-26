// Shared Stripe + Supabase helpers for billing. Files under api/_lib are not routes.
//
// Environment variables (Vercel → Settings → Environment Variables):
//   STRIPE_SECRET_KEY          sk_test_… while testing, sk_live_… when you go live
//   STRIPE_WEBHOOK_SECRET      whsec_… from the webhook endpoint in Stripe
//   SUPABASE_SERVICE_ROLE_KEY  Supabase → Project Settings → API (server only — never VITE_)
//   STRIPE_AUTOMATIC_TAX       optional: "1" once Stripe Tax is set up
//
// Prices are found by lookup key, so no price IDs need copying into Vercel:
//   solo_month, solo_year, pro_month, pro_year   (scripts/stripe-setup.mjs creates them)

import Stripe from 'stripe'

export const PLAN_KEYS = {
  solo: { month: 'solo_month', year: 'solo_year' },
  pro:  { month: 'pro_month',  year: 'pro_year' },
}

// "pro_year" → { plan: 'pro', interval: 'year' }
export function planFromLookupKey(key) {
  const m = /^(solo|pro)_(month|year)$/.exec(key || '')
  return m ? { plan: m[1], interval: m[2] } : null
}

let stripeClient = null
export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  if (!stripeClient) stripeClient = new Stripe(key)
  return stripeClient
}

const sbUrl = () => process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const anonKey = () => process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY

export const billingConfigured = () => !!(process.env.STRIPE_SECRET_KEY && sbUrl() && anonKey() && serviceKey())

// The signed-in person, from the app's Supabase login token.
export async function currentUser(req) {
  const auth = req.headers.authorization || ''
  if (!/^Bearer\s+\S+/.test(auth)) return null
  const r = await fetch(`${sbUrl()}/auth/v1/user`, {
    headers: { apikey: anonKey(), Authorization: auth },
    signal: AbortSignal.timeout(8000),
  })
  return r.ok ? r.json() : null
}

// Service-role REST call (bypasses row-level security — server only).
export async function admin(path, init = {}) {
  const r = await fetch(`${sbUrl()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey(),
      Authorization: `Bearer ${serviceKey()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`)
  const text = await r.text()
  return text ? JSON.parse(text) : null
}

export async function getChurch(id) {
  const rows = await admin(`churches?id=eq.${id}&select=id,name,plan,stripe_customer_id,stripe_subscription_id,billing_status`)
  return rows?.[0] || null
}

export async function isChurchAdmin(churchId, userId) {
  const rows = await admin(`church_members?church_id=eq.${churchId}&user_id=eq.${userId}&role=eq.admin&select=user_id`)
  return rows?.length > 0
}

export async function updateChurch(match, fields) {
  return admin(`churches?${match}`, { method: 'PATCH', body: JSON.stringify(fields) })
}

// Where the app lives, for Checkout's return links.
export function appOrigin(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return `${proto}://${host}`
}
