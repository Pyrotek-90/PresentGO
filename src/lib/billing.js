// Starts Stripe Checkout or opens the Stripe customer portal for the person's own team (see api/billing.js).
import { supabase } from './supabase'

async function call(body) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch('/api/billing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body),
  })
  const out = await r.json().catch(() => ({}))
  if (!r.ok || !out.url) throw new Error(out.error || 'Something went wrong. Please try again.')
  window.location.assign(out.url)
}

// The plan goes on the person's own team; teamName names it if one has to be started.
export const startCheckout = (plan, interval, teamName) => call({ action: 'checkout', plan, interval, teamName })
export const openBillingPortal = () => call({ action: 'portal' })

// Billing status for the team's Admins (null for others, or before the billing update is run).
export async function getBilling(church) {
  const { data, error } = await supabase.rpc('church_billing', { p_church: church })
  return error ? null : data
}
