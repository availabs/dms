import React from 'react'
import * as Headless from '@headlessui/react'
import Icon from './Icon'
import {ThemeContext} from '../useTheme'
import {inputTheme} from './Input.theme'

export default function Input ({ type='text', label, description, value, onChange=() => {}, placeholder, disabled, onClick=()=>{}, rounded,...props}) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext);
  const theme = {...themeFromContext, input: {...inputTheme, ...(themeFromContext.input || {})}};
  //const { theme = { input: inputTheme, field: fieldTheme } } = React.useContext(CMSContext) || {}
  return (
    <span className={`${theme?.input?.inputContainer}`}>
      <Headless.Input type={type} className={`${theme?.input?.input}`} value={value} onChange={onChange} disabled={disabled} {...props}/>
    </span>
  )
}

export function Textarea ({ type='text', label, description, value, onChange=() => {}, placeholder, disabled, onClick=()=>{}, rounded,...props}) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext);
  const theme = {...themeFromContext, input: {...inputTheme, ...(themeFromContext.input || {})}};
  //const { theme = { input: inputTheme, field: fieldTheme } } = React.useContext(CMSContext) || {}
  return (
    <span className={`${theme?.input?.inputContainer}`}>
      <Headless.Textarea className={`${theme?.input?.textarea}`} value={value} onChange={onChange} {...props}/>
    </span>
  )
}

export function ConfirmInput ({ type='text', label, description, value, onChange=() => {}, placeholder, disabled, onClick=()=>{}, rounded, EditIcon='PencilIcon', ConfirmIcon='CircleCheck', CancelIcon='CircleX'}) {
  const { theme = {input: inputTheme}} = React.useContext(ThemeContext);
  //const { theme = { input: inputTheme, field: fieldTheme } } = React.useContext(CMSContext) || {}
  const [tempValue, setTempValue] = React.useState(value)
  const [editing, setEditing] = React.useState(false)
  React.useEffect(() => setTempValue(value), [value])

  return (
    <span className={`${theme?.input?.inputContainer}`}>
      { editing ?
        <Headless.Input type={type} value={tempValue} onChange={e => setTempValue(e.target.value)} className={`${theme?.input?.input}`} /> :
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
