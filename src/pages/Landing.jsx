import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Check, Minus, ListMusic, MonitorPlay, Users, Upload, Tablet, Send, KeyRound, Tags, CalendarCheck } from 'lucide-react'
import PublicLayout from '../components/PublicLayout'
import Wordmark from '../components/Wordmark'
import { useAuth } from '../contexts/AuthContext'

// Public landing page: what StaffList does, the plans, and the way in (Log in → the sign-in
// screen, which takes people to their Home). Shown at /welcome, and at / to signed-out visitors
// on the web. The iPad / iPhone app skips it and opens the sign-in screen.

const FEATURES = [
  {
    id: 'charts',
    icon: ListMusic,
    plan: 'Free',
    title: 'Your chord charts and set lists, in one place',
    body: 'Import a song by uploading its ChordPro file or PDF chord chart, one at a time or a whole folder at once. Each import becomes a song with its lyrics, chord chart, key, slides and tags already set up, so it is easy to find in your song list. Building a set list is just as quick: pick songs from your list and add them to a set, or start a new set right there.',
    points: [
      { icon: Upload, text: 'Import ChordPro files and PDF chord charts, even a whole folder' },
      { icon: Tags, text: 'Slides and tags are set up as part of the import' },
      { icon: KeyRound, text: 'Keys, transposition and each set’s key kept with the song' },
    ],
    note: 'No more charts stored in different places, or keeping track of everyone’s keys.',
  },
  {
    id: 'present',
    icon: MonitorPlay,
    plan: 'Solo and Pro',
    title: 'Present the slides you already prepared',
    body: 'Your lyric slides are ready the moment a song is imported, so there is nothing more to set up on Sunday. Open the set, tap Present, and run the service from the controller with Up Next and Loop. Present directly from an iPad or iPhone: with AirPlay, the TV shows only the slide on screen while you keep the controls.',
    points: [
      { icon: Tablet, text: 'Present from an iPad, iPhone or computer' },
      { icon: MonitorPlay, text: 'The TV shows only the Now Showing slide' },
      { icon: ListMusic, text: 'Songs, Scripture and other program items in run order' },
    ],
  },
  {
    id: 'team',
    icon: Users,
    plan: 'Pro',
    title: 'Share the set with your band and team',
    body: 'Invite your musicians, singers and production team by email to join your team in StaffList. When you schedule them on a set, they get a set request. Once they accept, they see the whole program: the run order, chord charts, lyrics and keys.',
    points: [
      { icon: Send, text: 'Email invitations to join the team and set requests to serve' },
      { icon: CalendarCheck, text: 'See who has accepted, is waiting or declined' },
      { icon: Users, text: 'Each person sees the sets they serve on, with every chart' },
    ],
  },
]

// The Feature / Pricing matrix. Values: true (included), false (not included), or text.
const PLANS = [
  { id: 'free', name: 'Free', price: '$0', period: '', note: 'Your music book' },
  { id: 'solo', name: 'Solo', price: '$5', period: '/month', note: 'or $50/year', soon: true },
  { id: 'pro', name: 'Pro', price: '$12', period: '/month', note: 'or $100/year', soon: true, featured: true },
  { id: 'ultimate', name: 'Ultimate', price: 'TBA', period: '', note: 'For whole churches', soon: true },
]

const MATRIX = [
  ['Songs and sets', [
    ['Unlimited songs and chord charts', true, true, true, true],
    ['Transpose and keep each set’s key', true, true, true, true],
    ['Unlimited imports: ChordPro, PDF charts, whole folders', true, true, true, true],
    ['Set lists, the Song Viewer and the schedule calendar', true, true, true, true],
    ['Team Details', true, true, true, true],
    ['Content Library storage', '100 MB', '500 MB', '1 GB', '5 GB'],
  ]],
  ['Presenting', [
    ['Present lyrics: controller, Up Next, Loop', false, true, true, true],
    ['Present from iPad and iPhone to a TV (AirPlay)', false, true, true, true],
    ['CCLI Report', false, true, true, true],
  ]],
  ['Team', [
    ['Add, invite and message team members', false, false, true, true],
    ['Schedule your team with set requests by email', false, false, true, true],
    ['Shared access: everyone opens their sets, charts and lyrics', false, false, true, true],
    ['Calendar sync', false, false, true, true],
  ]],
  ['AI tools', [
    ['AI Translate for lyrics and slides', false, false, true, true],
    ['AI Worship Leader Notes', false, false, true, true],
    ['AI key and BPM lookup, Smart Cleanup', false, false, true, true],
  ]],
  ['Church', [
    ['Workspaces (Main Service, Youth, Kids…), each with its own leaders', false, false, false, 'Up to 5'],
    ['Announcements page, registrations and merchandise', false, false, false, true],
  ]],
]

function Cell({ v, featured }) {
  if (v === true) return <Check size={18} className="mx-auto text-accent-light" aria-label="Included" />
  if (v === false) return <Minus size={16} className="mx-auto text-[#4b5a63]" aria-label="Not included" />
  return <span className={`text-sm ${featured ? 'text-primary font-medium' : 'text-primary'}`}>{v}</span>
}

// Five staff lines framing the hero logo, centered on "taffList", with softened ends.
const STAFF_LINE = 'rgba(34,211,238,0.34)'
const STAFF_FADE = 'linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)'

