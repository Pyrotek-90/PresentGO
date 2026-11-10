import { useEffect, useState } from 'react'
import { Trash2, X, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { clearOfflineData } from '../../lib/offline'

// Settings → Account → Delete my account. Apple requires apps with sign-up to offer this in the app.
// The database works out what happens to each team (see 2026-11-10_delete_account.sql); this screen
// shows it, removes the person's own files from storage, then deletes the account and signs out.
export default function DeleteAccount() {
  const [open, setOpen] = useState(false)

  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-3">
        <Trash2 size={18} className="text-red-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-primary">Delete my account</p>
          <p className="text-xs text-muted">Permanently deletes your account and sign-in. You'll see what happens to each of your teams before anything is deleted.</p>
        </div>
      </div>
      <button onClick={() => setOpen(true)}
        className="h-9 px-3 rounded-lg border border-red-500/60 text-red-400 text-sm font-semibold hover:bg-red-500/10">
        Delete my account…
      </button>
      {open && <DeleteDialog onClose={() => setOpen(false)} />}
    </div>
  )
}

const ACTION_TEXT = {
  delete: () => 'Only you are on this team, so it is deleted with everything in it: songs, sets, files and the team roster.',
  handover: heir => `${heir} becomes the Admin. Songs, sets and files you added stay with the team.`,
  leave: () => 'You leave this team. Songs, sets and files you added stay with the team.',
}

function DeleteDialog({ onClose }) {
  const [preview, setPreview] = useState(null)
  const [state, setState] = useState('loading')   // loading | ready | deleting | missing | error
  const [word, setWord] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.rpc('account_deletion_preview').then(({ data, error: err }) => {
      if (err) { setState(/function|schema cache|does not exist/i.test(err.message) ? 'missing' : 'error'); return }
      setPreview(data); setState('ready')
    })
  }, [])

  const teams = preview?.teams || []
  const confirmed = word.trim().toUpperCase() === 'DELETE'

  const remove = async () => {
    setState('deleting'); setError(null)
    // Files go first, while this person can still remove them. Files in teams that stay are kept.
    const files = preview?.files || []
    for (let i = 0; i < files.length; i += 100) {
      await supabase.storage.from('media').remove(files.slice(i, i + 100)).catch(() => {})
    }
    const { error: err } = await supabase.rpc('delete_my_account', { p_confirm: 'DELETE' })
    if (err) { setError('Your account could not be deleted. Please try again, or email us from the Support page.'); setState('ready'); return }
    await clearOfflineData().catch(() => {})
    try { localStorage.clear(); sessionStorage.clear() } catch { /* private mode */ }
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    window.location.replace('/auth?deleted=1')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 bg-black/75" onClick={state === 'deleting' ? undefined : onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="delete-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 space-y-4 max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="delete-title" className="text-lg font-semibold flex items-center gap-2"><AlertTriangle size={18} className="text-red-400" /> Delete your account?</h2>
          <button onClick={onClose} disabled={state === 'deleting'} aria-label="Close" className="text-muted hover:text-primary"><X size={18} /></button>
        </div>

        {state === 'loading' && <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>}
        {state === 'missing' && <p className="text-sm text-muted">Account deletion isn't set up on the server yet. Run the 2026-11-10_delete_account.sql update in Supabase, or email us from the Support page to delete your account.</p>}
        {state === 'error' && <p className="text-sm text-muted">We couldn't load your account details. Please try again in a moment.</p>}

        {preview && state !== 'loading' && (
          <>
            <p className="text-sm">This permanently deletes the StaffList account for <b>{preview.email}</b>. It can't be undone.</p>

            {teams.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Your teams</p>
                <ul className="space-y-2">
                  {teams.map(t => (
                    <li key={t.id} className={`rounded-xl border p-3 text-sm space-y-1 ${t.action === 'delete' ? 'border-red-500/50' : 'border-border'}`}>
                      <p className="font-semibold">{t.name}</p>
                      <p className={t.action === 'delete' ? 'text-red-400' : 'text-muted'}>{ACTION_TEXT[t.action]?.(t.heir || 'Another member')}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ul className="text-xs text-muted list-disc pl-5 space-y-1">
              <li>Your sign-in, notifications and calendar subscription links are deleted.</li>
              <li>If you subscribed through the App Store, deleting your account doesn't cancel it: cancel in your Apple ID settings under Subscriptions.</li>
            </ul>

            <div className="space-y-1.5">
              <label htmlFor="delete-word" className="text-sm">Type <b>DELETE</b> to confirm</label>
              <input id="delete-word" value={word} onChange={e => setWord(e.target.value)} autoComplete="off" autoCapitalize="characters"
                disabled={state === 'deleting'} className="input w-full" placeholder="DELETE" />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="grid grid-cols-2 gap-2">
              <button onClick={onClose} disabled={state === 'deleting'} className="h-10 rounded-lg border border-border text-sm font-semibold text-muted hover:text-primary">Cancel</button>
              <button onClick={remove} disabled={!confirmed || state === 'deleting'}
                className="h-10 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 flex items-center justify-center gap-1.5">
                {state === 'deleting' ? 'Deleting…' : <><Trash2 size={15} /> Delete account</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
