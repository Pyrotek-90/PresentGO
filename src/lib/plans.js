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
