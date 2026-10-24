import React from 'react';
import { Link } from 'react-router';
import { AuthContext } from '../context';
import { ThemeContext } from '../../../ui/themeContext';
import { isUserAuthed } from '../../../utils/auth';
import { openAuthWarningTheme } from './OpenAuthWarning.theme';

// Shown on the Users and Groups pages to `${app} Admin` members and explicit `*` holders when the auth
// pattern grants nothing: under the lenient rule (owner 2026-10-24) any signed-in user can then manage
// this project's users and groups, on the server as well (dms-server auth/utils/permissions.js).
// "Grants nothing" is judged the way the gate judges it: no group but `public`, no user.
export default function OpenAuthWarning({ app, authPermissions = {}, editUrl }) {
  const { user } = React.useContext(AuthContext) || {};
  const { theme } = React.useContext(ThemeContext) || {};
  const m = { ...openAuthWarningTheme, ...(theme?.auth?.authPages?.manage || {}) };

  const open = isUserAuthed({ user: { authed: true, groups: [] }, reqPermissions: ['auth-users'], authPermissions });
  const isAdmin = (user?.groups || []).includes(`${app} Admin`);
  const holdsAll = [
    ...((authPermissions.users || {})[user?.id] || []),
    ...(user?.groups || []).flatMap(g => (authPermissions.groups || {})[g] || []),
  ].includes('*');
  if (!open || !user?.authed || !(isAdmin || holdsAll)) return null;

  return (
    <div role="alert" className={m.openAuthWarning}>
      Any signed-in user can manage this site's users and groups: the Auth pattern grants no permissions yet.
      {' '}Grant <code>auth-users</code> / <code>auth-groups</code> to a group
      {editUrl ? <> on the <Link className={m.openAuthWarningLink} to={editUrl}>Auth pattern's Access tab</Link></> : ' on the Auth pattern\'s Access tab'}.
    </div>
  );
}
