import React from 'react'
import Icon from './Icon'
import {ThemeContext, getComponentTheme} from '../useTheme'
import { warnLockedClassName } from '../warnLockedClassName'
import {inputTheme} from './Input.theme'

// Locked (2026-10-14, ui-control-fields.md): the look comes only from the theme — `activeStyle` picks a
// named style of `theme.input` (styles[]); a `className` prop is dropped, never applied. Registered themes
// with a flat `input` are wrapped into styles[0] by src/themes/_legacy/ui.js withLegacyUi.
export default function Input ({ type='text', label, description, value, onChange=() => {}, placeholder, disabled, onClick=()=>{}, rounded, activeStyle, className, ...props}) {
  warnLockedClassName('Input', className);
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...inputTheme.styles[0], ...getComponentTheme(themeFromContext, 'input', activeStyle) };
  return (
    <span className={t.inputContainer}>
      <input type={type} className={t.input} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} {...props}/>
    </span>
  )
}

export function Textarea ({ type='text', label, description, value, onChange=() => {}, placeholder, disabled, onClick=()=>{}, rounded, activeStyle, className, ...props}) {
  warnLockedClassName('Input.Textarea', className);
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...inputTheme.styles[0], ...getComponentTheme(themeFromContext, 'input', activeStyle) };
  return (
    <span className={t.inputContainer}>
      <textarea className={t.textarea} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} {...props}/>
    </span>
  )
}

export function ConfirmInput ({ type='text', label, description, value, onChange=() => {}, placeholder, disabled, onClick=()=>{}, rounded, activeStyle='inline', EditIcon='PencilIcon', ConfirmIcon='CircleCheck', CancelIcon='CircleX'}) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...inputTheme.styles[0], ...getComponentTheme(themeFromContext, 'input', activeStyle) };
  const [tempValue, setTempValue] = React.useState(value)
  const [editing, setEditing] = React.useState(false)
  React.useEffect(() => setTempValue(value), [value])

  return (
    <span className={`${t.inputContainer}`}>
      { editing ?
        <input type={type} value={tempValue} onChange={e => setTempValue(e.target.value)} className={`${t.input}`} /> :
        <div className={`${t.input}`}>{tempValue}</div>
      }

      {!editing ?
        (<div className={`${t.confirmButtonContainer} ${t.editButton}`} onClick={() => setEditing(true)}><Icon icon={EditIcon} className={'size-5.5'} /></div>) :
        (<div className={`${t.confirmButtonContainer}`}>

            <div className={`${t.confirmButton}`} onClick={() => { onChange(tempValue); setEditing(false); }}><Icon icon={ConfirmIcon} /></div>
            <div className={`${t.cancelButton}`} onClick={() => { setTempValue(value);setEditing(false);}}><Icon icon={CancelIcon} /></div>

        </div>
        )
      }

    </span>
  )
}
