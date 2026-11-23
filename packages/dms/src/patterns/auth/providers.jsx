import React from 'react'
import { getAPI, syncSessionCookie } from "./api";
import { getRequestScope } from "../../utils/requestScope";
import { AuthContext, useAuth, defaultUserState } from "./context";
import ViewAsBar from "./components/ViewAsBar";

export const withAuth = Component => {
  return ({ ...props }) => {
    const authContext = useAuth()
    const effectiveUser = authContext?.viewAsUser ?? authContext?.user;
    return <Component {...props} user={effectiveUser} />
  }
}

// what AuthAPI.getUser() resolves to, for a user the server already verified
const signedInState = (user, token) => ({
  ...defaultUserState(), ...user, token, groups: [...new Set([...(user.groups || []), 'public'])], authed: true, isAuthenticating: false,
});

export const authProvider = (Component, config) => {
  const { AUTH_HOST, PROJECT_NAME, baseUrl = '/auth', defaultRedirectUrl = '/', isMultiTenant = false, siteType } = config
  // session: who the server rendered this page for, { state, user }, when the page says so in its props (an
  // RSC page: render/rsc/ClientChrome.jsx); today's path says it in window.__dmsSSRData.session.
  const AuthProvider = ({ session: renderedSession, ...props }) => {

    // The first state. A server render knows its user from the session cookie (render/ssr2, the request's
    // scope); the browser then starts from the same user (the rendered session), so hydration matches and a
    // page that needs sign-in arrives rendered. Otherwise: the stored token, if any, counted as signed in
    // while it is checked, so a refresh doesn't bounce to /login.
    const [user, setUser] = React.useState(() => {
      const scope = getRequestScope();
      if (scope) return scope.user ? signedInState(scope.user, scope.token) : defaultUserState();
      // the RSC path's HTML pass (generateHTML) has no request scope, only the page's own session
      if (renderedSession?.user && (typeof window === 'undefined' || window.__dmsStub)) return signedInState(renderedSession.user, null);
      try {
        const token = window.localStorage.getItem('userToken');
        const rendered = renderedSession || window.__dmsSSRData?.session;
        if (token && rendered?.user) return signedInState(rendered.user, token);
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
      // the session cookie follows the stored token: written when the server didn't know it (no cookie
      // yet, e.g. signed in before the cookie existed) or knew a different state
      // an RSC page (render/rsc/hydrate.js) was rendered for a visitor who isn't signed in
      const rendered = renderedSession || window.__dmsSSRData?.session || (window.__dmsRscPage ? { state: 'anonymous' } : null);
      if (rendered) {
        let token = null;
        try { token = window.localStorage.getItem('userToken'); } catch (e) {}
        if (rendered.state === 'absent' || (rendered.state === 'user') !== !!token) syncSessionCookie(token);
      }
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
