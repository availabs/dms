import React from 'react'
import * as Headless from '@headlessui/react'
import {ThemeContext} from '../useTheme'
import {dialogTheme} from './Dialog.theme'

export default function DialogComp({ size = 'lg', open=false, onClose=()=>{}, className, children, ...props }) {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const theme = {...themeFromContext, dialog: {...dialogTheme, ...(themeFromContext?.dialog || {})}};
  return (
    <Headless.Dialog open={open} onClose={onClose} {...props}>
      <Headless.DialogBackdrop
        transition
        className={theme?.dialog?.backdrop}
      />

      <div className={theme?.dialog?.dialogContainer}>
        <div className={theme?.dialog?.dialogContainer2}>
          <Headless.DialogPanel
            transition
            className={`
              ${className}
              ${theme?.dialog?.sizes?.[size]}
              ${theme?.dialog?.dialogPanel}
            `}
          >
            {children}
          </Headless.DialogPanel>
        </div>
      </div>
    </Headless.Dialog>
  )
}