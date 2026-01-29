export const isUserAuthed = ({user={}, reqPermissions=[], authPermissions={}}) => {
    if(!reqPermissions?.length) return true; // if there are no required permissions

    if(!user?.authed) return false;

    const authedGroups = authPermissions.groups || {};
    const authedUsers = authPermissions.users || {};
    if(!Object.keys(authedGroups).length && !Object.keys(authedUsers).length) return true;

    const userAuthPermissions =
        [
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
