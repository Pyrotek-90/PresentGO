import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import FolderSelect from '../components/FolderSelect'
import ManageFolders from '../components/content/ManageFolders'
import ArchivePolicy from '../components/content/ArchivePolicy'
import {
  ACCEPT, readImports, saveImport, itemSlides, createFolder, loadLibrary, folderPath, folderAndDescendants,
  itemBytes, formatBytes, sortFiles, loadArchiveInfo, archiveCandidates, readArchivePolicy, saveArchivePolicy, deleteLibraryItem,
} from '../lib/contentLibrary'
import {
  Upload, Image, Monitor, FileText, X, Folder, FolderInput, Check,
  Loader2, Search, HardDrive, List, LayoutGrid, ChevronRight, Library, Archive,
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

export default function ContentLibrary() {
  const { user } = useAuth()
  const [items, setItems]       = useState([])
  const [folders, setFolders]   = useState([])
  const [foldersReady, setFoldersReady] = useState(true)
  const [loading, setLoading]   = useState(true)
  const [folderId, setFolderId] = useState(null)   // null = top level
  const [query, setQuery]       = useState('')
  const [view, setView]         = useState(() => { try { return localStorage.getItem(VIEW_KEY) || 'preview' } catch { return 'preview' } })
  const [review, setReview]     = useState(null)   // groups waiting to be saved
  const [dest, setDest]         = useState(null)   // folder the import is saved to
  const [busy, setBusy]         = useState(null)
  const [error, setError]       = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [viewing, setViewing]   = useState(null)
  const [managing, setManaging] = useState(false)   // Manage Folders open
  const [archiving, setArchiving] = useState(false) // Archive policy open
  const [policy, setPolicy]     = useState(() => readArchivePolicy(user))
  const [archived, setArchived] = useState(null)   // notice after an automatic clear-out: { count, bytes }
  const autoRan = useRef(false)
  const [archiveInfo, setArchiveInfo] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    let live = true
    loadLibrary(user.id).then(r => {
      if (!live) return
      setItems(r.items); setFolders(r.folders); setFoldersReady(r.foldersReady); setLoading(false)
    })
    return () => { live = false }
  }, [user.id])

  // With an archive policy on, work out which files are outside it so the page can offer to clear them.
  useEffect(() => {
    let live = true
    if (!policy.keep) { setArchiveInfo(null); return }
    loadArchiveInfo(user.id, policy.keep).then(r => { if (live) setArchiveInfo(r) }).catch(() => { if (live) setArchiveInfo(null) })
    return () => { live = false }
  }, [user.id, policy.keep])
  const archivable = useMemo(
    () => (policy.keep && archiveInfo ? archiveCandidates(items, archiveInfo, policy.keep, policy.unused) : []),
    [items, archiveInfo, policy])
  const archivableBytes = archivable.reduce((n, c) => n + itemBytes(c.item), 0)

  const changePolicy = next => {
    setPolicy(next); autoRan.current = true   // a change made here never triggers an automatic clear-out in the same visit
    saveArchivePolicy(next).catch(e => setError(`Couldn't save your archive policy: ${e.message}`))
  }
  // "Clear automatically": once per visit, delete the files outside the policy and say what was cleared.
  useEffect(() => {
    if (!policy.auto || autoRan.current || loading || !archivable.length) return
    autoRan.current = true
    const list = archivable.map(c => c.item)
    ;(async () => {
      const gone = new Set()
      for (const it of list) { try { await deleteLibraryItem(it); gone.add(it.id) } catch { break } }
      setItems(prev => prev.filter(i => !gone.has(i.id)))
      if (gone.size) setArchived({ count: gone.size, bytes: list.filter(i => gone.has(i.id)).reduce((n, i) => n + itemBytes(i), 0) })
    })()
  }, [policy.auto, loading, archivable])

  const chooseView = v => { setView(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ } }
  const openFolder = id => { setFolderId(id); setQuery('') }

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
  // If the open folder was deleted or moved away in the manager, fall back to the top level.
  useEffect(() => { if (folderId && !folders.some(f => f.id === folderId)) setFolderId(null) }, [folders, folderId])

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
        saved.push(await saveImport(user.id, g, g.name,
          (i, n) => setBusy(`Uploading ${review.length > 1 ? `file ${gi + 1} of ${review.length}, ` : ''}slide ${i} of ${n}…`),
          foldersReady ? dest : null))
      }
      review.forEach(g => g.pages.forEach(p => URL.revokeObjectURL(p.url)))
      setItems(prev => [...saved.reverse(), ...prev])
      setReview(null); setQuery('')
      if (foldersReady && dest !== folderId) openFolder(dest)
    } catch (e) {
      setError(`${e.message || 'Upload failed'} — try again.`)
    } finally { setBusy(null) }
  }
  const cancelReview = () => {
    review?.forEach(g => g.pages.forEach(p => URL.revokeObjectURL(p.url)))
    setReview(null); setError(null)
  }

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
        {archived && (
          <p className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted">
            <Archive size={14} className="shrink-0 text-accent-light" />
            <span className="flex-1">Archived {archived.count} file{archived.count === 1 ? '' : 's'} not used in your last {policy.keep} set{policy.keep === 1 ? '' : 's'} — freed {formatBytes(archived.bytes)}.</span>
            <button onClick={() => setArchived(null)} className="p-0.5 hover:text-[#f5f5f5]" aria-label="Dismiss"><X size={14} /></button>
          </p>
        )}
        {archivable.length > 0 && !policy.auto && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <Archive size={14} className="shrink-0" />
            <span className="flex-1 min-w-0">{archivable.length} file{archivable.length === 1 ? '' : 's'} ({formatBytes(archivableBytes)}) {archivable.length === 1 ? "isn't" : "aren't"} in your last {policy.keep} sets and can be archived.</span>
            <button onClick={() => setArchiving(true)} className="font-medium underline hover:text-white">Review</button>
          </div>
        )}
        {review && <ImportReview groups={review} busy={busy} error={error} onCancel={cancelReview} onSave={saveReview}
          folderSelect={foldersReady && <FolderSelect folders={folders} value={dest} onChange={setDest} disabled={!!busy}
            onCreate={async (name, parent) => { const f = await createFolder(user.id, name, parent); setFolders(prev => [...prev, f]); return f }} />}
          onChangeName={(gi, name) => setReview(r => r.map((g, i) => (i === gi ? { ...g, name } : g)))} />}

          {/* Files pane */}
          <section className={`flex-1 min-w-0 rounded-xl border bg-card overflow-hidden ${dragOver ? 'border-accent ring-2 ring-accent/40' : 'border-border'}`}>
            {/* Header: Library path · search · List / Tiles · Manage Folders · Import */}
            <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden"
              onChange={e => { pickFiles(e.target.files); e.target.value = '' }} />
            <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-border">
              {q ? (
                <p className="text-sm font-medium flex-1 min-w-0 truncate">Results for “{query.trim()}”</p>
              ) : (
                <nav className="flex items-center gap-1 flex-1 min-w-0 text-sm overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                  <h1 className="shrink-0"><button onClick={() => openFolder(null)} className={`flex items-center gap-1.5 text-base rounded-md px-1 -mx-1 ${current ? 'text-muted hover:text-[#f5f5f5]' : 'font-semibold'}`}><Library size={15} /> Library</button></h1>
                  {path.map((f, i) => (
                    <span key={f.id} className="flex items-center gap-1 shrink-0">
                      <ChevronRight size={14} className="text-muted" />
                      <button onClick={() => openFolder(f.id)} className={`text-base rounded-md px-1 ${i === path.length - 1 ? 'font-semibold' : 'text-muted hover:text-[#f5f5f5]'}`}>{f.name}</button>
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
                <FolderInput size={15} /><span className="hidden lg:inline">Manage Folders</span>
              </button>
              <button onClick={() => fileRef.current?.click()} disabled={!!busy || !!review}
                className="btn-primary shrink-0 flex items-center justify-center gap-1.5 !h-8 !py-0 w-9 lg:w-auto !px-0 lg:!px-3 text-sm disabled:opacity-60" title="Import PDF or Image" aria-label="Import PDF or Image">
                {busy && !review ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                <span className="hidden lg:inline">Import</span>
              </button>
            </div>

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
                    <li key={f.id}>
                      <button onClick={() => openFolder(f.id)} className="w-full flex items-center gap-3 py-2 px-1 rounded-lg text-left hover:bg-[#2e2e2e]">
                        <span className="w-16 aspect-video rounded bg-[#1a1a1a] border border-border flex items-center justify-center shrink-0"><Folder size={18} className="text-accent-light" /></span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium truncate">{f.name}</span>
                          <span className="block text-[11px] text-muted truncate">Folder · {counts[f.id] || 0} file{counts[f.id] === 1 ? '' : 's'}{q && f.parent_id ? ` · in ${folderLabel(f.parent_id)}` : ''}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {shownFiles.map(item => {
                    const slides = itemSlides(item)
                    return (
                      <li key={item.id}>
                        <button onClick={() => slides.length && setViewing(item)} title={fileMeta(item)} className="w-full flex items-center gap-3 py-2 px-1 rounded-lg text-left hover:bg-[#2e2e2e]">
                          <span className="w-16 aspect-video rounded bg-[#1a1a1a] border border-border shrink-0 flex items-center justify-center">
                            {!slides.length ? <Monitor size={18} className="text-muted" />
                              : item.type === 'presentation' ? <FileText size={18} className="text-blue-400" />
                              : <Image size={18} className="text-green-400" />}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium truncate" title={item.name}>{item.name}</span>
                            <span className="block text-[11px] text-muted truncate">
                              {fileMeta(item)} · {formatDate(item.created_at)}{itemBytes(item) ? ` · ${formatBytes(itemBytes(item))}` : ''}{q ? ` · ${folderLabel(item.folder_id)}` : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 select-none">
                  {shownFolders.map(f => (
                    <button key={f.id} onClick={() => openFolder(f.id)}
                      className="rounded-xl border border-border bg-[#1a1a1a] overflow-hidden hover:border-[#555] transition-colors text-left">
                      <span className="flex w-full aspect-video items-center justify-center"><Folder size={40} className="text-accent-light" strokeWidth={1.5} /></span>
                      <span className="block px-2 py-1.5 border-t border-border">
                        <span className="block text-sm font-medium truncate">{f.name}</span>
                        <span className="block text-[10px] text-muted truncate">{counts[f.id] || 0} file{counts[f.id] === 1 ? '' : 's'}{q && f.parent_id ? ` · in ${folderLabel(f.parent_id)}` : ''}</span>
                      </span>
                    </button>
                  ))}
                  {shownFiles.map(item => {
                    const slides = itemSlides(item)
                    const old = slides.length === 0
                    return (
                      <button key={item.id} onClick={() => !old && setViewing(item)} disabled={old}
                        className="rounded-xl border border-border bg-[#1a1a1a] overflow-hidden text-left hover:border-[#555] transition-colors">
                        <span className="relative block w-full aspect-video bg-black">
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
                        </span>
                        <span className="block px-2 py-1.5">
                          <span className="block text-sm font-medium truncate" title={item.name}>{item.name}</span>
                          <span className="block text-[10px] text-muted truncate">{fileMeta(item)} · {q ? folderLabel(item.folder_id) : formatDate(item.created_at)}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {/* Footer: storage used · archive policy */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-[#1a1a1a] text-xs text-muted">
              <button onClick={() => setArchiving(true)} className="flex items-center gap-1.5 h-7 px-2 rounded-lg border border-border hover:border-[#555] hover:text-[#f5f5f5] shrink-0">
                <Archive size={13} /> Archive policy{policy.keep ? `: last ${policy.keep} set${policy.keep === 1 ? '' : 's'}${policy.auto ? ' · auto' : ''}` : ''}
              </button>
              <span className="flex items-center gap-2 min-w-0">
                <HardDrive size={14} className="text-accent-light shrink-0" />
                <span className="truncate"><span className="text-[#f5f5f5] font-medium">{formatBytes(totalBytes)}</span> used · {items.length} file{items.length !== 1 ? 's' : ''}{folders.length ? ` · ${folders.length} folder${folders.length !== 1 ? 's' : ''}` : ''}</span>
              </span>
            </div>
          </section>
      </div>
      {viewing && <SlidesViewer item={viewing} onClose={() => setViewing(null)} />}
      {managing && <ManageFolders user={user} items={items} setItems={setItems} folders={folders} setFolders={setFolders}
        startFolder={folderId} onClose={() => setManaging(false)} />}
      {archiving && <ArchivePolicy user={user} policy={policy} items={items} setItems={setItems} onChange={changePolicy} onClose={() => setArchiving(false)} />}
    </Layout>
  )
}
