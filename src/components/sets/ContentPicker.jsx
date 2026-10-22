import { useEffect, useMemo, useState } from 'react'
import { Search, Upload, Loader2, Folder, FolderOpen, ChevronRight, Check, Monitor, Image, Plus, Library } from 'lucide-react'
import FolderSelect from '../FolderSelect'
import {
  ACCEPT, readImports, saveImport, itemSlides, loadLibrary, folderPath, folderAndDescendants,
  groupContent, contentMediaIds, sortFiles, createFolder,
} from '../../lib/contentLibrary'

// Add to Set → Content: browse Content Library folders, pick one or several files (or a whole
// folder, e.g. a sermon), and add them as ONE Program item. The presenter shows every slide.
const QUICK_NAMES = ['Announcements', 'Sermon']

export default function ContentPicker({ scope, item, onAdd }) {
  const editing = !!item
  const [items, setItems]     = useState([])
  const [folders, setFolders] = useState([])
  const [ready, setReady]     = useState(true)
  const [loaded, setLoaded]   = useState(false)
  const [folderId, setFolderId] = useState(null)
  const [query, setQuery]     = useState('')
  const [picked, setPicked]   = useState(() => contentMediaIds(item?.content))   // ordered ids
  const [title, setTitle]     = useState(item?.content?.files ? item.content.media_name || '' : '')
  const [titleTouched, setTitleTouched] = useState(!!item?.content?.files)
  const [imp, setImp]   = useState(null)   // { group, name }
  const [busy, setBusy] = useState(null)
  const [err, setErr]   = useState(null)

  useEffect(() => {
    let live = true
    loadLibrary(scope).then(r => {
      if (!live) return
      setItems(r.items); setFolders(r.folders); setReady(r.foldersReady); setLoaded(true)
      // Editing: open the folder the first file lives in.
      const first = r.items.find(i => i.id === contentMediaIds(item?.content)[0])
      if (first?.folder_id) setFolderId(first.folder_id)
    })
    return () => { live = false }
  }, [scope]) // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items])
  const counts = useMemo(() => Object.fromEntries(folders.map(f => {
    const ids = folderAndDescendants(folders, f.id)
    return [f.id, items.filter(i => ids.has(i.folder_id)).length]
  })), [folders, items])
  const path = folderPath(folders, folderId)
  const current = path[path.length - 1] || null
  const q = query.trim().toLowerCase()
  const shownFolders = q ? [] : folders.filter(f => (f.parent_id || null) === folderId).sort((a, b) => a.name.localeCompare(b.name))
  const shownFiles = sortFiles(q ? items.filter(i => i.name.toLowerCase().includes(q)) : items.filter(i => (i.folder_id || null) === folderId))
    .filter(i => itemSlides(i).length)
  const allHere = shownFiles.length > 0 && shownFiles.every(i => picked.includes(i.id))

  // Suggested Program item name: the folder when a whole folder is picked, else the file, else "Announcements".
  const suggested = useMemo(() => {
    if (picked.length === 1) return byId[picked[0]]?.name || ''
    const fids = new Set(picked.map(id => byId[id]?.folder_id || null))
    if (picked.length > 1 && fids.size === 1) {
      const fid = [...fids][0]
      const inFolder = items.filter(i => (i.folder_id || null) === fid && itemSlides(i).length)
      if (fid && inFolder.every(i => picked.includes(i.id))) return folders.find(f => f.id === fid)?.name || ''
    }
    return picked.length > 1 ? 'Announcements' : ''
  }, [picked, byId, items, folders])
  const name = titleTouched ? title : suggested

  const toggle = id => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))
  const toggleAll = () => setPicked(p => allHere
    ? p.filter(id => !shownFiles.some(i => i.id === id))
    : [...p, ...shownFiles.map(i => i.id).filter(id => !p.includes(id))])
  const open = id => { setFolderId(id); setQuery('') }

  const chosen = picked.map(id => byId[id]).filter(Boolean)
  const slideCount = chosen.reduce((n, i) => n + itemSlides(i).length, 0)
  const add = () => {
    if (!chosen.length) return
    const many = chosen.length > 1
    onAdd(groupContent(chosen, many || titleTouched ? name : ''))
  }

  const pickFile = async files => {
    if (!files?.length) return
    setErr(null); setBusy('Reading…')
    try {
      const groups = await readImports(files, msg => setBusy(`Reading ${msg}…`))
      setImp({ groups, dest: folderId })
    } catch (e) { setErr(e.message || 'Could not read that file.') } finally { setBusy(null) }
  }
  const saveImp = async () => {
    setErr(null)
    try {
      const saved = []
      for (let gi = 0; gi < imp.groups.length; gi++) {
        const g = imp.groups[gi]
        saved.push(await saveImport(scope, g, g.name, (i, n) => setBusy(`Uploading ${imp.groups.length > 1 ? `file ${gi + 1}, ` : ''}slide ${i} of ${n}…`), ready ? imp.dest : null))
      }
      imp.groups.forEach(g => g.pages.forEach(p => URL.revokeObjectURL(p.url)))
      setItems(prev => [...saved, ...prev])
      setPicked(p => [...p, ...saved.map(s => s.id)])
      if (ready) setFolderId(imp.dest)
      setImp(null); setBusy(null); setQuery('')
    } catch (e) { setBusy(null); setErr(`${e.message || 'Upload failed'} — try again.`) }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input !pl-9 !h-9 text-sm" placeholder="Search Content Library…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <label title={`Import a PDF or image into ${current?.name || 'Library'}`} aria-label="Import a PDF or image"
          className={`btn-primary shrink-0 flex items-center justify-center gap-1.5 h-9 w-9 sm:w-auto !p-0 sm:!px-3 text-sm cursor-pointer ${busy || imp ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload size={14} /> <span className="hidden sm:inline">Import</span>
          <input type="file" multiple accept={ACCEPT} className="hidden" onChange={e => { pickFile(e.target.files); e.target.value = '' }} />
        </label>
      </div>

      {busy && !imp && <p className="text-xs text-muted flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> {busy}</p>}
      {err && <p className="text-xs text-red-400">{err}</p>}
      {imp && (
        <div className="rounded-xl border border-accent/40 bg-card p-2.5 space-y-2">
          {ready && <FolderSelect folders={folders} value={imp.dest} onChange={id => setImp(c => ({ ...c, dest: id }))} disabled={!!busy}
            onCreate={async (name, parent) => { const f = await createFolder(scope, name, parent); setFolders(prev => [...prev, f]); return f }} />}
          {imp.groups.map((g, gi) => (
            <div key={gi} className="flex items-center gap-2">
              {g.pages.length > 1 ? <Monitor size={15} className="text-blue-400 shrink-0" /> : <Image size={15} className="text-green-400 shrink-0" />}
              <input className="input !h-8 !py-0 text-sm flex-1 min-w-0" value={g.name} aria-label="File name"
                onChange={e => setImp(c => ({ groups: c.groups.map((x, i) => (i === gi ? { ...x, name: e.target.value } : x)) }))} />
              <span className="text-[11px] text-muted shrink-0">{g.pages.length} slide{g.pages.length !== 1 ? 's' : ''}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button onClick={saveImp} disabled={!!busy} className="btn-primary !h-8 !py-0 !px-3 text-sm flex items-center gap-1.5 disabled:opacity-60">
              {busy ? <><Loader2 size={13} className="animate-spin" /> {busy}</> : <><Check size={13} /> Save &amp; select</>}
            </button>
            {!busy && <button onClick={() => { imp.groups.forEach(g => g.pages.forEach(p => URL.revokeObjectURL(p.url))); setImp(null) }} className="btn-ghost text-sm">Cancel</button>}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Breadcrumb + select all */}
        <div className="flex items-center gap-2 px-2.5 h-10 border-b border-border">
          {q ? <span className="text-sm font-medium flex-1 truncate">Results</span> : (
            <nav className="flex items-center gap-1 flex-1 min-w-0 text-sm overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
              <button onClick={() => open(null)} className={`shrink-0 flex items-center gap-1 ${current ? 'text-muted hover:text-[#f5f5f5]' : 'font-semibold'}`}><Library size={13} /> Library</button>
              {path.map((f, i) => (
                <span key={f.id} className="flex items-center gap-1 shrink-0">
                  <ChevronRight size={13} className="text-muted" />
                  <button onClick={() => open(f.id)} className={i === path.length - 1 ? 'font-semibold' : 'text-muted hover:text-[#f5f5f5]'}>{f.name}</button>
                </span>
              ))}
            </nav>
          )}
          {shownFiles.length > 1 && (
            <button onClick={toggleAll} className="text-xs font-medium text-accent-light hover:underline shrink-0">{allHere ? 'Clear' : `Select all ${shownFiles.length}`}</button>
          )}
        </div>

        {!loaded ? (
          <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : !shownFolders.length && !shownFiles.length ? (
          <div className="text-center py-8 px-4 space-y-1">
            <FolderOpen size={26} className="mx-auto text-muted" />
            <p className="text-muted text-sm">{q ? 'No matches.' : current ? 'This folder is empty.' : 'Your Content Library is empty.'}</p>
            {!q && <p className="text-xs text-muted">Import a PDF or an image above.</p>}
          </div>
        ) : (
          <ul className="divide-y divide-border/60 max-h-[42dvh] overflow-y-auto">
            {shownFolders.map(f => (
              <li key={f.id}>
                <button onClick={() => open(f.id)} className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left hover:bg-[#1a1a1a]">
                  <span className="w-6" />
                  <span className="w-14 aspect-video rounded bg-[#1a1a1a] border border-border flex items-center justify-center shrink-0"><Folder size={16} className="text-accent-light" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{f.name}</span>
                    <span className="block text-[11px] text-muted">{counts[f.id] || 0} file{counts[f.id] === 1 ? '' : 's'}</span>
                  </span>
                  <ChevronRight size={15} className="text-muted shrink-0" />
                </button>
              </li>
            ))}
            {shownFiles.map(m => {
              const slides = itemSlides(m)
              const n = picked.indexOf(m.id)
              const on = n >= 0
              return (
                <li key={m.id}>
                  <button onClick={() => toggle(m.id)} aria-pressed={on}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors ${on ? 'bg-accent/10' : 'hover:bg-[#1a1a1a]'}`}>
                    <span className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 text-[11px] font-bold ${on ? 'bg-accent border-accent text-white' : 'border-[#555]'}`}>
                      {on ? (picked.length > 1 ? n + 1 : <Check size={14} strokeWidth={3} />) : null}
                    </span>
                    <span className="w-14 aspect-video rounded bg-black border border-border overflow-hidden shrink-0">
                      <img src={slides[0].url} alt="" className="w-full h-full object-contain" loading="lazy" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{m.name}</span>
                      <span className="block text-[11px] text-muted truncate">
                        {m.type === 'presentation' ? `PDF · ${slides.length} slides` : 'Image'}{q && m.folder_id ? ` · ${folderPath(folders, m.folder_id).map(f => f.name).join(' › ')}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Program item name + add */}
      {chosen.length > 0 && (
        <div className="rounded-xl border border-accent/40 bg-card p-2.5 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted">Program item</span>
            <input className="input !h-8 !py-0 text-sm flex-1 min-w-[10rem]" value={name} placeholder={chosen[0]?.name || 'Name'}
              onChange={e => { setTitle(e.target.value); setTitleTouched(true) }} aria-label="Program item name" />
            {QUICK_NAMES.map(n => (
              <button key={n} onClick={() => { setTitle(n); setTitleTouched(true) }}
                className={`h-7 px-2.5 rounded-full border text-xs font-medium ${name === n ? 'border-accent bg-accent/20 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5]'}`}>{n}</button>
            ))}
          </div>
          <button onClick={add} className="btn-primary w-full text-sm flex items-center justify-center gap-1.5">
            {editing ? <Check size={14} /> : <Plus size={14} />}
            {editing ? 'Save' : 'Add to Set'} · {chosen.length} file{chosen.length !== 1 ? 's' : ''} · {slideCount} slide{slideCount !== 1 ? 's' : ''}
          </button>
          {!ready && <p className="text-[10px] text-amber-300">Folders need the content folders SQL in Supabase.</p>}
        </div>
      )}
    </div>
  )
}
