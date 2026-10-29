import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { LEGAL } from '../lib/legal'

const mail = <a href={`mailto:${LEGAL.contactEmail}`} className="text-accent-light underline">{LEGAL.contactEmail}</a>

// ── Privacy Policy ──────────────────────────────────────────────────────────────────────────
const PRIVACY = [
  ['Who we are', <>
    <p>{LEGAL.operator} ("StaffList", "we", "us") makes StaffList, an app for worship teams to keep song charts, plan sets, schedule musicians and present lyrics, on the web and in the iPad and iPhone app. This policy explains what information StaffList keeps, why, who helps us run it, and the choices you have. Questions: {mail}.</p>
  </>],
  ['What we collect', <>
    <p><b>Your account.</b> Your name, email address and password (stored only as a secure hash by our sign-in provider). If you sign in with Google or Apple, we receive your name and email from them.</p>
    <p><b>What you and your team put in StaffList.</b> Songs, lyrics, chord charts, arrangements, keys, notes, sets and their dates, times and locations, files and images in the Content Library, Team Details, and messages sent with Message Team.</p>
    <p><b>Information about team members.</b> Team leaders can add people to their team roster with a name, email address, phone number and positions, and schedule them on sets. If someone added you, we keep what they entered, plus your answers to invitations (joined, accepted or declined) and your team color.</p>
    <p><b>Song usage.</b> Which songs were used in which sets, so a team can prepare its CCLI report.</p>
    <p><b>On your device.</b> Settings such as the theme, your CCLI license number and an offline copy of your sets and songs are saved in your browser or the app on your device.</p>
    <p><b>Technical information.</b> Our hosting and database providers keep standard logs (such as IP address, browser type and the time of a request) to run, secure and fix the service.</p>
    <p>We do not use advertising, ad trackers or third-party analytics, and we do not sell or share your personal information for advertising.</p>
  </>],
  ['How we use it', <>
    <ul className="list-disc pl-5 space-y-1">
      <li>To run StaffList: store your library and sets, show them to the people on your team who should see them, and present lyrics.</li>
      <li>To send the emails you ask for: invitations to join a team, set requests, reminders and team messages.</li>
      <li>To provide calendar subscriptions of the sets you lead or serve on.</li>
      <li>To run the AI features you choose to use (see below).</li>
      <li>To manage plans and subscriptions, keep the service secure, answer support requests and meet legal obligations.</li>
    </ul>
  </>],
  ['Who can see your information', <>
    <p><b>Your team.</b> Admins and Leaders of a team see its song library, sets and roster. Members see the sets they have accepted, with their charts and lyrics, and their own roster entry. Team Details appear in the invitation emails your team sends.</p>
    <p><b>Service providers</b> who process information for us only to run StaffList:</p>
    <ul className="list-disc pl-5 space-y-1">
      <li><b>Supabase</b>: database, sign-in and file storage.</li>
      <li><b>Vercel</b>: hosting of the website and its server functions.</li>
      <li><b>Resend</b>: sending email.</li>
      <li><b>Anthropic</b>: AI features. When you use Smart Cleanup, Translate, song details lookup or Worship Leader Notes, the song's title, artist and lyrics (or your notes) are sent to Anthropic's Claude to produce the result. Under Anthropic's commercial terms, this data is not used to train their models.</li>
      <li><b>Google (YouTube)</b>: when you search for a song's video, your search words are sent to YouTube.</li>
      <li><b>Google and Apple</b>: if you choose to sign in with them.</li>
      <li><b>Stripe and Apple</b>: when paid plans are offered, payments are handled by Stripe on the web and by Apple in the app. We never see or store your full card number.</li>
    </ul>
    <p>We may also share information if the law requires it, to protect the rights and safety of people using StaffList, or as part of a sale or merger of the service (in which case this policy continues to apply).</p>
  </>],
  ['How long we keep it', <>
    <p>We keep your information while your account or team is active. When a leader removes someone from a team roster, or you delete a song, set or file, it is deleted from our database (backups roll over within about 30 days). When you ask us to delete your account, we delete it and the content only you own within 30 days; content that belongs to a team stays with that team.</p>
  </>],
  ['Your choices and rights', <>
    <ul className="list-disc pl-5 space-y-1">
      <li>You can view and change most of your information in the app.</li>
      <li>You can decline or leave a team, and turn off calendar sync, at any time.</li>
      <li>You can ask for a copy of your information, a correction, or deletion of your account by emailing {mail}. We answer within 30 days.</li>
      <li>Depending on where you live (for example California or the European Union), you may have further rights, including to object to or limit some uses. We honor them however you contact us, and we won't treat you differently for using them.</li>
    </ul>
  </>],
  ['Security', <>
    <p>Information is sent over encrypted connections (HTTPS) and stored with providers that encrypt it at rest. Access is limited by your team role. No system is perfectly secure, so please use a strong password and tell us right away if you think your account has been misused.</p>
  </>],
  ['Children', <>
    <p>StaffList is meant for adults who lead and serve on worship teams, and is not directed to children under 13. Team leaders who add a child under 13 to a roster should have a parent's permission and should use a parent's email address. If you believe a child under 13 has given us personal information, email {mail} and we will delete it.</p>
  </>],
  ['Where information is processed', <>
    <p>StaffList is run from the United States, and our providers may process information in the United States and other countries. Where required, we rely on appropriate safeguards for those transfers.</p>
  </>],
  ['Changes to this policy', <>
    <p>If we change this policy, we will update the date above, and for important changes we will tell you in the app or by email before they take effect.</p>
  </>],
]

