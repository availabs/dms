import React from "react";
import { useLocation, useNavigate } from "react-router";
import { AuthContext } from "../context";
import { isUserAuthed } from "../../../utils/auth";

// In-page gate for the auth manage pages (Users, Groups). Their routes declare
// `reqPermissions`, but the route-level check never blocks (defect A in
// src/dms/planning/tasks/current/auth-permission-chain-and-unguarded-writes.md),
// so without this the pages open for anyone who types the URL.
//
// Same rule as the sidenav links (auth/siteConfig.jsx, admin/siteConfig.jsx):
// the auth pattern's grants via utils/auth.js isUserAuthed — which allows any
// logged-in user while the auth pattern grants nothing beyond `public`.
// Reads the LIVE user from AuthContext: on refresh the user is seeded with a
// placeholder `groups: ['public']` and `isAuthenticating`, and nothing is
// judged until the real groups arrive.
//
// Logged out → login; no permission → home. Returns whether the page may render
// (and load its data).
export function useManagePageGate(reqPermission, authPermissions = {}) {
  const { user, baseUrl } = React.useContext(AuthContext) || {};
  const navigate = useNavigate();
  const location = useLocation();
  const allowed = Boolean(user?.authed)
    && isUserAuthed({ user, reqPermissions: [reqPermission], authPermissions });

  React.useEffect(() => {
    if (!user?.authed) {
      navigate(`${baseUrl || ''}/login`, { state: { from: location.pathname } });
      return;
    }
    if (user?.isAuthenticating) return;
    if (!allowed) navigate('/');
  }, [user?.authed, user?.isAuthenticating, allowed]);

  return allowed && !user?.isAuthenticating;
}
