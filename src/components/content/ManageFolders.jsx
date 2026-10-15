import { useState, useMemo, useRef } from 'react'
import {
  deleteLibraryItem, renameLibraryItem, createFolder, renameFolder, deleteFolder, moveItems, moveFolder,
  folderPath, folderAndDescendants, itemSlides, itemBytes, formatBytes, sortFiles,
} from '../../lib/contentLibrary'
import {
  X, Folder, FolderOpen, FolderPlus, FolderInput, Pencil, Trash2, Check, Library, Image, FileText, Monitor, Loader2,
} from 'lucide-react'

// ─── Manage Folders ───────────────────────────────────────────────────────────
// A bookmark-manager style view of the Content Library: the folder tree on the left, the selected folder's
// contents on the right. Create, rename, delete and nest folders; rename, move and delete files — by
// drag and drop or with Move to….

const Checkbox = ({ on, onClick, label }) => (
  <button onClick={e => { e.stopPropagation(); onClick() }} aria-label={label} aria-pressed={on}
    className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
      on ? 'bg-accent border-accent text-white' : 'bg-black/60 border-[#666] text-transparent hover:border-[#aaa]'}`}>
    <Check size={14} strokeWidth={3} />
  </button>
)

// Folder tree, used in the left pane and in the Move dialog.
function FolderTree({ folders, parentId = null, depth = 0, current, onOpen, counts, disabled, dropCls }) {
  const kids = folders.filter(f => (f.parent_id || null) === parentId).sort((a, b) => a.name.localeCompare(b.name))
  return kids.map(f => {
    const active = current === f.id
    const off = disabled?.has(f.id)
    return (
      <div key={f.id}>
        <button data-drop={f.id} onClick={() => !off && onOpen(f.id)} disabled={off}
          className={`w-full flex items-center gap-2 pr-2 py-1.5 rounded-lg text-sm text-left transition-colors disabled:opacity-40 ${
            active ? 'bg-accent/20 text-accent-light font-medium' : 'text-[#e5e5e5] hover:bg-[#2e2e2e]'} ${dropCls?.(f.id) || ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}>
          {active ? <FolderOpen size={15} className="shrink-0" /> : <Folder size={15} className="shrink-0 text-muted" />}
          <span className="flex-1 truncate">{f.name}</span>
          {counts && <span className="text-[11px] text-muted shrink-0">{counts[f.id] || 0}</span>}
        </button>
        <FolderTree folders={folders} parentId={f.id} depth={depth + 1} current={current} onOpen={onOpen} counts={counts}
          disabled={disabled} dropCls={dropCls} />
      </div>
    )
  })
}

function MoveDialog({ folders, count, from, onMove, onClose }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-3 sm:p-6 pt-16 bg-black/70" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm max-h-[70dvh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="font-semibold">Move {count} file{count !== 1 ? 's' : ''} to…</p>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-2 space-y-0.5">
          <button onClick={() => onMove(null)} disabled={from === null}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left hover:bg-[#2e2e2e] disabled:opacity-40">
            <Library size={15} className="text-muted" /> Library (top level)
          </button>
          <FolderTree folders={folders} current={null} onOpen={onMove} disabled={new Set(from ? [from] : [])} />
          {!folders.length && <p className="text-xs text-muted px-2 py-3">No folders yet — create one first.</p>}
        </div>
      </div>
    </div>
  )
}