// ── Terms of Use ────────────────────────────────────────────────────────────────────────────
const TERMS = [
  ['Agreement', <>
    <p>These Terms of Use are an agreement between you and {LEGAL.operator} for StaffList on the web and in the iPad and iPhone app. By creating an account or using StaffList, you agree to these Terms and to our <Link to="/privacy" className="text-accent-light underline">Privacy Policy</Link>. If you use StaffList for a church or organization, you confirm you may accept these Terms for it.</p>
  </>],
  ['Your account', <>
    <p>You must be at least 13 years old to create an account (or older, if your country requires it). Give accurate information, keep your password private and tell us at {mail} if you think someone else has used your account. You are responsible for what happens under your account.</p>
  </>],
  ['Teams', <>
    <p>The person who creates a team is its Admin. Admins and Leaders decide who joins, what roles they have and who is scheduled, and are responsible for the information they enter about other people, including having permission to add their contact details and to email them. Content in a team (its songs, sets and files) belongs to the team, and its Admins control it.</p>
  </>],
  ['Your content and copyright', <>
    <p>You keep ownership of everything you add to StaffList. You give us permission to store, copy, display and send that content only as needed to run StaffList for you and your team, for example to show a chart to a scheduled musician or put lyrics on a screen.</p>
    <p>Many worship songs are copyrighted. You are responsible for having the rights or licenses (such as a CCLI license) needed to copy, display, project, stream or translate the songs and files you add, and for reporting your usage to your licensing organization. StaffList's CCLI Report helps with that report but does not replace your license.</p>
    <p>If you believe something in StaffList infringes your copyright, email {mail} with the work, where it appears and your contact details, and we will respond promptly.</p>
  </>],
  ['Acceptable use', <>
    <p>Please don't use StaffList to break the law, infringe others' rights, send spam or unwanted messages, upload harmful code, try to get into accounts or data that aren't yours, overload or disrupt the service, or copy or resell the service itself. We may remove content or suspend accounts that do.</p>
  </>],
  ['AI features', <>
    <p>Smart Cleanup, Translate, song details lookup and Worship Leader Notes use artificial intelligence. Results can be wrong or incomplete: please review keys, tempos, translations and notes before relying on them, especially before a service.</p>
  </>],
  ['Plans, payments and cancelling', <>
    <p>StaffList has a free plan and paid plans (Pro and Ultimate) with more features and storage, as described in Settings. Paid plans are billed in advance, monthly or yearly, and renew automatically until cancelled. Prices may change, with notice before your next renewal.</p>
    <p>If you subscribe through the App Store, Apple handles payment, renewal, cancellation and refunds under its terms; manage it in your Apple account settings. If you subscribe on the web, you can cancel any time in Settings, and your plan stays active until the end of the period you paid for. Except where the law requires, payments are not refundable.</p>
    <p>If a team's paid plan ends, its content is kept, but paid features (such as presenting, scheduling and adding team members) stop working, and storage above the free limit becomes read-only until the team upgrades again or makes room.</p>
  </>],
  ['Changes and availability', <>
    <p>We are always improving StaffList and may add, change or remove features. We work to keep it running, but can't promise it will always be available or error-free, so keep your own copies of anything you can't do without, and have a backup plan for services.</p>
  </>],
  ['Ending your use', <>
    <p>You can stop using StaffList at any time and ask us to delete your account. We may suspend or end access if you seriously or repeatedly break these Terms, or if we have to stop offering the service (in which case we will give reasonable notice where we can so you can export your content).</p>
  </>],
  ['Disclaimers', <>
    <p>StaffList is provided "as is" and "as available". To the fullest extent the law allows, we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose and non-infringement.</p>
  </>],
  ['Limitation of liability', <>
    <p>To the fullest extent the law allows, {LEGAL.operator} will not be liable for indirect, incidental, special, consequential or punitive damages, or for lost data, profits or revenue. Our total liability for any claim relating to StaffList is limited to the greater of the amount you paid us in the 12 months before the claim or US $50. Some places don't allow these limits, so they may not apply to you.</p>
  </>],
  ['Apple', <>
    <p>If you use the iPad or iPhone app, these Terms are between you and {LEGAL.operator}, not Apple. Apple has no obligation to provide support or maintenance for the app and is not responsible for any claims about it. Apple and its subsidiaries are third-party beneficiaries of these Terms and may enforce them. Your use of the app must also follow the App Store's Usage Rules.</p>
  </>],
  ['Governing law', <>
    <p>These Terms are governed by the laws of the State of {LEGAL.state}, USA, without regard to its conflict-of-law rules, and disputes will be handled in the state or federal courts located in {LEGAL.state}, unless the law where you live gives you the right to bring a claim there.</p>
  </>],
  ['Changes to these Terms', <>
    <p>If we change these Terms, we will update the date above and, for important changes, tell you in the app or by email before they take effect. Continuing to use StaffList after that means you accept the new Terms.</p>
  </>],
  ['Contact', <><p>Questions about these Terms: {mail}.</p></>],
]

