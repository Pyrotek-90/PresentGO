import Layout from '../components/Layout'
import { LegalLinks } from './Legal'
import CalendarSync from '../components/settings/CalendarSync'
import OfflineMode from '../components/settings/OfflineMode'
import MyTeams from '../components/settings/MyTeams'
import { getPref, setPref } from '../lib/prefs'
import { useTheme } from '../contexts/ThemeContext'
import {
  Sun, Moon, Shield, Check, ExternalLink,
  Church, Zap, Bell, Star, Music, Languages, MonitorPlay, CreditCard, Loader2, AlertTriangle, PartyPopper,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useChurch } from '../contexts/ChurchContext'
import { DEFAULT_LIBRARY_LANGUAGE, songLanguage } from '../lib/songTags'
import { useEffect, useState } from 'react'
import { PLAN_LABEL } from '../lib/plans'
import { startCheckout, openBillingPortal, getBilling } from '../lib/billing'

// ─── Subscription plans ────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: null,
    badge: null,
    badgeClass: 'bg-accent/20 text-accent-light',
    icon: Star,
    iconClass: 'text-accent-light',
    borderClass: '',
    description: 'Your music book: songs, charts and sets.',
    features: [
      'Unlimited songs, chord charts & transposition',
      'Unlimited imports (ChordPro, PDF charts, bulk folder)',
      'Sets, the Song Viewer and the schedule calendar',
      'Team Details',
      '100 MB Content Library',
    ],
    cta: 'Your current plan',
    ctaDisabled: true,
  },
  {
    id: 'solo',
    name: 'Solo',
    monthly: '$5',
    yearly: '$50',
    yearlyNote: 'save about 17%',
    badge: null,
    badgeClass: 'bg-sky-500/20 text-sky-300',
    icon: MonitorPlay,
    iconClass: 'text-sky-400',
    borderClass: 'border-sky-500/30',
    description: 'For a worship leader who presents on Sunday.',
    features: [
      'Everything in Free',
      '500 MB Content Library',
      'Presenting: controller, Up Next, Loop, TV output',
      'CCLI Report',
      'Up to 3 devices signed in at once',
    ],
    purchasable: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: '$12',
    yearly: '$100',
    yearlyNote: 'save about 30%',
    badge: null,
    badgeClass: 'bg-purple-500/20 text-purple-300',
    icon: Zap,
    iconClass: 'text-purple-400',
    borderClass: 'border-purple-500/30',
    description: 'For worship teams: AI tools and scheduling.',
    features: [
      'Everything in Solo, with no device limit',
      '1 GB Content Library',
      'AI Translate (lyrics & slide translations)',
      'AI Worship Leader Notes',
      'AI key / BPM lookup & Smart Cleanup',
      'Team scheduling, email invites & calendar sync',
      'Add, invite and message team members',
      'Shared team access: musicians and singers open their sets, charts and lyrics',
    ],
    purchasable: true,
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    price: null,
    badge: 'Coming Soon',
    badgeClass: 'bg-amber-500/20 text-amber-300',
    icon: Church,
    iconClass: 'text-amber-400',
    borderClass: 'border-amber-500/30',
    description: 'For whole churches with several ministries.',
    features: [
      'Everything in Pro',
      '5 GB Content Library',
      'Up to 5 workspaces (Main Service, Youth, Kids…), each with its own leaders',
      'Custom announcements page',
      'Registrations',
      'Merchandise',
    ],
    cta: 'Notify Me When Available',
    ctaDisabled: false,
    comingSoon: true,
  },
]

// ─── Plan card ─────────────────────────────────────────────────────────────────