export default function ManageFolders({ user, items, setItems, folders, setFolders, startFolder = null, onClose }) {
  const [folderId, setFolderId] = useState(startFolder)   // folder shown on the right (null = Library)
  const [selected, setSelected] = useState(() => new Set())
  const [renaming, setRenaming] = useState(null)          // { id, name } — a file or a folder
  const [confirmDel, setConfirmDel] = useState(null)      // file / folder id or 'bulk', waiting for a second tap
  const [newFolder, setNewFolder] = useState(null)        // name being typed for a new folder inside the open folder
  const [moving, setMoving] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const open = id => { setFolderId(id); setSelected(new Set()); setNewFolder(null); setConfirmDel(null); setRenaming(null) }
  const askTwice = id => {
    if (confirmDel === id) return true
    setConfirmDel(id); setTimeout(() => setConfirmDel(c => (c === id ? null : c)), 4000)
    return false
  }

  const counts = useMemo(() => {
    const out = {}
    for (const f of folders) {
      const ids = folderAndDescendants(folders, f.id)
      out[f.id] = items.filter(i => ids.has(i.folder_id)).length
    }
    return out
  }, [folders, items])

  const path = folderPath(folders, folderId)
  const current = path[path.length - 1] || null
  const subfolders = folders.filter(f => (f.parent_id || null) === folderId).sort((a, b) => a.name.localeCompare(b.name))
  const files = sortFiles(items.filter(i => (i.folder_id || null) === folderId))
  const allSelected = files.length > 0 && files.every(i => selected.has(i.id))

  // ── Folders ──
  const addFolder = async () => {
    const name = (newFolder || '').trim()
    setNewFolder(null)
    if (!name) return
    setError(null)
    try { const f = await createFolder(user.id, name, folderId); setFolders(prev => [...prev, f]) }
    catch (e) { setError(e.message) }
  }
  const removeFolder = async f => {
    if (!askTwice(f.id)) return
    setConfirmDel(null)
    try {
      await deleteFolder(f)
      const parent = f.parent_id || null
      setItems(prev => prev.map(i => (i.folder_id === f.id ? { ...i, folder_id: parent } : i)))
      setFolders(prev => prev.filter(x => x.id !== f.id).map(x => (x.parent_id === f.id ? { ...x, parent_id: parent } : x)))
      if (folderId === f.id) setFolderId(parent)
    } catch (e) { setError(e.message) }
  }

  // ── Files ──
  const toggle = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const remove = async item => {
    if (!askTwice(item.id)) return
    setConfirmDel(null)
    try {
      await deleteLibraryItem(item)
      setItems(prev => prev.filter(i => i.id !== item.id))
      setSelected(prev => { const n = new Set(prev); n.delete(item.id); return n })
    } catch (e) { setError(e.message) }
  }
  const removeSelected = async () => {
    if (!askTwice('bulk')) return
    setConfirmDel(null)
    const list = items.filter(i => selected.has(i.id))
    setBusy(`Deleting ${list.length} file${list.length !== 1 ? 's' : ''}…`)
    try { for (const it of list) await deleteLibraryItem(it) } catch (e) { setError(e.message) }
    const gone = new Set(list.map(i => i.id))
    setItems(prev => prev.filter(i => !gone.has(i.id)))
    setSelected(new Set()); setBusy(null)
  }
  const moveSelected = async target => {
    setMoving(false)
    const ids = [...selected]
    const before = items
    setItems(prev => prev.map(i => (selected.has(i.id) ? { ...i, folder_id: target } : i)))
    setSelected(new Set())
    try { await moveItems(ids, target) } catch (e) { setItems(before); setError(e.message) }
  }

  const saveRename = async () => {
    const r = renaming
    setRenaming(null)
    const name = r?.name.trim()
    if (!name) return
    const folder = folders.find(f => f.id === r.id)
    if (folder) {
      if (name === folder.name) return
      setFolders(prev => prev.map(f => (f.id === folder.id ? { ...f, name } : f)))
      try { await renameFolder(folder, name) } catch (e) { setFolders(prev => prev.map(f => (f.id === folder.id ? folder : f))); setError(e.message) }
      return
    }
    const item = items.find(i => i.id === r.id)
    if (!item || name === item.name) return
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, name } : i)))
    try { await renameLibraryItem(item, name) } catch (e) { setItems(prev => prev.map(i => (i.id === item.id ? item : i))); setError(e.message) }
  }

  // ── Drag a file (or the selected files) or a folder onto a folder to move it ──
  // Mouse: press and move. Touch (iPad): press and hold, then drag.
  const [drag, setDrag] = useState(null)   // { files, folder, label, x, y, over }  over: folder id, null = Library, undefined = nothing
  const dragRef = useRef(null)
  const suppressClick = useRef(false)
  const guard = fn => () => { if (!suppressClick.current) fn() }

  const canDropInto = (d, target) => {
    if (!d || target === undefined) return false
    if (d.folder) {
      if (target && folderAndDescendants(folders, d.folder).has(target)) return false
      return (folders.find(f => f.id === d.folder)?.parent_id || null) !== target
    }
    return d.files.some(id => (items.find(i => i.id === id)?.folder_id || null) !== target)
  }
  const dropInto = async (d, target) => {
    setError(null)
    if (d.folder) {
      const before = folders
      setFolders(prev => prev.map(f => (f.id === d.folder ? { ...f, parent_id: target } : f)))
      try { await moveFolder(d.folder, target) } catch (e) { setFolders(before); setError(e.message) }
    } else {
      const before = items
      setItems(prev => prev.map(i => (d.files.includes(i.id) ? { ...i, folder_id: target } : i)))
      setSelected(new Set())
      try { await moveItems(d.files, target) } catch (e) { setItems(before); setError(e.message) }
    }
  }
  const startDrag = (e, kind, id) => {
    if ((e.button !== undefined && e.button !== 0) || e.target.closest('[data-nodrag]') || renaming) return
    const sx = e.clientX, sy = e.clientY, touch = e.pointerType === 'touch'
    const ids = kind === 'file' ? (selected.has(id) ? [...selected] : [id]) : []
    const payload = kind === 'folder'
      ? { files: [], folder: id, label: folders.find(f => f.id === id)?.name || 'Folder' }
      : { files: ids, folder: null, label: ids.length > 1 ? `${ids.length} files` : items.find(i => i.id === id)?.name || 'File' }
    let active = false
    let timer = null
    const cleanup = () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cleanup)
      window.removeEventListener('touchmove', holdStill)
      dragRef.current = null
      setDrag(null)
    }
    const activate = (x, y) => {
      active = true
      dragRef.current = { ...payload, over: undefined }
      setDrag({ ...payload, x, y, over: undefined })
      try { navigator.vibrate?.(10) } catch { /* ignore */ }
    }
    const move = ev => {
      const x = ev.clientX, y = ev.clientY
      if (!active) {
        if (Math.hypot(x - sx, y - sy) < 8) return
        if (touch) { cleanup(); return }   // finger moved before the hold: it's a scroll
        activate(x, y)
      }
      const el = document.elementFromPoint(x, y)?.closest('[data-drop]')
      const over = el ? (el.dataset.drop === 'root' ? null : el.dataset.drop) : undefined
      dragRef.current.over = over
      setDrag(d => d && { ...d, x, y, over })
    }
    const holdStill = ev => { if (active) ev.preventDefault() }   // stop the page scrolling while dragging
    const up = () => {
      const d = dragRef.current
      const wasActive = active
      cleanup()
      if (!wasActive || !d) return
      suppressClick.current = true
      setTimeout(() => { suppressClick.current = false }, 100)
      if (canDropInto(d, d.over)) dropInto(d, d.over)
    }
    if (touch) timer = setTimeout(() => activate(sx, sy), 350)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cleanup)
    window.addEventListener('touchmove', holdStill, { passive: false })
  }
  const dropCls = id => (drag && drag.over === id && canDropInto(drag, id) ? '!bg-accent/25 ring-2 ring-accent' : '')
  const dragging = (kind, id) => drag && (kind === 'folder' ? drag.folder === id : drag.files.includes(id))
  const dragProps = (kind, id) => ({
    onPointerDown: e => startDrag(e, kind, id),
    style: { WebkitTouchCallout: 'none', touchAction: 'pan-y' },
  })

  const renameInput = cls => (
    <input autoFocus className={`input !h-7 !py-0 !px-2 text-xs min-w-0 ${cls}`} value={renaming.name}
      onClick={e => e.stopPropagation()}
      onChange={e => setRenaming(r => ({ ...r, name: e.target.value }))} onBlur={saveRename}
      onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(null) }} />
  )
  const iconBtn = 'p-1.5 rounded-lg text-muted hover:text-[#f5f5f5] hover:bg-[#2e2e2e] shrink-0'
  const delBtn = id => `p-1.5 rounded-lg shrink-0 transition-colors ${confirmDel === id ? 'bg-red-700 text-white' : 'text-muted hover:text-red-400 hover:bg-red-500/10'}`
  const toolBtn = 'flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border text-sm hover:border-[#555] disabled:opacity-40 shrink-0'

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center p-0 sm:p-6 bg-black/80" onClick={onClose}>
      <div className="bg-surface border border-border sm:rounded-2xl w-full max-w-5xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <p className="font-semibold flex items-center gap-2"><FolderInput size={16} className="text-accent-light" /> Manage Folders</p>
          <div className="flex items-center gap-2">
            {busy && <span className="text-xs text-muted flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> {busy}</span>}
            <button onClick={onClose} className="btn-primary !h-8 !py-0 !px-3 text-sm">Done</button>
          </div>
        </div>
        {error && <p className="text-xs text-red-400 px-4 pt-2">{error}</p>}

        <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
          {/* Folder tree */}
          <aside className="sm:w-60 shrink-0 max-h-40 sm:max-h-none overflow-y-auto border-b sm:border-b-0 sm:border-r border-border p-2 space-y-0.5 select-none">
            <button data-drop="root" onClick={() => open(null)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left transition-colors ${
                folderId === null ? 'bg-accent/20 text-accent-light font-medium' : 'text-[#e5e5e5] hover:bg-[#2e2e2e]'} ${dropCls(null)}`}>
              <Library size={15} className="shrink-0" /> <span className="flex-1">Library</span>
              <span className="text-[11px] text-muted">{items.length}</span>
            </button>
            <FolderTree folders={folders} current={folderId} onOpen={open} counts={counts} dropCls={dropCls} />
          </aside>

          {/* Contents of the open folder */}
          <section className="flex-1 min-w-0 min-h-0 flex flex-col">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border">
              <nav className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                <button data-drop="root" onClick={() => open(null)} className={`shrink-0 rounded-md px-1 ${dropCls(null)} ${current ? 'text-muted hover:text-[#f5f5f5]' : 'font-semibold'}`}>Library</button>
                {path.map((f, i) => (
                  <span key={f.id} className="flex items-center gap-1 shrink-0">
                    <span className="text-muted">›</span>
                    {renaming?.id === f.id ? renameInput('w-40') : (
                      <button data-drop={f.id} onClick={() => open(f.id)} className={`rounded-md px-1 ${dropCls(f.id)} ${i === path.length - 1 ? 'font-semibold' : 'text-muted hover:text-[#f5f5f5]'}`}>{f.name}</button>
                    )}
                  </span>
                ))}
              </nav>
              <button onClick={() => setNewFolder('')} className={toolBtn}><FolderPlus size={14} /> New folder</button>
              {current && (
                <>
                  <button onClick={() => setRenaming({ id: current.id, name: current.name })} className={toolBtn}><Pencil size={13} /> Rename</button>
                  <button onClick={() => removeFolder(current)}
                    className={`${toolBtn} ${confirmDel === current.id ? '!bg-red-700 !border-red-700 text-white' : 'text-red-400 hover:bg-red-500/10'}`}>
                    <Trash2 size={13} /> {confirmDel === current.id ? 'Tap to confirm' : 'Delete folder'}
                  </button>
                </>
              )}
            </div>
            {current && confirmDel === current.id && <p className="text-[11px] text-red-300 px-3 pt-1.5">Deleting a folder keeps its files — they move up a level.</p>}

            {newFolder !== null && (
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-[#1a1a1a]">
                <FolderPlus size={15} className="text-accent-light shrink-0" />
                <input autoFocus className="input !h-8 !py-0 text-sm flex-1 min-w-0" placeholder={`New folder in ${current?.name || 'Library'}`} value={newFolder}
                  onChange={e => setNewFolder(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addFolder(); if (e.key === 'Escape') setNewFolder(null) }} />
                <button onClick={addFolder} className="btn-primary !h-8 !py-0 !px-3 text-sm">Create</button>
                <button onClick={() => setNewFolder(null)} className="btn-ghost !h-8 !py-0 !px-2 text-sm">Cancel</button>
              </div>
            )}

            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-accent/10">
                <span className="text-sm font-medium">{selected.size} selected</span>
                <button onClick={() => setSelected(allSelected ? new Set() : new Set(files.map(i => i.id)))} className="text-xs text-accent-light hover:underline">
                  {allSelected ? 'Clear' : 'Select all'}
                </button>
                <div className="ml-auto flex items-center gap-1.5">
                  <button onClick={() => setMoving(true)} className={toolBtn}><FolderInput size={14} /> Move to…</button>
                  <button onClick={removeSelected}
                    className={`${toolBtn} ${confirmDel === 'bulk' ? '!bg-red-700 !border-red-700 text-white' : 'text-red-400 hover:bg-red-500/10'}`}>
                    <Trash2 size={14} /> {confirmDel === 'bulk' ? 'Tap to confirm' : 'Delete'}
                  </button>
                  <button onClick={() => setSelected(new Set())} className={iconBtn} aria-label="Clear selection"><X size={15} /></button>
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              {!subfolders.length && !files.length ? (
                <p className="text-sm text-muted text-center py-12">{current ? `“${current.name}” is empty.` : 'The Library is empty.'}</p>
              ) : (
                <ul className="divide-y divide-border/60 select-none">
                  {subfolders.map(f => (
                    <li key={f.id} data-drop={f.id} {...dragProps('folder', f.id)}
                      className={`flex items-center gap-3 py-2 px-1 rounded-lg transition-colors ${dropCls(f.id)} ${dragging('folder', f.id) ? 'opacity-40' : ''}`}>
                      <span className="w-6" />
                      <button onClick={guard(() => open(f.id))} className="w-14 aspect-video rounded bg-[#1a1a1a] border border-border flex items-center justify-center shrink-0"><Folder size={16} className="text-accent-light" /></button>
                      <div className="flex-1 min-w-0">
                        {renaming?.id === f.id ? renameInput('w-full') : (
                          <button onClick={guard(() => open(f.id))} className="block w-full text-left text-sm font-medium truncate">{f.name}</button>
                        )}
                        <p className="text-[11px] text-muted">Folder · {counts[f.id] || 0} file{counts[f.id] === 1 ? '' : 's'}</p>
                      </div>
                      <button data-nodrag onClick={() => setRenaming({ id: f.id, name: f.name })} className={iconBtn} title="Rename folder" aria-label={`Rename ${f.name}`}><Pencil size={13} /></button>
                      <button data-nodrag onClick={() => removeFolder(f)} className={delBtn(f.id)} title={confirmDel === f.id ? 'Tap again to delete' : 'Delete folder'} aria-label={`Delete ${f.name}`}><Trash2 size={13} /></button>
                    </li>
                  ))}
                  {files.map(item => {
                    const slides = itemSlides(item)
                    const on = selected.has(item.id)
                    return (
                      <li key={item.id} {...dragProps('file', item.id)}
                        className={`flex items-center gap-3 py-2 px-1 rounded-lg ${on ? 'bg-accent/10' : ''} ${dragging('file', item.id) ? 'opacity-40' : ''}`}>
                        <span data-nodrag><Checkbox on={on} onClick={() => toggle(item.id)} label={`Select ${item.name}`} /></span>
                        <span className="w-14 aspect-video rounded bg-[#1a1a1a] border border-border shrink-0 flex items-center justify-center">
                          {!slides.length ? <Monitor size={16} className="text-muted" />
                            : item.type === 'presentation' ? <FileText size={16} className="text-blue-400" />
                            : <Image size={16} className="text-green-400" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          {renaming?.id === item.id ? renameInput('w-full') : <p className="text-sm font-medium truncate" title={item.name}>{item.name}</p>}
                          <p className="text-[11px] text-muted truncate">
                            {item.type === 'presentation' ? `PDF · ${slides.length} slides` : 'Image'}{itemBytes(item) ? ` · ${formatBytes(itemBytes(item))}` : ''}
                          </p>
                          {confirmDel === item.id && <p className="text-[10px] text-red-300">Tap again to delete. Sets that use it will lose these slides.</p>}
                        </div>
                        <button data-nodrag onClick={() => setRenaming({ id: item.id, name: item.name })} className={iconBtn} title="Rename" aria-label={`Rename ${item.name}`}><Pencil size={13} /></button>
                        <button data-nodrag onClick={() => remove(item)} className={delBtn(item.id)} title={confirmDel === item.id ? 'Tap again to delete' : 'Delete'} aria-label={`Delete ${item.name}`}><Trash2 size={13} /></button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <p className="px-3 py-1.5 border-t border-border text-[11px] text-muted">Drag files or folders onto a folder on the left to move them. On iPad, press and hold, then drag.</p>
          </section>
        </div>
      </div>

      {drag && (
        <div className="fixed z-[80] pointer-events-none flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-accent text-white text-xs font-medium shadow-lg max-w-[16rem]"
          style={{ left: drag.x + 14, top: drag.y + 14 }}>
          {drag.folder ? <Folder size={13} /> : <FolderInput size={13} />}
          <span className="truncate">{drag.label}</span>
          {canDropInto(drag, drag.over) && <span className="shrink-0 opacity-80">→ {drag.over ? folders.find(f => f.id === drag.over)?.name : 'Library'}</span>}
        </div>
      )}
      {moving && <MoveDialog folders={folders} count={selected.size} from={folderId} onMove={moveSelected} onClose={() => setMoving(false)} />}
    </div>
  )
}
