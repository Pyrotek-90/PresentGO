import { useState, useEffect, useMemo } from 'react'
import {
  Folder, FolderOpen, FolderPlus, FolderInput, Library, FileText, Image, Monitor, MoreVertical, Pencil, Trash2,
  X, Check, Archive, Loader2, ChevronRight,
} from 'lucide-react'
import {
  renameFolder, deleteFolder, createFolder, moveFolder, moveItems, renameLibraryItem, deleteLibraryItem,
  folderPath, folderAndDescendants, folderOptions, itemSlides, itemBytes, formatBytes, sortFiles,
  loadMediaUsage, archiveCandidates,
} from '../lib/contentLibrary'

// ─── Manage Folders ───────────────────────────────────────────────────────────
// Like Chrome's bookmark manager: a folder tree on the left, what's inside the chosen folder on the
// right. Rename, move and delete live here (⋮ on each row) instead of on every tile in the library.
// The Archive tab clears out files that haven't been used in a set for a while.

const ARCHIVE_KEY = 'contentLibrary.archiveAfter'
export const ARCHIVE_CHOICES = [0, 10, 20]   // 0 = off

const fileIcon = item => {
  const slides = itemSlides(item)
  if (!slides.length) return <Monitor size={16} className="text-muted" />
  return item.type === 'presentation' ? <FileText size={16} className="text-blue-400" /> : <Image size={16} className="text-green-400" />
}

function TreeNode({ folders, parentId, depth, selected, onSelect, counts }) {
  const kids = folders.filter(f => (f.parent_id || null) === parentId).sort((a, b) => a.name.localeCompare(b.name))
  return kids.map(f => {
    const on = selected === f.id
    return (
      <div key={f.id}>
        <button onClick={() => onSelect(f.id)} style={{ paddingLeft: 8 + depth * 14 }}
          className={`w-full flex items-center gap-2 pr-2 py-1.5 rounded-lg text-sm text-left transition-colors ${on ? 'bg-accent/20 text-accent-light font-medium' : 'text-[#e5e5e5] hover:bg-[#2e2e2e]'}`}>
          {on ? <FolderOpen size={15} className="shrink-0" /> : <Folder size={15} className="shrink-0 text-muted" />}
          <span className="flex-1 truncate">{f.name}</span>
          <span className="text-[11px] text-muted shrink-0">{counts[f.id] || 0}</span>
        </button>
        <TreeNode folders={folders} parentId={f.id} depth={depth + 1} selected={selected} onSelect={onSelect} counts={counts} />
      </div>
    )
  })
}

