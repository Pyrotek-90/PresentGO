import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { makeScope } from '../lib/scope'
import { teamColorMap, LEAD_COLOR } from '../lib/teamColors'
import { isPaid, canPresent } from '../lib/plans'
import { isOfflineEnabled } from '../lib/offline'
import { downloadForOffline } from '../lib/offlineSync'

// Which church and workspace the app is working in, and what this person may do there.
//
//  Admin  — the whole church (every workspace, songs, team, people and roles)
//  Leader — their workspace(s): sets, schedule, songs, team, content
//  Member — musicians and singers: the sets they've accepted, read-only
//
// Until the churches migration (supabase/migrations/2026-10-22_churches.sql) has been run, the
// app keeps working the old way: everything belongs to the signed-in user ("legacy").

const ChurchContext = createContext(null)
const KEY = 'stafflist.workspace'   // { church, workspace } last used on this device

const readSaved = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }
const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* ignore */ } }

export function ChurchProvider({ children }) {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, legacy: false, churches: [] })
  const [pick, setPick] = useState(readSaved)

  const load = useCallback(async () => {
    if (!user) { setState({ loading: false, legacy: false, churches: [] }); return }
    const cacheKey = `stafflist.churches.${user.id}`
    let data = null, error = null
    try {
      await supabase.rpc('join_my_teams')
      ;({ data, error } = await supabase.rpc('my_churches'))
    } catch (e) { error = e }
    if (error) {
      // Offline: use what we knew last time. Otherwise the churches migration hasn't been run
      // yet (the function is missing): keep working the old way.
      let cached = null
      try { cached = JSON.parse(localStorage.getItem(cacheKey)) } catch { /* ignore */ }
      if (cached && !navigator.onLine) setState({ loading: false, legacy: false, churches: cached })
      else setState({ loading: false, legacy: !cached, churches: cached || [] })
      return
    }
    const churches = Array.isArray(data) ? data : []
    try { localStorage.setItem(cacheKey, JSON.stringify(churches)) } catch { /* ignore */ }
    setState({ loading: false, legacy: false, churches })
  }, [user?.id])

  useEffect(() => { setState(s => ({ ...s, loading: true })); load() }, [load])

  const value = useMemo(() => {
    const { churches, legacy, loading } = state
    const church = churches.find(c => c.id === pick.church) || churches.find(c => c.editor) || churches[0] || null
    const leadable = church?.workspaces?.filter(w => w.lead) || []
    const workspace = church?.editor
      ? (leadable.find(w => w.id === pick.workspace) || leadable[0] || null)
      : null
    const isAdmin = church?.role === 'admin'
    const isEditor = legacy || !!church?.editor
    const canLead = legacy || !!workspace?.lead
    // The team's plan. Before the churches update everything stays open (as it always was).
    const plan = legacy ? 'pro' : church?.plan || 'free'
    const scope = makeScope({ userId: user?.id, church, workspace, legacy, canLead, plan })
    const colors = teamColorMap(churches)
    return {
      loading, legacy, churches, church, workspace, isAdmin, isEditor, canLead, scope,
      plan, pro: isPaid(plan), present: canPresent(plan),
      // Free / Pro: one "Team". Ultimate: a "Church" with several workspaces.
      unitLabel: church?.plan === 'ultimate' ? 'Church' : 'Team',
      // this person's color for each team's sets
      colors,
      teamColor: churchId => colors[churchId] || LEAD_COLOR,
      setTeamColor: async (churchId, color) => {
        setState(st => ({ ...st, churches: st.churches.map(c => (c.id === churchId ? { ...c, color } : c)) }))
        const { error } = await supabase.rpc('set_my_team_color', { p_church: churchId, p_color: color })
        if (error) load()
      },
      // can this person change a set (by its church / workspace)?
      canEditSet: set => legacy || !set || (set.church_id
        ? (churches.find(c => c.id === set.church_id)?.role === 'admin'
          || !!churches.find(c => c.id === set.church_id)?.workspaces?.find(w => w.id === set.workspace_id)?.lead)
        : set.user_id === user?.id),
      choose: (churchId, workspaceId) => { const v = { church: churchId, workspace: workspaceId }; save(v); setPick(v) },
      refresh: load,
    }
  }, [state, pick, user?.id])

  // Offline mode: refresh the downloaded copy once we know the church (once per session).
  const { loading: churchLoading, legacy: isLegacy } = state
  const scopeKey = `${value.scope.churchId}|${value.scope.workspaceId}|${isLegacy}`
  useEffect(() => {
    if (!user || churchLoading || !isOfflineEnabled() || !navigator.onLine) return
    downloadForOffline(value.scope).catch(() => {})
  }, [user?.id, churchLoading, scopeKey])   // eslint-disable-line react-hooks/exhaustive-deps

  return <ChurchContext.Provider value={value}>{children}</ChurchContext.Provider>
}

export const useChurch = () => useContext(ChurchContext)