function LegalPage({ title, intro, sections, other }) {
  return (
    <div className="min-h-[100dvh] bg-bg text-primary">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <header className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80"><Logo className="text-accent" size={26} /><span className="font-semibold tracking-tight">StaffList</span></Link>
          <Link to={other.to} className="text-sm text-muted hover:text-primary">{other.label}</Link>
        </header>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted">Effective {LEGAL.effective}</p>
          {intro && <p className="text-sm leading-relaxed">{intro}</p>}
        </div>
        {sections.map(([h, body], i) => (
          <section key={h} className="space-y-2 text-sm leading-relaxed [&_p]:mb-2">
            <h2 className="text-base font-semibold">{i + 1}. {h}</h2>
            {body}
          </section>
        ))}
        <footer className="pt-6 border-t border-border text-xs text-muted flex gap-4">
          <Link to="/privacy" className="hover:text-primary">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-primary">Terms of Use</Link>
          <Link to="/" className="hover:text-primary ml-auto">Open StaffList</Link>
        </footer>
      </div>
    </div>
  )
}

export function Privacy() {
  return <LegalPage title="Privacy Policy" sections={PRIVACY} other={{ to: '/terms', label: 'Terms of Use' }} />
}

export function Terms() {
  return <LegalPage title="Terms of Use" sections={TERMS} other={{ to: '/privacy', label: 'Privacy Policy' }} />
}

// The two links, for the sign-in screen and Settings.
export function LegalLinks({ className = '' }) {
  return (
    <p className={`text-xs text-muted flex justify-center gap-4 ${className}`}>
      <Link to="/privacy" className="hover:text-primary underline-offset-2 hover:underline">Privacy Policy</Link>
      <Link to="/terms" className="hover:text-primary underline-offset-2 hover:underline">Terms of Use</Link>
      <Link to="/support" className="hover:text-primary underline-offset-2 hover:underline">Support</Link>
    </p>
  )
}