export default function LibraryManager({ userId, folders, items, setFolders, setItems, startFolder, onClose }) {
  const [tab, setTab] = useState('folders')
  const [sel, setSel] = useState(startFolder || null)     // folder being looked at (null = Library)
  const [menu, setMenu] = useState(null)                  // row id whose actions are open
  const [mode, setMode] = useState(null)                  // { id, kind: 'rename' | 'move' | 'delete', name? }
  const [creating, setCreating] = useState(null)          // new folder name being typed
  const [error, setError] = useState(null)

  const counts = useMemo(() => {
    const out = {}
    for (const f of folders) {
      const ids = folderAndDescendants(folders, f.id)
      out[f.id] = items.filter(i => ids.has(i.folder_id)).length
    }
    return out
  }, [folders, items])

  const path = folderPath(folders, sel)
  const here = path[path.length - 1] || null
  const subFolders = folders.filter(f => (f.parent_id || null) === sel).sort((a, b) => a.name.localeCompare(b.name))
  const files = sortFiles(items.filter(i => (i.folder_id || null) === sel))

  const select = id => { setSel(id); setMenu(null); setMode(null); setCreating(null); setError(null) }
  const fail = e => setError(e?.message || 'Something went wrong — try again.')
  const done = () => { setMode(null); setMenu(null) }

  // ── Folder actions ──
  const addFolder = async () => {
    const name = (creating || '').trim()
    setCreating(null)
    if (!name) return
    try { const f = await createFolder(userId, name, sel); setFolders(prev => [...prev, f]) } catch (e) { fail(e) }
  }
  const doRenameFolder = async (f, name) => {
    done()
    name = name.trim()
    if (!name || name === f.name) return
    setFolders(prev => prev.map(x => (x.id === f.id ? { ...x, name } : x)))
    try { await renameFolder(f, name) } catch (e) { setFolders(prev => prev.map(x => (x.id === f.id ? f : x))); fail(e) }
  }
  const doMoveFolder = async (f, target) => {
    done()
    const before = folders
    setFolders(prev => prev.map(x => (x.id === f.id ? { ...x, parent_id: target } : x)))
    try { await moveFolder(f.id, target) } catch (e) { setFolders(before); fail(e) }
  }
  const doDeleteFolder = async f => {
    done()
    try {
      await deleteFolder(f)
      const parent = f.parent_id || null
      setItems(prev => prev.map(i => (i.folder_id === f.id ? { ...i, folder_id: parent } : i)))
      setFolders(prev => prev.filter(x => x.id !== f.id).map(x => (x.parent_id === f.id ? { ...x, parent_id: parent } : x)))
      if (sel === f.id) setSel(parent)
    } catch (e) { fail(e) }
  }

  // ── File actions ──
  const doRenameFile = async (item, name) => {
    done()
    name = name.trim()
    if (!name || name === item.name) return
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, name } : i)))
    try { await renameLibraryItem(item, name) } catch (e) { setItems(prev => prev.map(i => (i.id === item.id ? item : i))); fail(e) }
  }
  const doMoveFile = async (item, target) => {
    done()
    const before = items
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, folder_id: target } : i)))
    try { await moveItems([item.id], target) } catch (e) { setItems(before); fail(e) }
  }
  const doDeleteFile = async item => {
    done()
    try { await deleteLibraryItem(item); setItems(prev => prev.filter(i => i.id !== item.id)) } catch (e) { fail(e) }
  }

  // One row's inline panel: rename box, move chooser, or delete confirmation.
  const panel = (kind, thing) => {
    const isFolder = kind === 'folder'
    if (mode?.id !== thing.id) return null
    if (mode.kind === 'rename') {
      const submit = () => (isFolder ? doRenameFolder(thing, mode.name) : doRenameFile(thing, mode.name))
      return (
        <div className="flex items-center gap-2 pt-2">
          <input autoFocus className="input !h-8 !py-0 text-sm flex-1 min-w-0" value={mode.name}
            onChange={e => setMode(m => ({ ...m, name: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') done() }} />
          <button onClick={submit} className="btn-primary !h-8 !py-0 !px-3 text-sm">Save</button>
          <button onClick={done} className="btn-ghost !h-8 !py-0 !px-2 text-sm">Cancel</button>
        </div>
      )
    }
    if (mode.kind === 'move') {
      const blocked = isFolder ? folderAndDescendants(folders, thing.id) : new Set()
      const current = isFolder ? (thing.parent_id || null) : (thing.folder_id || null)
      const opts = folderOptions(folders).filter(o => !blocked.has(o.id))
      return (
        <div className="flex items-center gap-2 pt-2">
          <FolderInput size={14} className="text-muted shrink-0" />
          <select autoFocus className="input !h-8 !py-0 text-sm flex-1 min-w-0" defaultValue=""
            onChange={e => { const v = e.target.value; if (v === '') return; const t = v === 'root' ? null : v; if (t !== current) (isFolder ? doMoveFolder(thing, t) : doMoveFile(thing, t)); else done() }}>
            <option value="" disabled>Move to…</option>
            <option value="root">Library (top level){current === null ? ' — current' : ''}</option>
            {opts.map(o => <option key={o.id} value={o.id}>{'  '.repeat(o.depth)}{o.name}{o.id === current ? ' — current' : ''}</option>)}
          </select>
          <button onClick={done} className="btn-ghost !h-8 !py-0 !px-2 text-sm">Cancel</button>
        </div>
      )
    }
    return (
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <p className="text-xs text-red-300 flex-1 min-w-[12rem]">
          {isFolder ? `Delete the folder “${thing.name}”? Its files and folders move up a level.` : `Delete “${thing.name}”? Sets that use it will lose these slides.`}
        </p>
        <button onClick={() => (isFolder ? doDeleteFolder(thing) : doDeleteFile(thing))}
          className="h-8 px-3 rounded-lg bg-red-700 text-white text-sm font-medium flex items-center gap-1.5"><Trash2 size={13} /> Delete</button>
        <button onClick={done} className="btn-ghost !h-8 !py-0 !px-2 text-sm">Cancel</button>
      </div>
    )
  }

  const actions = (kind, thing) => menu !== thing.id ? null : (
    <div className="flex flex-wrap gap-1.5 pt-2">
      {[['rename', Pencil, 'Rename'], ['move', FolderInput, 'Move to…'], ['delete', Trash2, 'Delete']].map(([k, I, label]) => (
        <button key={k} onClick={() => setMode({ id: thing.id, kind: k, name: thing.name })}
          className={`h-8 px-2.5 rounded-lg border text-sm flex items-center gap-1.5 ${mode?.id === thing.id && mode.kind === k ? 'border-accent text-accent-light' : k === 'delete' ? 'border-border text-red-400 hover:bg-red-500/10' : 'border-border hover:border-[#555]'}`}>
          <I size={13} /> {label}
        </button>
      ))}
    </div>
  )

  const row = (kind, thing, icon, title, meta, onOpen) => (
    <li key={thing.id} className={`px-2 py-2 rounded-lg ${menu === thing.id ? 'bg-[#242424]' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="w-8 h-8 rounded bg-[#1a1a1a] border border-border flex items-center justify-center shrink-0">{icon}</span>
        {onOpen
          ? <button onClick={onOpen} className="flex-1 min-w-0 text-left"><span className="block text-sm font-medium truncate">{title}</span><span className="block text-[11px] text-muted truncate">{meta}</span></button>
          : <div className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{title}</span><span className="block text-[11px] text-muted truncate">{meta}</span></div>}
        <button onClick={() => { setMenu(m => (m === thing.id ? null : thing.id)); setMode(null) }} aria-label={`Options for ${thing.name}`} aria-expanded={menu === thing.id}
          className={`p-2 rounded-lg shrink-0 ${menu === thing.id ? 'bg-[#2e2e2e] text-[#f5f5f5]' : 'text-muted hover:text-[#f5f5f5] hover:bg-[#2e2e2e]'}`}><MoreVertical size={16} /></button>
      </div>
      {actions(kind, thing)}
      {panel(kind, thing)}
    </li>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-black/75" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-4xl h-[min(44rem,calc(100dvh-1.5rem))] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <p className="font-semibold flex-1">Manage Library</p>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {[['folders', FolderOpen, 'Folders'], ['archive', Archive, 'Archive']].map(([k, I, label]) => (
              <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
                className={`h-8 px-3 flex items-center gap-1.5 text-sm transition-colors ${tab === k ? 'bg-accent/20 text-accent-light' : 'bg-[#1a1a1a] text-muted hover:text-[#f5f5f5]'}`}>
                <I size={14} /> {label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg" aria-label="Close"><X size={18} /></button>
        </div>

        {tab === 'folders' ? (
          <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
            <div className="sm:w-60 shrink-0 max-h-40 sm:max-h-none overflow-y-auto p-2 border-b sm:border-b-0 sm:border-r border-border space-y-0.5">
              <button onClick={() => select(null)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left transition-colors ${sel === null ? 'bg-accent/20 text-accent-light font-medium' : 'text-[#e5e5e5] hover:bg-[#2e2e2e]'}`}>
                <Library size={15} className="shrink-0" /> <span className="flex-1">Library</span>
                <span className="text-[11px] text-muted">{items.length}</span>
              </button>
              <TreeNode folders={folders} parentId={null} depth={1} selected={sel} onSelect={select} counts={counts} />
            </div>
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <nav className="flex items-center gap-1 flex-1 min-w-0 text-sm overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                  <button onClick={() => select(null)} className={`shrink-0 ${here ? 'text-muted hover:text-[#f5f5f5]' : 'font-semibold'}`}>Library</button>
                  {path.map((f, i) => (
                    <span key={f.id} className="flex items-center gap-1 shrink-0">
                      <ChevronRight size={13} className="text-muted" />
                      <button onClick={() => select(f.id)} className={i === path.length - 1 ? 'font-semibold' : 'text-muted hover:text-[#f5f5f5]'}>{f.name}</button>
                    </span>
                  ))}
                </nav>
                <button onClick={() => setCreating('')}
                  className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-accent/50 text-accent-light text-sm font-medium hover:bg-accent/10 shrink-0">
                  <FolderPlus size={14} /> New Folder
                </button>
              </div>
              {creating !== null && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-[#1a1a1a]">
                  <FolderPlus size={15} className="text-accent-light shrink-0" />
                  <input autoFocus className="input !h-8 !py-0 text-sm flex-1 min-w-0" placeholder={`New folder in ${here?.name || 'Library'}`} value={creating}
                    onChange={e => setCreating(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addFolder(); if (e.key === 'Escape') setCreating(null) }} />
                  <button onClick={addFolder} className="btn-primary !h-8 !py-0 !px-3 text-sm">Create</button>
                  <button onClick={() => setCreating(null)} className="btn-ghost !h-8 !py-0 !px-2 text-sm">Cancel</button>
                </div>
              )}
              {error && <p className="px-3 pt-2 text-xs text-red-400">{error}</p>}
              <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {here && row('folder', here, <FolderOpen size={16} className="text-accent-light" />, `${here.name} (this folder)`,
                  `${counts[here.id] || 0} file${counts[here.id] === 1 ? '' : 's'} inside`)}
                {here && <li className="border-t border-border/60 my-1" aria-hidden="true" />}
                {subFolders.map(f => row('folder', f, <Folder size={16} className="text-accent-light" />, f.name,
                  `Folder · ${counts[f.id] || 0} file${counts[f.id] === 1 ? '' : 's'}`, () => select(f.id)))}
                {files.map(item => row('file', item, fileIcon(item), item.name,
                  `${itemSlides(item).length ? (item.type === 'presentation' ? `PDF · ${itemSlides(item).length} slides` : 'Image') : 'Old file'}${itemBytes(item) ? ` · ${formatBytes(itemBytes(item))}` : ''}`))}
                {!subFolders.length && !files.length && <li className="text-sm text-muted text-center py-10">Nothing in {here?.name || 'the Library'} yet.</li>}
              </ul>
            </div>
          </div>
        ) : (
          <ArchiveTab userId={userId} items={items} setItems={setItems} />
        )}
      </div>
    </div>
  )
}

function ArchiveTab({ userId, items, setItems }) {
  const [after, setAfter] = useState(() => { try { const v = Number(localStorage.getItem(ARCHIVE_KEY)); return ARCHIVE_CHOICES.includes(v) ? v : 0 } catch { return 0 } })
  const [usage, setUsage] = useState(null)
  const [err, setErr] = useState(null)
  const [skip, setSkip] = useState(() => new Set())   // candidates the user unticked
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    if (!userId) { setUsage({}); return }
    let live = true
    loadMediaUsage(userId).then(u => live && setUsage(u)).catch(e => live && setErr(e.message))
    return () => { live = false }
  }, [userId])

  const choose = n => { setAfter(n); setSkip(new Set()); setConfirm(false); try { localStorage.setItem(ARCHIVE_KEY, String(n)) } catch { /* ignore */ } }
  const cands = useMemo(() => (usage && after ? archiveCandidates(items, usage, after) : []), [items, usage, after])
  const picked = cands.filter(i => !skip.has(i.id))
  const bytes = picked.reduce((n, i) => n + itemBytes(i), 0)
  const neverUsed = usage ? items.filter(i => !usage[i.id]).length : 0
  const toggle = id => { setConfirm(false); setSkip(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  const run = async () => {
    if (!confirm) { setConfirm(true); setTimeout(() => setConfirm(false), 4000); return }
    setConfirm(false)
    const list = picked
    try {
      for (let i = 0; i < list.length; i++) {
        setBusy(`Deleting ${i + 1} of ${list.length}…`)
        await deleteLibraryItem(list[i])
        setItems(prev => prev.filter(x => x.id !== list[i].id))
      }
    } catch (e) { setErr(e.message) } finally { setBusy(null) }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      <div>
        <p className="text-sm font-medium">Archive files that haven’t been used in a while</p>
        <p className="text-xs text-muted mt-1">Pick how far back a file’s last use can be. Files last used in a set older than that are listed below to review and delete. Files in upcoming sets are always kept, and nothing is deleted until you confirm.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Archive files last used">
        {ARCHIVE_CHOICES.map(n => (
          <button key={n} role="radio" aria-checked={after === n} onClick={() => choose(n)}
            className={`h-9 px-3.5 rounded-lg border text-sm transition-colors ${after === n ? 'border-accent bg-accent/15 text-accent-light font-medium' : 'border-border hover:border-[#555]'}`}>
            {n === 0 ? 'Off' : `Last used ${n}+ sets ago`}
          </button>
        ))}
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      {!after ? (
        <p className="text-sm text-muted">Archiving is off. Choose 10 or 20 sets to see which files are ready to clear out.</p>
      ) : !usage ? (
        <p className="text-sm text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Checking your sets…</p>
      ) : !cands.length ? (
        <p className="text-sm text-muted">Nothing to archive — every file that’s been used was used within your last {after} sets.{neverUsed ? ` (${neverUsed} file${neverUsed !== 1 ? 's have' : ' has'} never been used in a set and ${neverUsed !== 1 ? 'are' : 'is'} never archived.)` : ''}</p>
      ) : (
        <>
          <ul className="rounded-xl border border-border divide-y divide-border/60">
            {cands.map(i => {
              const u = usage[i.id]
              const on = !skip.has(i.id)
              return (
                <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                  <button onClick={() => toggle(i.id)} aria-pressed={on} aria-label={`${on ? 'Keep' : 'Delete'} ${i.name}`}
                    className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-accent border-accent text-white' : 'border-[#666] text-transparent'}`}><Check size={14} strokeWidth={3} /></button>
                  <span className="w-8 h-8 rounded bg-[#1a1a1a] border border-border flex items-center justify-center shrink-0">{fileIcon(i)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{i.name}</p>
                    <p className="text-[11px] text-muted truncate">Last used in “{u.setName}”{u.date ? ` · ${new Date(u.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''} · {u.rank} sets ago</p>
                  </div>
                  <span className="text-[11px] text-muted shrink-0">{itemBytes(i) ? formatBytes(itemBytes(i)) : ''}</span>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={run} disabled={!picked.length || !!busy}
              className={`h-9 px-4 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50 ${confirm ? 'bg-red-700 text-white' : 'border border-border text-red-400 hover:bg-red-500/10'}`}>
              {busy ? <><Loader2 size={14} className="animate-spin" /> {busy}</> : <><Trash2 size={14} /> {confirm ? 'Tap again to delete' : `Delete ${picked.length} file${picked.length !== 1 ? 's' : ''} · ${formatBytes(bytes)}`}</>}
            </button>
            <p className="text-[11px] text-muted flex-1 min-w-[12rem]">Past sets that used these files will lose their slides.{neverUsed ? ` ${neverUsed} never-used file${neverUsed !== 1 ? 's are' : ' is'} not included.` : ''}</p>
          </div>
        </>
      )}
    </div>
  )
}
