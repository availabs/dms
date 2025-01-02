import React from 'react'
import { Button } from '@headlessui/react'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { CMSContext } from '../../../siteConfig';

export const buttonTheme = {
  default: 'inline-flex items-center gap-2  bg-gray-700 py-1.5  text-sm/6 font-semibold text-white shadow-inner shadow-white/10 focus:outline-none data-[hover]:bg-gray-600 data-[open]:bg-gray-700 data-[focus]:outline-1 data-[focus]:outline-white',
  active: 'inline-flex w-36 justify-center cursor-pointer text-sm font-semibold  bg-blue-600 text-white hover:bg-blue-500 shadow-lg border border-b-4 border-blue-800 hover:border-blue-700 active:border-b-2 active:mb-[2px] active:shadow-none',
  inactive: 'inline-flex w-36 justify-center cursor-not-allowed text-sm font-semibold bg-slate-300 text-white shadow border border-slate-400 border-b-4',
  rounded: 'rounded-lg'
}



export default function ButtonComp ({ children, disabled, onClick=()=>{}, type='default', padding='p-2', rounded}) {
  const { theme = { button: buttonTheme } } = React.useContext(CMSContext) || {}
  return (
    <Button disabled={disabled} className={`${theme?.button?.[type] || theme?.button?.default} ${padding} ${rounded || theme?.button?.rounded}` } onClick={onClick}>
      {children}
    </Button>
  )
}
