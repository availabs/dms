import React, { useEffect, Fragment, useRef, useState } from 'react'
import {PencilIcon} from './icons'
import { CMSContext } from '../siteConfig'
import { Transition, } from '@headlessui/react'
import { usePopper } from 'react-popper'
import defaultTheme from './theme'

import * as Headless from '@headlessui/react'


export { default as DraggableNav } from './components/nestable/draggableNav';
export { default as Layout }  from './components/layout';
export { default as SideNav } from './components/sidenav';
export { default as TopNav } from './components/topnav';
export { default as Nestable } from './components/nestable';
export { default as Drawer } from './components/drawer';
export { default as Tabs } from './components/tabs';
export { default as Button } from './components/button';
export { default as Menu } from './components/menu';
export { default as Input, ConfirmInput } from './components/input';
export { default as Icon } from './components/icon';
export { default as Dialog } from './components/dialog';
export { default as Label } from './components/label';
export { default as Popover } from './components/popover';
export { default as Select } from './components/select';
export { default as ColorPicker } from './components/colorpicker'
export * from './components/select';
export { default as FieldSet } from './components/fieldset';

export { default as SectionGroup} from './dataComponents/sections/sectionGroup'


export const useClickOutside = handleClick => {
  const [node, setNode] = React.useState(null);

  React.useEffect(() => {
    const checkOutside = e => {
      if (node.contains(e.target)) {
        return;
      }
      (typeof handleClick === "function") && handleClick(e);
    }
    node && document.addEventListener("mousedown", checkOutside);
    return () => document.removeEventListener("mousedown", checkOutside);
  }, [node, handleClick])

  return [setNode, node];
}

// import { useTheme } from "../../wrappers/with-theme"

export function Dropdown ({ control, children,className, width='w-full min-w-[200px] max-w-[200px]', openType='hover' }) {
    const [open, setOpen] = React.useState(false),
        clickedOutside = React.useCallback(() => setOpen(false), []),
        [setRef] = useClickOutside(clickedOutside);
        // console.log('openType', openType)
    return (
        <div ref={ setRef }
             className={`relative cursor-pointer ${className}` }
             onMouseEnter={ e => {
                if(openType === 'hover') {
                 setOpen(true)
                }
            }}
            onMouseLeave={ e => setOpen(false) }
            onClick={ e => {
                 //e.preventDefault();
                 setOpen(!open)
             } }
        >
            {control}
            {open ?
                <div className={ `shadow absolute ${width} rounded-b-lg ${open ? `block` : `hidden`} z-10 right-0` }>
                    { children }
                </div> : ''

            }
        </div>
    )
}



export function SideNavContainer({children, width='w-64', custom='top-20'}) {
  return (
    <div className={`${width} hidden xl:block`}>
      <div className={`${width} sticky ${custom}  hidden xl:block`}>
        {children}
      </div>
    </div>
  )
}

export function PublishButton({children, active, onClick}) {
    // console.log('test', active)
    return (
        <div
          onClick={onClick}
          className={`${ active ?
            'inline-flex w-36 justify-center rounded-lg cursor-pointer text-sm font-semibold py-2 px-2 bg-blue-600 text-white hover:bg-blue-500 shadow-lg border border-b-4 border-blue-800 hover:border-blue-700 active:border-b-2 active:mb-[2px] active:shadow-none':
            'inline-flex w-36 justify-center rounded-lg cursor-not-allowed text-sm font-semibold py-2 px-2 bg-slate-300 text-white shadow border border-slate-400 border-b-4'
          }`}
        >
          <span className='flex items-center'>
            {children}
          </span>
        </div>
    )
}

export function DiscardChangesButton({children, active, onClick}) {
    if(!active) return null;
    return (
        <div
          onClick={onClick}
          className={`${ active ?
            'inline-flex w-36 justify-center rounded-lg cursor-pointer text-sm font-semibold py-2 px-2 bg-red-600 text-white hover:bg-red-500 shadow-lg border border-b-4 border-red-800 hover:border-red-700 active:border-b-2 active:mb-[2px] active:shadow-none':
            'inline-flex w-36 justify-center rounded-lg cursor-not-allowed text-sm font-semibold py-2 px-2 bg-slate-300 text-white shadow border border-slate-400 border-b-4'
          }`}
        >
          <span className='flex items-center'>
            {children}
          </span>
        </div>
    )
}



export function DeleteModal ({title, prompt, item={}, open, setOpen, onDelete})  {
  const cancelButtonRef = useRef(null)
  const { baseUrl } = React.useContext(CMSContext) || {}
  const [loading, setLoading] = useState(false)
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      initialFocus={cancelButtonRef}
    >
      <div className="sm:flex sm:items-start">
        <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
          <i className="fa fa-danger h-6 w-6 text-red-600" aria-hidden="true" />
        </div>
        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
          <Headless.DialogTitle as="h3" className="text-base font-semibold leading-6 text-gray-900">
              {title || `Delete ${item.title || ''} ${item.id}`}
          </Headless.DialogTitle>
          <div className="mt-2">
            <p className="text-sm text-gray-500">
                {prompt || `Are you sure you want to delete this page? All of the page data will be permanently removed
              from our servers forever. This action cannot be undone.`}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
        <button
          type="button"
          disabled={loading}
          className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto"
          onClick={onDelete}
        >
          Delet{loading ? 'ing...' : 'e'}
        </button>
        <button
          type="button"
          className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
          onClick={() => setOpen(false)}
          ref={cancelButtonRef}
        >
          Cancel
        </button>
      </div>
    </Modal>
  )

}

export function Modal({open, setOpen, initialFocus, children}) {
  return (
    <Transition.Root show={open} as={Fragment}>
      <Headless.Dialog as="div" className="relative z-30" initialFocus={initialFocus} onClose={setOpen}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto" >
          <div
            onClick={() =>  {setOpen(false);}}
            className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0"
          >
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Headless.DialogPanel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                {children}
              </Headless.DialogPanel>
            </Transition.Child>
          </div>
        </div>
      </Headless.Dialog>
    </Transition.Root>
  )
}
