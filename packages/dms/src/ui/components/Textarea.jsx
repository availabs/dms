import React from 'react'
import {ThemeContext, getComponentTheme} from '../useTheme'
import { warnLockedClassName } from '../warnLockedClassName'
import {textareaTheme} from './Textarea.theme'
import { fieldOnTop } from './fieldOnTop'

// Locked (2026-10-14, ui-control-fields.md): the look comes only from the theme — `activeStyle` picks a named
// style of `theme.textarea` (styles[]); a `className` prop is dropped, never applied.
export default function Textarea ({description, value, onChange=() => {}, placeholder, disabled, onClick=()=>{}, rounded, activeStyle, className, ...props}) {
  warnLockedClassName('Textarea', className);
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...textareaTheme.styles[0], ...getComponentTheme(themeFromContext, 'textarea', activeStyle) };

  return (
    <span className={t.textAreaContainer}>
      <textarea className={fieldOnTop(t.textarea)} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} {...props}/>
    </span>
  )
}
