import React, { useRef, forwardRef } from 'react';
import { MenuSeparator } from '@headlessui/react'
import {ThemeContext} from '../useTheme'
import Icon from "./Icon"
import {menuTheme} from './Menu.theme'

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

// const InputItem = forwardRef(({item}, ref) => (

//     <div
//       onClick={item.onClick}
//       className="cursor-pointer flex items-center rounded-lg py-2 text-sm text-gray-700 data-[focus]:bg-gray-100 data-[focus]:text-gray-900 data-[focus]:outline-none"
//     >
//       <div className='px-2'><Icon icon={item.icon} className='size-5'/></div>
//       <div className='flex-1'>{item.name}</div>
//       <div className='w-20'><Input {...item.inputProps} /></div>
//     </div>

// ))


const Seperator = forwardRef(({item}, ref) => <MenuSeparator className="my-1 h-px bg-slate-200" />)

const ItemTypes = {
  'simple': SimpleItem,
  'menu': SubMenuItem,
  'seperator': Seperator,
  //'input': InputItem
}
// left-8 -top-2
export default function MenuComp ({ children, items=defaultItems, zIndex=40, origin='right-0' }) {
  const [open, setOpen] = React.useState(false)
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext);
  const theme = {...themeFromContext, menu: {...menuTheme, ...(themeFromContext.menu || {})}};

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
