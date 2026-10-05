import { useState } from 'react'
import { X } from 'lucide-react'
import { transposeChart } from '../../lib/chords'

export default function ChordChartViewer({ song, onClose }) {
  const meta = song.metadata || {}
  const original = meta.original_key || meta.key || ''
  const tabs = [original, ...(meta.transposed_keys || [])].filter(Boolean)
  const [active, setActive] = useState(tabs[0] || '')
  const chart = active && active !== original
    ? transposeChart(meta.chord_chart, original, active)
    : meta.chord_chart || ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-[#141414]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="min-w-0">
            <p className="font-semibold truncate">{song.title}</p>
            <p className="text-xs text-muted">Chord chart{meta.bpm ? ` · ${meta.bpm} BPM` : ''}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-[#f5f5f5]"><X size={16} /></button>
        </div>
        {tabs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-5 py-3 border-b border-border">
            {tabs.map(k => (
              <button key={k} onClick={() => setActive(k)}
                className={`px-3 h-8 rounded-lg border text-xs font-medium transition-colors ${
                  active === k ? 'border-accent bg-accent/20 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5]'
                }`}>{k}{k === original ? ' (original)' : ''}</button>
            ))}
          </div>
        )}
        <pre className="flex-1 overflow-auto px-5 py-4 text-sm font-mono text-[#f5f5f5] whitespace-pre">{chart || 'No chord chart saved for this song.'}</pre>
      </div>
    </div>
  )
}
