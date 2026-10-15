import React from 'react';
import { AuthContext } from '../context';
import { viewAsBarTheme } from './ViewAsBar.theme';
import { ThemeContext } from '../../../ui/themeContext';
import defaultTheme from '../../../ui/defaultTheme';
import UI from '../../../ui';

// Rendered by the auth provider, outside every ThemeContext: its controls use the library default theme
// (like the admin and auth manage pages), so they come from UI with their named styles.
const VIEW_AS_THEME = { theme: defaultTheme, UI };

export default function ViewAsBar() {
  const { viewAsUser, setViewAsUser } = React.useContext(AuthContext) || {};

  if (!viewAsUser) return null;

  const t = viewAsBarTheme;
  const groups = (viewAsUser.groups || []).filter(g => g !== 'public');

  return (
    <ThemeContext.Provider value={VIEW_AS_THEME}>
    <div className={t.bar}>
      <span className={t.label}>Viewing as:</span>
      <span className={t.email}>{viewAsUser.email}</span>
      {groups.length > 0 && (
        <span className={t.groupPills}>
          {groups.map(g => (
            <UI.Pill key={g} activeStyle="status_amber" text={g} />
          ))}
        </span>
      )}
      <span className={t.spacer} />
      <UI.Button activeStyle="smallWarn" onClick={() => setViewAsUser(null)}>
        Exit View As
      </UI.Button>
    </div>
    </ThemeContext.Provider>
  );
}
