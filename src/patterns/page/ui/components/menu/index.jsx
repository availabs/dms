import React, { useRef, forwardRef } from 'react';
import { Menu, MenuButton, MenuItem, MenuItems, MenuSeparator } from '@headlessui/react'
import { CMSContext } from '../../../siteConfig';
import { Icon, Input } from '../../'

export const menuTheme = {
  menuItems: 'absolute z-40 -mr-1 mt-1 w-64 p-1 origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black/5 transition focus:outline-none data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-50 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in'
}

const NOOP = () => {}

const defaultItems = [
  { name: 'Save and schedule', onClick: '#' },
  { name: 'Save and publish', onClick: '#' },
  { name: 'Export PDF', onClick: '#' },
]

const SimpleItem = forwardRef(({item}, ref) => (
    <div
      onClick={item?.onClick}
      className="cursor-pointer flex items-center rounded-lg py-2 text-sm text-gray-700 data-[focus]:bg-gray-100 data-[focus]:text-gray-900 data-[focus]:outline-none hover:bg-gray-100"
    >
      <div className='px-2'><Icon icon={item?.icon || 'Blank'} className='size-5'/></div>
      <div className=''>{item?.name}</div>
    </div>
 
))

const SubMenuItem = forwardRef(({item}, ref) => (
  
    <div
      onClick={item.onClick}
      className="cursor-pointer flex items-center rounded-lg py-2 text-sm text-gray-700 data-[focus]:bg-gray-100 data-[focus]:text-gray-900 data-[focus]:outline-none hover:bg-gray-100"
    >
      <div className='px-2'><Icon icon={item.icon} className='size-5'/></div>
      <div className='flex-1'>{item.name}</div>
      <MenuComp items={item.items} zIndex={'z-50'} origin='right-0'>
        <div className='px-4 text-sm text-slate-300 flex items-center'>
          <div>{item.value}</div>
          <div><Icon icon='ArrowRight'/></div>
        </div>
      </MenuComp>
    </div>
  
))

const InputItem = forwardRef(({item}, ref) => (
 
    <div
      onClick={item.onClick}
      className="cursor-pointer flex items-center rounded-lg py-2 text-sm text-gray-700 data-[focus]:bg-gray-100 data-[focus]:text-gray-900 data-[focus]:outline-none"
    >
      <div className='px-2'><Icon icon={item.icon} className='size-5'/></div>
      <div className='flex-1'>{item.name}</div>
      <div className='w-20'><Input {...item.inputProps} /></div>
    </div>
 
))


const Seperator = forwardRef(({item}, ref) => <MenuSeparator className="my-1 h-px bg-slate-200" />)

const ItemTypes = {
  'simple': SimpleItem,
  'menu': SubMenuItem,
  'seperator': Seperator,
  'input': InputItem
}
// left-8 -top-2
export default function MenuComp ({ children, items=defaultItems, zIndex=40, origin='right-0' }) {
  const [open, setOpen] = React.useState(false)
  const { theme = { menu: menuTheme } } = React.useContext(CMSContext) || {}
  
  return (
      <div className={`relative block `}>
        <div className="" onClick={() => setOpen(!open)}>
          <span className="sr-only">Open options</span>
          {children}
        </div>
        <div

            className={!open ? `hidden pointer-events-none` : `${theme.menu.menuItems} ${origin} ${zIndex}`}
            
        >
          <div className="py-1">
            {
              items
                .filter(d => d)
                .map((item, i) => {   
                    const ItemComp = ItemTypes?.[item?.type] || ItemTypes['simple']
                    return  <ItemComp  key={i} item={item} />
                })
            }
          </div>
        
        </div>
    </div>
  )
}