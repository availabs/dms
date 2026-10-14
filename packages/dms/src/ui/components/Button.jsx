import React from 'react'
import { ThemeContext, getComponentTheme } from '../useTheme'
import { warnLockedClassName } from '../warnLockedClassName'

// The look comes only from the theme: `activeStyle` picks a `button.styles` entry by name or index
// (Button.theme.jsx; a theme adds or overrides names in its own button.styles). There is no className or
// themeOptions look override (owner 2026-10-13: "no ui component should allow classname to override
// theme"); layout belongs on a wrapper. `buttonType` sets the HTML type when `type` is taken by a config.
export default function ButtonComp ({ children, disabled, onClick=()=>{}, type='button', buttonType, activeStyle, className, themeOptions, padding, rounded, ...props}) {
  warnLockedClassName('Button', className);
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const theme = getComponentTheme(themeFromContext,'button', activeStyle);
  const buttonClass = theme?.button;
  // only real HTML types: an unknown one ('plain', 'transparent') would make the browser treat it as submit
  const htmlType = ['button', 'submit', 'reset'].includes(buttonType || type) ? (buttonType || type) : 'button';

  return (
    <button
      type={ htmlType }
      disabled={disabled}
      className={buttonClass}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  )
}
