import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useChurch } from '../contexts/ChurchContext'
import Layout from '../components/Layout'
import FolderSelect from '../components/FolderSelect'
import LibraryManager from '../components/LibraryManager'
import {
  ACCEPT, readImports, saveImport, itemSlides, deleteLibraryItem,
  loadLibrary, createFolder, moveItems, moveFolder, folderPath, folderAndDescendants,
  itemBytes, formatBytes, sortFiles,
} from '../lib/contentLibrary'
import {
  Upload, Image, Monitor, FileText, Trash2, X, Folder, FolderOpen, FolderPlus, FolderInput, FolderCog, Check,
  Loader2, Search, HardDrive, List, LayoutGrid, ChevronRight, Library,
} from 'lucide-react'

// ─── Content Library ──────────────────────────────────────────────────────────
// PDFs and images only (keeps storage small), organised in folders such as Announcements or
// Sermons. A PDF with several pages is one file with several slides.

const VIEW_KEY = 'contentLibrary.view'

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const fileMeta = item => {
  const n = itemSlides(item).length
  if (!n) return 'Old file — re-import as a PDF'
  return item.type === 'presentation' ? `PDF · ${n} slides` : 'Image'
}

function ImportReview({ groups, busy, error, folderSelect, onChangeName, onCancel, onSave }) {
  const total = groups.reduce((n, g) => n + g.pages.length, 0)
  return (
    <div className="card space-y-3 border-accent/40">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-sm">
          Ready to add {groups.length === 1 ? '1 file' : `${groups.length} files`} · {total} slide{total !== 1 ? 's' : ''}
        </p>
        <button onClick={onCancel} disabled={!!busy} className="btn-ghost p-1 rounded-lg" aria-label="Cancel import"><X size={16} /></button>
      </div>
      {folderSelect}
      {groups.map((g, gi) => (
        <div key={gi} className="rounded-lg border border-border p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            {g.pages.length > 1 ? <Monitor size={15} className="text-blue-400 shrink-0" /> : <Image size={15} className="text-green-400 shrink-0" />}
            <input className="input !h-8 !py-0 text-sm flex-1 min-w-0" value={g.name} onChange={e => onChangeName(gi, e.target.value)}
              placeholder="Name, e.g. Sermon – Oct 18" aria-label="File name" />
            <span className="text-[11px] text-muted shrink-0">{g.pages.length} slide{g.pages.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {g.pages.slice(0, 12).map((p, i) => (
              <img key={i} src={p.url} alt="" className="h-12 aspect-video object-contain rounded border border-border bg-black shrink-0" />
            ))}
            {g.pages.length > 12 && <span className="self-center text-[11px] text-muted shrink-0 px-1">+{g.pages.length - 12} more</span>}
          </div>
        </div>
      ))}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={onSave} disabled={!!busy} className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-60">
          {busy ? <><Loader2 size={14} className="animate-spin" /> {busy}</> : <><Check size={14} /> Save to Content Library</>}
        </button>
        {!busy && <button onClick={onCancel} className="btn-ghost text-sm">Cancel</button>}
      </div>
    </div>
  )
}

function SlidesViewer({ item, onClose }) {
  const slides = itemSlides(item)
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-black/80" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-4xl max-h-[calc(100dvh-1.5rem)] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <p className="font-semibold truncate">{item.name} <span className="text-xs text-muted font-normal">· {slides.length} slide{slides.length !== 1 ? 's' : ''}</span></p>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {slides.map((s, i) => (
            <div key={i} className="relative rounded-lg overflow-hidden border border-border bg-black aspect-video">
              <img src={s.url} alt={`Slide ${i + 1}`} className="w-full h-full object-contain" loading="lazy" />
              <span className="absolute bottom-1 left-1.5 text-[10px] text-white/70">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Folder tree, used in the side pane and the Move dialog.
function FolderTree({ folders, parentId = null, depth = 0, current, onOpen, counts, disabled }) {
  const kids = folders.filter(f => (f.parent_id || null) === parentId).sort((a, b) => a.name.localeCompare(b.name))
  return kids.map(f => {
    const active = current === f.id
    const off = disabled?.has(f.id)
    return (
      <div key={f.id}>
        <button onClick={() => !off && onOpen(f.id)} disabled={off}
          className={`w-full flex items-center gap-2 pr-2 py-1.5 rounded-lg text-sm text-left transition-colors disabled:opacity-40 ${
            active ? 'bg-accent/20 text-accent-light font-medium' : 'text-[#e5e5e5] hover:bg-[#2e2e2e]'}`}
          style={{ paddingLeft: 8 + depth * 14 }}>
          {active ? <FolderOpen size={15} className="shrink-0" /> : <Folder size={15} className="shrink-0 text-muted" />}
          <span className="flex-1 truncate">{f.name}</span>
          {counts && <span className="text-[11px] text-muted shrink-0">{counts[f.id] || 0}</span>}
        </button>
        <FolderTree folders={folders} parentId={f.id} depth={depth + 1} current={current} onOpen={onOpen} counts={counts} disabled={disabled} />
      </div>
    )
  })
}

function MoveDialog({ folders, count, from, onMove, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 pt-16 bg-black/70" onClick={onClose}>
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

const Checkbox = ({ on, onClick, label, className = '' }) => (
  <button onClick={e => { e.stopPropagation(); onClick() }} aria-label={label} aria-pressed={on}
    className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
      on ? 'bg-accent border-accent text-white' : 'bg-black/60 border-[#666] text-transparent hover:border-[#aaa]'} ${className}`}>
    <Check size={14} strokeWidth={3} />
  </button>
)

export default function ContentLibrary() {
  const { user } = useAuth()
  const { scope } = useChurch()
  const [items, setItems]       = useState([])
  const [folders, setFolders]   = useState([])
  const [foldersReady, setFoldersReady] = useState(true)
  const [loading, setLoading]   = useState(true)
  const [folderId, setFolderId] = useState(null)   // null = top level
  const [query, setQuery]       = useState('')
  const [view, setView]         = useState(() => { try { return localStorage.getItem(VIEW_KEY) || 'preview' } catch { return 'preview' } })
  const [selected, setSelected] = useState(() => new Set())
  const [review, setReview]     = useState(null)   // groups waiting to be saved
  const [dest, setDest]         = useState(null)   // folder the import is saved to
  const [busy, setBusy]         = useState(null)
  const [error, setError]       = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [viewing, setViewing]   = useState(null)
  const [managing, setManaging] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)   // id of file / folder / 'bulk' waiting for a second tap
  const [newFolder, setNewFolder]   = useState(null)   // name being typed
  const [moving, setMoving]     = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    let live = true
    loadLibrary(scope).then(r => {
      if (!live) return
      setItems(r.items); setFolders(r.folders); setFoldersReady(r.foldersReady); setLoading(false)
    })
    return () => { live = false }
  }, [scope.churchId])   // eslint-disable-line react-hooks/exhaustive-deps

  const chooseView = v => { setView(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ } }
  const openFolder = id => { setFolderId(id); setSelected(new Set()); setQuery(''); setNewFolder(null); setConfirmDel(null) }
  const askTwice = id => {
    if (confirmDel === id) return true
    setConfirmDel(id); setTimeout(() => setConfirmDel(c => (c === id ? null : c)), 4000)
    return false
  }

  // Counts include files in sub-folders.
  const counts = useMemo(() => {
    const out = {}
    for (const f of folders) {
      const ids = folderAndDescendants(folders, f.id)
      out[f.id] = items.filter(i => ids.has(i.folder_id)).length
    }
    return out
  }, [folders, items])
  const totalBytes = useMemo(() => items.reduce((n, i) => n + itemBytes(i), 0), [items])
  const path = folderPath(folders, folderId)
  const current = path[path.length - 1] || null
  const folderName = current?.name || 'Library'

  const q = query.trim().toLowerCase()
  const shownFolders = (q ? folders.filter(f => f.name.toLowerCase().includes(q)) : folders.filter(f => (f.parent_id || null) === folderId))
    .sort((a, b) => a.name.localeCompare(b.name))
  const shownFiles = sortFiles(q ? items.filter(i => i.name.toLowerCase().includes(q)) : items.filter(i => (i.folder_id || null) === folderId))
  const folderLabel = id => folderPath(folders, id).map(f => f.name).join(' › ') || 'Library'

  // ── Import ──
  const pickFiles = async files => {
    if (!files?.length) return
    setError(null); setBusy('Reading…')
    try {
      const groups = await readImports(files, msg => setBusy(`Reading ${msg}…`))
      setDest(folderId); setReview(groups)
    } catch (e) {
      setError(e.message || 'Could not read that file.')
    } finally { setBusy(null) }
  }
  const saveReview = async () => {
    setError(null)
    try {
      const saved = []
      for (let gi = 0; gi < review.length; gi++) {
        const g = review[gi]
        saved.push(await saveImport(scope, g, g.name,
          (i, n) => setBusy(`Uploading ${review.length > 1 ? `file ${gi + 1} of ${review.length}, ` : ''}slide ${i} of ${n}…`),
          foldersReady ? dest : null))
      }
      review.forEach(g => g.pages.forEach(p => URL.revokeObjectURL(p.url)))
      setItems(prev => [...saved.reverse(), ...prev])
      setReview(null); setQuery('')
      if (foldersReady && dest !== folderId) openFolder(dest)
    } catch (e) {
      setError(/full \(/.test(e.message || '') ? e.message : `${e.message || 'Upload failed'} — try again.`)
    } finally { setBusy(null) }
  }
  const cancelReview = () => {
    review?.forEach(g => g.pages.forEach(p => URL.revokeObjectURL(p.url)))
    setReview(null); setError(null)
  }

  // ── Folders ──
  const addFolder = async () => {
    const name = (newFolder || '').trim()
    setNewFolder(null)
    if (!name) return
    setError(null)
    try { const f = await createFolder(scope, name, folderId); setFolders(prev => [...prev, f]) }
    catch (e) { setError(e.message) }
  }

  // ── Files ──
  const toggle = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const removeSelected = async () => {
    if (!askTwice('bulk')) return
    setConfirmDel(null)
    const list = items.filter(i => selected.has(i.id))
    setBusy(`Deleting ${list.length} file${list.length !== 1 ? 's' : ''}…`)
    for (const it of list) await deleteLibraryItem(it)
    setItems(prev => prev.filter(i => !selected.has(i.id)))
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

  // ── Drag a file (or the selected files) or a folder onto a folder or a path crumb to move it ──
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
    if ((e.button !== undefined && e.button !== 0) || e.target.closest('[data-nodrag]') || !foldersReady) return
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
  const dropCls = id => (drag && drag.over === id && canDropInto(drag, id) ? '!border-accent ring-2 ring-accent bg-accent/15' : '')
  const dragging = (kind, id) => drag && (kind === 'folder' ? drag.folder === id : drag.files.includes(id))
  const dragProps = (kind, id) => ({
    onPointerDown: e => startDrag(e, kind, id),
    style: { WebkitTouchCallout: 'none', touchAction: 'pan-y' },
  })

  const iconBtn = 'p-1.5 rounded-lg text-muted hover:text-[#f5f5f5] hover:bg-[#2e2e2e] shrink-0'

  const allShownSelected = shownFiles.length > 0 && shownFiles.every(i => selected.has(i.id))
  const empty = !shownFolders.length && !shownFiles.length

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-3"
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={e => { if (e.currentTarget === e.target) setDragOver(false) }}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (!review) pickFiles(e.dataTransfer.files) }}>


        {busy && !review && <p className="text-xs text-muted flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> {busy}</p>}
        {error && !review && <p className="text-xs text-red-400">{error}</p>}
        {!foldersReady && !loading && (
          <p className="text-xs text-amber-300 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">Folders need a one-time database update — run the content folders SQL in Supabase, then reload.</p>
        )}
        {review && <ImportReview groups={review} busy={busy} error={error} onCancel={cancelReview} onSave={saveReview}
          folderSelect={foldersReady && <FolderSelect folders={folders} value={dest} onChange={setDest} disabled={!!busy}
            onCreate={async (name, parent) => { const f = await createFolder(scope, name, parent); setFolders(prev => [...prev, f]); return f }} />}
          onChangeName={(gi, name) => setReview(r => r.map((g, i) => (i === gi ? { ...g, name } : g)))} />}

          {/* Files pane */}
          <section className={`flex-1 min-w-0 rounded-xl border bg-card overflow-hidden ${dragOver ? 'border-accent ring-2 ring-accent/40' : 'border-border'}`}>
            {/* Header: Library path · folder actions · search · List / Tiles · Import */}
            <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden"
              onChange={e => { pickFiles(e.target.files); e.target.value = '' }} />
            <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-border">
              {q ? (
                <p className="text-sm font-medium flex-1 min-w-0 truncate">Results for “{query.trim()}”</p>
              ) : (
                <nav className="flex items-center gap-1 flex-1 min-w-0 text-sm overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                  <h1 className="shrink-0"><button data-drop="root" onClick={() => openFolder(null)} className={`flex items-center gap-1.5 text-base rounded-md px-1 -mx-1 ${dropCls(null)} ${current ? 'text-muted hover:text-[#f5f5f5]' : 'font-semibold'}`}><Library size={15} /> Library</button></h1>
                  {path.map((f, i) => (
                    <span key={f.id} className="flex items-center gap-1 shrink-0">
                      <ChevronRight size={14} className="text-muted" />
                      <button data-drop={f.id} onClick={() => openFolder(f.id)} className={`text-base rounded-md px-1 ${dropCls(f.id)} ${i === path.length - 1 ? 'font-semibold' : 'text-muted hover:text-[#f5f5f5]'}`}>{f.name}</button>
                    </span>
                  ))}
                </nav>
              )}
              <div className="relative order-last w-full sm:order-none sm:w-48 lg:w-56">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input className="input !pl-9 !h-8 text-sm" placeholder="Search all folders…" value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
                {[['list', List, 'List view'], ['preview', LayoutGrid, 'Tiles view']].map(([v, I, t]) => (
                  <button key={v} onClick={() => chooseView(v)} title={t} aria-label={t} aria-pressed={view === v}
                    className={`h-8 w-9 flex items-center justify-center transition-colors ${view === v ? 'bg-accent/20 text-accent-light' : 'bg-[#1a1a1a] text-muted hover:text-[#f5f5f5]'}`}>
                    <I size={15} />
                  </button>
                ))}
              </div>
              <button onClick={() => setManaging(true)} disabled={!foldersReady} title="Manage folders" aria-label="Manage folders"
                className="h-8 w-9 lg:w-auto lg:px-3 flex items-center justify-center gap-1.5 rounded-lg border border-accent/50 text-accent-light text-sm font-medium hover:bg-accent/10 shrink-0 disabled:opacity-40">
                <FolderCog size={15} /><span className="hidden lg:inline">Manage Folders</span>
              </button>
              <button onClick={() => setNewFolder('')} disabled={!foldersReady || !!q} title="New folder" aria-label="New folder"
                className="h-8 w-9 lg:w-auto lg:px-3 flex items-center justify-center gap-1.5 rounded-lg border border-accent/50 text-accent-light text-sm font-medium hover:bg-accent/10 shrink-0 disabled:opacity-40">
                <FolderPlus size={15} /><span className="hidden lg:inline">New Folder</span>
              </button>
              <button onClick={() => fileRef.current?.click()} disabled={!!busy || !!review}
                className="btn-primary shrink-0 flex items-center justify-center gap-1.5 !h-8 !py-0 w-9 lg:w-auto !px-0 lg:!px-3 text-sm disabled:opacity-60" title="Import PDF or Image" aria-label="Import PDF or Image">
                {busy && !review ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                <span className="hidden lg:inline">Import</span>
              </button>
            </div>

            {newFolder !== null && (
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-[#1a1a1a]">
                <FolderPlus size={15} className="text-accent-light shrink-0" />
                <input autoFocus className="input !h-8 !py-0 text-sm flex-1 min-w-0" placeholder="Folder name, e.g. Sermons" value={newFolder}
                  onChange={e => setNewFolder(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addFolder(); if (e.key === 'Escape') setNewFolder(null) }} />
                <button onClick={addFolder} className="btn-primary !h-8 !py-0 !px-3 text-sm">Create</button>
                <button onClick={() => setNewFolder(null)} className="btn-ghost !h-8 !py-0 !px-2 text-sm">Cancel</button>
              </div>
            )}

            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-accent/10">
                <span className="text-sm font-medium">{selected.size} selected</span>
                <button onClick={() => setSelected(allShownSelected ? new Set() : new Set(shownFiles.map(i => i.id)))} className="text-xs text-accent-light hover:underline">
                  {allShownSelected ? 'Clear' : 'Select all'}
                </button>
                <div className="ml-auto flex items-center gap-1.5">
                  <button onClick={() => setMoving(true)} disabled={!foldersReady}
                    className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border text-sm hover:border-[#555] disabled:opacity-40"><FolderInput size={14} /> Move to…</button>
                  <button onClick={removeSelected}
                    className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-sm transition-colors ${confirmDel === 'bulk' ? 'bg-red-700 border-red-700 text-white' : 'border-border text-red-400 hover:bg-red-500/10'}`}>
                    <Trash2 size={14} /> {confirmDel === 'bulk' ? 'Tap to confirm' : 'Delete'}
                  </button>
                  <button onClick={() => setSelected(new Set())} className={iconBtn} aria-label="Clear selection"><X size={15} /></button>
                </div>
              </div>
            )}

            <div className="p-3">
              {loading ? (
                <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
              ) : empty ? (
                q ? <p className="text-sm text-muted text-center py-10">Nothing matches “{query.trim()}”.</p> : (
                  <button onClick={() => fileRef.current?.click()}
                    className={`w-full rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}`}>
                    <Upload size={28} className="mx-auto text-accent-light mb-2" />
                    <p className="text-sm font-medium">{current ? `“${current.name}” is empty` : 'Import a PDF or an image'}</p>
                    <p className="text-xs text-muted mt-1">Drop files here or tap to choose — they’ll be saved in {folderName}. PowerPoint or Keynote? Export to PDF first.</p>
                  </button>
                )
              ) : view === 'list' ? (
                <ul className="divide-y divide-border/60 -my-1 select-none">
                  {shownFolders.map(f => (
                    <li key={f.id} data-drop={f.id} {...dragProps('folder', f.id)}
                      className={`flex items-center gap-3 py-2 px-1 rounded-lg transition-colors ${dropCls(f.id)} ${dragging('folder', f.id) ? 'opacity-40' : ''}`}>
                      <span className="w-6" />
                      <button onClick={guard(() => openFolder(f.id))} className="w-16 aspect-video rounded bg-[#1a1a1a] border border-border flex items-center justify-center shrink-0"><Folder size={18} className="text-accent-light" /></button>
                      <div className="flex-1 min-w-0">
                        <button onClick={guard(() => openFolder(f.id))} className="block w-full text-left text-sm font-medium truncate">{f.name}</button>
                        <p className="text-[11px] text-muted truncate">Folder · {counts[f.id] || 0} file{counts[f.id] === 1 ? '' : 's'}{q && f.parent_id ? ` · in ${folderLabel(f.parent_id)}` : ''}</p>
                      </div>
                    </li>
                  ))}
                  {shownFiles.map(item => {
                    const slides = itemSlides(item)
                    const on = selected.has(item.id)
                    return (
                      <li key={item.id} {...dragProps('file', item.id)}
                        className={`flex items-center gap-3 py-2 px-1 rounded-lg ${on ? 'bg-accent/10' : ''} ${dragging('file', item.id) ? 'opacity-40' : ''}`}>
                        <span data-nodrag><Checkbox on={on} onClick={() => toggle(item.id)} label={`Select ${item.name}`} /></span>
                        <button onClick={guard(() => slides.length && setViewing(item))} title={fileMeta(item)}
                          className="w-16 aspect-video rounded bg-[#1a1a1a] border border-border shrink-0 flex items-center justify-center">
                          {!slides.length ? <Monitor size={18} className="text-muted" />
                            : item.type === 'presentation' ? <FileText size={18} className="text-blue-400" />
                            : <Image size={18} className="text-green-400" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <button onClick={guard(() => slides.length && setViewing(item))} className="block w-full text-left text-sm font-medium truncate" title={item.name}>{item.name}</button>
                          <p className="text-[11px] text-muted truncate">
                            {fileMeta(item)} · {formatDate(item.created_at)}{itemBytes(item) ? ` · ${formatBytes(itemBytes(item))}` : ''}{q ? ` · ${folderLabel(item.folder_id)}` : ''}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 select-none">
                  {shownFolders.map(f => (
                    <div key={f.id} data-drop={f.id} {...dragProps('folder', f.id)}
                      className={`rounded-xl border border-border bg-[#1a1a1a] overflow-hidden hover:border-[#555] transition-colors ${dropCls(f.id)} ${dragging('folder', f.id) ? 'opacity-40' : ''}`}>
                      <button onClick={guard(() => openFolder(f.id))} className="flex w-full aspect-video items-center justify-center">
                        <Folder size={40} className="text-accent-light" strokeWidth={1.5} />
                      </button>
                      <div className="flex items-center gap-1 px-2 py-1.5 border-t border-border">
                        <button onClick={guard(() => openFolder(f.id))} className="flex-1 min-w-0 text-left">
                          <span className="block text-sm font-medium truncate">{f.name}</span>
                          <span className="block text-[10px] text-muted truncate">{counts[f.id] || 0} file{counts[f.id] === 1 ? '' : 's'}{q && f.parent_id ? ` · in ${folderLabel(f.parent_id)}` : ''}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  {shownFiles.map(item => {
                    const slides = itemSlides(item)
                    const on = selected.has(item.id)
                    const old = slides.length === 0
                    return (
                      <div key={item.id} {...dragProps('file', item.id)}
                        className={`rounded-xl border overflow-hidden ${on ? 'border-accent ring-1 ring-accent' : 'border-border'} bg-[#1a1a1a] ${dragging('file', item.id) ? 'opacity-40' : ''}`}>
                        <div className="relative">
                          <button onClick={guard(() => !old && setViewing(item))} disabled={old} className="relative block w-full aspect-video bg-black">
                            {old ? (
                              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted text-[11px] px-2 text-center">
                                <Monitor size={20} /> Old file — re-import as a PDF to use it as slides
                              </span>
                            ) : <img src={slides[0].url} alt="" draggable={false} className="w-full h-full object-contain" loading="lazy" />}
                            {slides.length > 1 && (
                              <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 px-1.5 h-5 rounded bg-black/75 text-white text-[10px]">
                                <Monitor size={10} /> {slides.length}
                              </span>
                            )}
                          </button>
                          <span data-nodrag className="absolute top-1.5 left-1.5"><Checkbox on={on} onClick={() => toggle(item.id)} label={`Select ${item.name}`} /></span>
                        </div>
                        <div className="flex items-center gap-1 px-2 py-1.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" title={item.name}>{item.name}</p>
                            <p className="text-[10px] text-muted truncate">{fileMeta(item)} · {q ? folderLabel(item.folder_id) : formatDate(item.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {/* Footer: storage used */}
            <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border bg-[#1a1a1a] text-xs text-muted">
              <HardDrive size={14} className="text-accent-light shrink-0" />
              <span><span className="text-[#f5f5f5] font-medium">{formatBytes(totalBytes)}</span> used · {items.length} file{items.length !== 1 ? 's' : ''}{folders.length ? ` · ${folders.length} folder${folders.length !== 1 ? 's' : ''}` : ''}</span>
            </div>
          </section>
      </div>
      {drag && (
        <div className="fixed z-[60] pointer-events-none flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-accent text-white text-xs font-medium shadow-lg max-w-[16rem]"
          style={{ left: drag.x + 14, top: drag.y + 14 }}>
          {drag.folder ? <Folder size={13} /> : <FolderInput size={13} />}
          <span className="truncate">{drag.label}</span>
          {canDropInto(drag, drag.over) && <span className="shrink-0 opacity-80">→ {drag.over ? folders.find(f => f.id === drag.over)?.name : 'Library'}</span>}
        </div>
      )}
      {managing && <LibraryManager scope={scope} folders={folders} items={items} setFolders={setFolders} setItems={setItems}
        startFolder={folderId} onClose={() => { setManaging(false); if (folderId && !folders.some(f => f.id === folderId)) setFolderId(null) }} />}
      {viewing && <SlidesViewer item={viewing} onClose={() => setViewing(null)} />}
      {moving && <MoveDialog folders={folders} count={selected.size} from={q ? undefined : folderId}
        onMove={moveSelected} onClose={() => setMoving(false)} />}
    </Layout>
  )
}
