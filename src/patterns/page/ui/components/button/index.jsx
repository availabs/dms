import React from 'react'
import { Button } from '@headlessui/react'
import { CMSContext } from '../../../siteConfig';

const buttonTheme = {
  default: 'inline-flex items-center gap-2 rounded-md bg-gray-700 py-1.5 px-3 text-sm/6 font-semibold text-white shadow-inner shadow-white/10 focus:outline-none data-[hover]:bg-gray-600 data-[open]:bg-gray-700 data-[focus]:outline-1 data-[focus]:outline-white' 
}



export default function Example({ children, type='default' }) {
  const { theme = { button: buttonTheme } } = React.useContext(CMSContext) || {}
  return (
    <Button className={theme?.button?.[type] || theme?.button?.default}>
      {children}
    </Button>
  )
}