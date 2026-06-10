export function isUserAuthed ({user={}, reqPermissions=[], authPermissions={}}) {
    if(!reqPermissions?.length) return true;
    const authedGroups = authPermissions.groups || {};
    const authedUsers = authPermissions.users || {};

    // if user is logged in and auth has not been set up (beyond public group) → allow
    if(user.authed && !Object.keys(authedGroups).filter(g => g !== 'public').length && !Object.keys(authedUsers).length) return true;

    if(!Object.keys(authedGroups).length && !Object.keys(authedUsers).length) return true;

    const userAuthPermissions = [
      ...(authedUsers[user?.id] || []),
      ...(user.groups || [])
        .filter(group => authedGroups[group])
        .reduce((acc, group) => {
            const groupPermissions = Array.isArray(authedGroups[group]) ? authedGroups[group] : [authedGroups[group]];
            if(groupPermissions?.length) acc.push(...groupPermissions);
            return acc;
        }, [])
    ];

    return userAuthPermissions.some(permission => permission === '*' || reqPermissions.includes(permission));
}
