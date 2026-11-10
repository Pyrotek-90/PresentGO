import { useState } from 'react'
import { FileDown, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useChurch } from '../../contexts/ChurchContext'
import { useUpgrade, locked } from '../../contexts/UpgradeContext'
import { isNativeApp } from '../../lib/native'

// Settings → Export Song Library: every song as one PDF songbook (cover, index, one song per page
// with title, artist, key, BPM, time, CCLI and the chord chart). Paid plans (Solo and up).
// The server builds the PDF (api/export-songbook.js) so the app stays light.
export default function ExportLibrary() {
  const { scope, church, unitLabel } = useChurch()
  const { present, requirePresent } = useUpgrade()
  const [state, setState] = useState('idle')   // idle | working | done | error
  const [message, setMessage] = useState('')

  const save = async (blob, name) => {
    const file = new File([blob], name, { type: 'application/pdf' })
    // In the iPad / iPhone app, hand the PDF to the share sheet (Save to Files, Print, AirDrop…).
    if (isNativeApp() && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name }).catch(() => {})
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const exportPdf = async () => {
    if (!requirePresent('Exporting the Song Library')) return
    setState('working'); setMessage('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/export-songbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ church_id: scope.legacy ? null : scope.churchId }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || 'Could not build the PDF. Please try again.')
      }
      const name = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'Song Library.pdf'
      await save(await r.blob(), name)
      setState('done'); setMessage(`Saved “${name}”.`)
    } catch (e) {
      setState('error'); setMessage(e.message)
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-3">
        <FileDown size={18} className="text-accent-light shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-primary flex items-center gap-1.5">
            Export Song Library {!present && <Lock size={12} className="text-muted" aria-label="Paid plans" />}
          </p>
          <p className="text-xs text-muted">
            Every song in {church?.name ? `${church.name}'s` : `your ${unitLabel.toLowerCase()}'s`} library as one PDF songbook:
            a cover, an index, and a page per song with its title, artist, key, BPM, CCLI number and chord chart.
          </p>
        </div>
      </div>
      <button onClick={exportPdf} disabled={state === 'working'}
        className={`btn-secondary text-sm flex items-center gap-2 disabled:opacity-60 ${locked(present)}`}>
        {state === 'working'
          ? <><span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" /> Building your songbook…</>
          : <><FileDown size={15} /> Export as PDF</>}
      </button>
      {message && <p className={`text-xs ${state === 'error' ? 'text-red-400' : 'text-green-400'}`}>{message}</p>}
    </div>
  )
}
