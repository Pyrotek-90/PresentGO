// Colors for sets from each team, chosen per person (Settings, or the Schedule's color key).
// The team you lead defaults to StaffList teal; teams you serve on get the next color in line.

export const TEAM_COLORS = ['#22d3ee', '#a78bfa', '#fbbf24', '#f472b6', '#4ade80', '#fb923c', '#60a5fa', '#f87171']
export const LEAD_COLOR = TEAM_COLORS[0]

// churches (from my_churches) → { churchId: color }
export function teamColorMap(churches = []) {
  const out = {}
  let k = 0
  for (const c of churches) {
    out[c.id] = c.color || (c.editor ? LEAD_COLOR : TEAM_COLORS[1 + (k++ % (TEAM_COLORS.length - 1))])
  }
  return out
}

// Chip styles for a color on the dark background.
export const chipStyle = hex => ({ backgroundColor: `${hex}33`, color: hex })
export const dotStyle = hex => ({ backgroundColor: hex })
