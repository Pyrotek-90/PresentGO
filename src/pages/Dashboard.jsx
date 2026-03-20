import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import { Plus, Calendar, ChevronRight, Music, Layers, Clock, FlaskConical } from 'lucide-react'

const MOCK_SETS = [
  { id: 'mock', name: 'Sunday Morning — March 23', service_date: '2026-03-23', updated_at: new Date().toISOString(), set_items: [{ count: 4 }] },
  { id: 'mock', name: 'Wednesday Night — March 19', service_date: '2026-03-19', updated_at: new Date(Date.now() - 3 * 86400000).toISOString(), set_items: [{ count: 2 }] },
]

export default function Dashboard() {
  const { user } = useAuth()
  const isMock = user?.id === 'mock-user-id'
  const navigate = useNavigate()
  const [sets, setSets] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newSetName, setNewSetName] = useState('')
  const [showNewSet, setShowNewSet] = useState(false)
  const [createError, setCreateError] = useState(null)

  useEffect(() => {
    if (isMock) {
      setSets(MOCK_SETS)
      setLoading(false)
      return
    }
    supabase
      .from('sets')
      .select('*, set_items(count)')
      .eq('user_id', user.id)
      .order('service_date', { ascending: false })
      .then(({ data }) => {
        setSets(data || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user.id, isMock])

  const createSet = async () => {
    if (!newSetName.trim()) return
    setCreateError(null)

    // In mock mode, just navigate to the mock set editor
    if (isMock) {
      setShowNewSet(false)
      setNewSetName('')
      navigate('/sets/mock')
      return
    }

    setCreating(true)
    const { data, error } = await supabase
      .from('sets')
      .insert({ user_id: user.id, name: newSetName.trim(), service_date: new Date().toISOString().split('T')[0] })
      .select()
      .single()
    setCreating(false)
    if (error) {
      setCreateError('Could not create set. Make sure the Supabase schema has been run.')
      return
    }
    navigate(`/sets/${data.id}`)
  }

  const formatDate = (d) => {
    if (!d) return ''
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const formatModified = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-6 space-y-8">

        {/* Demo mode banner */}
        {isMock && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-yellow-400/10 border border-yellow-400/20 text-sm">
            <FlaskConical size={16} className="text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-yellow-300 font-medium">Demo mode — </span>
              <span className="text-yellow-200/80">sample data shown. To save real sets, run the schema in Supabase and sign in with a real account.</span>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Set Lists</h1>
            <p className="text-muted text-sm mt-1">Your presentation sets</p>
          </div>
          <button
            onClick={() => setShowNewSet(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={16} />
            New Set
          </button>
        </div>

        {/* New set inline form */}
        {showNewSet && (
          <div className="space-y-2">
          {createError && <p className="text-red-400 text-sm px-1">{createError}</p>}
          <div className="card flex gap-3 items-center">
            <input
              className="input flex-1"
              placeholder="e.g. Sunday Morning — March 23"
              value={newSetName}
              onChange={e => setNewSetName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createSet()}
              autoFocus
            />
            <button onClick={createSet} disabled={creating} className="btn-primary shrink-0">
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button onClick={() => { setShowNewSet(false); setNewSetName(''); setCreateError(null) }} className="btn-ghost shrink-0">
              Cancel
            </button>
          </div>
          </div>
        )}

        {/* Sets list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sets.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Layers size={40} className="text-muted mx-auto" />
            <p className="text-muted">No sets yet. Create your first presentation set to get started.</p>
            <button onClick={() => setShowNewSet(true)} className="btn-primary mx-auto">
              <Plus size={16} className="inline mr-2" />Create Set
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {sets.map(set => (
              <button
                key={set.id}
                onClick={() => navigate(`/sets/${set.id}`)}
                className="w-full card hover:border-accent/50 transition-all flex items-center gap-4 text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                  <Calendar size={18} className="text-accent-light" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{set.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {set.service_date && (
                      <span className="text-xs text-muted">{formatDate(set.service_date)}</span>
                    )}
                    {set.set_items?.[0]?.count > 0 && (
                      <span className="text-xs text-muted flex items-center gap-1">
                        <Music size={11} />
                        {set.set_items[0].count} item{set.set_items[0].count !== 1 ? 's' : ''}
                      </span>
                    )}
                    {set.updated_at && (
                      <span className="text-xs text-muted flex items-center gap-1">
                        <Clock size={11} />
                        {formatModified(set.updated_at)}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={16} className="text-muted group-hover:text-[#f5f5f5] transition-colors shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