// `current`: the team's plan. Solo and Pro are bought through Stripe by the team's Admin;
// Ultimate still offers "Notify me".
function PlanCard({ plan, current, interval, billing }) {
  const isCurrent = plan.id === current
  const [notified, setNotified] = useState(false)
  const Icon = plan.icon
  const { canBuy, hasSub, busy, buy, manage } = billing

  const checkColor =
    plan.id === 'solo'     ? 'text-sky-400'    :
    plan.id === 'pro'      ? 'text-purple-400' :
    plan.id === 'ultimate' ? 'text-amber-400'  : 'text-accent-light'
  const accentBtn =
    plan.id === 'solo' ? 'bg-sky-500 hover:bg-sky-400' : 'bg-purple-600 hover:bg-purple-500'

  const yearly = interval === 'year'
  const price = plan.purchasable ? (yearly ? plan.yearly : plan.monthly) : null
  const working = busy === plan.id
  const badge = isCurrent ? 'Current Plan' : plan.badge

  return (
    <div className={`card space-y-4 ${plan.borderClass}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-primary">{plan.name}</span>
            {badge && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isCurrent ? 'bg-accent/20 text-accent-light' : plan.badgeClass}`}>
                {badge}
              </span>
            )}
          </div>
          {price ? (
            <div className="flex items-baseline gap-0.5 flex-wrap">
              <span className="text-xl font-bold text-primary">{price}</span>
              <span className="text-xs text-muted">{yearly ? '/year' : '/month'}</span>
              {yearly && <span className="text-xs text-green-400 ml-2">{plan.yearlyNote}</span>}
            </div>
          ) : (
            <div className="text-xl font-bold text-primary">
              {plan.id === 'free' ? 'Free' : <span className="text-base text-muted font-medium">Pricing coming soon</span>}
            </div>
          )}
          <p className="text-xs text-muted">{plan.description}</p>
        </div>
        <Icon size={20} className={`${plan.iconClass} shrink-0 mt-1`} />
      </div>

      {/* Feature list */}
      <ul className="space-y-2">
        {plan.features.map(f => (
          <li key={f} className="flex items-center gap-2.5 text-sm text-muted">
            <Check size={13} className={`${checkColor} shrink-0`} />
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      {plan.purchasable && isCurrent && canBuy && hasSub && (
        <button onClick={manage} disabled={!!busy}
          className="w-full py-2 rounded-lg text-sm font-medium border border-border text-muted hover:text-primary hover:border-accent transition-colors disabled:opacity-60">
          <span className="flex items-center justify-center gap-2">
            {busy === 'portal' ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />} Manage billing
          </span>
        </button>
      )}
      {plan.purchasable && !isCurrent && (
        canBuy ? (
          <button onClick={() => buy(plan.id)} disabled={!!busy}
            className={`w-full py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60 ${accentBtn}`}>
            <span className="flex items-center justify-center gap-2">
              {working ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {hasSub ? `Switch to ${plan.name}` : `Upgrade to ${plan.name} — ${price}${yearly ? '/year' : '/month'}`}
            </span>
          </button>
        ) : (
          <p className="text-center text-xs text-muted py-2 border border-border rounded-lg">
            Ask your team's Admin to upgrade.
          </p>
        )
      )}
      {!plan.purchasable && !isCurrent && plan.id !== 'free' && (
        <button
          onClick={() => setNotified(true)}
          disabled={notified}
          className={`w-full py-2 rounded-lg text-sm font-medium border transition-colors ${
            notified
              ? 'border-green-500/40 text-green-400 bg-green-500/10 cursor-default'
              : 'border-border text-muted hover:text-primary hover:border-accent'
          }`}
        >
          {notified ? (
            <span className="flex items-center justify-center gap-2">
              <Check size={14} /> You're on the list!
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Bell size={14} /> {plan.cta}
            </span>
          )}
        </button>
      )}
    </div>
  )
}

// ─── Billing status (Admins of a paying team) ──────────────────────────────────

const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '')

function BillingStatus({ info, busy, manage }) {
  if (!info?.status || info.status === 'canceled' || info.status === 'incomplete_expired') return null
  const trouble = ['past_due', 'unpaid', 'incomplete'].includes(info.status)
  const ends = fmtDate(info.current_period_end)
  return (
    <div className={`card flex items-start gap-3 ${trouble ? 'border-amber-500/40' : ''}`}>
      {trouble ? <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" /> : <CreditCard size={18} className="text-accent-light shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm text-primary font-medium">
          {PLAN_LABEL[info.plan] || 'Paid'} · {info.interval === 'year' ? 'Yearly' : 'Monthly'}
        </p>
        <p className="text-xs text-muted">
          {trouble
            ? "The last payment didn't go through. Update your card to keep your plan."
            : info.cancel_at_period_end
              ? `Cancelled — your plan stays active until ${ends}.`
              : ends ? `Renews on ${ends}.` : 'Active.'}
        </p>
      </div>
      <button onClick={manage} disabled={!!busy}
        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted hover:text-primary hover:border-accent shrink-0 disabled:opacity-60">
        {busy === 'portal' ? <Loader2 size={13} className="animate-spin" /> : trouble ? 'Update card' : 'Manage'}
      </button>
    </div>
  )
}

// ─── Main Settings page ────────────────────────────────────────────────────────

export default function Settings() {
  const { isDark, toggleTheme } = useTheme()
  const [viewerMode, setViewerMode] = useState(() => getPref('viewerMode', 'lyrics'))
  const pickViewerMode = m => { setViewerMode(m); setPref('viewerMode', m) }
  const { user } = useAuth()
  const { scope, plan: currentPlan, church, isAdmin, legacy, refresh } = useChurch()
  // "See plans" from an upgrade prompt lands on the plans.
  useEffect(() => {
    if (window.location.hash === '#plans') setTimeout(() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' }), 150)
  }, [])

  // ── Billing ──
  const [interval, setInterval_] = useState('month')
  const [billingInfo, setBillingInfo] = useState(null)
  const [billingBusy, setBillingBusy] = useState(null)      // plan id or 'portal' while redirecting
  const [billingError, setBillingError] = useState('')
  const [returned] = useState(() => new URLSearchParams(window.location.search).get('billing'))   // success | cancelled
  const loadBilling = () => (church?.id && isAdmin ? getBilling(church.id).then(setBillingInfo) : Promise.resolve())
  useEffect(() => { loadBilling() }, [church?.id, isAdmin, currentPlan])   // eslint-disable-line react-hooks/exhaustive-deps
  // Back from Stripe Checkout: the webhook updates the plan within a few seconds, so check again.
  useEffect(() => {
    if (returned !== 'success') return
    let n = 0
    const t = window.setInterval(() => { refresh(); loadBilling(); if (++n >= 6) window.clearInterval(t) }, 2500)
    window.history.replaceState(null, '', '/settings#plans')
    return () => window.clearInterval(t)
  }, [returned])   // eslint-disable-line react-hooks/exhaustive-deps
  const hasSub = !!billingInfo?.status && !['canceled', 'incomplete_expired'].includes(billingInfo.status)
  const billing = {
    canBuy: !legacy && !!church?.id && isAdmin,
    hasSub,
    busy: billingBusy,
    buy: async planId => {
      setBillingError(''); setBillingBusy(planId)
      try { await (hasSub ? openBillingPortal(church.id) : startCheckout(church.id, planId, interval)) }
      catch (e) { setBillingError(e.message); setBillingBusy(null) }
    },
    manage: async () => {
      setBillingError(''); setBillingBusy('portal')
      try { await openBillingPortal(church.id) }
      catch (e) { setBillingError(e.message); setBillingBusy(null) }
    },
  }
  const [libLang, setLibLang] = useState(user?.user_metadata?.library_language || DEFAULT_LIBRARY_LANGUAGE)
  const [libLangState, setLibLangState] = useState(null)   // null | 'saving' | 'saved' | 'error'
  // Only offer languages that songs in the library are actually in.
  const [songLangs, setSongLangs] = useState([])
  useEffect(() => {
    if (!user?.id) return
    scope.church(supabase.from('songs').select('metadata, raw_lyrics'))
      .then(({ data }) => setSongLangs([...new Set((data || []).map(songLanguage))]))
      .catch(() => {})
  }, [user?.id, scope.churchId])   // eslint-disable-line react-hooks/exhaustive-deps
  const libLangOptions = [...new Set([...songLangs, libLang])].sort()
  const pickLibLang = async l => {
    setLibLang(l); setLibLangState('saving')
    const { error } = await supabase.auth.updateUser({ data: { library_language: l } })
    setLibLangState(error ? 'error' : 'saved')
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">

        <h1 className="text-2xl font-bold text-primary">Settings</h1>

        {/* ── Appearance ────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">Appearance</h2>
          <div className="card flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {isDark
                ? <Moon size={18} className="text-accent-light" />
                : <Sun  size={18} className="text-amber-400" />}
              <div>
                <p className="text-sm font-medium text-primary">Theme</p>
                <p className="text-xs text-muted">{isDark ? 'Dark mode' : 'Light mode'}</p>
              </div>
            </div>

            {/* Toggle switch */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-card ${
                isDark ? 'bg-accent' : 'bg-stone-400'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  isDark ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </section>

        {/* ── Preferences ───────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">Preferences</h2>

          <div className="card flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Music size={18} className="text-accent-light shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary">Open songs in Chord Chart</p>
                <p className="text-xs text-muted">The song viewer opens in Lyrics mode by default. Turn this on to open in Chord Chart mode instead. Saved on this device.</p>
              </div>
            </div>
            <button onClick={() => pickViewerMode(viewerMode === 'chords' ? 'lyrics' : 'chords')}
              aria-label="Open song viewer in Chord Chart mode" aria-pressed={viewerMode === 'chords'}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0 ${viewerMode === 'chords' ? 'bg-accent' : 'bg-stone-400'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${viewerMode === 'chords' ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className="card flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Languages size={18} className="text-accent-light shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary">Song Library language</p>
                <p className="text-xs text-muted">Songs in other languages are hidden from the Song Library's main list; show them from its ⇅ menu.
                  {libLangState === 'saved' && <span className="text-green-400"> Saved.</span>}
                  {libLangState === 'error' && <span className="text-red-400"> Couldn't save — try again.</span>}</p>
              </div>
            </div>
            <select className="input !w-auto !h-9 !py-0 text-sm shrink-0" value={libLang} onChange={e => pickLibLang(e.target.value)}
              disabled={libLangState === 'saving'} aria-label="Song Library language">
              {libLangOptions.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>

          <OfflineMode />

          <CalendarSync />

          <MyTeams />
        </section>

        {/* ── Licensing & Copyright ─────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">Licensing & Copyright</h2>
          <div className="card space-y-4">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-accent-light shrink-0" />
              <span className="text-sm font-semibold text-primary">Copyright Notice</span>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              Song lyrics are protected by copyright regardless of the context in which they are used.
              Displaying lyrics publicly — in a church service, event, or otherwise — requires a valid license.
            </p>
            <ul className="space-y-2.5">
              {[
                {
                  label: 'Personal / private use',
                  detail: 'Generally permitted without a license.',
                },
                {
                  label: 'Churches',
                  detail: (
                    <>
                      Verify coverage via{' '}
                      <a
                        href="https://ccli.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent-light underline hover:text-accent inline-flex items-center gap-0.5"
                      >
                        CCLI <ExternalLink size={10} />
                      </a>.
                      CCLI API integration is a planned premium feature.
                    </>
                  ),
                },
                {
                  label: 'Other public or commercial use',
                  detail: 'A performance license is required — ASCAP, BMI, or SESAC depending on your region.',
                },
                {
                  label: 'Public domain songs',
                  detail: 'No license required. Generally applies to works published before 1928.',
                },
              ].map(({ label, detail }) => (
                <li key={label} className="flex items-start gap-2.5 text-sm">
                  <span className="text-accent-light shrink-0 mt-0.5">•</span>
                  <span className="text-muted">
                    <span className="text-primary font-medium">{label}</span>
                    {' — '}
                    {detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Subscription Plans ────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 id="plans" className="text-xs font-semibold text-muted uppercase tracking-wider scroll-mt-4">Subscription Plans</h2>
          {returned === 'success' && (
            <div className="card flex items-center gap-3 border-green-500/40">
              <PartyPopper size={18} className="text-green-400 shrink-0" />
              <p className="text-sm text-primary">
                Thank you! {['solo', 'pro'].includes(currentPlan) ? `Your team is now on ${PLAN_LABEL[currentPlan]}.` : 'Your plan will switch over in a moment.'}
              </p>
            </div>
          )}
          {returned === 'cancelled' && (
            <p className="text-xs text-muted">Checkout was cancelled — nothing was charged.</p>
          )}
          {billingError && <p className="text-xs text-red-400">{billingError}</p>}
          {billing.canBuy && <BillingStatus info={billingInfo} busy={billingBusy} manage={billing.manage} />}
          <div className="flex justify-center">
            <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
              {[['month', 'Monthly'], ['year', 'Yearly']].map(([v, label]) => (
                <button key={v} onClick={() => setInterval_(v)}
                  className={`px-4 py-1.5 rounded-md font-medium transition-colors ${interval === v ? 'bg-accent text-white' : 'text-muted hover:text-primary'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {PLANS.map(plan => <PlanCard key={plan.id} plan={plan} current={currentPlan} interval={interval} billing={billing} />)}
          </div>
          <p className="text-[11px] text-muted text-center">Payments are handled securely by Stripe. Cancel anytime from Manage billing.</p>
        </section>

        {/* Footer */}
        <div className="space-y-2 pb-6">
          <LegalLinks />
          <p className="text-center text-xs text-muted">StaffList v0.1.0</p>
        </div>

      </div>
    </Layout>
  )
}
