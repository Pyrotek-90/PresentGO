import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  FolderOpen, FileUp, Loader2, CheckCircle2, AlertTriangle, XCircle, Copy, Music,
  ChevronDown, ChevronRight, ShieldCheck, FileText, ArrowRight,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { filesFromDrop, triageFiles, readChart, markDuplicates, songPayload } from '../lib/bulkImport'

const SOURCES = [
  {
    name: 'SongSelect (CCLI)',
    best: 'ChordPro',
    steps: [
      'Open a song and choose Chord Sheet.',
      'Set the key, then Download → ChordPro (available on SongSelect plans that include ChordPro), or Download → PDF.',
      'Save every download into one folder.',
    ],
  },
  {
    name: 'Planning Center Services',
    best: 'PDF or ChordPro',
    steps: [
      'Open each song’s arrangement.',
      'Download the chord chart or the attached PDF from Files.',
      'Charts you imported into Planning Center from SongSelect or PraiseCharts download the same way.',
    ],
  },
  {
    name: 'PraiseCharts',
    best: 'PDF chord chart',
    steps: [
      'Open My Library on praisecharts.com.',
      'Download the Chord Chart for each song in the key you use.',
      'Lead sheets and orchestrations are music notation — keep those as PDFs for your players.',
    ],
  },
  {
    name: 'OnSong, Chordbot & other chart apps',
    best: 'ChordPro',
    steps: [
      'Export your library or a set as ChordPro (.chordpro, .cho or .txt).',
      'Unzip the export if the app gives you a .zip.',
    ],
  },
]

const STATUS = {
  ready:     { label: 'Ready',      icon: CheckCircle2,  cls: 'text-emerald-400' },
  duplicate: { label: 'Duplicate',  icon: Copy,          cls: 'text-amber-400' },
  error:     { label: 'Can’t read', icon: XCircle,       cls: 'text-red-400' },
  imported:  { label: 'Imported',   icon: CheckCircle2,  cls: 'text-accent-light' },
  failed:    { label: 'Failed',     icon: AlertTriangle, cls: 'text-red-400' },
}

function SourceCard({ source }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-card">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <span>
          <span className="block text-sm font-medium text-primary">{source.name}</span>
          <span className="block text-xs text-muted">Best format: {source.best}</span>
        </span>
        <ChevronDown size={15} className={`text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ol className="px-4 pb-4 -mt-1 space-y-1.5 text-sm text-muted list-decimal list-inside">
          {source.steps.map(s => <li key={s}>{s}</li>)}
        </ol>
      )}
    </div>
  )
}

function ReviewRow({ r, checked, onToggle }) {
  const [open, setOpen] = useState(false)
  const st = STATUS[r.status]
  const Icon = st.icon
  const selectable = r.status === 'ready' || r.status === 'duplicate'
  return (
    <li className="px-3 py-2">
      <div className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 accent-[#0e7490] w-4 h-4 shrink-0"
          checked={checked} disabled={!selectable} onChange={onToggle} aria-label={`Import ${r.song?.title || r.path}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm text-primary truncate">{r.song?.title || r.path.split('/').pop()}</span>
            {r.song?.key && <span className="text-[11px] text-muted border border-border rounded px-1.5 shrink-0">{r.song.key.replace(' Major', '').replace(' Minor', 'm')}</span>}
            {r.song?.ccli && <span className="text-[11px] text-muted shrink-0 hidden sm:inline">CCLI {r.song.ccli}</span>}
          </div>
          <div className="text-[11px] text-muted truncate">{r.path}</div>
          {r.message && <div className={`text-xs mt-0.5 ${r.status === 'ready' ? 'text-amber-400/90' : st.cls}`}>{r.message}</div>}
          {r.song?.chordChart && (
            <button onClick={() => setOpen(v => !v)} className="text-xs text-accent-light hover:underline mt-1 flex items-center gap-1">
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Preview chart
            </button>
          )}
          {open && (
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-surface border border-border p-3 text-[11px] leading-snug text-primary font-mono whitespace-pre">{r.song.chordChart}</pre>
          )}
        </div>
        <span className={`flex items-center gap-1 text-xs shrink-0 ${st.cls}`}><Icon size={13} /> {st.label}</span>
      </div>
    </li>
  )
}

