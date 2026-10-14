import { useState } from 'react'
import { Folder, FolderPlus, Loader2 } from 'lucide-react'
import { folderOptions } from '../lib/contentLibrary'

// "Save to" folder picker for imports, with a quick "New folder…" option.
export default function FolderSelect({ folders, value, onChange, onCreate, disabled }) {
  const [naming, setNaming] = useState(null)   // new folder name being typed
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const parentName = folders.find(f => f.id === value)?.name

  const create = async () => {
    const name = (naming || '').trim()
    if (!name) { setNaming(null); return }
    setBusy(true); setErr(null)
    try { const f = await onCreate(name, value); onChange(f.id); setNaming(null) }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (naming !== null) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <FolderPlus size={14} className="text-accent-light shrink-0" />
        <input autoFocus className="input !h-8 !py-0 text-sm flex-1 min-w-[8rem]" placeholder={parentName ? `New folder inside ${parentName}` : 'New folder name'} value={naming}
          onChange={e => setNaming(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setNaming(null) }} />
        <button onClick={create} disabled={busy} className="btn-primary !h-8 !py-0 !px-3 text-sm flex items-center gap-1">{busy && <Loader2 size={12} className="animate-spin" />} Create</button>
        <button onClick={() => setNaming(null)} className="btn-ghost !h-8 !py-0 !px-2 text-sm">Cancel</button>
        {err && <p className="w-full text-[11px] text-red-400">{err}</p>}
      </div>
    )
  }
  return (
    <label className="flex items-center gap-1.5 min-w-0">
      <span className="text-xs text-muted shrink-0">Save to</span>
      <span className="relative flex-1 min-w-0">
        <Folder size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent-light pointer-events-none" />
        <select value={value || ''} disabled={disabled} aria-label="Save to folder"
          onChange={e => (e.target.value === '__new' ? setNaming('') : onChange(e.target.value || null))}
          className="input !h-8 !py-0 !pl-8 text-sm w-full">
          <option value="">Library (top level)</option>
          {folderOptions(folders).map(o => <option key={o.id} value={o.id}>{' '.repeat(o.depth + 1)}{o.name}</option>)}
          {onCreate && <option value="__new">{parentName ? `+ New folder inside ${parentName}…` : '+ New folder…'}</option>}
        </select>
      </span>
    </label>
  )
}
