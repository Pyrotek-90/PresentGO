import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronDown, Lightbulb, Mail, Check, HelpCircle } from 'lucide-react'
import PublicLayout from '../components/PublicLayout'
import { useAuth } from '../contexts/AuthContext'
import { LEGAL } from '../lib/legal'

// Public Support page: FAQ, Feature Request and Contact Us. The two forms post to
// /api/support, which emails them (addresses are set in Vercel; see api/support.js).

const FAQ = [
  ['How do I import my songs?',
    <>Open the menu under your name and choose <b>Import Songs</b>, or tap <b>Import</b> in your song list. Choose your ChordPro files (.cho, .chordpro or .txt) or PDF chord charts. On a computer you can choose a whole folder at once; on an iPad, use <b>Choose Files</b>. Check the review list and import. Each chart becomes a song with its lyrics, chord chart, key, slides and tags, ready in your song list. Scanned PDFs (a photo of a page) can’t be read, so download the ChordPro or text PDF version from SongSelect, PraiseCharts or your other licensed source.</>],
  ['How do I create a set list?',
    <>On Home, tap <b>New Set</b>, give it a name and date, and save. You can also start one from your song list: tap <b>Add songs to a set</b>, open the <b>Add to</b> list and choose <b>+ New Set…</b>.</>],
  ['How do I add songs to a set and change their order?',
    <>In your song list, tap <b>Add songs to a set</b>, choose the set in the <b>Add to</b> list, then tap each song you want. Or open the set and use <b>Add a song</b>. Drag songs in the <b>Run Order</b> to rearrange them, and add program items such as Scripture or a reflection between songs.</>],
  ['How do I change the key of a song for one set?',
    <>Open the set and the song, and choose its <b>Key for this set</b>. The chart transposes for that set only. The song keeps its own key in your library, so next week starts from your usual key.</>],
  ['How do I present the lyrics?',
    <>Open the set and tap <b>Present</b>. Your slides are already made from the import, so the program is ready to go. The controller shows the current slide and <b>Up Next</b>; tap a slide to show it, and use <b>Loop</b> for a welcome or offering loop. Presenting is part of the Solo and Pro plans.</>],
  ['Can I present from my iPad or iPhone to the TV?',
    <>Yes. In the StaffList app, open the set and tap <b>Present</b>, then open Control Center, tap <b>Screen Mirroring</b> and choose your Apple TV or AirPlay TV. The TV shows only the slide on screen while you keep the controller. Keep StaffList open in front while presenting. In Safari, mirroring shows your whole screen instead.</>],
  ['How do I invite my band and team?',
    <>On the <b>Team</b> page, tap <b>Add Member</b> and enter their name, email and positions. They get an email invitation to join your team. To schedule them, go to <b>Schedule</b>, pick the set, add each person with their position, and send. Each person gets a set request they can accept or decline, and you see who is waiting, accepted or declined. Team scheduling is part of Pro.</>],
  ['What do my musicians and singers see?',
    <>Team members see Home and their Schedule: the sets they have accepted, with the run order, chord charts, lyrics and the key for each song. Admins and Leaders can edit songs and sets; members can view them.</>],
  ['Can I use StaffList without Wi-Fi at church?',
    <>Yes. Turn on <b>Offline mode</b> in Settings, then open StaffList once while you are online before the service so your sets and songs are saved on the device. Offline you can view songs and charts and present. Changes save once you reconnect.</>],
  ['How do I make my CCLI report?',
    <>Open the menu under your name and choose <b>CCLI Report</b>. Pick the period, and StaffList lists every song used in your sets with its CCLI number, how many times it was used and the dates. Download it as a spreadsheet file, print it or email it. The CCLI Report is part of the Solo and Pro plans.</>],
]

function FaqItem({ q, a }) {
  return (
    <details className="group rounded-xl border border-border bg-card open:bg-surface">
      <summary className="flex items-center gap-3 cursor-pointer list-none p-4 sm:p-5 font-medium [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{q}</span>
        <ChevronDown size={18} className="text-muted shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="px-4 sm:px-5 pb-5 -mt-1 text-sm leading-relaxed text-muted [&_b]:text-primary [&_b]:font-medium">{a}</div>
    </details>
  )
}

