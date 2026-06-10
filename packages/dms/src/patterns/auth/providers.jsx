import React from 'react'
import { getAPI } from "./api";
import { AuthContext, useAuth, defaultUserState } from "./context";
import ViewAsBar from "./components/ViewAsBar";

export const withAuth = Component => {
  return ({ ...props }) => {
    const authContext = useAuth()
    const effectiveUser = authContext?.viewAsUser ?? authContext?.user;
    return <Component {...props} user={effectiveUser} />
  }
}

export const authProvider = (Component, config) => {
  const { AUTH_HOST, PROJECT_NAME, baseUrl = '/auth', defaultRedirectUrl = '/', isMultiTenant = false, siteType } = config
  const AuthProvider = ({ ...props }) => {

    // Initialize with token from localStorage if available.
    // This prevents the auth check from redirecting to /login on page refresh
    // while the async auth validation is still in progress.
    const [user, setUser] = React.useState(() => {
      try {
        const token = window.localStorage.getItem('userToken');
        if (token) {
          return { ...defaultUserState(), token, authed: true, isAuthenticating: true };
        }
      } catch (e) {}
      return defaultUserState();
    });
    const [viewAsUser, setViewAsUserState] = React.useState(null);
    const AuthAPI = getAPI({ AUTH_HOST, PROJECT_NAME })

    const setViewAsUser = React.useCallback((targetUser) => {
      globalThis.__dmsViewAsActive = !!targetUser;
      setViewAsUserState(targetUser);
    }, []);

    React.useEffect(() => {
      async function load() {
        const user = await AuthAPI.getUser();
        setUser(user || defaultUserState());
      }
      load();
    }, []);

    return (
      <AuthContext.Provider value={{ user, setUser, viewAsUser, setViewAsUser, AUTH_HOST, PROJECT_NAME, AuthAPI, baseUrl, defaultRedirectUrl, isMultiTenant, siteType }}>
        <Component {...props} />
        <ViewAsBar />
      </AuthContext.Provider>
    )
  }

  return AuthProvider
}
