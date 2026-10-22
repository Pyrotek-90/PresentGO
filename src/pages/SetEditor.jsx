import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useChurch } from '../contexts/ChurchContext'
import { formatModified, formatSetTime } from '../lib/sets'
import { buildIcs } from '../lib/ics'
import { nextDates, freqLabel, ruleSummary, sameRule, DEFAULT_COUNT, MAX_OCCURRENCES } from '../lib/recurrence'
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Layout from '../components/Layout'
import AddItemModal from '../components/sets/AddItemModal'
import SongEditor from '../components/songs/SongEditor'
import SetSongViewer from '../components/songs/SetSongViewer'
import ItemOptionsDialog from '../components/sets/ItemOptionsDialog'
import { formatLyrics } from '../lib/lyricFormatter'
import { arrangedSlides } from '../lib/arrangement'
import { stripRepeat } from '../lib/repeat'
import { extraTimes, timeText, TIME_NAMES, DEFAULT_MINUTES, daysBetween, addDays } from '../lib/setTimes'
import {
  Plus, X, MonitorPlay, Music, Star, Megaphone, Square,
  GripVertical, Trash2, ArrowLeft, Layers, FolderOpen, Pencil, CalendarPlus, MapPin, BookOpen, Repeat, ChevronDown, NotebookPen, Mic, Clock3,
} from 'lucide-react'

const ITEM_ICONS  = { song: Music, welcome: Star, announcement: Megaphone, blank: Square, media: FolderOpen, note: NotebookPen }
const ITEM_LABELS = { song: 'Song', welcome: 'Welcome', announcement: 'Announcement', blank: 'Blank', media: 'Content', note: 'Worship Leader Note · Song Viewer only' }
const ITEM_COLORS = {
  song:         'text-accent-light bg-accent/20',
  welcome:      'text-yellow-400 bg-yellow-400/10',
  announcement: 'text-orange-400 bg-orange-400/10',
  blank:        'text-gray-500 bg-gray-500/10',
  media:        'text-purple-400 bg-purple-400/10',
  note:         'text-amber-300 bg-amber-400/10',
}

const REVEAL = 80   // px the row slides to show the trash can

function SortableRow({ leadLabel, item, idx, ItemIcon, colorClass, title, subtitle, keyLabel, onOptions, open, onSwipe, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const [dx, setDx] = useState(null)       // live finger offset while swiping, null when not swiping
  const touch = useRef(null)

  const onTouchStart = e => {
    if (e.target.closest('[data-drag-handle]')) return
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: open ? -REVEAL : 0, swiping: false }
  }
  const onTouchMove = e => {
    const t = touch.current
    if (!t) return
    const mx = e.touches[0].clientX - t.x
    const my = e.touches[0].clientY - t.y
    if (!t.swiping) {
      if (Math.abs(mx) < 8 || Math.abs(mx) < Math.abs(my)) return   // not a sideways swipe
      t.swiping = true
    }
    setDx(Math.max(-REVEAL, Math.min(0, t.base + mx)))
  }
  const onTouchEnd = () => {
    const t = touch.current
    touch.current = null
    if (!t?.swiping) return
    onSwipe(dx !== null && dx < -REVEAL / 2)
    setDx(null)
  }

  const offset = dx !== null ? dx : open ? -REVEAL : 0

  return (
    <li ref={setNodeRef} data-swiped-row={open ? '' : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined, position: 'relative' }}
      className={`rounded-lg ${isDragging ? 'shadow-xl ring-1 ring-accent/50' : 'overflow-hidden'}`}>
      <button type="button" onClick={onDelete} tabIndex={open ? 0 : -1} aria-label={`Delete ${title}`} aria-hidden={!open}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-600 text-white"
        style={{ width: REVEAL }}>
        <Trash2 size={20} />
      </button>
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${offset}px)`, transition: dx !== null ? 'none' : 'transform 0.2s ease', touchAction: 'pan-y' }}
        className={`relative flex items-center gap-2 px-1 py-1.5 group ${isDragging ? 'bg-accent/15' : 'bg-card hover:bg-[#1a1a1a]'}`}>
        <button type="button" data-drag-handle {...attributes} {...listeners} aria-label={`Drag to reorder ${title}`} title="Drag to reorder"
          className="w-8 h-9 flex items-center justify-center rounded-md text-muted hover:text-[#f5f5f5] cursor-grab active:cursor-grabbing touch-none shrink-0">
          <GripVertical size={16} />
        </button>
        <span className="text-xs text-muted w-4 shrink-0 text-center">{idx + 1}</span>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${colorClass}`}><ItemIcon size={13} /></div>
        <button onClick={() => (open ? onSwipe(false) : onOptions(item))} className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium leading-snug line-clamp-2 sm:truncate">{title}</p>
          <p className="text-xs text-muted truncate">{subtitle}</p>
        </button>
        {leadLabel && (
          <button onClick={() => (open ? onSwipe(false) : onOptions(item))} title={`Song Leader: ${leadLabel}`}
            className="shrink-0 max-w-[4.5rem] sm:max-w-[16rem] h-7 px-2 rounded-md border border-border text-xs text-muted hover:text-[#f5f5f5] flex items-center gap-1">
            <span className="shrink-0 hidden sm:inline">Song Leader:</span><span className="truncate font-semibold sm:hidden">{leadLabel.split(/\s+/)[0]}</span><span className="truncate font-semibold hidden sm:inline">{leadLabel}</span>
          </button>
        )}
        {keyLabel && (
          <button onClick={() => (open ? onSwipe(false) : onOptions(item))} title={`Key: ${keyLabel} (tap to change for this set)`}
            className="shrink-0 min-w-[2rem] h-7 px-2 rounded-md border border-border text-xs font-semibold text-muted hover:text-[#f5f5f5]">{keyLabel}</button>
        )}
        <button onClick={() => (open ? onSwipe(false) : onOptions(item))} aria-label="Item options" title="Options"
          className="p-1.5 rounded-lg hover:bg-[#2e2e2e] text-muted hover:text-[#f5f5f5] shrink-0"><Pencil size={14} /></button>
      </div>
    </li>
  )
}

