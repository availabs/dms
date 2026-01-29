import React from 'react'
import * as Headless from '@headlessui/react'
import {ThemeContext} from '../useTheme'

export const textAreaTheme = {
  textarea: 'relative w-full block appearance-none rounded-lg px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)] sm:px-[calc(theme(spacing[3])-1px)] sm:py-[calc(theme(spacing[1.5])-1px)] text-base/6 text-zinc-950 placeholder:text-zinc-500 sm:text-sm/6 dark:text-white border border-zinc-950/10 data-[hover]:border-zinc-950/20 dark:border-white/10 dark:data-[hover]:border-white/20 bg-transparent dark:bg-white/5 focus:outline-none data-[invalid]:border-red-500 data-[invalid]:data-[hover]:border-red-500 data-[invalid]:dark:border-red-500 data-[invalid]:data-[hover]:dark:border-red-500 data-[disabled]:border-zinc-950/20 dark:data-[hover]:data-[disabled]:border-white/15 data-[disabled]:dark:border-white/15 data-[disabled]:dark:bg-white/[2.5%] dark:[color-scheme:dark]',
  textAreaContainer: 'group flex relative w-full before:absolute before:inset-px before:rounded-[calc(theme(borderRadius.lg)-1px)] before:bg-white before:shadow dark:before:hidden after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-inset after:ring-transparent sm:after:focus-within:ring-2 sm:after:focus-within:ring-blue-500 has-[[data-disabled]]:opacity-50 before:has-[[data-disabled]]:bg-zinc-950/5 before:has-[[data-disabled]]:shadow-none before:has-[[data-invalid]]:shadow-red-500/10',
  confirmButtonContainer: 'absolute right-0 hidden group-hover:flex items-center',
  editButton: 'py-1.5 px-2 text-slate-400 hover:text-blue-500 cursor-pointer bg-white/10',
  cancelButton:'text-slate-400 hover:text-red-500 cursor-pointer  py-1.5 pr-1 ',
  confirmButton:'text-green-500 hover:text-white hover:bg-green-500 cursor-pointer rounded-full'

}

export const docs = {
  doc_name: 'example 1',
  type: 'text',
  placeholder: 'Please Enter value...'
}

export default function Textarea ({description, value, onChange=() => {}, placeholder, disabled, onClick=()=>{}, rounded,...props}) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext);
  const theme = {...themeFromContext, textarea: {...textAreaTheme, ...(themeFromContext.textarea || {})}};

  return (
    <span className={`${theme?.textarea?.textAreaContainer}`}>
      <Headless.Textarea className={`${theme?.textarea?.textarea}`} value={value} onChange={onChange} {...props}/>
    </span>
  )
}
