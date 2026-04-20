import React from 'react'
import { getAPI } from "./api";
import { AuthContext, useAuth, defaultUserState } from "./context";

export const withAuth = Component => {
  return ({ ...props }) => {
    const authContext = useAuth()
    return <Component {...props } user={authContext?.user }/>
  }
}

export const authProvider = (Component, config) => {
  const { AUTH_HOST, PROJECT_NAME, baseUrl = '/auth', defaultRedirectUrl = '/' } = config
  const AuthProvider = ({ ...props }) => {

    // Initialize with token from localStorage if available.
    // This prevents the auth check from redirecting to /login on page refresh
    // while the async auth validation is still in progress.
    const [user, setUser] = React.useState(() => {
      try {
        const token = window.localStorage.getItem('userToken');
        if (token) {
          return { ...defaultUserState(), token, authed: true };
        }
      } catch (e) {}
      return defaultUserState();
    });
    const AuthAPI = getAPI({ AUTH_HOST, PROJECT_NAME })

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