function SupportForm({ kind, id, icon: Icon, title, intro, titleLabel, titleHint, messageHint, button }) {
  const { user } = useAuth()
  const [email, setEmail] = useState(user?.email || '')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')       // hidden from people; catches bots
  const [state, setState] = useState('idle')       // idle | sending | sent | error
  const [error, setError] = useState('')

  useEffect(() => { if (user?.email && !email) setEmail(user.email) }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async e => {
    e.preventDefault()
    setState('sending'); setError('')
    try {
      const r = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, email, title: subject, message, website, signedIn: !!user }),
      })
      if (r.ok) { setState('sent'); return }
      const { error: code } = await r.json().catch(() => ({}))
      setError(code === 'email' ? 'Please check your email address.'
        : code === 'missing' ? 'Please add a title and a message.'
        : 'We couldn’t send this right now.')
      setState('error')
    } catch {
      setError('We couldn’t send this right now.')
      setState('error')
    }
  }

  const mailto = `mailto:${LEGAL.contactEmail}?subject=${encodeURIComponent(`StaffList ${title}: ${subject}`)}&body=${encodeURIComponent(message)}`

  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 rounded-2xl border border-border bg-card p-5 sm:p-7 space-y-5">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-accent/20 text-accent-light flex items-center justify-center shrink-0"><Icon size={20} /></span>
        <div>
          <h2 id={`${id}-h`} className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted mt-1">{intro}</p>
        </div>
      </div>

      {state === 'sent' ? (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-5 space-y-3" role="status">
          <p className="flex items-center gap-2 font-medium"><Check size={18} className="text-accent-light" /> Thank you, we got it.</p>
          <p className="text-sm text-muted">We’ll reply to {email}.</p>
          <button type="button" onClick={() => { setSubject(''); setMessage(''); setState('idle') }} className="text-sm text-accent-light hover:underline">Send another</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-email`} className="text-sm font-medium">Your email</label>
            <input id={`${id}-email`} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
              className="input w-full" placeholder="you@yourchurch.org" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-title`} className="text-sm font-medium">{titleLabel}</label>
            <input id={`${id}-title`} type="text" required maxLength={150} value={subject} onChange={e => setSubject(e.target.value)}
              className="input w-full" placeholder={titleHint} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-message`} className="text-sm font-medium">Message</label>
            <textarea id={`${id}-message`} required rows={6} maxLength={5000} value={message} onChange={e => setMessage(e.target.value)}
              className="input w-full !h-auto py-2 resize-y" placeholder={messageHint} />
          </div>
          <div className="hidden" aria-hidden="true">
            <label htmlFor={`${id}-website`}>Website</label>
            <input id={`${id}-website`} tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
          </div>
          {state === 'error' && (
            <p className="text-sm text-red-300" role="alert">
              {error} You can also <a href={mailto} className="underline text-accent-light">email us directly</a>.
            </p>
          )}
          <button type="submit" disabled={state === 'sending' || !email.trim() || !subject.trim() || !message.trim()} className="btn-primary w-full sm:w-auto !px-6 !py-2.5">
            {state === 'sending' ? 'Sending…' : button}
          </button>
        </form>
      )}
    </section>
  )
}

export default function Support() {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }, [hash])

  return (
    <PublicLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-14">
        <header className="text-center space-y-4 max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight">Help and Support</h1>
          <p className="text-muted sm:text-lg">Answers to common questions, a place to suggest what StaffList should do next, and a way to reach us.</p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <a href="#faq" className="px-4 py-2 rounded-full border border-border text-sm hover:bg-card">FAQ</a>
            <a href="#feature-request" className="px-4 py-2 rounded-full border border-border text-sm hover:bg-card">Request a feature</a>
            <a href="#contact" className="px-4 py-2 rounded-full border border-border text-sm hover:bg-card">Contact us</a>
          </div>
        </header>

        <section id="faq" aria-labelledby="faq-h" className="scroll-mt-20 space-y-5 max-w-3xl mx-auto">
          <h2 id="faq-h" className="text-2xl font-semibold flex items-center gap-2"><HelpCircle size={22} className="text-accent-light" /> Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQ.map(([q, a]) => <FaqItem key={q} q={q} a={a} />)}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2 items-start">
          <SupportForm kind="feature" id="feature-request" icon={Lightbulb} title="Feature Request"
            intro="Tell us what would make Sunday easier. We read every idea."
            titleLabel="Title of your request" titleHint="e.g. Capo chords for guitar"
            messageHint="What would you like StaffList to do, and how would you use it?" button="Send request" />
          <SupportForm kind="contact" id="contact" icon={Mail} title="Contact Us"
            intro="Questions, problems or account help. We usually reply within a couple of days."
            titleLabel="Subject" titleHint="e.g. Can’t import a PDF chart"
            messageHint="What happened, and on which device (iPad, iPhone or computer)?" button="Send message" />
        </div>
      </div>
    </PublicLayout>
  )
}
