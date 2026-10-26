import React from "react";
import { useLocation, useNavigate } from "react-router";
import { AuthContext } from "../context";
import { isUserAuthed } from "../../../utils/auth";
import { PatternAuthContext } from "../../../utils/patternAuthContext";

// In-page gate for the auth manage pages (Users, Groups). Their routes declare
// `reqPermissions`, but the route-level check never blocks (defect A in
// src/dms/planning/tasks/current/auth-permission-chain-and-unguarded-writes.md),
// so without this the pages open for anyone who types the URL.
//
// Same rule as the server's permission path (dms-server auth/utils/permissions.js
// authority): the user belongs to this project (a group of it besides `public`),
// and is `${app} Admin` or holds the permission on the auth pattern's grants via
// utils/auth.js isUserAuthed, which allows any member while the auth pattern
// grants nothing beyond `public`. A signed-in user of another project no longer
// gets in on an open auth row.
// Reads the LIVE user from AuthContext: on refresh the user is seeded with a
// placeholder `groups: ['public']` and `isAuthenticating`, and nothing is
// judged until the real groups arrive.
//
// Logged out → login; no permission → home. Returns whether the page may render
// (and load its data).
export function useManagePageGate(reqPermission, authPermissions = {}) {
  const { user, baseUrl } = React.useContext(AuthContext) || {};
  const { app } = React.useContext(PatternAuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const groups = (user?.groups || []).filter(g => g !== 'public');
  const allowed = Boolean(user?.authed) && groups.length > 0
    && (groups.includes(`${app} Admin`) || isUserAuthed({ user, reqPermissions: [reqPermission], authPermissions }));

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
