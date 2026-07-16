import React from 'react'
import Icon from './Icon'
import {ThemeContext} from '../useTheme'
import {inputTheme} from './Input.theme'

// `activeStyle` is a THEMING key (named-style selector) that themed callers (filter controls,
// column types) pass alongside real input props — destructure it out so it never spreads onto
// the DOM <input> (React unknown-prop warning). Input doesn't resolve styles[] today; if it
// grows named styles, wire activeStyle into getComponentTheme here.
export default function Input ({ type='text', label, description, value, onChange=() => {}, placeholder, disabled, onClick=()=>{}, rounded, activeStyle, ...props}) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext);
  const theme = {...themeFromContext, input: {...inputTheme, ...(themeFromContext.input || {})}};
  return (
    <span className={`${theme?.input?.inputContainer}`}>
      <input type={type} className={`${theme?.input?.input}`} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} {...props}/>
    </span>
  )
}

export function Textarea ({ type='text', label, description, value, onChange=() => {}, placeholder, disabled, onClick=()=>{}, rounded, activeStyle, ...props}) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext);
  const theme = {...themeFromContext, input: {...inputTheme, ...(themeFromContext.input || {})}};
  return (
    <span className={`${theme?.input?.inputContainer}`}>
      <textarea className={`${theme?.input?.textarea}`} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} {...props}/>
    </span>
  )
}

export function ConfirmInput ({ type='text', label, description, value, onChange=() => {}, placeholder, disabled, onClick=()=>{}, rounded, EditIcon='PencilIcon', ConfirmIcon='CircleCheck', CancelIcon='CircleX'}) {
  const { theme = {input: inputTheme}} = React.useContext(ThemeContext);
  const [tempValue, setTempValue] = React.useState(value)
  const [editing, setEditing] = React.useState(false)
  React.useEffect(() => setTempValue(value), [value])

  return (
    <span className={`${theme?.input?.inputContainer}`}>
      { editing ?
        <input type={type} value={tempValue} onChange={e => setTempValue(e.target.value)} className={`${theme?.input?.input}`} /> :
        <div className={`${theme?.input?.input}`}>{tempValue}</div>
      }

      {!editing ?
        (<div className={`${theme?.input?.confirmButtonContainer} ${theme?.input?.editButton}`} onClick={() => setEditing(true)}><Icon icon={EditIcon} className={'size-5.5'} /></div>) :
        (<div className={`${theme?.input?.confirmButtonContainer}`}>

            <div className={`${theme?.input?.confirmButton}`} onClick={() => { onChange(tempValue); setEditing(false); }}><Icon icon={ConfirmIcon} /></div>
            <div className={`${theme?.input?.cancelButton}`} onClick={() => { setTempValue(value);setEditing(false);}}><Icon icon={CancelIcon} /></div>

        </div>
        )
      }

    </span>
  )
}
