import Layout from '../components/Layout'
import { useTheme } from '../contexts/ThemeContext'
import {
  Sun, Moon, Shield, Check, ExternalLink,
  Church, Zap, Bell, Star,
} from 'lucide-react'
import { useState } from 'react'

// ─── Subscription plans ────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: null,
    badge: 'Current Plan',
    badgeClass: 'bg-accent/20 text-accent-light',
    icon: Star,
    iconClass: 'text-accent-light',
    borderClass: '',
    description: 'For personal and private use.',
    features: [
      'Public domain songs',
      'Manual lyrics entry & online search',
      'Unlimited sets',
      'AirPlay / screen mirroring presentation',
      'Controller & full-screen presenter views',
    ],
    cta: 'Your current plan',
    ctaDisabled: true,
  },
  {
    id: 'church',
    name: 'Church',
    price: '$9.99',
    period: '/month',
    badge: 'Coming Soon',
    badgeClass: 'bg-purple-500/20 text-purple-300',
    icon: Church,
    iconClass: 'text-purple-400',
    borderClass: 'border-purple-500/30',
    description: 'For licensed church services with CCLI coverage.',
    features: [
      'Everything in Free',
      'CCLI API — import licensed lyrics directly',
      'Automatic CCLI license verification',
      'Motion backgrounds for slides',
      'Multi-user / team access',
      'Priority support',
    ],
    cta: 'Notify Me When Available',
    ctaDisabled: false,
    comingSoon: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19.99',
    period: '/month',
    badge: 'Coming Soon',
    badgeClass: 'bg-amber-500/20 text-amber-300',
    icon: Zap,
    iconClass: 'text-amber-400',
    borderClass: 'border-amber-500/30',
    description: 'For venues, events, and multi-campus organisations.',
    features: [
      'Everything in Church',
      'Custom branding & logo overlays',
      'Multiple venues / campuses',
      'Analytics & reporting',
      'REST API access',
    ],
    cta: 'Notify Me When Available',
    ctaDisabled: false,
    comingSoon: true,
  },
]

// ─── Plan card ─────────────────────────────────────────────────────────────────

function PlanCard({ plan }) {
  const [notified, setNotified] = useState(false)
  const Icon = plan.icon

  const checkColor =
    plan.id === 'church' ? 'text-purple-400' :
    plan.id === 'pro'    ? 'text-amber-400'  : 'text-accent-light'

  return (
    <div className={`card space-y-4 ${plan.borderClass}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-primary">{plan.name}</span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${plan.badgeClass}`}>
              {plan.badge}
            </span>
          </div>
          {plan.price ? (
            <div className="flex items-baseline gap-0.5">
              <span className="text-xl font-bold text-primary">{plan.price}</span>
              <span className="text-xs text-muted">{plan.period}</span>
            </div>
          ) : (
            <div className="text-xl font-bold text-primary">Free</div>
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
      {!plan.ctaDisabled && (
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

// ─── Main Settings page ────────────────────────────────────────────────────────

export default function Settings() {
  const { isDark, toggleTheme } = useTheme()

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
                isDark ? 'bg-accent' : 'bg-slate-300'
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
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">Subscription Plans</h2>
          <div className="space-y-4">
            {PLANS.map(plan => <PlanCard key={plan.id} plan={plan} />)}
          </div>
        </section>

        {/* Footer */}
        <p className="text-center text-xs text-muted pb-6">
          PresentGO v0.1.0 · Built for worship
        </p>

      </div>
    </Layout>
  )
}
