// POST /api/v1/sets/save — create a set or save its details, the same way the web Set page does
// (src/pages/SetEditor.jsx saveDetails), so the iOS app gets repeating sets and extra times too.
//
// Body: {
//   id?, church_id? (new sets), workspace_id?,
//   name, date: 'YYYY-MM-DD', time?: 'HH:MM', duration?: minutes,
//   venue?, address?, room?,
//   times?: [{ label, date, time?, minutes? }],           // rehearsal, practice, soundcheck…
//   repeat?: { freq: 'weekly'|'biweekly'|'monthly', count?, until? } | null,
//   copy_program?: bool,                                     // copy this set's program to new repeats
//   scope?: 'one' | 'following',                             // in a series: also update the following sets
//   time_zone?
// }
// Returns { set, message? }.

import crypto from 'node:crypto'
import { userDb } from '../_lib/db.js'
import { nextDates, freqLabel, ruleSummary, sameRule, DEFAULT_COUNT, MAX_OCCURRENCES } from '../../src/lib/recurrence.js'
import { DEFAULT_MINUTES, daysBetween, addDays } from '../../src/lib/setTimes.js'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const s = (v, max = 300) => (typeof v === 'string' ? v : '').trim().slice(0, max)

export function cleanTimes(times) {
  return (Array.isArray(times) ? times : []).filter(t => t && DAY.test(t.date || '')).slice(0, 20).map(t => ({
    label: s(t.label, 60) || 'Rehearsal',
    date: t.date,
    ...(/^\d{2}:\d{2}/.test(t.time || '') ? { time: t.time.slice(0, 5) } : {}),
    minutes: Number(t.minutes) > 0 ? Math.min(Number(t.minutes), 1440) : DEFAULT_MINUTES,
  }))
}

// The times for a set on `date`: each keeps the same distance from the set as on `fromDate`.
export const timesFor = (times, fromDate, date) =>
  times.map(t => ({ ...t, date: fromDate && date ? addDays(date, daysBetween(fromDate, t.date)) : t.date }))

