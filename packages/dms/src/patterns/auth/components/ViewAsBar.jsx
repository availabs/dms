import React from 'react';
import { AuthContext } from '../context';
import { viewAsBarTheme } from './ViewAsBar.theme';

export default function ViewAsBar() {
  const { viewAsUser, setViewAsUser } = React.useContext(AuthContext) || {};

  if (!viewAsUser) return null;

  const t = viewAsBarTheme;
  const groups = (viewAsUser.groups || []).filter(g => g !== 'public');

  return (
    <div className={t.bar}>
      <span className={t.label}>Viewing as:</span>
      <span className={t.email}>{viewAsUser.email}</span>
      {groups.length > 0 && (
        <span className={t.groupPills}>
          {groups.map(g => (
            <span key={g} className={t.groupPill}>{g}</span>
          ))}
        </span>
      )}
      <span className={t.spacer} />
      <button className={t.exitButton} onClick={() => setViewAsUser(null)}>
        Exit View As
      </button>
    </div>
  );
}
