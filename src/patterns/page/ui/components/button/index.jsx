import React from 'react'
import { Button } from '@headlessui/react'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { CMSContext } from '../../../siteConfig';

export const buttonTheme = {
  default: 'cursor-pointer inline-flex items-center gap-2  bg-gray-700 py-1.5  text-sm/6 font-semibold text-white shadow-inner shadow-white/10 focus:outline-none data-[hover]:bg-gray-600 data-[open]:bg-gray-700 data-[focus]:outline-1 data-[focus]:outline-white',
  plain: 'cursor-pointer relative isolate inline-flex items-center justify-center gap-x-2 rounded-lg border text-base/6 font-semibold  sm:text-sm/6 focus:outline-none data-[focus]:outline data-[focus]:outline-2 data-[focus]:outline-offset-2 data-[focus]:outline-blue-500 data-[disabled]:opacity-50 [&>[data-slot=icon]]:-mx-0.5 [&>[data-slot=icon]]:my-0.5 [&>[data-slot=icon]]:size-5 [&>[data-slot=icon]]:shrink-0 [&>[data-slot=icon]]:text-[--btn-icon] [&>[data-slot=icon]]:sm:my-1 [&>[data-slot=icon]]:sm:size-4 forced-colors:[--btn-icon:ButtonText] forced-colors:data-[hover]:[--btn-icon:ButtonText] border-transparent text-zinc-950 data-[active]:bg-zinc-950/5 data-[hover]:bg-zinc-950/5 dark:text-white dark:data-[active]:bg-white/10 dark:data-[hover]:bg-white/10 [--btn-icon:theme(colors.zinc.500)] data-[active]:[--btn-icon:theme(colors.zinc.700)] data-[hover]:[--btn-icon:theme(colors.zinc.700)] dark:[--btn-icon:theme(colors.zinc.500)] dark:data-[active]:[--btn-icon:theme(colors.zinc.400)] dark:data-[hover]:[--btn-icon:theme(colors.zinc.400)] cursor-default',
  active: 'cursor-pointer px-4 inline-flex  justify-center cursor-pointer text-sm font-semibold  bg-blue-600 text-white hover:bg-blue-500 shadow-lg border border-b-4 border-blue-800 hover:border-blue-700 active:border-b-2 active:mb-[2px] active:shadow-none',
  inactive: 'inline-flex  px-4 justify-center cursor-not-allowed text-sm font-semibold bg-slate-300 text-white shadow border border-slate-400 border-b-4',
  rounded: 'rounded-lg',
  padding: 'px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)] sm:px-[calc(theme(spacing.3)-1px)] sm:py-[calc(theme(spacing[1.5])-1px)]'
}



export default function ButtonComp ({ children, disabled, onClick=()=>{}, type='default', padding, rounded, className, ...props}) {
  const { theme = { button: buttonTheme } } = React.useContext(CMSContext) || {}
  return (
    <Button disabled={disabled} className={`${className} ${theme?.button?.[type] || theme?.button?.default} ${padding || theme?.button?.padding} ${rounded || theme?.button?.rounded}` } onClick={onClick} {...props}>
      {children}
    </Button>
  )
}
