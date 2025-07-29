

export const defaultCheck = ( checkAuth, {user}, activeConfig, navigate ,path) =>  {
      
  const getReqAuth = (configs) => {
    //console.log('')
    return configs.reduce((out,config) => {
      console.log('_auth: config', config)
      let authLevel = config.authLevel || -1
      let reqPermissions = config.reqPermissions || [];
      let authPermissions = config.authPermissions || {};
      // if(config.children) {
      //   authLevel = Math.max(authLevel, getReqAuth(config.children))
      // }
      return {
        authLevel: Math.max(out.authLevel, authLevel),
        reqPermissions: [...new Set([...reqPermissions, ...out.reqPermissions])],
        authPermissions // same for a pattern
      }
    }, {authLevel: -1, reqPermissions: [], authPermissions: []})
  } 
  let {authLevel, reqPermissions, authPermissions} = getReqAuth(activeConfig)
  //console.log('requiredAuth', requiredAuth)
  checkAuth({user, authLevel, reqPermissions, authPermissions}, navigate, path)
}

export const defaultCheckAuth = ( props, navigate, path ) => {
  //const isAuthenticating = props?.user?.isAuthenticating
  
  //------------------------------------------
  // TODO : if user is logged in 
  // and refreshes authed page
  // isAuthenticating = false and Authed = false 
  // so user is sent to login
  // while token check happens in background
  // then user is send back to authed page
  // by /auth/login redirect using state:from
  // can we switch to isAuthenticating is true
  //------------------------------------------

  const {user = {}, authLevel, reqPermissions, authPermissions} = props
  console.log('_auth:', authLevel, reqPermissions, authPermissions, user)
  let reqAuthLevel = props?.authLevel || -1;
  const authReq = props?.auth  || false;
  
  reqAuthLevel = Math.max(reqAuthLevel, authReq ? 0 : -1);

  const userAuthed = user?.authed || false
  const userAuthLevel = user?.authLevel || -1 //get(props, ["user", "authLevel"], -1);
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

  const sendToLogin = !userAuthed && (reqAuthLevel >= 0 || reqPermissions?.length);
  const sendToHome = userAuthLevel < reqAuthLevel || (reqPermissions?.length && !userAuthPermissions.some(permission => permission === '*' || reqPermissions.includes(permission)));
  console.log('permissions match', userAuthPermissions, reqPermissions, userAuthed, reqAuthLevel)
  //console.log('checkAuth', reqAuthLevel, userAuthLevel, path)

  //----------------------------------------
  // if page requires auth
  // && user isn't logged in
  // send to login 
  //----------------------------------------
  if( sendToLogin ) {
    console.log('navigate to login',  props, path)
    navigate('/dms_auth/login', {state:{ from: path }})
    // return <Navigate 
    //   to={ "/auth/login" } 
    //   state={{ from: props.path }}
    // />
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
