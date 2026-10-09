import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FileSpreadsheet, Printer, Mail, ExternalLink, Loader2, AlertTriangle, Copy, Check, ShieldCheck } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getPref, setPref } from '../lib/prefs'
import { todayISO, formatSetDate } from '../lib/sets'

// Song usage report for CCLI: every song used in a set within the chosen dates, with its CCLI
// number and how often it was used. Churches enter these counts at reporting.ccli.com (or hand
// the printout / CSV to whoever submits for the church).

const iso = d => d.toLocaleDateString('en-CA')
const monthsAgo = n => { const d = new Date(); d.setMonth(d.getMonth() - n); return iso(d) }

const PRESETS = [
  { id: 'last6',  label: 'Last 6 months', range: () => [monthsAgo(6), todayISO()] },
  { id: 'last3',  label: 'Last 3 months', range: () => [monthsAgo(3), todayISO()] },
  { id: 'year',   label: 'This year',     range: () => [`${new Date().getFullYear()}-01-01`, todayISO()] },
  { id: 'lastyr', label: 'Last year',     range: () => { const y = new Date().getFullYear() - 1; return [`${y}-01-01`, `${y}-12-31`] } },
  { id: 'custom', label: 'Custom',        range: null },
]

const longDate = d => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '')
const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

export default function CcliReport() {
  const { user } = useAuth()
  const [preset, setPreset] = useState('last6')
  const [[from, to], setRange] = useState(PRESETS[0].range())
  const [church, setChurch] = useState(() => getPref('ccliChurchName', ''))
  const [license, setLicense] = useState(() => getPref('ccliLicenseNumber', ''))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({ sets: [], items: [], songs: [] })
  const [copied, setCopied] = useState(false)

  useEffect(() => { setPref('ccliChurchName', church) }, [church])
  useEffect(() => { setPref('ccliLicenseNumber', license) }, [license])

  useEffect(() => {
    let live = true
    const load = async () => {
      setLoading(true); setError(null)
      try {
        const { data: sets, error: e1 } = await supabase.from('sets')
          .select('id, name, service_date').eq('user_id', user.id)
          .gte('service_date', from).lte('service_date', to)
        if (e1) throw e1
        const setIds = (sets || []).map(s => s.id)
        let items = []
        if (setIds.length) {
          const { data: it, error: e2 } = await supabase.from('set_items')
            .select('set_id, content').eq('type', 'song').in('set_id', setIds)
          if (e2) throw e2
          items = it || []
        }
        const songIds = [...new Set(items.map(i => i.content?.song_id).filter(Boolean))]
        let songs = []
        if (songIds.length) {
          const { data: sg, error: e3 } = await supabase.from('songs')
            .select('id, title, artist, ccli_number, metadata').in('id', songIds)
          if (e3) throw e3
          songs = sg || []
        }
        if (live) setData({ sets: sets || [], items, songs })
      } catch (err) {
        console.error('ccli report load failed', err)
        if (live) setError('Could not load your sets. Check your connection and try again.')
      } finally {
        if (live) setLoading(false)
      }
    }
    if (from && to && from <= to) load()
    else { setLoading(false); setError('Choose a start date before the end date.') }
    return () => { live = false }
  }, [user.id, from, to])

  // One row per song: how many services it was used in, and on which dates.
  const rows = useMemo(() => {
    const setById = new Map(data.sets.map(s => [s.id, s]))
    const songById = new Map(data.songs.map(s => [s.id, s]))
    const bySong = new Map()
    for (const it of data.items) {
      const id = it.content?.song_id
      const set = setById.get(it.set_id)
      if (!id || !set) continue
      const song = songById.get(id)
      const row = bySong.get(id) || {
        id,
        title: song?.title || it.content?.song_title || 'Unknown song',
        ccli: (song?.ccli_number || '').trim(),
        writers: song?.metadata?.author || song?.artist || it.content?.song_artist || '',
        publicDomain: /public domain/i.test(song?.metadata?.copyright || ''),
        missing: !song,
        sets: new Set(),
        dates: new Set(),
      }
      row.sets.add(set.id)
      row.dates.add(set.service_date)
      bySong.set(id, row)
    }
    return [...bySong.values()]
      .map(r => ({ ...r, uses: r.sets.size, dates: [...r.dates].sort() }))
      .sort((a, b) => b.uses - a.uses || a.title.localeCompare(b.title))
  }, [data])

  const servicesWithSongs = new Set(data.items.map(i => i.set_id)).size
  const noCcli = rows.filter(r => !r.ccli && !r.publicDomain)
  const totalUses = rows.reduce((n, r) => n + r.uses, 0)
  const period = `${longDate(from)} – ${longDate(to)}`

  const downloadCsv = () => {
    const head = ['Song Title', 'CCLI Song #', 'Writers', 'Times Used', 'Dates Used', 'Notes']
    const lines = [
      [`CCLI Song Usage Report${church ? ` — ${church}` : ''}`],
      [`CCLI License #`, license],
      ['Period', period],
      [],
      head,
      ...rows.map(r => [r.title, r.ccli, r.writers, r.uses, r.dates.join('; '),
        r.publicDomain ? 'Public domain' : !r.ccli ? 'Missing CCLI #' : '']),
    ]
    const blob = new Blob([lines.map(l => l.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `CCLI-report-${from}-to-${to}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const emailHref = () => {
    const body = [
      `CCLI song usage${church ? ` for ${church}` : ''}${license ? ` (CCLI License # ${license})` : ''}`,
      period, '',
      ...rows.map(r => `${r.title} — CCLI #${r.ccli || 'n/a'} — used ${r.uses}×`),
    ].join('\n')
    const capped = body.length > 1800 ? body.slice(0, 1800) + '\n…(see attached CSV for the full list)' : body
    return `mailto:?subject=${encodeURIComponent(`CCLI song usage report — ${period}`)}&body=${encodeURIComponent(capped)}`
  }

  const copyNumbers = async () => {
    const text = rows.filter(r => r.ccli).map(r => `${r.ccli}\t${r.uses}\t${r.title}`).join('\n')
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* ignore */ }
  }

  return (
    <Layout>
      <style>{`
        @media print {
          html, body, #root { background: #fff !important; }
          body * { visibility: hidden !important; }
          #ccli-print, #ccli-print * { visibility: visible !important; color: #000 !important; background: transparent !important; border-color: #bbb !important; }
          #ccli-print { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 0 !important; }
          #ccli-print .no-print { display: none !important; }
          #ccli-print table { font-size: 11px; }
          @page { margin: 0.6in; }
        }
      `}</style>
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-5 pb-16">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-primary">CCLI Report</h1>
          <p className="text-sm text-muted">Songs used in your sets, ready to submit to CCLI or hand to whoever reports for your church.</p>
        </header>

        <div className="card grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Church name</label>
            <input className="input" value={church} onChange={e => setChurch(e.target.value)} placeholder="Grace Community Church" />
          </div>
          <div>
            <label className="label">CCLI License #</label>
            <input className="input" value={license} onChange={e => setLicense(e.target.value.replace(/[^\d-]/g, ''))} inputMode="numeric" placeholder="1234567" />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <label className="label !mb-0">Reporting period</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(p => (
                <button key={p.id} onClick={() => { setPreset(p.id); if (p.range) setRange(p.range()) }}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${preset === p.id ? 'border-accent bg-accent/15 text-accent-light' : 'border-border text-muted hover:text-primary'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" className="input !w-auto" value={from} onChange={e => setRange([e.target.value, to])} />
                <span className="text-muted text-sm">to</span>
                <input type="date" className="input !w-auto" value={to} onChange={e => setRange([from, e.target.value])} />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={downloadCsv} disabled={!rows.length} className="btn-primary text-sm flex items-center gap-2"><FileSpreadsheet size={15} /> Download CSV</button>
          <button onClick={() => window.print()} disabled={!rows.length} className="btn-secondary text-sm flex items-center gap-2"><Printer size={15} /> Print / Save PDF</button>
          <a href={rows.length ? emailHref() : undefined} aria-disabled={!rows.length}
            className={`btn-secondary text-sm flex items-center gap-2 ${rows.length ? '' : 'opacity-50 pointer-events-none'}`}><Mail size={15} /> Email</a>
          <button onClick={copyNumbers} disabled={!rows.some(r => r.ccli)} className="btn-secondary text-sm flex items-center gap-2">
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy CCLI #s'}
          </button>
          <a href="https://reporting.ccli.com" target="_blank" rel="noreferrer" className="btn-ghost text-sm flex items-center gap-2">
            <ExternalLink size={15} /> Open CCLI Reporting
          </a>
        </div>

        {noCcli.length > 0 && !loading && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 text-amber-400 font-medium"><AlertTriangle size={15} /> {noCcli.length} song{noCcli.length === 1 ? ' has' : 's have'} no CCLI number</p>
            <p className="text-muted mt-1">Add the number in each song’s Details step so it can be reported: {noCcli.map(r => r.title).join(', ')}.</p>
          </div>
        )}

        <section id="ccli-print" className="card !p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-primary">CCLI Song Usage Report{church ? ` — ${church}` : ''}</h2>
            <p className="text-xs text-muted">
              {license ? `CCLI License # ${license} · ` : ''}{period} · {servicesWithSongs} service{servicesWithSongs === 1 ? '' : 's'} · {rows.length} song{rows.length === 1 ? '' : 's'} · {totalUses} use{totalUses === 1 ? '' : 's'}
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-accent-light" /></div>
          ) : error ? (
            <p className="px-4 py-8 text-sm text-red-400 text-center">{error}</p>
          ) : !rows.length ? (
            <div className="px-4 py-10 text-center space-y-2">
              <p className="text-sm text-muted">No songs were used in sets dated in this period.</p>
              <Link to="/" className="text-sm text-accent-light hover:underline no-print">Plan a set →</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted border-b border-border">
                    <th className="px-4 py-2 font-medium">Song</th>
                    <th className="px-3 py-2 font-medium">CCLI #</th>
                    <th className="px-3 py-2 font-medium text-right">Uses</th>
                    <th className="px-4 py-2 font-medium">Dates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(r => (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-2">
                        <div className="text-primary">{r.title}</div>
                        {r.writers && <div className="text-xs text-muted">{r.writers}</div>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.ccli ? <span className="text-primary tabular-nums">{r.ccli}</span>
                          : r.publicDomain ? <span className="text-xs text-muted">Public domain</span>
                          : <span className="text-xs text-amber-400">Missing</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-primary">{r.uses}</td>
                      <td className="px-4 py-2 text-xs text-muted">{r.dates.map(formatSetDate).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-4 py-3 border-t border-border text-[11px] text-muted">
            Uses = number of services each song was scheduled in. Generated by PresentGO on {longDate(todayISO())}.
          </p>
        </section>

        <p className="flex items-start gap-2 text-xs text-muted">
          <ShieldCheck size={14} className="shrink-0 mt-0.5 text-accent-light" />
          To submit, sign in at reporting.ccli.com with your church’s CCLI account and enter each song’s CCLI number and uses
          (count lyric projection under Digital). The report counts sets dated in the period, so songs from sets that never happened are included — remove those sets or adjust the dates first.
        </p>
      </div>
    </Layout>
  )
}
