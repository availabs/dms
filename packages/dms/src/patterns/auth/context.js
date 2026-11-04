import React from 'react'

export const defaultUserState = () => ({
  token: null,
  groups: ['public'],
  // `authLevel` removed 2026-11-03 — auth levels are deprecated and nothing reads them.
  authed: false,
  attempts: 0,
  meta: [],
  id: null,
  isAuthenticating: false,
  email: null
});

export const AuthContext = React.createContext({
  user: defaultUserState(),
  viewAsUser: null,
  setViewAsUser: () => {},
});
export const useAuth = () => React.useContext(AuthContext);
