import React from 'react'
import { Menu, MenuButton, MenuItem, MenuItems, MenuSeparator } from '@headlessui/react'
import { CMSContext } from '../../../siteConfig';
import { Icon, Input } from '../../'

export const menuTheme = {
  default: 'inline-flex items-center gap-2 rounded-md bg-gray-700 py-1.5 px-3 text-sm/6 font-semibold text-white shadow-inner shadow-white/10 focus:outline-none data-[hover]:bg-gray-600 data-[open]:bg-gray-700 data-[focus]:outline-1 data-[focus]:outline-white',
  publish: 'inline-flex w-36 justify-center rounded-lg cursor-pointer text-sm font-semibold py-2 px-2 bg-blue-600 text-white hover:bg-blue-500 shadow-lg border border-b-4 border-blue-800 hover:border-blue-700 active:border-b-2 active:mb-[2px] active:shadow-none',
  publishInactive: 'inline-flex w-36 justify-center rounded-lg cursor-not-allowed text-sm font-semibold py-2 px-2 bg-slate-300 text-white shadow border border-slate-400 border-b-4',
  menuItems: 'absolute right-0 z-40 -mr-1 mt-1 w-64 p-1 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black/5 transition focus:outline-none data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-50 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in'
}


const defaultItems = [
  { name: 'Save and schedule', onClick: '#' },
  { name: 'Save and publish', onClick: '#' },
  { name: 'Export PDF', onClick: '#' },
]

const SimpleItem = ({item}) => (
  <MenuItem>
    <div
      onClick={item.onClick}
      className="cursor-pointer flex items-center rounded-lg py-2 text-sm text-gray-700 data-[focus]:bg-gray-100 data-[focus]:text-gray-900 data-[focus]:outline-none"
    >
      <div className='px-2'><Icon icon={item.icon || 'Blank'} className='size-5'/></div>
      <div className=''>{item.name}</div>
    </div>
  </MenuItem>
)

const SubMenuItem = ({item}) => (
  <MenuItem>
    <div
      onClick={item.onClick}
      className="cursor-pointer flex items-center rounded-lg py-2 text-sm text-gray-700 data-[focus]:bg-gray-100 data-[focus]:text-gray-900 data-[focus]:outline-none"
    >
      <div className='px-2'><Icon icon={item.icon} className='size-5'/></div>
      <div className='flex-1'>{item.name}</div>
      <MenuComp items={item.items}>
        <div className='px-4 text-sm text-slate-300 flex items-center'>
          <div>{item.value}</div>
          <div><Icon icon='ArrowRight'/></div>
        </div>
      </MenuComp>
    </div>
  </MenuItem>
)

const InputItem = ({item}) => (
  <MenuItem>
    <div
      onClick={item.onClick}
      className="cursor-pointer flex items-center rounded-lg py-2 text-sm text-gray-700 data-[focus]:bg-gray-100 data-[focus]:text-gray-900 data-[focus]:outline-none"
    >
      <div className='px-2'><Icon icon={item.icon} className='size-5'/></div>
      <div className='flex-1'>{item.name}</div>
      <div className='w-20'><Input {...item.inputProps} /></div>
    </div>
  </MenuItem>
)


const Seperator = ({item}) => <MenuSeparator className="my-1 h-px bg-slate-200" />

const ItemTypes = {
  'simple': SimpleItem,
  'menu': SubMenuItem,
  'seperator': Seperator,
  'input': InputItem
}

export default function MenuComp ({ children, items=defaultItems }) {
  const { theme = { menu: menuTheme } } = React.useContext(CMSContext) || {}
  return (
    <div className="">
      <Menu as="div" className="relative block z-40">
        <MenuButton as="div" className="">
          <span className="sr-only">Open options</span>
          {children}
        </MenuButton>
        <MenuItems
          transition
          className={theme.menu.menuItems}
          modal={false}
        >
          <div className="py-1">
            {
              items.map((item, i) => {
                const ItemComp = ItemTypes?.[item?.type] || ItemTypes['simple']
                return <ItemComp key={i} item={item} />
              }
            )}
          </div>
        </MenuItems>
      </Menu>
    </div>
  )
}