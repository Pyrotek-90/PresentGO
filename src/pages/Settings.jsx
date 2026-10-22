import Layout from '../components/Layout'
import CalendarSync from '../components/settings/CalendarSync'
import OfflineMode from '../components/settings/OfflineMode'
import ChurchSettings from '../components/settings/ChurchSettings'
import MyTeams from '../components/settings/MyTeams'
import { getPref, setPref } from '../lib/prefs'
import { useTheme } from '../contexts/ThemeContext'
import {
  Sun, Moon, Shield, Check, ExternalLink,
  Church, Zap, Bell, Star, Music, Languages,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useChurch } from '../contexts/ChurchContext'
import { DEFAULT_LIBRARY_LANGUAGE, songLanguage } from '../lib/songTags'
import { useEffect, useState } from 'react'

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
    description: 'Everything you need to keep your music book and run Sunday.',
    features: [
      'Unlimited songs, chord charts & transposition',
      'Unlimited imports (ChordPro, PDF charts, bulk folder)',
      'Sets and single-screen presentation',
      '100 MB Content Library',
    ],
    cta: 'Your current plan',
    ctaDisabled: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$12',
    period: '/month',
    yearly: 'or $100/year — save about 30%',
    badge: 'Coming Soon',
    badgeClass: 'bg-purple-500/20 text-purple-300',
    icon: Zap,
    iconClass: 'text-purple-400',
    borderClass: 'border-purple-500/30',
    description: 'For worship teams: live presenting, AI tools and scheduling.',
    features: [
      'Everything in Free',
      '500 MB Content Library',
      'Live presenting with controller',
      'AI Translate (lyrics & slide translations)',
      'AI Worship Leader Notes',
      'AI key / BPM lookup & Smart Cleanup',
      'Team scheduling, email invites & calendar feed',
      'Shared team access: musicians and singers open their sets, charts and lyrics',
      'CCLI Report',
    ],
    cta: 'Notify Me When Available',
    ctaDisabled: false,
    comingSoon: true,
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

function PlanCard({ plan }) {
  const [notified, setNotified] = useState(false)
  const Icon = plan.icon

  const checkColor =
    plan.id === 'pro'      ? 'text-purple-400' :
    plan.id === 'ultimate' ? 'text-amber-400'  : 'text-accent-light'

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
              {plan.yearly && <span className="text-xs text-muted ml-2">{plan.yearly}</span>}
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
  const [viewerMode, setViewerMode] = useState(() => getPref('viewerMode', 'lyrics'))
  const pickViewerMode = m => { setViewerMode(m); setPref('viewerMode', m) }
  const { user } = useAuth()
  const { scope } = useChurch()
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

        <ChurchSettings />

        <MyTeams />

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
          StaffList v0.1.0 · Built for worship
        </p>

      </div>
    </Layout>
  )
}
