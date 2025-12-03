export const defaultCheck = ( checkAuth, {user}, activeConfig, navigate ,path) =>  {
      
  const getReqAuth = (configs) => {
    return configs.reduce((out,config) => {
      let reqPermissions = config.reqPermissions || [];
      let authPermissions = config.authPermissions || {};
      return {
        reqPermissions: [...new Set([...reqPermissions, ...out.reqPermissions])],
        authPermissions // same for a pattern
      }
    }, {reqPermissions: [], authPermissions: []})
  } 
  let {reqPermissions, authPermissions} = getReqAuth(activeConfig)

  checkAuth({user, reqPermissions, authPermissions}, navigate, path)
}

export const defaultCheckAuth = ( props, navigate, path ) => {
  const {user = {}, reqPermissions, authPermissions = {}} = props

  const userAuthed = user?.authed || false

    const authedGroups = authPermissions.groups || {};
    const authedUsers = authPermissions.users || {};
    
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

  const sendToLogin = !userAuthed && // user is not authed
      reqPermissions?.length // there are required permissions to access this pattern at siteconfig level
      // Object.keys(authPermissions).length; // pattern defines SOME auth; if not, allow access.
  const sendToHome =
      reqPermissions?.length && // there are requires permissions to access this pattern in siteconfig
      (Object.keys(authedGroups).length || Object.keys(authedUsers).length) && // pattern defines SOME auth; if not, allow access.
      !userAuthPermissions.some(permission => permission === '*' || reqPermissions.includes(permission));
  //----------------------------------------
  // if page requires auth
  // && user isn't logged in
  // send to login 
  //----------------------------------------
  if( sendToLogin ) {
    navigate('/auth/login', {state:{ from: path }})
  }

  //----------------------------------------
  // if page requires auth level
  // && user is below that
  // send to home
  //----------------------------------------
  else if (sendToHome && path !== '/' ) {
     navigate('/')
  }

  return false
}