export default function GetStarted() {
  const { user } = useAuth()
  const [phase, setPhase] = useState('idle')       // idle | reading | review | importing | done
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState([])
  const [skipped, setSkipped] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [filter, setFilter] = useState('all')
  const [dragOver, setDragOver] = useState(false)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const folderRef = useRef(null)
  const filesRef = useRef(null)

  useEffect(() => {
    folderRef.current?.setAttribute('webkitdirectory', '')
    folderRef.current?.setAttribute('directory', '')
  }, [])

  const processFiles = async files => {
    setError(null); setSummary(null)
    const { charts, skipped: skip } = triageFiles(files)
    setSkipped(skip)
    if (!charts.length) {
      setError(files.length ? 'No ChordPro or PDF charts were found in that selection.' : 'No files were selected.')
      setPhase('idle')
      return
    }
    setPhase('reading')
    setProgress({ done: 0, total: charts.length })

    let existing = []
    try {
      const { data } = await supabase.from('songs').select('id, title, ccli_number').eq('user_id', user.id)
      existing = data || []
    } catch { /* offline: duplicates within the batch are still caught */ }

    const read = []
    for (const c of charts) {
      read.push(await readChart(c))
      setProgress({ done: read.length, total: charts.length })
    }
    const marked = markDuplicates(read, existing)
    setResults(marked)
    setSelected(new Set(marked.filter(r => r.status === 'ready').map(r => r.id)))
    setFilter('all')
    setPhase('review')
  }

  const onPick = e => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    processFiles(files)
  }

  const onDrop = async e => {
    e.preventDefault(); setDragOver(false)
    if (phase === 'reading' || phase === 'importing') return
    processFiles(await filesFromDrop(e.dataTransfer))
  }

  const toggle = id => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const runImport = async () => {
    const chosen = results.filter(r => selected.has(r.id))
    if (!chosen.length) return
    setPhase('importing'); setError(null)
    setProgress({ done: 0, total: chosen.length })
    const outcome = new Map()
    const insertOne = async r => {
      const { error: err } = await supabase.from('songs').insert(songPayload(r, user.id))
      outcome.set(r.id, err ? { status: 'failed', message: err.message } : { status: 'imported', message: '' })
    }
    for (let i = 0; i < chosen.length; i += 20) {
      const chunk = chosen.slice(i, i + 20)
      const { error: err } = await supabase.from('songs').insert(chunk.map(r => songPayload(r, user.id)))
      if (err) { for (const r of chunk) await insertOne(r) }
      else chunk.forEach(r => outcome.set(r.id, { status: 'imported', message: '' }))
      setProgress({ done: Math.min(i + 20, chosen.length), total: chosen.length })
    }
    setResults(prev => prev.map(r => (outcome.has(r.id) ? { ...r, ...outcome.get(r.id) } : r)))
    const ok = [...outcome.values()].filter(o => o.status === 'imported').length
    setSummary({ ok, failed: chosen.length - ok })
    setSelected(new Set())
    setPhase('done')
  }

  const reset = () => { setPhase('idle'); setResults([]); setSkipped([]); setSummary(null); setError(null) }

  const counts = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {})
  const shown = filter === 'all' ? results : results.filter(r => r.status === filter)
  const busy = phase === 'reading' || phase === 'importing'

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-8 pb-16">
        <header className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-accent-light">Get started</p>
          <h1 className="text-2xl font-semibold text-primary">Bring your songbook into PresentGO</h1>
          <p className="text-sm text-muted leading-relaxed">
            The fastest way to start is with the charts you already use. Download the ChordPro or PDF chord charts your
            church is licensed for — from SongSelect, Planning Center, or PraiseCharts — into one folder on your computer,
            then point PresentGO at that folder. Each chart becomes a song with lyrics, slides, chords, and key, ready for your next set.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-primary">1. Gather your charts</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {SOURCES.map(s => <SourceCard key={s.name} source={s} />)}
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted space-y-1.5">
            <p className="text-primary font-medium flex items-center gap-2"><FileText size={14} className="text-accent-light" /> What imports best</p>
            <p><span className="text-primary">ChordPro</span> — exact chords, key, tempo, writers, and CCLI number. Use it whenever it’s offered.</p>
            <p><span className="text-primary">Text PDFs</span> (chord sheets printed from an app) — PresentGO reads the lyrics and chords; give each one a quick look.</p>
            <p><span className="text-primary">Scanned pages and sheet music</span> have no readable text. They’ll be listed so you can add those songs by hand.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-primary">2. Choose the folder</h2>

          {phase !== 'review' && phase !== 'done' && (
            <div
              onDragOver={e => { e.preventDefault(); if (!busy) setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors ${dragOver ? 'border-accent bg-accent/10' : 'border-border bg-card'}`}
            >
              {busy ? (
                <div className="space-y-3">
                  <Loader2 size={28} className="mx-auto animate-spin text-accent-light" />
                  <p className="text-sm text-primary">{phase === 'reading' ? 'Reading charts' : 'Adding songs'} — {progress.done} of {progress.total}</p>
                  <div className="h-1.5 max-w-xs mx-auto rounded-full bg-surface overflow-hidden">
                    <div className="h-full bg-accent transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <FolderOpen size={32} className="mx-auto text-accent-light" />
                  <div>
                    <p className="text-sm text-primary font-medium">Drop your charts folder here</p>
                    <p className="text-xs text-muted mt-1">Subfolders are included. ChordPro (.chordpro, .cho, .txt) and PDF files are read; everything else is skipped.</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <input ref={folderRef} type="file" multiple className="hidden" onChange={onPick} />
                    <input ref={filesRef} type="file" multiple accept=".pdf,.chordpro,.cho,.crd,.chopro,.pro,.txt,application/pdf,text/plain" className="hidden" onChange={onPick} />
                    <button onClick={() => folderRef.current?.click()} className="btn-primary flex items-center gap-2 text-sm">
                      <FolderOpen size={15} /> Choose Folder
                    </button>
                    <button onClick={() => filesRef.current?.click()} className="btn-secondary flex items-center gap-2 text-sm">
                      <FileUp size={15} /> Choose Files
                    </button>
                  </div>
                  <p className="text-[11px] text-muted">On iPad, use Choose Files and select all the charts in the folder.</p>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          {(phase === 'review' || phase === 'done') && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border">
                <div className="flex flex-wrap gap-1">
                  {[['all', `All ${results.length}`], ...Object.keys(STATUS).filter(k => counts[k]).map(k => [k, `${STATUS[k].label} ${counts[k]}`])].map(([k, label]) => (
                    <button key={k} onClick={() => setFilter(k)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${filter === k ? 'border-accent bg-accent/15 text-accent-light' : 'border-border text-muted hover:text-primary'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {phase === 'review' && <span className="text-xs text-muted">{selected.size} selected</span>}
              </div>
              <ul className="divide-y divide-border max-h-[28rem] overflow-y-auto">
                {shown.map(r => <ReviewRow key={r.id} r={r} checked={selected.has(r.id)} onToggle={() => toggle(r.id)} />)}
              </ul>
              {skipped.length > 0 && (
                <details className="border-t border-border px-3 py-2 text-xs text-muted">
                  <summary className="cursor-pointer">{skipped.length} file{skipped.length === 1 ? '' : 's'} skipped</summary>
                  <ul className="mt-2 space-y-0.5">
                    {skipped.map(s => <li key={s.path} className="truncate">{s.path} — {s.reason}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </section>

        {(phase === 'review' || phase === 'importing' || phase === 'done') && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-primary">3. Add them to your library</h2>
            {phase === 'done' && summary ? (
              <div className="rounded-xl border border-border bg-card px-4 py-4 space-y-3">
                <p className="text-sm text-primary flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  Added {summary.ok} song{summary.ok === 1 ? '' : 's'} to your library.
                  {summary.failed > 0 && <span className="text-red-400">{summary.failed} failed — see the list above.</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link to="/" className="btn-primary text-sm flex items-center gap-2"><Music size={15} /> Open Song Library</Link>
                  <button onClick={reset} className="btn-secondary text-sm">Import another folder</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={runImport} disabled={!selected.size || busy} className="btn-primary text-sm flex items-center gap-2">
                  {phase === 'importing' ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                  {phase === 'importing' ? `Adding ${progress.done} of ${progress.total}…` : `Import ${selected.size} song${selected.size === 1 ? '' : 's'}`}
                </button>
                <button onClick={reset} disabled={busy} className="btn-ghost text-sm">Start over</button>
                <p className="text-xs text-muted w-full">Slides are built automatically. Duplicates are unticked; tick one to import it anyway.</p>
              </div>
            )}
          </section>
        )}

        <p className="flex items-start gap-2 text-xs text-muted border-t border-border pt-4">
          <ShieldCheck size={14} className="shrink-0 mt-0.5 text-accent-light" />
          Only import charts your church is licensed to use. Keep your CCLI license current and report song usage —
          the CCLI Report in your account menu lists every song you’ve used.
        </p>
      </div>
    </Layout>
  )
}
