import Layout from '../components/Layout'
import { LegalLinks } from './Legal'
import CalendarSync from '../components/settings/CalendarSync'
import OfflineMode from '../components/settings/OfflineMode'
import MyTeams from '../components/settings/MyTeams'
import DeleteAccount from '../components/settings/DeleteAccount'
import ExportLibrary from '../components/settings/ExportLibrary'
import PlanMatrix from '../components/settings/PlanMatrix'
import { PLAN_LABEL } from '../lib/plans'
import { getPref, setPref } from '../lib/prefs'
import { useTheme } from '../contexts/ThemeContext'
import {
  Sun, Moon, Shield, ExternalLink,
  Star, Music, Languages,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useChurch } from '../contexts/ChurchContext'
import { DEFAULT_LIBRARY_LANGUAGE, songLanguage } from '../lib/songTags'
import { useEffect, useState } from 'react'

// ─── Main Settings page ────────────────────────────────────────────────────────

export default function Settings() {
  const { isDark, toggleTheme } = useTheme()
  const [viewerMode, setViewerMode] = useState(() => getPref('viewerMode', 'lyrics'))
  const pickViewerMode = m => { setViewerMode(m); setPref('viewerMode', m) }
  const { user } = useAuth()
  const { scope, plan: currentPlan } = useChurch()
  // "See plans" from an upgrade prompt opens the Feature Matrix.
  const [showPlans, setShowPlans] = useState(false)
  useEffect(() => {
    if (window.location.hash === '#plans') setShowPlans(true)
  }, [])
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

          <OfflineMode />

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

        {/* ── Account ───────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">Account</h2>
          <div className="card flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">Signed in as</p>
              <p className="text-sm text-primary truncate">{user?.email}</p>
            </div>
          </div>
          <button id="plans" onClick={() => setShowPlans(true)} className="card w-full flex items-center gap-3 text-left hover:border-accent scroll-mt-4">
            <Star size={18} className="text-accent-light shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-primary">Plan: <span className="text-accent-light">{PLAN_LABEL[currentPlan] || 'Free'}</span></p>
              <p className="text-xs text-muted">See what each plan includes, or change your plan.</p>
            </div>
            <span className="text-xs text-accent-light font-medium">Compare plans ›</span>
          </button>
          {showPlans && <PlanMatrix current={currentPlan} onClose={() => setShowPlans(false)} />}
          <ExportLibrary />
          <DeleteAccount />
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
