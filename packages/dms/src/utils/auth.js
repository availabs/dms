// Merge an `override` authPermissions onto a `base` (inheritance: pattern ⊕ page, or pattern ⊕
// source). For each group/user key in the override: `[]` DISABLES the inherited grant, a non-empty
// array REPLACES it. Returns a new object; with no override returns the base unchanged.
// NOTE: the server (avail-falcor / dms-server) reimplements this identically for source-data
// enforcement — keep the two in sync.
export function mergeAuthPermissions (base = {}, override) {
    if (!override) return base || {};
    const groups = { ...(base?.groups || {}) };
    const users = { ...(base?.users || {}) };
    for (const [id, perms] of Object.entries(override.users || {})) {
        if (Array.isArray(perms) && perms.length === 0) delete users[id];
        else users[id] = perms;
    }
    for (const [name, perms] of Object.entries(override.groups || {})) {
        if (Array.isArray(perms) && perms.length === 0) delete groups[name];
        else groups[name] = perms;
    }
    return { groups, users };
}

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
