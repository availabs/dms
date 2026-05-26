import React from 'react';
import { ThemeContext, getComponentTheme } from '../useTheme';
import { dialogActionsTheme } from './DialogActions.theme';

export default function DialogActionsComp({ children, className, ...props }) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const theme = { ...dialogActionsTheme, ...getComponentTheme(themeFromContext, 'dialogActions') };

  return (
    <div className={className || theme.wrapper} {...props}>
      {children}
    </div>
  );
}