function HeroLogo() {
  return (
    <div className="relative w-full flex justify-center text-[64px] sm:text-[96px] lg:text-[116px]">
      <span className="relative inline-flex">
        <span aria-hidden="true" className="absolute flex flex-col justify-between pointer-events-none"
          style={{ left: '-0.9em', right: '-0.9em', top: '50%', height: '0.72em', marginTop: '-0.3em', WebkitMaskImage: STAFF_FADE, maskImage: STAFF_FADE }}>
          {[0, 1, 2, 3, 4].map(i => <span key={i} className="block" style={{ height: 'max(1px, 0.016em)', background: STAFF_LINE }} />)}
        </span>
        <Wordmark tagline className="relative" />
      </span>
    </div>
  )
}

export default function Landing() {
  const { user } = useAuth()
  const { hash } = useLocation()

  // Header links like /welcome#pricing: scroll to the section.
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }, [hash])

  const start = user ? '/' : '/auth?signup=1'

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 flex flex-col items-center text-center gap-8">
          <HeroLogo />
          <div className="space-y-4 max-w-2xl">
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">Chord charts, set lists and presentation, all in one app</h1>
            <p className="text-base sm:text-lg text-muted leading-relaxed">Keep every song, key and slide in one place. Build a set in a few taps, present from your iPad or iPhone, and share the whole program with your band.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to={start} className="btn-primary !px-6 !py-3 text-base">{user ? 'Open StaffList' : 'Get started free'}</Link>
            {!user && <Link to="/auth" className="px-6 py-3 rounded-lg border border-border text-base font-medium hover:bg-card transition-colors">Log in</Link>}
          </div>
          <p className="text-xs text-muted">Free forever for your songs, charts and sets. On the web and on iPad and iPhone.</p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-t border-border bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-16 sm:space-y-20">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight">Set list prep in minutes, not hours</h2>
            <p className="text-muted">Import your charts once, build a set in a few taps and share it with your team. No more hunting for files or keys before Sunday.</p>
          </div>
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <div key={f.id} className="grid gap-8 md:grid-cols-2 md:gap-14 items-center">
                <div className={`space-y-4 ${i % 2 ? 'md:order-2' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-5xl font-semibold text-accent-light/40 tabular-nums leading-none" aria-hidden="true">{i + 1}</span>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-accent/20 text-accent-light">{f.plan}</span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-snug">{f.title}</h3>
                  <p className="text-muted leading-relaxed">{f.body}</p>
                  {f.note && <p className="text-primary font-medium">{f.note}</p>}
                </div>
                <div className={`rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-5 ${i % 2 ? 'md:order-1' : ''}`}>
                  <span className="w-12 h-12 rounded-xl bg-accent/20 text-accent-light flex items-center justify-center"><Icon size={24} /></span>
                  <ul className="space-y-4">
                    {f.points.map(p => {
                      const P = p.icon
                      return (
                        <li key={p.text} className="flex gap-3 items-start">
                          <P size={18} className="text-accent-light shrink-0 mt-0.5" />
                          <span className="text-sm sm:text-base leading-snug">{p.text}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Pricing matrix */}
      <section id="pricing" className="scroll-mt-20 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-10">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight">Features and pricing</h2>
            <p className="text-muted">Start free. Upgrade when you are ready to present or bring your whole team in. Paid plans are coming soon, and everything you add on Free stays when you upgrade.</p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <caption className="sr-only">StaffList features by plan</caption>
              <thead>
                <tr className="bg-card">
                  <th scope="col" className="p-4 align-bottom text-sm font-medium text-muted w-[38%]">Feature</th>
                  {PLANS.map(p => (
                    <th key={p.id} scope="col" className={`p-4 text-center align-top ${p.featured ? 'bg-accent/15' : ''}`}>
                      <div className="font-semibold text-primary">{p.name}</div>
                      <div className="mt-1"><span className="text-2xl font-semibold text-primary">{p.price}</span><span className="text-sm text-muted">{p.period}</span></div>
                      <div className="text-xs text-muted">{p.note}</div>
                      {p.soon && <div className="mt-2 inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#26313a] text-[#c3ccd2]">Coming soon</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              {MATRIX.map(([group, rows]) => (
                <tbody key={group}>
                  <tr className="border-t border-border bg-surface">
                    <th scope="colgroup" colSpan={5} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-accent-light">{group}</th>
                  </tr>
                  {rows.map(([label, ...vals]) => (
                    <tr key={label} className="border-t border-border">
                      <th scope="row" className="p-4 text-sm font-normal text-primary">{label}</th>
                      {vals.map((v, i) => (
                        <td key={PLANS[i].id} className={`p-4 text-center ${PLANS[i].featured ? 'bg-accent/10' : ''}`}><Cell v={v} featured={PLANS[i].featured} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <p className="text-xs text-muted text-center">Prices in US dollars. A plan belongs to the team, so everyone you invite to a Pro team gets its team features.</p>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="border-t border-border bg-surface">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center space-y-6">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Ready for Sunday?</h2>
          <p className="text-muted">Import your charts, build your first set and see it on screen in minutes.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to={start} className="btn-primary !px-6 !py-3 text-base">{user ? 'Open StaffList' : 'Get started free'}</Link>
            <Link to="/support" className="px-6 py-3 rounded-lg border border-border text-base font-medium hover:bg-card transition-colors">Questions? Visit Support</Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  )
}
