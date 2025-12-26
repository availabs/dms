export function isUserAuthed ({user={}, reqPermissions=[], authPermissions={}}) {
    if(!reqPermissions?.length) return true; // if there are no required permissions
    // if(!user?.authed) return false; public group makes this useless
    const authedGroups = authPermissions.groups || {}; // will always have public group
    const authedUsers = authPermissions.users || {};

    // if user is logged in, and auth has not been setup (except public group) return true
    if(user.authed && !Object.keys(authedGroups).filter(g => g !== 'public').length && !Object.keys(authedUsers).length) return true;

    if(!Object.keys(authedGroups).length && !Object.keys(authedUsers).length) return true;

    const userAuthPermissions = [
      ...(authedUsers[user?.id] || []),
      ...(user.groups || [])
        .filter(group => authedGroups[group])
          .reduce((acc, group) => {
              const groupPermissions = Array.isArray(authedGroups[group]) ? authedGroups[group] : [authedGroups[group]];
              if(groupPermissions?.length){
                  acc.push(...groupPermissions)
              }
              return acc;
          }, [])
    ]

    return userAuthPermissions.some(permission => permission === '*' || reqPermissions.includes(permission))
}
