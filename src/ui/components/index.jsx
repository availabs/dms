import React from 'react'
import * as Headless from '@headlessui/react'
import {ThemeContext} from "../useTheme";
export const dialogTheme  = {
  backdrop: "fixed inset-0 flex w-screen justify-center overflow-y-auto bg-zinc-950/25 px-2 py-2 transition duration-100 focus:outline-0 data-[closed]:opacity-0 data-[enter]:ease-out data-[leave]:ease-in sm:px-6 sm:py-8 lg:px-8 lg:py-16 dark:bg-zinc-950/50",
  dialogContainer: "fixed inset-0 w-screen overflow-y-auto pt-6 sm:pt-0",
  dialogContainer2: "grid min-h-full grid-rows-[1fr_auto] justify-items-center sm:grid-rows-[1fr_auto_3fr] sm:p-4",
  dialogPanel: `
    row-start-2 w-full min-w-0 rounded-t-3xl bg-white p-[--gutter] shadow-lg ring-1 ring-zinc-950/10 [--gutter:theme(spacing.8)] sm:mb-auto sm:rounded-2xl dark:bg-zinc-900 dark:ring-white/10 forced-colors:outline
    transition duration-100 data-[closed]:translate-y-12 data-[closed]:opacity-0 data-[enter]:ease-out data-[leave]:ease-in sm:data-[closed]:translate-y-0 sm:data-[closed]:data-[enter]:scale-95
  `,
  sizes:  {
    xs: 'sm:max-w-xs',
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
    '2xl': 'sm:max-w-2xl',
    '3xl': 'sm:max-w-3xl',
    '4xl': 'sm:max-w-4xl',
    '5xl': 'sm:max-w-5xl',
  }
}

export default function DialogComp({ size = 'lg', open=false, onClose=()=>{}, className, children, ...props }) {
  const { theme = { dialog: dialogTheme } } = React.useContext(ThemeContext) || {}
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
              ${theme.dialog.sizes[size]}
              ${theme.dialog.dialogPanel}
            `}
          >
            {children}
          </Headless.DialogPanel>
        </div>
      </div>
    </Headless.Dialog>
  )
}