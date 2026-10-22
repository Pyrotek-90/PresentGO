import { useChurch } from '../../contexts/ChurchContext'
import { TeamColorDot } from '../TeamColorKey'

// Settings → My teams: every team I'm on, my role, and the color its sets show in.
export default function MyTeams() {
  const { legacy, churches } = useChurch()
  if (legacy || !churches.length) return null
  const roleOf = c => (c.role === 'admin' ? 'Admin' : c.editor ? 'Leader' : 'Member')
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">My teams &amp; colors</h2>
      <div className="card space-y-3">
        <p className="text-xs text-muted">Sets from each team show in its color on Home, the Schedule calendar and that team's calendar subscription. Tap a color to change it; only you see your colors.</p>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {churches.map(c => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
              <TeamColorDot churchId={c.id} name={c.name} size={18} />
              <span className="flex-1 min-w-0 text-sm font-medium truncate">{c.name}</span>
              <span className="text-xs text-muted shrink-0">{roleOf(c)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
