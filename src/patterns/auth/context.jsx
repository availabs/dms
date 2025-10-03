import React from 'react'
import { getAPI } from "./api";

const defaultUserState = () => ({
  token: null,
  groups: [],
  authLevel: -1,
  authed: false,
  attempts: 0,
  meta: [],
  id: null,
  isAuthenticating: false,
  email: null
});

export const AuthContext = React.createContext({ user: defaultUserState() });
export const useAuth = () => React.useContext(AuthContext);
export const withAuth = Component => {
  return ({ ...props }) => {
    const authContext = useAuth()
    return <Component {...props } user={authContext?.user }/>
  }
}

export const authProvider = (Component, config) => {
  const { AUTH_HOST, PROJECT_NAME, baseUrl = '/auth', defaultRedirectUrl = '/' } = config
  const AuthProvider = ({ ...props }) => {

    const [user, setUser] = React.useState(defaultUserState());
    const AuthAPI = getAPI({ AUTH_HOST, PROJECT_NAME })

    // React.useEffect(() => {
    //   console.log('user updated', user)
    // },[user])
    //
    React.useEffect(() => {
      async function load() {
        const user = await AuthAPI.getUser();
        setUser(user || defaultUserState());
      }
      load();
    }, []);

    return (
      <AuthContext.Provider value={{ user, setUser, AUTH_HOST, PROJECT_NAME, AuthAPI, baseUrl, defaultRedirectUrl }}>
        <Component {...props} />
      </AuthContext.Provider>
    )
  }

  return AuthProvider
}