const shortKey = k => (k || '').replace(' Major', '').replace(' Minor', 'm')

export default function SetEditor() {
  const { setId } = useParams()
  const { user } = useAuth()
  const { canEditSet } = useChurch()
  const navigate = useNavigate()
  const location = useLocation()
  const [isNew, setIsNew] = useState(!!location.state?.newSet)   // just created from Home's + New Set
  const [set, setSet]       = useState(null)
  const [items, setItems]   = useState([])
  const [songs, setSongs]   = useState({})
  const [team, setTeam]     = useState([])   // people assigned to this set: { id, name, positions[], status }
  const [editItem, setEditItem] = useState(null)
  const [editSong, setEditSong] = useState(null)
  const [viewerOpen, setViewerOpen] = useState(false)   // false, or true / the entry index to open at
  const [optionsItem, setOptionsItem] = useState(null)
  const [swipedId, setSwipedId] = useState(null)   // row currently swiped open to show its trash can
  const [details, setDetails] = useState(null)   // form state while editing set details
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [notice, setNotice] = useState(null)
  const [detailsError, setDetailsError] = useState(null)
  const [showAdd, setShowAdd]   = useState(false)
  const [confirmDeleteSet, setConfirmDeleteSet] = useState(false)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      // Mock data for preview
      if (setId === 'mock') {
        setSet({ id: 'mock', name: 'Sunday Morning — March 23', service_date: '2026-03-23' })
        const mockSongId = 'mock-song-1'
        const mockSong = {
          id: mockSongId, title: 'Holy Forever', artist: 'Bethel Music', lines_per_slide: 2,
          raw_lyrics: '[Verse 1]\nA thousand generations falling down in worship\nTo sing the song of ages to the Lamb\n\n[Chorus]\nHoly forever\nA story never ending\nHoly forever\nTo sing Your praise unceasing',
          slides: [],
          metadata: { original_key: 'G Major', transposed_keys: ['A Major', 'B♭ Major'], chord_chart: '[Verse 1]\nG        D\nA thousand generations falling down in worship\nEm       C\nTo sing the song of ages to the Lamb\n' },
        }
        setSongs({ [mockSongId]: mockSong })
        setItems([
          { id: 'i1', type: 'welcome',      position: 0, content: { title: 'Welcome', subtitle: "Glad you're here!" } },
          { id: 'i2', type: 'song',         position: 1, content: { song_id: mockSongId, song_title: 'Holy Forever', song_artist: 'Bethel Music' } },
          { id: 'i3', type: 'announcement', position: 2, content: { title: 'Announcements', slides: [{ lines: ['Join us for small groups', 'Every Wednesday at 7pm'] }] } },
          { id: 'i4', type: 'blank',        position: 3, content: {} },
        ])
        setLoading(false)
        return
      }

      const [{ data: setData }, { data: itemsData }] = await Promise.all([
        supabase.from('sets').select('*').eq('id', setId).single(),
        supabase.from('set_items').select('*').eq('set_id', setId).order('position'),
      ])
      if (!setData) { navigate('/'); return }
      setSet(setData)
      setItems(itemsData || [])
      // Team assigned to this set (for choosing a lead singer per song). Same three reads as the
      // Schedule page, joined here; quietly empty if the team tables aren't set up.
      Promise.all([
        supabase.from('set_assignments').select('*').eq('set_id', setId),
        supabase.from('team_members').select('id, name'),
        supabase.from('positions').select('id, name, category'),
      ]).then(([a, m, p]) => {
        if (a.error) { console.warn('set team:', a.error.message); return }
        const memberBy = Object.fromEntries((m.data || []).map(x => [x.id, x]))
        const posBy = Object.fromEntries((p.data || []).map(x => [x.id, x]))
        const byId = {}
        for (const row of a.data || []) {
          const mem = memberBy[row.member_id]
          if (!mem) continue
          const pos = posBy[row.position_id]
          const t = byId[mem.id] || (byId[mem.id] = { id: mem.id, name: mem.name, positions: [], singer: false, status: row.status })
          if (pos?.name && !t.positions.includes(pos.name)) t.positions.push(pos.name)
          if (pos?.category === 'Singers' || /sing|vocal|lead|worship leader/i.test(pos?.name || '')) t.singer = true
          if (row.status === 'accepted') t.status = 'accepted'
        }
        setTeam(Object.values(byId).sort((x, y) => (y.singer - x.singer) || x.name.localeCompare(y.name)))
      }).catch(e => console.warn('set team:', e))
      if (location.state?.newSet) {
        openDetailsFor(setData, { name: '' })
        navigate(location.pathname, { replace: true, state: null })   // a refresh shouldn't reopen it
      }

      const songIds = (itemsData || []).filter(i => i.type === 'song').map(i => i.content?.song_id).filter(Boolean)
      if (songIds.length) {
        const { data: songData } = await supabase.from('songs').select('*').in('id', songIds)
        const map = {}
        for (const s of (songData || [])) map[s.id] = s
        setSongs(map)
      }
      setLoading(false)
    }
    load()
  }, [setId])

  const handleAddItem = async (item) => {
    if (setId === 'mock') return // no-op in mock mode
    const pos = items.length
    const { data } = await supabase
      .from('set_items')
      .insert({ set_id: setId, type: item.type, content: item.content, position: pos })
      .select().single()
    if (data) {
      setItems(prev => [...prev, data])
      if (item.type === 'song' && item.content.song_id) {
        const { data: song } = await supabase.from('songs').select('*').eq('id', item.content.song_id).single()
        if (song) setSongs(prev => ({ ...prev, [song.id]: song }))
      }
    }
  }

  const handleDelete = async item => {
    if (setId !== 'mock') await supabase.from('set_items').delete().eq('id', item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
    setOptionsItem(null)
  }

  // A set's own section order for a song (null = the song's arrangement).
  const handleSetArrangement = async (item, arrangement) => {
    const content = { ...item.content }
    if (arrangement?.length) content.arrangement = arrangement; else delete content.arrangement
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, content } : i)))
    setOptionsItem(o => (o && o.id === item.id ? { ...o, content } : o))
    if (setId !== 'mock') await supabase.from('set_items').update({ content }).eq('id', item.id)
  }

  // Lead singer for a song in this set (null = none).
  const handleSetLead = async (item, lead) => {
    const content = { ...item.content }
    if (lead) content.lead = lead; else delete content.lead
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, content } : i)))
    setOptionsItem(o => (o && o.id === item.id ? { ...o, content } : o))
    if (setId !== 'mock') await supabase.from('set_items').update({ content }).eq('id', item.id)
  }

  const handleSetKey = async (item, key) => {
    const content = { ...item.content }
    if (key) content.key = key; else delete content.key
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, content } : i)))
    setOptionsItem(prev => (prev && prev.id === item.id ? { ...prev, content } : prev))
    if (setId !== 'mock') await supabase.from('set_items').update({ content }).eq('id', item.id)
  }

  const DURATIONS = [30, 45, 60, 75, 90, 105, 120, 150, 180, 240]
  // Extra times (rehearsal, practice, run-thru…): saved once the set-times database update has been
  // run (sets then have extra_times).
  const hasTimes = !set || 'extra_times' in set
  const cleanTimes = d => (d.times || []).filter(t => t.date).map(t => ({
    label: t.label.trim() || 'Rehearsal', date: t.date, ...(t.time ? { time: t.time } : {}), minutes: Number(t.minutes) || DEFAULT_MINUTES,
  }))
  // The times for a set on `date`: each keeps the same distance from the set as on this one.
  const timesFor = (d, date) => cleanTimes(d).map(t => ({ ...t, date: d.date && date ? addDays(date, daysBetween(d.date, t.date)) : t.date }))
  const durationLabel = m => (m % 60 === 0 ? `${m / 60} hr` : m > 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`)

  const openDetailsFor = (s, overrides = {}) => {
    setDetailsError(null)
    setDetails({
      name: s?.name || '',
      date: s?.service_date || '',
      time: s?.service_time ? s.service_time.slice(0, 5) : '',
      duration: s?.duration_min || 90,
      venue: s?.venue_name || '',
      address: s?.location_address || '',
      room: s?.location_details || '',
      times: extraTimes(s),   // added with "+ Add time"
      freq: s?.recurrence?.freq || '',
      endMode: s?.recurrence?.until ? 'until' : 'count',
      count: s?.recurrence?.count || DEFAULT_COUNT,
      until: s?.recurrence?.until || '',
      copyProgram: false,
      scope: 'one',
      ...overrides,
    })
    setRepeatOpen(false)
  }
  const openDetails = () => openDetailsFor(set)

  // Cancel on a brand-new, still-empty set discards it and goes back Home.
  const cancelDetails = async () => {
    if (isNew && items.length === 0 && setId !== 'mock') {
      await supabase.from('sets').delete().eq('id', setId)
      navigate('/')
      return
    }
    setDetails(null)
  }

  const ruleFrom = d => !d.freq ? null
    : d.endMode === 'until' && d.until ? { freq: d.freq, until: d.until }
    : { freq: d.freq, count: Math.min(Math.max(Number(d.count) || DEFAULT_COUNT, 2), MAX_OCCURRENCES) }

  // Fields every set in a series shares (the date is each set's own).
  const sharedFields = d => ({
    name: d.name.trim(),
    service_time: d.time || null,
    duration_min: Number(d.duration) || 90,
    venue_name: d.venue.trim() || null,
    location_address: d.address.trim() || null,
    location_details: d.room.trim() || null,
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
  })

  // New sets for the given dates, copying the shared fields (and optionally this set's program).
  const createSeriesSets = async (dates, fields, seriesId, rule, copyProgram) => {
    if (!dates.length) return 0
    const rows = dates.map(date => ({ user_id: user.id, church_id: set.church_id, workspace_id: set.workspace_id, ...fields, service_date: date, series_id: seriesId, recurrence: rule,
      ...(hasTimes ? { extra_times: timesFor(details, date) } : {}) }))
    const { data, error } = await supabase.from('sets').insert(rows).select('id')
    if (error) throw error
    if (copyProgram && items.length && data?.length) {
      const copies = data.flatMap(ns => items.map(it => ({ set_id: ns.id, type: it.type, content: it.content, position: it.position })))
      await supabase.from('set_items').insert(copies)
    }
    return data?.length || 0
  }

  // Following sets in this series that are still empty (no program items, no team) can be replaced.
  const followingSets = async () => {
    const { data } = await supabase.from('sets').select('id, service_date')
      .eq('series_id', set.series_id).gt('service_date', set.service_date || '0000-01-01')
    const ids = (data || []).map(r => r.id)
    if (!ids.length) return { empty: [], kept: [] }
    const [{ data: its }, asg] = await Promise.all([
      supabase.from('set_items').select('set_id').in('set_id', ids),
      supabase.from('set_assignments').select('set_id').in('set_id', ids).then(r => r, () => ({ data: [] })),
    ])
    const busy = new Set([...(its || []), ...(asg?.data || [])].map(r => r.set_id))
    return { empty: (data || []).filter(r => !busy.has(r.id)), kept: (data || []).filter(r => busy.has(r.id)) }
  }

  const saveDetails = async () => {
    if (!details.name.trim()) { setDetailsError('Set name is required.'); return }
    const rule = ruleFrom(details)
    if (rule && !details.date) { setDetailsError('Pick a date to repeat from.'); return }
    if (rule?.until && rule.until <= details.date) { setDetailsError('The end date must be after the set date.'); return }
    const missingDate = (details.times || []).find(t => !t.date && (t.label.trim() || t.time))
    if (missingDate) { setDetailsError(`Pick a date for ${missingDate.label.trim() || 'the extra time'}, or remove it.`); return }
    if (cleanTimes(details).length && !hasTimes) {
      setDetailsError('Extra times need a one-time database update: run the set-times SQL in Supabase → SQL Editor, reload, then save again.')
      return
    }
    setDetailsSaving(true); setDetailsError(null)
    const shared = sharedFields(details)
    const patch = { ...shared, service_date: details.date || null, ...(hasTimes ? { extra_times: cleanTimes(details) } : {}) }
    const inSeries = !!set?.series_id
    const ruleChanged = !sameRule(rule, set?.recurrence)
    let msg = null

    if (setId !== 'mock') {
      try {
        if (!inSeries && rule) {
          const seriesId = crypto.randomUUID()
          const { error } = await supabase.from('sets').update({ ...patch, series_id: seriesId, recurrence: rule }).eq('id', setId)
          if (error) throw error
          patch.series_id = seriesId; patch.recurrence = rule
          const n = await createSeriesSets(nextDates(details.date, rule), shared, seriesId, rule, details.copyProgram)
          msg = `Repeats ${freqLabel(rule.freq, details.date).toLowerCase()} — added ${n} more set${n === 1 ? '' : 's'}.`
        } else if (inSeries) {
          const { error } = await supabase.from('sets').update({ ...patch, recurrence: rule }).eq('id', setId)
          if (error) throw error
          patch.recurrence = rule
          if (details.scope === 'following') {
            await supabase.from('sets').update(shared).eq('series_id', set.series_id).gt('service_date', set.service_date || '0000-01-01')
            if (hasTimes) {
              // each following set's times keep the same distance from its own date
              const { data: next } = await supabase.from('sets').select('id, service_date')
                .eq('series_id', set.series_id).gt('service_date', set.service_date || '0000-01-01')
              await Promise.all((next || []).map(r => supabase.from('sets')
                .update({ extra_times: r.service_date ? timesFor(details, r.service_date) : [] }).eq('id', r.id)))
            }
            msg = 'Updated this set and the following sets.'
          }
          if (ruleChanged) {
            const { empty, kept } = await followingSets()
            if (empty.length) await supabase.from('sets').delete().in('id', empty.map(r => r.id))
            let n = 0
            if (rule) {
              const have = new Set(kept.map(r => r.service_date))
              n = await createSeriesSets(nextDates(details.date, rule).filter(d => !have.has(d)), shared, set.series_id, rule, details.copyProgram)
              if (kept.length) await supabase.from('sets').update({ recurrence: rule }).in('id', kept.map(r => r.id))
            }
            msg = rule
              ? `Repeat updated: ${ruleSummary(rule, details.date)}.`
              : `Stopped repeating${empty.length ? ` — removed ${empty.length} empty upcoming set${empty.length === 1 ? '' : 's'}` : ''}.`
            if (kept.length) msg += ` Kept ${kept.length} upcoming set${kept.length === 1 ? '' : 's'} that already ${kept.length === 1 ? 'has' : 'have'} a program or team.`
            if (rule && n) msg += ` Added ${n}.`
          }
        } else {
          const { error } = await supabase.from('sets').update(patch).eq('id', setId)
          if (error) throw error
        }
      } catch {
        setDetailsSaving(false)
        setDetailsError(rule || inSeries
          ? 'Could not save the repeat. Make sure the latest Supabase migration (recurring sets) has been run.'
          : 'Could not save. Make sure the latest Supabase migration has been run.')
        return
      }
    }
    setSet(prev => ({ ...prev, ...patch, updated_at: new Date().toISOString() }))
    setDetailsSaving(false); setDetails(null); setIsNew(false)
    if (msg) { setNotice(msg); setTimeout(() => setNotice(n => (n === msg ? null : n)), 8000) }
  }

  // Trash can in the header: first tap arms it (turns red), second tap deletes the set and its program.
  const deleteSet = async () => {
    if (!confirmDeleteSet) { setConfirmDeleteSet(true); setTimeout(() => setConfirmDeleteSet(false), 4000); return }
    const { error } = await supabase.from('sets').delete().eq('id', setId)
    if (error) { setConfirmDeleteSet(false); return }
    navigate('/')
  }

  const downloadIcs = () => {
    const ics = buildIcs([{ ...set, id: set.id }], { baseUrl: window.location.origin, calendarName: set.name })
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${(set.name || 'set').replace(/[^\w-]+/g, '_')}.ics`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleEdit = item => {
    if (item.type === 'song') {
      const song = songs[item.content?.song_id]
      if (song) setEditSong(song)
    } else if (item.type !== 'blank') {
      setEditItem(item)
    }
  }

  // Worship Leader Notes go just before their songs. An existing note right before a song is replaced.
  const handleAddNotes = async notes => {
    if (setId === 'mock' || !notes.length) return
    const bySong = new Map(notes.map(n => [n.songItemId, n.content]))
    const oldPos = new Map(items.map(it => [it.id, it.position]))
    const next = [], inserts = [], updates = []
    items.forEach((it, idx) => {
      const content = bySong.get(it.id)
      if (content) {
        const before = items[idx - 1]
        if (before?.type === 'note' && before.content?.song_id === it.content?.song_id) {
          updates.push({ id: before.id, content })
          next[next.length - 1] = { ...next[next.length - 1], content }
        } else {
          const row = { set_id: setId, type: 'note', content }
          inserts.push(row); next.push(row)
        }
      }
      next.push({ ...it })
    })
    next.forEach((it, i) => { it.position = i })
    let saved = []
    if (inserts.length) {
      const { data, error } = await supabase.from('set_items').insert(inserts).select()
      if (error) throw new Error(/check constraint|violates/i.test(error.message) ? 'Run the Worship Leader Notes migration in Supabase first.' : error.message)
      saved = data || []
    }
    await Promise.all([
      ...updates.map(u => supabase.from('set_items').update({ content: u.content }).eq('id', u.id)),
      ...next.filter(it => it.id && oldPos.get(it.id) !== it.position)
        .map(it => supabase.from('set_items').update({ position: it.position }).eq('id', it.id)),
    ])
    setItems(next.map(it => (it.id ? it : saved.find(d => d.position === it.position) || it)))
  }

  const handleSaveEdit = async ({ content }) => {
    if (setId !== 'mock') await supabase.from('set_items').update({ content }).eq('id', editItem.id)
    setItems(prev => prev.map(i => i.id === editItem.id ? { ...i, content } : i))
  }

  const handleSongSaved = async saved => {
    setSongs(prev => ({ ...prev, [saved.id]: saved }))
    const touched = items.filter(i => i.type === 'song' && i.content?.song_id === saved.id)
    const content = i => ({ ...i.content, song_title: saved.title, song_artist: saved.artist })
    setItems(prev => prev.map(i => touched.includes(i) ? { ...i, content: content(i) } : i))
    if (setId !== 'mock') await Promise.all(touched.map(i => supabase.from('set_items').update({ content: content(i) }).eq('id', i.id)))
  }

  useEffect(() => {
    if (!swipedId) return
    const close = e => { if (!e.target.closest('[data-swiped-row]')) setSwipedId(null) }
    document.addEventListener('touchstart', close, { passive: true })
    return () => document.removeEventListener('touchstart', close)
  }, [swipedId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return
    const from = items.findIndex(i => i.id === active.id)
    const to = items.findIndex(i => i.id === over.id)
    if (from < 0 || to < 0) return
    const before = items
    const next = arrayMove(items, from, to)
    setItems(next)
    if (setId === 'mock') return
    const changed = next.map((it, position) => ({ it, position })).filter(({ it, position }) => before.indexOf(it) !== position)
    const results = await Promise.all(changed.map(({ it, position }) => supabase.from('set_items').update({ position }).eq('id', it.id)))
    if (results.some(r => r.error)) setItems(before)   // couldn't save: put the order back
  }

  const getSlidesForItem = (item) => {
    if (item.type === 'song') {
      const song = songs[item.content?.song_id]
      if (!song) return []
      const slides = (song.slides?.length ? arrangedSlides(song, item.content?.arrangement) : null) || formatLyrics(song.raw_lyrics, song.lines_per_slide || 2)
      return slides.map(sl => ({ ...sl, lines: (sl.lines || []).map(stripRepeat) }))
    }
    if (item.type === 'welcome')      return [{ lines: [item.content.title, item.content.subtitle].filter(Boolean), label: 'Welcome' }]
    if (item.type === 'announcement') return (item.content.slides || [])
    if (item.type === 'blank')        return [{ lines: [], label: 'Blank' }]
    if (item.type === 'media' && item.content?.images?.length) return item.content.images.map(img => ({ image: img.url, lines: [] }))
    if (item.type === 'media')        return [{ lines: [item.content?.media_name || 'Media file'], label: item.content?.media_category || 'Content' }]
    return []
  }

  // Song Viewer: songs in order, with any Worship Leader Note just before its song.
  const orderedSongs = items.map(i =>
    i.type === 'note' ? { note: i.content }
    : i.type === 'song' && songs[i.content?.song_id] ? {
        song: i.content?.arrangement?.length
          ? { ...songs[i.content.song_id], slides: arrangedSlides(songs[i.content.song_id], i.content.arrangement) }
          : songs[i.content.song_id],
        key: i.content?.key || null,
        lead: i.content?.lead?.name || null,
      }
    : null).filter(Boolean)

  // Musicians and singers (Members) see the set read-only: the program, keys and the Song Viewer.
  const editable = setId === 'mock' || !set || canEditSet(set)
  const viewerIndex = item => {
    let n = 0
    for (const i of items) {
      if (i.id === item.id) return n
      if (i.type === 'note' || (i.type === 'song' && songs[i.content?.song_id])) n++
    }
    return 0
  }

  const openPresent = () => {
    navigate(`/sets/${setId}/control`)
  }

  const formatDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''

  const itemTitle = item =>
    item.type === 'song'  ? item.content?.song_title :
    item.type === 'media' ? item.content?.media_name :
    item.type === 'note'  ? `${item.content?.song_title || 'Song'} — Worship Leader Note` :
    item.content?.title || ITEM_LABELS[item.type]

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-3">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="btn-ghost p-1.5 rounded-lg shrink-0" aria-label="Back to Home">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 min-w-0">
              <h1 className="font-semibold text-lg truncate">{set?.name || '…'}</h1>
              {editable && <button onClick={openDetails} title="Edit set name, date and venue" aria-label="Edit set name, date and venue"
                className="p-1 rounded-md text-muted hover:text-[#f5f5f5] hover:bg-[#2e2e2e] shrink-0"><Pencil size={13} /></button>}
            </div>
            <p className="text-xs text-muted flex items-center gap-1 min-w-0">
              {set?.series_id && set?.recurrence && <Repeat size={11} className="text-accent-light shrink-0" aria-label="Repeating set" />}
              <span className="truncate">{[set?.service_date && formatDate(set.service_date), set?.service_time && formatSetTime(set.service_time), set?.series_id && set?.recurrence && freqLabel(set.recurrence.freq, set.service_date), set?.updated_at && `Updated ${formatModified(set.updated_at)}`].filter(Boolean).join(' · ')}</span>
            </p>
            {extraTimes(set).map((t, i) => (
              <p key={i} className="text-xs text-muted flex items-center gap-1 truncate"><Clock3 size={11} className="shrink-0" />{t.label} {timeText(t, { short: true })}</p>
            ))}
            {(set?.venue_name || set?.location_address) && (
              <p className="text-xs text-muted flex items-center gap-1 truncate"><MapPin size={11} className="shrink-0" />{[set.venue_name, set.location_address].filter(Boolean).join(', ')}{set.location_details ? ` · ${set.location_details}` : ''}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={downloadIcs} disabled={!set?.service_date} title={set?.service_date ? 'Download an event file for Apple, Google or Outlook calendar' : 'Add a date first'}
              className="hidden sm:flex btn-ghost items-center gap-1.5 text-sm !px-2.5 !py-1.5 disabled:opacity-40"><CalendarPlus size={14} /> Add to calendar</button>
            {editable && <button onClick={deleteSet} disabled={setId === 'mock'}
              title={confirmDeleteSet ? 'Tap again to delete this set' : 'Delete set'} aria-label={confirmDeleteSet ? 'Tap again to delete this set' : 'Delete set'}
              className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${confirmDeleteSet ? 'bg-red-700 text-white' : 'text-muted hover:text-red-400 hover:bg-[#2e2e2e]'}`}>
              <Trash2 size={15} />
            </button>}
          </div>
        </div>

        {details && (
          <section className="rounded-xl border border-border bg-card p-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 sm:col-span-4">
                <label className="label !mb-1">Set name</label>
                <input className="input" value={details.name} autoFocus={isNew} placeholder="e.g. Sunday Morning Worship"
                  onChange={e => setDetails(d => ({ ...d, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && saveDetails()} />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="label !mb-1">Date</label>
                <input type="date" className="input" value={details.date} onChange={e => setDetails(d => ({ ...d, date: e.target.value }))} />
              </div>
              <div>
                <label className="label !mb-1">Start time</label>
                <input type="time" className="input" value={details.time} onChange={e => setDetails(d => ({ ...d, time: e.target.value }))} />
              </div>
              <div>
                <label className="label !mb-1">Length</label>
                <select className="input" value={details.duration} onChange={e => setDetails(d => ({ ...d, duration: e.target.value }))}>
                  {(DURATIONS.includes(Number(details.duration)) ? DURATIONS : [...DURATIONS, Number(details.duration)].sort((a, b) => a - b)).map(m => <option key={m} value={m}>{durationLabel(m)}</option>)}
                </select>
              </div>
              {/* Extra times: rehearsal, practice, run-thru… named by the leader */}
              {(details.times || []).map((t, i) => {
                const upd = patch => setDetails(d => ({ ...d, times: d.times.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))
                return (
                  <div key={i} className="col-span-2 sm:col-span-4 grid grid-cols-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end">
                    <div>
                      <label className="label !mb-1" htmlFor={`time-name-${i}`}>Name</label>
                      <input id={`time-name-${i}`} className="input" list="extra-time-names" placeholder="Rehearsal" value={t.label} autoFocus={!t.label && !t.date}
                        onChange={e => upd({ label: e.target.value })} />
                    </div>
                    <div>
                      <label className="label !mb-1" htmlFor={`time-date-${i}`}>Date</label>
                      <input id={`time-date-${i}`} type="date" className="input" value={t.date} onChange={e => upd({ date: e.target.value })} />
                    </div>
                    <div>
                      <label className="label !mb-1" htmlFor={`time-time-${i}`}>Time</label>
                      <input id={`time-time-${i}`} type="time" className="input" value={t.time} onChange={e => upd({ time: e.target.value })} />
                    </div>
                    <div>
                      <label className="label !mb-1" htmlFor={`time-len-${i}`}>Length</label>
                      <select id={`time-len-${i}`} className="input" value={t.minutes} onChange={e => upd({ minutes: Number(e.target.value) })}>
                        {(DURATIONS.includes(Number(t.minutes)) ? DURATIONS : [...DURATIONS, Number(t.minutes)].sort((a, b) => a - b)).map(m => <option key={m} value={m}>{durationLabel(m)}</option>)}
                      </select>
                    </div>
                    <button type="button" onClick={() => setDetails(d => ({ ...d, times: d.times.filter((_, j) => j !== i) }))}
                      aria-label={`Remove ${t.label || 'this time'}`} title="Remove"
                      className="h-10 w-10 rounded-lg border border-border text-muted hover:text-red-400 hover:border-red-400/50 flex items-center justify-center justify-self-start"><X size={15} /></button>
                  </div>
                )
              })}
              <datalist id="extra-time-names">{TIME_NAMES.map(n => <option key={n} value={n} />)}</datalist>
              <div className="col-span-2 sm:col-span-4">
                <button type="button" onClick={() => setDetails(d => ({ ...d, times: [...(d.times || []), { label: '', date: '', time: '', minutes: DEFAULT_MINUTES }] }))}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-dashed border-accent/50 text-accent-light text-sm font-medium hover:bg-accent/10">
                  <Plus size={14} /> Add time <span className="text-muted font-normal hidden sm:inline">(rehearsal, practice, run-thru…)</span>
                </button>
              </div>
              <div className="col-span-2">
                <label className="label !mb-1">Venue name</label>
                <input className="input" placeholder="First Baptist Church" value={details.venue} onChange={e => setDetails(d => ({ ...d, venue: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label !mb-1">Address</label>
                <input className="input" placeholder="123 Main St, Dallas, TX 75201" value={details.address} onChange={e => setDetails(d => ({ ...d, address: e.target.value }))} />
              </div>
              <div className="col-span-2 sm:col-span-4">
                <label className="label !mb-1">Room / details (optional)</label>
                <input className="input" placeholder="Main Sanctuary" value={details.room} onChange={e => setDetails(d => ({ ...d, room: e.target.value }))} />
              </div>
            </div>
            {(() => {
              const rule = ruleFrom(details)
              const dates = rule ? nextDates(details.date, rule) : []
              const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              const FREQS = [['', 'Does not repeat'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', freqLabel('monthly', details.date)]]
              return (
                <div className="rounded-lg border border-border">
                  <button type="button" onClick={() => setRepeatOpen(o => !o)} aria-expanded={repeatOpen}
                    className="w-full flex items-center gap-2 px-3 h-10 text-left text-sm">
                    <Repeat size={14} className={rule ? 'text-accent-light' : 'text-muted'} />
                    <span className="font-medium">Repeat</span>
                    <span className="text-xs text-muted truncate">{rule ? ruleSummary(rule, details.date) : 'Does not repeat'}</span>
                    <ChevronDown size={14} className={`ml-auto text-muted transition-transform ${repeatOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {repeatOpen && (
                    <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                      <div className="flex flex-wrap gap-1.5">
                        {FREQS.map(([v, label]) => (
                          <button key={v || 'none'} type="button" onClick={() => setDetails(d => ({ ...d, freq: v }))}
                            className={`px-3 h-8 rounded-full border text-xs font-medium transition-colors ${details.freq === v ? 'border-accent bg-accent/20 text-accent-light' : 'border-border text-muted hover:text-[#f5f5f5]'}`}>{label}</button>
                        ))}
                      </div>
                      {details.freq && (
                        <>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                            <span className="text-xs text-muted">Ends</span>
                            <label className="flex items-center gap-2">
                              <input type="radio" name="ends" checked={details.endMode === 'count'} onChange={() => setDetails(d => ({ ...d, endMode: 'count' }))} className="accent-[#1a8aa8]" />
                              After
                              <input type="number" min="2" max={MAX_OCCURRENCES} className="input !w-16 !h-8 !py-0 text-sm" value={details.count}
                                onFocus={() => setDetails(d => ({ ...d, endMode: 'count' }))} onChange={e => setDetails(d => ({ ...d, count: e.target.value, endMode: 'count' }))} />
                              sets
                            </label>
                            <label className="flex items-center gap-2">
                              <input type="radio" name="ends" checked={details.endMode === 'until'} onChange={() => setDetails(d => ({ ...d, endMode: 'until' }))} className="accent-[#1a8aa8]" />
                              On
                              <input type="date" className="input !w-auto !h-8 !py-0 text-sm" value={details.until} min={details.date || undefined}
                                onFocus={() => setDetails(d => ({ ...d, endMode: 'until' }))} onChange={e => setDetails(d => ({ ...d, until: e.target.value, endMode: 'until' }))} />
                            </label>
                          </div>
                          {details.date ? (
                            <p className="text-[11px] text-muted leading-snug">
                              {set?.series_id && sameRule(rule, set.recurrence)
                                ? 'This set is part of a repeating series.'
                                : `${dates.length} more set${dates.length === 1 ? '' : 's'} after this one: ${dates.slice(0, 4).map(fmt).join(', ')}${dates.length > 4 ? ` … ${fmt(dates[dates.length - 1])}` : ''}.`}
                              {' '}Each gets the same name, time, length and venue.
                            </p>
                          ) : <p className="text-[11px] text-amber-400/90">Pick a date above to repeat from.</p>}
                          {items.length > 0 && !(set?.series_id && sameRule(rule, set.recurrence)) && (
                            <label className="flex items-center gap-2 text-xs">
                              <input type="checkbox" checked={details.copyProgram} onChange={e => setDetails(d => ({ ...d, copyProgram: e.target.checked }))} className="accent-[#1a8aa8]" />
                              Copy this set's program ({items.length} item{items.length === 1 ? '' : 's'}) to each new set
                            </label>
                          )}
                        </>
                      )}
                      {set?.series_id && !details.freq && set?.recurrence && (
                        <p className="text-[11px] text-amber-400/90 leading-snug">Saving stops the repeat after this set. Upcoming sets in the series that are still empty are removed; any with a program or team are kept.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
            {set?.series_id && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-xs text-muted">Apply changes to</span>
                {[['one', 'This set only'], ['following', 'This and following sets']].map(([v, label]) => (
                  <label key={v} className="flex items-center gap-2">
                    <input type="radio" name="scope" checked={details.scope === v} onChange={() => setDetails(d => ({ ...d, scope: v }))} className="accent-[#1a8aa8]" />
                    {label}
                  </label>
                ))}
              </div>
            )}
            {detailsError && <p className="text-red-400 text-xs">{detailsError}</p>}
            <div className="flex items-center gap-2">
              <button onClick={saveDetails} disabled={detailsSaving} className="btn-primary !py-1.5 !px-4 text-sm">{detailsSaving ? 'Saving…' : 'Save details'}</button>
              <button onClick={cancelDetails} className="btn-ghost text-sm">Cancel</button>
              <span className="ml-auto text-[11px] text-muted hidden sm:block">Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
            </div>
          </section>
        )}

        {notice && (
          <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent-light flex items-start gap-2">
            <Repeat size={13} className="shrink-0 mt-0.5" /> <span>{notice}</span>
          </p>
        )}

        {/* Program card */}
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
            <div className="flex items-baseline gap-2 min-w-0">
              <h2 className="font-semibold">Program</h2>
              <span className="text-xs text-muted whitespace-nowrap">{items.length}<span className="hidden sm:inline"> item{items.length !== 1 ? 's' : ''}</span></span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {editable && <button onClick={() => setShowAdd(true)} aria-label="Add item"
                className="flex items-center gap-1 h-8 px-2.5 sm:px-3 rounded-lg border border-accent/50 text-accent-light text-sm font-medium whitespace-nowrap transition-colors hover:bg-accent/10">
                <Plus size={14} /><span className="hidden sm:inline">Add</span> Item
              </button>}
              <button onClick={() => setViewerOpen(true)} disabled={orderedSongs.length === 0}
                title="Song Viewer: step through the songs in order" aria-label="Song Viewer"
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-accent/50 text-accent-light text-sm font-medium transition-colors hover:bg-accent/10 disabled:opacity-40 disabled:hover:bg-transparent">
                <BookOpen size={14} /><span className="hidden sm:inline">Song Viewer</span>
              </button>
              {editable && <button onClick={openPresent} disabled={items.length === 0} title="Present" aria-label="Present"
                className="flex items-center justify-center gap-1.5 h-8 w-9 sm:w-auto sm:px-3 rounded-lg border border-accent/50 text-accent-light text-sm font-medium transition-colors hover:bg-accent/10 disabled:opacity-40 disabled:hover:bg-transparent">
                <MonitorPlay size={15} /><span className="hidden sm:inline">Present</span>
              </button>}
            </div>
          </div>

          <div className="p-2">
            {loading ? (
              <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
            ) : items.length === 0 ? (
              <div className="text-center py-12 space-y-3 px-4">
                <Layers size={32} className="text-muted mx-auto" />
                <p className="text-muted text-sm">{editable ? "Build your program: add songs, title slides, announcements and content in the order they'll run." : "The leader hasn't added the program yet."}</p>
                {editable && <button onClick={() => setShowAdd(true)} className="btn-primary mx-auto flex items-center gap-1.5 text-sm">
                  <Plus size={14} /> Add Item
                </button>}
              </div>
            ) : !editable ? (
              <ul className="space-y-0.5">
                {items.map((item, idx) => {
                  const ItemIcon = ITEM_ICONS[item.type] || Square
                  const song = songs[item.content?.song_id]
                  const key = item.type === 'song' ? shortKey(item.content?.key || song?.metadata?.preferred_key || song?.metadata?.original_key || song?.metadata?.key || '') : ''
                  const lead = item.type === 'song' ? item.content?.lead?.name || '' : ''
                  const opens = item.type === 'note' || (item.type === 'song' && song)
                  return (
                    <li key={item.id}>
                      <button type="button" disabled={!opens} onClick={() => setViewerOpen(viewerIndex(item))}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-[#1a1a1a] disabled:hover:bg-transparent disabled:cursor-default">
                        <span className="text-xs text-muted w-4 shrink-0 text-center">{idx + 1}</span>
                        <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${ITEM_COLORS[item.type] || ITEM_COLORS.blank}`}><ItemIcon size={13} /></span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium truncate">{(item.type === 'song' && !item.content?.song_title && song?.title) || itemTitle(item)}</span>
                          <span className="block text-xs text-muted truncate">{ITEM_LABELS[item.type]}{item.type === 'song' && item.content?.song_artist ? ` · ${item.content.song_artist}` : ''}{lead ? ` · Song Leader: ${lead}` : ''}</span>
                        </span>
                        {key && <span className="shrink-0 min-w-[2rem] h-7 px-2 rounded-md border border-border text-xs font-semibold text-muted flex items-center justify-center" title={`Key: ${key}`}>{key}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-0.5">
                    {items.map((item, idx) => {
                      const slideCount = getSlidesForItem(item).length
                      return (
                        <SortableRow key={item.id} item={item} idx={idx}
                          ItemIcon={ITEM_ICONS[item.type] || Square} colorClass={ITEM_COLORS[item.type] || ITEM_COLORS.blank}
                          title={itemTitle(item)}
                          subtitle={`${item.type === 'media' ? (item.content?.files?.length > 1 ? `Content · ${item.content.files.length} files` : 'Content') : ITEM_LABELS[item.type]}${item.type === 'song' && item.content?.song_artist ? ` · ${item.content.song_artist}` : ''}${slideCount > 0 ? ` · ${slideCount} slide${slideCount !== 1 ? 's' : ''}` : ''}`}
                          leadLabel={item.type === 'song' ? (item.content?.lead?.name || '') : ''}
                          keyLabel={item.type === 'song' ? shortKey(item.content?.key || songs[item.content?.song_id]?.metadata?.preferred_key || songs[item.content?.song_id]?.metadata?.original_key || songs[item.content?.song_id]?.metadata?.key || '') : ''}
                          onOptions={it => (it.type === 'song' || it.type === 'blank' ? setOptionsItem(it) : handleEdit(it))}
                          open={swipedId === item.id} onSwipe={o => setSwipedId(o ? item.id : null)}
                          onDelete={async () => { setSwipedId(null); await handleDelete(item) }} />
                      )
                    })}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </section>

        {items.length > 0 && editable && (
          <p className="text-xs text-muted text-center">When your program is ready, tap <strong className="text-[#f5f5f5]">Present</strong> (<MonitorPlay size={12} className="inline -mt-0.5" />) to connect a TV and run the slides.</p>
        )}
      </div>

      {showAdd && <AddItemModal onClose={() => setShowAdd(false)} onAdd={handleAddItem} onAddNotes={handleAddNotes}
        setSongs={items.map((it, i) => it.type === 'song' ? {
          itemId: it.id, title: it.content?.song_title || songs[it.content?.song_id]?.title || 'Song',
          artist: it.content?.song_artist || songs[it.content?.song_id]?.artist || '', song: songs[it.content?.song_id],
          hasNote: items[i - 1]?.type === 'note' && items[i - 1].content?.song_id === it.content?.song_id,
        } : null).filter(Boolean)} />}
      {editItem && <AddItemModal item={editItem} onClose={() => setEditItem(null)} onAdd={handleSaveEdit}
        onDelete={async () => { const it = editItem; setEditItem(null); await handleDelete(it) }} />}
      {optionsItem && (
        <ItemOptionsDialog item={optionsItem} title={itemTitle(optionsItem)} song={songs[optionsItem.content?.song_id]}
          onClose={() => setOptionsItem(null)}
          onSetKey={key => handleSetKey(optionsItem, key)}
          onSetArrangement={arr => handleSetArrangement(optionsItem, arr)}
          team={team} onSetLead={lead => handleSetLead(optionsItem, lead)}
          onEdit={() => { const it = optionsItem; setOptionsItem(null); handleEdit(it) }}
          onRemove={() => handleDelete(optionsItem)} />
      )}
      {viewerOpen !== false && orderedSongs.length > 0 && <SetSongViewer entries={orderedSongs} startIndex={viewerOpen === true ? 0 : viewerOpen} onClose={() => setViewerOpen(false)} />}
      {editSong && <SongEditor song={editSong} onClose={() => setEditSong(null)} onSaved={handleSongSaved} />}
    </Layout>
  )
}