export function ruleFrom(r) {
  if (!r?.freq || !['weekly', 'biweekly', 'monthly'].includes(r.freq)) return null
  if (r.until && DAY.test(r.until)) return { freq: r.freq, until: r.until }
  return { freq: r.freq, count: Math.min(Math.max(Number(r.count) || DEFAULT_COUNT, 2), MAX_OCCURRENCES) }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const b = req.body || {}
  const name = s(b.name)
  const date = DAY.test(b.date || '') ? b.date : null
  if (!name) return res.status(400).json({ error: 'Set name is required.' })
  const rule = ruleFrom(b.repeat)
  if (rule && !date) return res.status(400).json({ error: 'Pick a date to repeat from.' })
  if (rule?.until && rule.until <= date) return res.status(400).json({ error: 'The end date must be after the set date.' })
  const times = cleanTimes(b.times)

  const db = userDb(req)
  const shared = {
    name,
    service_time: /^\d{2}:\d{2}/.test(b.time || '') ? b.time.slice(0, 5) : null,
    duration_min: Number(b.duration) > 0 ? Math.min(Number(b.duration), 1440) : 90,
    venue_name: s(b.venue) || null,
    location_address: s(b.address, 500) || null,
    location_details: s(b.room) || null,
    time_zone: s(b.time_zone, 64) || 'America/Chicago',
  }
  const patch = { ...shared, service_date: date, extra_times: times }

  // ── New set ──────────────────────────────────────────────────────────────────────────────
  let set
  if (!b.id) {
    if (!/^[0-9a-f-]{36}$/i.test(b.church_id || '')) return res.status(400).json({ error: 'church_id is required for a new set.' })
    const row = { ...patch, user_id: req.user.id, church_id: b.church_id, ...(b.workspace_id ? { workspace_id: b.workspace_id } : {}) }
    const { data, error } = await db.from('sets').insert(row).select().single()
    if (error) return res.status(400).json({ error: error.message })
    set = data
    if (!rule) return res.status(200).json({ set })
    b.id = set.id
  } else {
    const { data, error } = await db.from('sets').select('*').eq('id', b.id).maybeSingle()
    if (error) return res.status(400).json({ error: error.message })
    if (!data) return res.status(404).json({ error: "That set wasn't found, or you can't edit it." })
    set = data
  }

  // New sets for the given dates, copying the shared fields (and optionally this set's program).
  const createSeriesSets = async (dates, seriesId) => {
    if (!dates.length) return 0
    const rows = dates.map(d => ({
      user_id: req.user.id, church_id: set.church_id, workspace_id: set.workspace_id, ...shared,
      service_date: d, series_id: seriesId, recurrence: rule, extra_times: timesFor(times, date, d),
    }))
    const { data, error } = await db.from('sets').insert(rows).select('id')
    if (error) throw error
    if (b.copy_program && data?.length) {
      const { data: items } = await db.from('set_items').select('type, content, position').eq('set_id', set.id)
      if (items?.length) {
        await db.from('set_items').insert(data.flatMap(ns => items.map(it => ({ set_id: ns.id, type: it.type, content: it.content, position: it.position }))))
      }
    }
    return data?.length || 0
  }

  // Following sets in this series, split into empty ones (no program, no team) and ones in use.
  const followingSets = async () => {
    const { data } = await db.from('sets').select('id, service_date')
      .eq('series_id', set.series_id).gt('service_date', set.service_date || '0000-01-01')
    const ids = (data || []).map(r => r.id)
    if (!ids.length) return { empty: [], kept: [] }
    const [{ data: its }, { data: asg }] = await Promise.all([
      db.from('set_items').select('set_id').in('set_id', ids),
      db.from('set_assignments').select('set_id').in('set_id', ids),
    ])
    const busy = new Set([...(its || []), ...(asg || [])].map(r => r.set_id))
    return { empty: (data || []).filter(r => !busy.has(r.id)), kept: (data || []).filter(r => busy.has(r.id)) }
  }

  let message = null
  try {
    if (!set.series_id && rule) {
      const seriesId = crypto.randomUUID()
      const { data, error } = await db.from('sets').update({ ...patch, series_id: seriesId, recurrence: rule }).eq('id', set.id).select().single()
      if (error) throw error
      set = data
      const n = await createSeriesSets(nextDates(date, rule), seriesId)
      message = `Repeats ${freqLabel(rule.freq, date).toLowerCase()} — added ${n} more set${n === 1 ? '' : 's'}.`
    } else if (set.series_id) {
      const ruleChanged = !sameRule(rule, set.recurrence)
      const before = set
      const { data, error } = await db.from('sets').update({ ...patch, recurrence: rule }).eq('id', set.id).select().single()
      if (error) throw error
      set = data
      if (b.scope === 'following') {
        await db.from('sets').update(shared).eq('series_id', set.series_id).gt('service_date', before.service_date || '0000-01-01')
        const { data: next } = await db.from('sets').select('id, service_date')
          .eq('series_id', set.series_id).gt('service_date', before.service_date || '0000-01-01')
        await Promise.all((next || []).map(r => db.from('sets')
          .update({ extra_times: r.service_date ? timesFor(times, date, r.service_date) : [] }).eq('id', r.id)))
        message = 'Updated this set and the following sets.'
      }
      if (ruleChanged) {
        const { empty, kept } = await followingSets()
        if (empty.length) await db.from('sets').delete().in('id', empty.map(r => r.id))
        let n = 0
        if (rule) {
          const have = new Set(kept.map(r => r.service_date))
          n = await createSeriesSets(nextDates(date, rule).filter(d => !have.has(d)), set.series_id)
          if (kept.length) await db.from('sets').update({ recurrence: rule }).in('id', kept.map(r => r.id))
        }
        message = rule
          ? `Repeat updated: ${ruleSummary(rule, date)}.`
          : `Stopped repeating${empty.length ? ` — removed ${empty.length} empty upcoming set${empty.length === 1 ? '' : 's'}` : ''}.`
        if (kept.length) message += ` Kept ${kept.length} upcoming set${kept.length === 1 ? '' : 's'} that already ${kept.length === 1 ? 'has' : 'have'} a program or team.`
        if (rule && n) message += ` Added ${n}.`
      }
    } else {
      const { data, error } = await db.from('sets').update(patch).eq('id', set.id).select().single()
      if (error) throw error
      set = data
    }
  } catch (err) {
    console.error('sets/save failed', err)
    return res.status(400).json({ error: err.message || 'Could not save the set.' })
  }
  return res.status(200).json({ set, message })
}
