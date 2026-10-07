import { useState } from 'react'
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight, Minus, Plus, RotateCcw } from 'lucide-react'
import { FONTS, COLORS, DEFAULT_STYLE, mergeStyle } from './TitleSlide'

export default function TitleSlideToolbar({ style, onChange }) {
  const [target, setTarget] = useState('title')
  const st = mergeStyle(style)
  const cur = st[target]
  const setCur = patch => onChange({ ...st, [target]: { ...cur, ...patch } })
  const btn = on => `w-8 h-8 flex items-center justify-center rounded-md border transition-colors ${on ? 'border-accent bg-accent/20 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5]'}`
  const pct = Math.round(cur.scale * 100)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card px-2.5 py-2">
      <div className="flex rounded-md overflow-hidden border border-border" role="group" aria-label="Format which text">
        {[['title', 'Title'], ['subtitle', 'Subtitle']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTarget(id)} aria-pressed={target === id}
            className={`px-2.5 h-8 text-xs font-medium ${target === id ? 'bg-accent text-white' : 'bg-card text-muted hover:text-[#f5f5f5]'}`}>{label}</button>
        ))}
      </div>

      <div className="flex gap-1">
        <button type="button" onClick={() => setCur({ bold: !cur.bold })} className={btn(cur.bold)} aria-label="Bold" aria-pressed={cur.bold}><Bold size={14} /></button>
        <button type="button" onClick={() => setCur({ italic: !cur.italic })} className={btn(cur.italic)} aria-label="Italic" aria-pressed={cur.italic}><Italic size={14} /></button>
      </div>

      <div className="flex items-center rounded-md border border-border overflow-hidden" role="group" aria-label="Text size">
        <button type="button" onClick={() => setCur({ scale: Math.max(0.5, +(cur.scale - 0.1).toFixed(1)) })} className="w-8 h-8 flex items-center justify-center text-muted hover:text-[#f5f5f5]" aria-label="Smaller"><Minus size={13} /></button>
        <span className="px-1.5 text-xs w-11 text-center border-x border-border h-8 flex items-center justify-center">{pct === 100 ? 'Auto' : `${pct}%`}</span>
        <button type="button" onClick={() => setCur({ scale: Math.min(1.8, +(cur.scale + 0.1).toFixed(1)) })} className="w-8 h-8 flex items-center justify-center text-muted hover:text-[#f5f5f5]" aria-label="Larger"><Plus size={13} /></button>
      </div>

      <select className="input !h-8 !py-0 !px-2 !w-auto text-xs" value={cur.font} onChange={e => setCur({ font: e.target.value })} aria-label="Font">
        {Object.entries(FONTS).map(([id, f]) => <option key={id} value={id}>{f.label}</option>)}
      </select>

      <div className="flex items-center gap-1" role="group" aria-label="Text color">
        {COLORS.map(c => (
          <button key={c} type="button" onClick={() => setCur({ color: c })} aria-label={`Color ${c}`}
            className={`w-5 h-5 rounded-full border-2 ${cur.color === c ? 'border-accent' : 'border-border'}`} style={{ background: c }} />
        ))}
      </div>

      <div className="flex gap-1" role="group" aria-label="Alignment">
        {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([a, Icon]) => (
          <button key={a} type="button" onClick={() => onChange({ ...st, align: a })} className={btn(st.align === a)} aria-label={`Align ${a}`} aria-pressed={st.align === a}><Icon size={14} /></button>
        ))}
      </div>

      <button type="button" onClick={() => onChange(DEFAULT_STYLE)} className="ml-auto flex items-center gap-1 text-xs text-muted hover:text-[#f5f5f5]">
        <RotateCcw size={12} /> Reset
      </button>
    </div>
  )
}
