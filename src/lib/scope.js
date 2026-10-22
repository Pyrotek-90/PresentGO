// Where the app's queries look and where new rows go: the current church and workspace.
// Before the churches migration ("legacy"), everything is filtered by and saved to the user.
//
//   scope.church(query)   songs, team, positions, content: the church's
//   scope.sets(query)     sets: the current workspace's (Leaders / Admins), or every set this
//                         person can see in the church (Members — the database only returns the
//                         sets they've accepted)
//   scope.owned(row)      a new song / team member / position / content row
//   scope.ownedSet(row)   a new set (goes into the current workspace)

export function makeScope({ userId, church = null, workspace = null, legacy = false, canLead = false }) {
  const old = legacy || !church
  return {
    userId,
    churchId: church?.id || null,
    workspaceId: workspace?.id || null,
    legacy: old,
    church: q => (old ? q.eq('user_id', userId) : q.eq('church_id', church.id)),
    sets: q => (old ? q.eq('user_id', userId)
      : workspace && canLead ? q.eq('workspace_id', workspace.id) : q.eq('church_id', church.id)),
    owned: (row = {}) => (old ? { ...row, user_id: userId } : { ...row, user_id: userId, church_id: church.id }),
    ownedSet: (row = {}) => (old ? { ...row, user_id: userId }
      : { ...row, user_id: userId, church_id: church.id, ...(workspace ? { workspace_id: workspace.id } : {}) }),
  }
}
