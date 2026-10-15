import React from 'react'
import { ThemeContext, getComponentTheme } from '../useTheme'
import { warnLockedClassName } from '../warnLockedClassName'
import { fieldLabelTheme } from './FieldLabel.theme'

// A form field's <label> (FieldLabel.theme.js). With no children it is the caption itself (`htmlFor` ties it
// to its control); with children it wraps the control and `text` renders as the caption span. The look is
// theme.fieldLabel[activeStyle] only — a `className` prop is dropped (owner rule 2026-10-13).
export default function FieldLabel ({ text, children, activeStyle, className, ...props }) {
  warnLockedClassName('FieldLabel', className);
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...fieldLabelTheme.styles[0], ...getComponentTheme(themeFromContext, 'fieldLabel', activeStyle) };
  if (children === undefined || children === null) {
    return <label className={t.text} {...props}>{text}</label>
  }
  return (
    <label className={t.wrapper} {...props}>
      {text !== undefined && text !== null ? <span className={t.text}>{text}</span> : null}
      {children}
    </label>
  )
}
