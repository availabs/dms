import React from 'react'
import { ThemeContext } from '../../../ui/useTheme'
import { adminUiTheme } from './index.theme'

export function InputComp({label, value, placeholder="", onChange, type='text', Comp}) {
  const { theme } = React.useContext(ThemeContext) || {}
  const t = { ...adminUiTheme, ...(theme?.admin?.adminUi || {}) }
  return (
      <div className={t.inputWrapper} data-headlessui-state="">
         {label && <label data-slot="label" className={t.inputLabel}>{label}</label>}
         <span data-slot="control" className={t.inputControlSpan}>
          <Comp
              type={type}
            value={value}
            placeholder={placeholder}
            onChange={onChange}
            className={t.input}
            data-autofocus=""
          />
         </span>
      </div>
  )
}

export function ButtonPrimary ({children, onClick}) {
  const { theme } = React.useContext(ThemeContext) || {}
  const t = { ...adminUiTheme, ...(theme?.admin?.adminUi || {}) }
  return (
    <button onClick={onClick} className={t.button} type="button" data-headlessui-state="">
      {children}
      <span className={t.inputIconHidden} aria-hidden="true"></span>
    </button>
  )
}
