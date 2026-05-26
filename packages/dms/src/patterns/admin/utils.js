export function isUserAuthed(user, authPermissions = {}) {
  const authedGroups = authPermissions.groups || {};
  const authedUsers  = authPermissions.users  || {};
  const userPerms = [
    ...(authedUsers[user?.id] || []),
    ...(user?.groups || [])
      .filter(g => authedGroups[g])
      .flatMap(g => {
        const p = authedGroups[g];
        return Array.isArray(p) ? p : [p];
      })
  ];
  return userPerms.some(p => p === '*');
}
