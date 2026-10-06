import { useEffect, useState } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const CATEGORIES = ['Band Musicians', 'Presenter', 'Audio', 'Singers', 'Other']

export default function PositionsPanel() {
  const { user } = useAuth()
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Band Musicians')
  const [level, setLevel] = useState('Lead')
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    supabase.from('positions').select('*').eq('user_id', user.id).order('created_at')
      .then(({ data, error }) => {
        if (error) setError('Positions are not set up yet. Run the latest Supabase migration.')
        else setPositions(data || [])
      })
      .finally(() => setLoading(false))
  }, [user.id])

  const add = async () => {
    if (!name.trim()) return
    setError(null)
    const { data, error } = await supabase.from('positions')
      .insert({ user_id: user.id, name: name.trim(), category, level: category === 'Singers' ? level : null })
      .select().single()
    if (error) { setError('Could not add position. Make sure the latest Supabase migration has been run.'); return }
    setPositions(prev => [...prev, data])
    setName('')
  }

  const remove = async p => {
    if (deleting !== p.id) { setDeleting(p.id); return }
    await supabase.from('positions').delete().eq('id', p.id)
    setPositions(prev => prev.filter(x => x.id !== p.id))
    setDeleting(null)
  }

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Users size={15} className="text-accent-light" />
        <h2 className="font-semibold">Team Positions</h2>
        <span className="text-xs text-muted">{positions.length}</span>
      </div>

      <div className="px-3 py-2 border-b border-border space-y-2">
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1 min-w-[8rem] !h-8 text-sm" placeholder="Position, e.g. Drums"
            value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <select className="input !h-8 !py-0 !px-2 text-sm !w-auto" value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          {category === 'Singers' && (
            <select className="input !h-8 !py-0 !px-2 text-sm !w-auto" value={level} onChange={e => setLevel(e.target.value)}>
              <option>Lead</option><option>Supporting</option>
            </select>
          )}
          <button onClick={add} disabled={!name.trim()} className="btn-primary flex items-center gap-1 !py-1 !px-3 text-sm">
            <Plus size={13} /> Add
          </button>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>

      <div className="px-3 py-2 space-y-3">
        {loading ? (
          <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : positions.length === 0 ? (
          <p className="text-xs text-muted py-2">No positions yet. Add the roles your team fills, such as Drums, Presenter, Sound, or Lead Vocal.</p>
        ) : (
          CATEGORIES.map(cat => {
            const items = positions.filter(p => p.category === cat)
            if (!items.length) return null
            return (
              <div key={cat}>
                <p className="text-[10px] uppercase tracking-widest text-muted mb-1">{cat}</p>
                <ul className="space-y-0.5">
                  {items.map(p => (
                    <li key={p.id} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-[#1a1a1a] group">
                      <span className="flex-1 min-w-0 truncate text-sm">{p.name}</span>
                      {p.level && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                          p.level === 'Lead' ? 'border-accent/50 bg-accent/15 text-accent-light' : 'border-border text-muted'
                        }`}>{p.level}</span>
                      )}
                      <button onClick={() => remove(p)} title={deleting === p.id ? 'Click again to confirm delete' : 'Delete'}
                        className={`p-1.5 rounded-lg transition-colors ${deleting === p.id ? 'bg-red-700 text-white' : 'sm:opacity-0 sm:group-hover:opacity-100 text-muted hover:text-red-400 hover:bg-[#2e2e2e]'}`}>
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
