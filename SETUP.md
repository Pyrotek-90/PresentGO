# PresentGO — Setup Guide

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

## Using PresentGO

1. **Create a Set** from the dashboard (e.g. "Sunday March 23")
2. **Add Items** — songs from your library, welcome slides, announcements, or blank slides
3. **Songs** — paste lyrics, choose 2/3/4 lines per slide, click Format
4. Click **Present** — a full-screen window opens (send to TV via AirPlay/screen mirror)
5. Use the **Controller** window that opens on your device to navigate slides
