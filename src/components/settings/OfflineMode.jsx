import { useCallback, useEffect, useState } from 'react'
import { WifiOff, RefreshCw, Trash2, Download, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { getPref } from '../../lib/prefs'
import { enableOffline, disableOffline, clearOfflineData, getOfflineUsage, formatBytes, isOfflineEnabled } from '../../lib/offline'
import { downloadForOffline } from '../../lib/offlineSync'

const SEGMENTS = [['api', 'Songs, sets & team', 'bg-accent'], ['media', 'Slide images', 'bg-purple-400'], ['app', 'App files', 'bg-amber-400']]

export default function OfflineMode() {
  const { user } = useAuth()
  const [on, setOn] = useState(isOfflineEnabled())
  const [usage, setUsage] = useState(null)
  const [syncing, setSyncing] = useState(null)   // { done, label } while downloading
  const [syncedAt, setSyncedAt] = useState(() => getPref('offlineSyncedAt', null))
  const [result, setResult] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [error, setError] = useState(null)

  const refreshUsage = useCallback(async () => setUsage(await getOfflineUsage()), [])
  useEffect(() => { if (on) refreshUsage() }, [on, refreshUsage])

  const download = useCallback(async () => {
    setError(null); setResult(null); setSyncing({ done: 0, label: 'Starting…' })
    try {
      const r = await downloadForOffline(user.id, p => setSyncing(p))
      setResult(r); setSyncedAt(getPref('offlineSyncedAt', null))
    } catch { setError('Download failed — check your connection and try again.') }
    setSyncing(null)
    refreshUsage()
  }, [user.id, refreshUsage])

  const toggle = async () => {
    setError(null)
    if (on) {
      await disableOffline()
      setOn(false); setUsage(null); setSyncedAt(null); setResult(null)
    } else {
      await enableOffline()
      setOn(true)
      download()
    }
  }

  const clear = async () => {
    if (!confirmClear) { setConfirmClear(true); return }
    setConfirmClear(false)
    await clearOfflineData(); setSyncedAt(null); setResult(null)
    refreshUsage()
  }

  const total = usage ? usage.api + usage.media + usage.app : 0

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <WifiOff size={18} className="text-accent-light shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">Offline mode</p>
            <p className="text-xs text-muted">Keep your songs, sets and slides on this device so a service never depends on the internet.</p>
          </div>
        </div>
        <button onClick={toggle} aria-label="Toggle offline mode" aria-pressed={on}
          className={`relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0 ${on ? 'bg-accent' : 'bg-slate-300'}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
      </div>

      {on && (
        <div className="space-y-3 pt-3 border-t border-border">
          {/* Storage meter */}
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted">Storage used on this device</span>
              <span className="text-primary font-medium">{usage ? formatBytes(total) : '…'}</span>
            </div>
            <div className="h-2.5 rounded-full bg-[#2a2a2a] overflow-hidden flex">
              {usage && total > 0 && SEGMENTS.map(([k, , color]) => (
                <div key={k} className={color} style={{ width: `${(usage[k] / total) * 100}%` }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {SEGMENTS.map(([k, label, color]) => (
                <span key={k} className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className={`w-2 h-2 rounded-full ${color}`} />{label}
                  <span className="text-primary">{usage ? formatBytes(usage[k]) : '—'}</span>
                </span>
              ))}
            </div>
            {usage?.quota > 0 && (
              <p className="text-[11px] text-muted">
                That's {((total / usage.quota) * 100).toFixed(total / usage.quota < 0.01 ? 2 : 1)}% of the {formatBytes(usage.quota)} this browser lets PresentGO use
                {usage.usage != null && usage.usage > total ? ` (${formatBytes(usage.usage)} including other site data)` : ''}.
              </p>
            )}
          </div>

          {/* Status + actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={download} disabled={!!syncing} className="btn-primary !py-1.5 !px-3 text-sm flex items-center gap-1.5 disabled:opacity-60">
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {syncing ? 'Downloading…' : 'Download now'}
            </button>
            <button onClick={clear} disabled={!!syncing}
              className={`btn-secondary !py-1.5 !px-3 text-sm flex items-center gap-1.5 ${confirmClear ? '!border-red-500 !text-red-400' : ''}`}>
              <Trash2 size={13} /> {confirmClear ? 'Click again to clear' : 'Clear offline data'}
            </button>
            <span className="text-[11px] text-muted ml-auto flex items-center gap-1">
              <RefreshCw size={11} />
              {syncing ? syncing.label : syncedAt ? `Last downloaded ${new Date(syncedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Not downloaded yet'}
            </span>
          </div>
          {result && <p className="text-xs text-green-400">Ready for offline: {result.sets} sets, {result.songs} songs{result.images ? `, ${result.images} slide images` : ''}.</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}

          <ul className="text-[11px] text-muted space-y-1 list-disc pl-4">
            <li>Everything refreshes automatically each time you open PresentGO with a connection. Open it once before each service while online.</li>
            <li>Offline you can browse, view songs and charts, and run Presentation Mode. Changes to sets and songs can't be saved until you reconnect.</li>
            <li>To drive the TV offline, keep the controller and the display in the same browser on one device.</li>
            <li>On iPhone and iPad, tap Share → <strong className="text-primary">Add to Home Screen</strong> so Safari doesn't clear offline data after a week of non-use.</li>
          </ul>
        </div>
      )}
    </div>
  )
}
