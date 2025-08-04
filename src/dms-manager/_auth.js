export const defaultCheck = ( checkAuth, {user}, activeConfig, navigate ,path) =>  {
      
  const getReqAuth = (configs) => {
    return configs.reduce((out,config) => {
      console.log('_auth: config', config)
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
  const {user = {}, reqPermissions, authPermissions} = props

  const userAuthed = user?.authed || false

  const userAuthPermissions =
      (user.groups || [])
          .filter(group => authPermissions[group])
          .reduce((acc, group) => {
            const groupPermissions = Array.isArray(authPermissions[group]) ? authPermissions[group] : [authPermissions[group]];
            if(groupPermissions?.length){
              acc.push(...groupPermissions)
            }
            return acc;
            }, [])

  const sendToLogin = !userAuthed && reqPermissions?.length;
  const sendToHome = (reqPermissions?.length && !userAuthPermissions.some(permission => permission === '*' || reqPermissions.includes(permission)));
  console.log('permissions match', userAuthPermissions, reqPermissions, userAuthed)

  //----------------------------------------
  // if page requires auth
  // && user isn't logged in
  // send to login 
  //----------------------------------------
  if( sendToLogin ) {
    console.log('navigate to login',  props, path)
    navigate('/dms_auth/login', {state:{ from: path }})
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
