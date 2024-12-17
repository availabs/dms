import React, { useEffect, Fragment, useRef, useState } from 'react'
import {PencilIcon} from './icons'
import { FormsContext } from '../siteConfig'
import { Dialog, Transition, Switch, Popover } from '@headlessui/react'
import { usePopper } from 'react-popper'
import defaultTheme from '../theme/theme'


const NO_OP = ()=>{}

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

export function Dropdown ({ control, children,className, width='w-full max-w-[200px]', openType='hover' }) {
    const [open, setOpen] = React.useState(false),
        clickedOutside = React.useCallback(() => setOpen(false), []),
        [setRef] = useClickOutside(clickedOutside);
        // console.log('openType', openType)
    return (
        <div ref={ setRef }
             className={`h-full relative cursor-pointer ${className}` }
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
                <div className={ `shadow fixed ${width} rounded-b-lg ${open ? `block` : `hidden`} z-20` }>
                    { children }
                </div> : ''
                
            }
        </div>
    )
}


export function PopoverMenuItem ({children,onClick}) {
    const {theme = defaultTheme} = React.useContext(FormsContext)
    return (
        <div 
            onClick={onClick}
            className={theme.pageControls.controlItem}
        >
                {children}
        </div>
    )
}

export function IconPopover({icon, onClick, children}) {
  let [referenceElement, setReferenceElement] = useState()
  let [popperElement, setPopperElement] = useState()
  let { styles, attributes:popperAttributes } = usePopper(referenceElement, popperElement)

   return (
        <Popover className="relative">
            <Popover.Button
                ref={setReferenceElement}
                onClick={onClick}
                className={'text-md cursor-pointer hover:text-blue-800 text-blue-500'}>
                {icon}
            </Popover.Button>
            <Transition
                as={Fragment}
                enter="transition ease-out duration-200"
                enterFrom="opacity-0 translate-y-1"
                enterTo="opacity-100 translate-y-0"
                leave="transition ease-in duration-150"
                leaveFrom="opacity-100 translate-y-0"
                leaveTo="opacity-0 translate-y-1"
            >
                <Popover.Panel 
                    ref={setPopperElement}
                    style={styles.popper}
                    {...popperAttributes.popper}
                    className="shadow-lg bg-white rounded z-10 transform  border border-blue-200 w-[180px] ">
                    
                    {children}
              </Popover.Panel>
            </Transition>
        </Popover>
    )
}

export function TitleEditComp({value, onChange, label }) {
  const [editing, setEditing] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState(value || '')

  return (
    <div className='pl-4 pb-2'>
        {label && <span className='text-xs uppercase font-bold text-slate-400'> {label}</span>}
        <div  className='flex justify-between group'>
          <div  className="flex-1">
            <dd className=" text-sm text-gray-900 ">
              {editing ?
                <div className='flex group focus:outline-none border-slate-300 border-b-2 group-focus:border-blue-500'>
                  <input
                    className='w-full px-2 py-1 bg-transparent font-medium text-slate-500 focus:outline-none focus:border-blue-500'
                    value={newTitle} 
                    onChange={v => setNewTitle(v.target.value)}
                  />
                  <div className='flex cursor-pointer' >
                    <span className=" pt-0.5 text-green-500 rounded hover:bg-green-500 hover:text-white " onClick={e => {
                        onChange(newTitle);
                        setEditing(false);
                      }} >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                    </span>
                      
                    <span className="pt-0.5 text-slate-300  rounded  hover:text-red-300 " onClick={e =>  setEditing(false)}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                    </span>

                  </div>
                </div> :
                <div className='w-full min-h-[30px] flex flex-row px-2 py-1 text font-medium text-slate-500 focus:outline-none border-slate-300 border-b-2 focus:border-blue-500'>
                  <div className='w-full'>{value}</div>
                  <div className='hidden group-hover:block cursor-pointer group-hover:text-gray-300 ' onClick={e => editing ? setEditing(false): setEditing(true)}>
                     <PencilIcon size={20} className='text-gray-400 hover:text-blue-500' />
                  </div>
                </div>
              }
            </dd>
          </div> 
        </div>
    </div>
  )
}


