import React from 'react'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { CMSContext } from '../../../siteConfig';

export const menuTheme = {
  default: 'inline-flex items-center gap-2 rounded-md bg-gray-700 py-1.5 px-3 text-sm/6 font-semibold text-white shadow-inner shadow-white/10 focus:outline-none data-[hover]:bg-gray-600 data-[open]:bg-gray-700 data-[focus]:outline-1 data-[focus]:outline-white',
  publish: 'inline-flex w-36 justify-center rounded-lg cursor-pointer text-sm font-semibold py-2 px-2 bg-blue-600 text-white hover:bg-blue-500 shadow-lg border border-b-4 border-blue-800 hover:border-blue-700 active:border-b-2 active:mb-[2px] active:shadow-none',
  publishInactive: 'inline-flex w-36 justify-center rounded-lg cursor-not-allowed text-sm font-semibold py-2 px-2 bg-slate-300 text-white shadow border border-slate-400 border-b-4',
  menuItems: 'absolute right-0 z-10 -mr-1 mt-2 w-44 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black/5 transition focus:outline-none data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in'
}


const defaultItems = [
  { name: 'Save and schedule', onClick: '#' },
  { name: 'Save and publish', onClick: '#' },
  { name: 'Export PDF', onClick: '#' },
]

export default function MenuComp ({ children, items=defaultItems }) {
  const { theme = { menu: menuTheme } } = React.useContext(CMSContext) || {}
  return (
    <div className="">
      <Menu as="div" className="relative block">
        <MenuButton className="">
          <span className="sr-only">Open options</span>
          {children}
        </MenuButton>
        <MenuItems
          transition
          className={theme.menu.menuItems}
        >
          <div className="py-1">
            {items.map((item, i) => (
              <MenuItem key={ i }>
                <span
                  onClick={item.onClick}
                  className="block px-4 py-2 text-sm text-gray-700 data-[focus]:bg-gray-100 data-[focus]:text-gray-900 data-[focus]:outline-none"
                >
                  {item.name}
                </span>
              </MenuItem>
            ))}
          </div>
        </MenuItems>
      </Menu>
    </div>
  )
}