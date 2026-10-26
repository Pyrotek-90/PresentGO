# StaffList — Setup Guide

## 1. Install dependencies

```bash
npm install
```

## 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project** — give it a name (e.g. `presentgo`), set a database password, choose a region close to you
3. Wait for it to provision (~1 min)

## 3. Set up the database

1. In your Supabase project, go to **SQL Editor**
2. Paste the entire contents of `supabase/schema.sql`
3. Click **Run**

## 4. Get your API keys

In your Supabase project → **Settings → API**:
- Copy **Project URL** → `VITE_SUPABASE_URL`
- Copy **anon / public key** → `VITE_SUPABASE_ANON_KEY`

## 5. Create your .env file

```bash
cp .env.example .env
```

Edit `.env` and paste your values:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## 6. Run the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Deploying to Vercel (recommended)

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → Import your repo
3. Add the environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in the Vercel dashboard
4. Deploy — Vercel handles everything automatically

## Deploying to Netlify

Same as Vercel — connect your repo and add env vars in **Site Settings → Environment Variables**.

---

## How it works

| Component | Technology |
|---|---|
| Frontend | React + Vite |
| Styling | Tailwind CSS |
| Auth + Database | Supabase |
| Hosting | Vercel / Netlify |
| TV Display | Screen mirroring / AirPlay (browser window) |
| Remote control | BroadcastChannel API (same browser) |

## Using StaffList

1. **Create a Set** from the dashboard (e.g. "Sunday March 23")
2. **Add Items** — songs from your library, welcome slides, announcements, or blank slides
3. **Songs** — paste lyrics, choose 2/3/4 lines per slide, click Format
4. Click **Present** — a full-screen window opens (send to TV via AirPlay/screen mirror)
5. Use the **Controller** window that opens on your device to navigate slides

## Billing (Stripe) — Solo and Pro

Admins buy Solo or Pro in **Settings → Subscription Plans**. Stripe Checkout takes the payment; the
Stripe webhook then sets the team's plan. The customer portal (**Manage billing**) handles plan
changes, card updates, invoices and cancelling.

1. **Database:** run `supabase/migrations/2026-10-26_billing.sql` in Supabase → SQL Editor
   (after `2026-10-26_solo_plan.sql`).
2. **Products and prices:** with your Stripe *test* secret key, run
   `STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs`. It creates Solo ($5/mo, $50/yr) and
   Pro ($12/mo, $100/yr) with the lookup keys `solo_month`, `solo_year`, `pro_month`, `pro_year`.
3. **Customer portal:** Stripe → Settings → Billing → Customer portal. Turn on "Switch plans"
   (add the Solo and Pro products), "Cancel subscriptions" and "Update payment methods", then save.
4. **Webhook:** Stripe → Developers → Webhooks → Add endpoint
   `https://present-go-five.vercel.app/api/stripe-webhook` with events `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
5. **Vercel environment variables** (then redeploy):
   - `STRIPE_SECRET_KEY` — `sk_test_…` (later `sk_live_…`)
   - `STRIPE_WEBHOOK_SECRET` — the endpoint's `whsec_…` signing secret
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Project Settings → API. Server only: never prefix it with `VITE_`.
   - optional `STRIPE_AUTOMATIC_TAX=1` once Stripe Tax is set up
6. **Test:** on Settings, Upgrade to Pro and pay with card `4242 4242 4242 4242`, any future date and CVC.
   Back in StaffList the plan switches to Pro within a few seconds.
7. **Go live:** repeat steps 2–5 in Stripe's live mode with the live keys.

Until `STRIPE_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set, the Upgrade buttons show
"Billing isn't set up yet." Ultimate is still set by hand (`update churches set plan = 'ultimate' …`)
and Stripe never moves a team off it.