export const ButtonSelector = ({
   label,
   types,
   type,
   setType,
   multi = false,
   size = 'small',
   disabled,
   disabledTitle,
}) => {
    useEffect(() => {
        const initValue = types[0]?.value || types[0];
        if(!initValue || disabled) return;

        const initType = multi ? [initValue] : initValue;

        (!type || (Array.isArray(type) && !type.filter(t => t)?.length)) && setType(initType)
    },[types])
    return (
        <div className={`my-1 flex flex-rows flex-wrap`}
             title={disabled ? disabledTitle : null}
        >
            {
                label && <div className={'p-2 pl-0 w-1/4'}>{label}</div>
            }
            <span className={`
              
                space-x-1 rounded-lg bg-slate-100 py-0.5
                flex flex-row flex-wrap
                shadow-sm 
                ${size === 'large' ? `w-full` : 'w-fit'}`}>
                {
                    types.map((t, i) => {
                        const currentValue = t?.value || t;
                        const currentType =
                            multi && Array.isArray(type) ? type :
                                multi && !Array.isArray(type) ? [type] :
                                    !multi && Array.isArray(type) ? type[0] :
                                        type;

                        const isActive = (multi && currentType?.includes(currentValue)) || (!multi && currentType === currentValue);

                        return (
                            <button
                                type="button"
                                key={i}
                                className={`
                                    ${i !== 0 && `-ml-px`} 
                                    ${disabled && `pointer-events-none`}
                                    rounded-lg py-[0.4375rem] break-none
                                    ${isActive ? `text-gray-900 bg-white shadow` : `text-gray-700`} hover:text-blue-500
                                    min-w-[60px] min-h-[30px] uppercase
                                    relative items-center px-2 text-xs items-center justify-center text-center 
                                    focus:z-10
                                `}
                                onClick={() => {
                                    const value =
                                        multi && currentType?.includes(currentValue) ? currentType.filter(v => v !== currentValue) :
                                            multi && !currentType?.includes(currentValue) ? [...currentType, currentValue] :
                                                currentValue;

                                    setType(value);
                                }}
                            >
                                {t?.label || t}
                            </button>
                        )
                    })
                }
                </span>
        </div>
    )
}

export function SideNavContainer({children, width='w-64'}) {
  return (
    <div className={`w-64 hidden xl:block`}>
      <div className={`w-64 sticky top-2 hidden xl:block max-h-[100vh_-_450px]`}> 
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

export function SidebarSwitch({value,toggleSidebar}) {
  let enabled = value === 'show'
  return (
    <Switch
      checked={enabled}
      onChange={toggleSidebar}
      className="group relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2"
    >
      <span className="sr-only">Use setting</span>
      <span aria-hidden="true" className="pointer-events-none absolute h-full w-full rounded-md bg-white" />
      <span
        aria-hidden="true"
        className={`
          ${enabled ? 'bg-blue-500' : 'bg-gray-200'}
          pointer-events-none absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out
        `}
      />
      <span
        aria-hidden="true"
        className={`
          ${enabled ? 'translate-x-5' : 'translate-x-0'}
          pointer-events-none absolute left-0 inline-block h-5 w-5 transform rounded-full border border-gray-200 bg-white shadow ring-0 transition-transform duration-200 ease-in-out
        `}
      />
    </Switch>
  )
}

export function DeleteModal ({title, prompt, item, open, setOpen, onDelete})  {
  const cancelButtonRef = useRef(null)
  const { baseUrl } = React.useContext(FormsContext) || {}
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
          <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
              {title || `Delete ${item.title || ''} ${item.id}`}
          </Dialog.Title>
          <div className="mt-2">
            <p className="text-sm text-gray-500">
                {prompt || 'Are you sure you want to delete this page? All of the page data will be permanently removed from our servers forever. This action cannot be undone.'}
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
      <Dialog as="div" className="relative z-30" initialFocus={initialFocus} onClose={setOpen}>
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
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                {children}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

