// What each plan includes. Free: songs, charts, sets, the schedule calendar, Team Details.
// Pro adds AI tools, presenting, scheduling and the team; Ultimate adds workspaces.
// The plan belongs to the team (churches.plan). Before the churches update, everything is open.

export const PLAN_LABEL = { free: 'Free', pro: 'Pro', ultimate: 'Ultimate' }
export const isPaid = plan => plan === 'pro' || plan === 'ultimate'

// Content Library storage per plan, in bytes.
export const STORAGE_LIMIT = { free: 100 * 1024 * 1024, pro: 500 * 1024 * 1024, ultimate: 5 * 1024 * 1024 * 1024 }
export const storageLimit = plan => STORAGE_LIMIT[plan] ?? STORAGE_LIMIT.free
