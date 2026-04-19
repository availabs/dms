import React from 'react'

export const defaultUserState = () => ({
  token: null,
  groups: ['public'],
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
