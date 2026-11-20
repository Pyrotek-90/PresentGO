// What each plan includes. Free: songs, charts, sets, the schedule calendar, Team Details.
// Solo adds presenting and the CCLI Report. Pro adds AI tools, scheduling and the team;
// Ultimate adds workspaces.
// The plan belongs to the team (churches.plan). Before the churches update, everything is open.

export const PLAN_LABEL = { free: 'Free', solo: 'Solo', pro: 'Pro', ultimate: 'Ultimate' }

// Pro features (AI tools, scheduling, the team, calendar sync): Pro and Ultimate.
export const isPaid = plan => plan === 'pro' || plan === 'ultimate'

// Presenting and the CCLI Report: Solo and up.
export const canPresent = plan => plan === 'solo' || isPaid(plan)

// Content Library storage per plan, in bytes.
export const STORAGE_LIMIT = {
  free: 100 * 1024 * 1024,
  solo: 500 * 1024 * 1024,
  pro: 1024 * 1024 * 1024,
  ultimate: 5 * 1024 * 1024 * 1024,
}
export const storageLimit = plan => STORAGE_LIMIT[plan] ?? STORAGE_LIMIT.free

// Devices signed in at once (Solo only). Not enforced yet.
export const DEVICE_LIMIT = { solo: 3 }

// The Feature Matrix (Settings → Account → Plan). true = included; a string is shown as is.
// Order of each `on`: [free, solo, pro, ultimate]. Keep the iOS copy (PlanMatrixView.swift) in step.
export const PLAN_ORDER = ['free', 'solo', 'pro', 'ultimate']
export const PLAN_PRICE = { free: 'Free', solo: '$5/mo', pro: '$12/mo', ultimate: 'Coming soon' }
export const PLAN_MATRIX = [
  { group: 'Your music book', rows: [
    ['Songs, chord charts & transposition', [true, true, true, true]],
    ['Imports (ChordPro, PDF charts, bulk folder)', [true, true, true, true]],
    ['Sets, Song Viewer & schedule calendar', [true, true, true, true]],
    ['Team Details', [true, true, true, true]],
    ['Content Library', ['100 MB', '500 MB', '1 GB', '5 GB']],
  ] },
  { group: 'Presenting', rows: [
    ['Controller, Up Next, Loop & TV output', [false, true, true, true]],
    ['CCLI Report', [false, true, true, true]],
    ['Song Library as a PDF songbook', [false, true, true, true]],
    ['Devices signed in at once', [false, 'Up to 3', 'No limit', 'No limit']],
  ] },
  { group: 'AI tools', rows: [
    ['AI Translate (lyrics & slides)', [false, false, true, true]],
    ['AI Worship Leader Notes', [false, false, true, true]],
    ['AI key / BPM lookup & Smart Cleanup', [false, false, true, true]],
  ] },
  { group: 'Team', rows: [
    ['Scheduling, email invites & calendar sync', [false, false, true, true]],
    ['Add, invite & message team members', [false, false, true, true]],
    ['Shared access for musicians & singers', [false, false, true, true]],
  ] },
  { group: 'Church', rows: [
    ['Up to 5 workspaces (Main, Youth, Kids…)', [false, false, false, true]],
    ['Announcements page', [false, false, false, true]],
    ['Registrations & merchandise', [false, false, false, true]],
  ] },
]
