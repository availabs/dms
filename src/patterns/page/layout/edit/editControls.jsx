import React, { useEffect, Fragment, useRef, useState } from 'react'
import { Dialog, Transition, Switch } from '@headlessui/react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import cloneDeep from 'lodash/cloneDeep'
import { ToastContainer, toast, Slide } from 'react-toastify';
import { useSubmit, useLocation } from "react-router-dom";
import {json2DmsForm, getUrlSlug, toSnakeCase} from '../components/utils/navItems'
import 'react-toastify/dist/ReactToastify.css';
import { CMSContext } from '../layout'

const theme = {
  pageControls: {
    controlItem: 'pl-6 py-0.5 text-md cursor-pointer hover:text-blue-500 text-slate-400 flex items-center',
    select: 'bg-transparent border-none rounded-sm focus:ring-0 focus:border-0 pl-1',
    selectOption: 'p-4 text-md cursor-pointer hover:text-blue-500 text-slate-400 hover:bg-blue-600',
    content: '',
  }
}

export function EditControls({ item, dataItems, updateAttribute,attributes, edit, status, setItem }) {
  const submit = useSubmit()
  const { pathname = '/edit' } = useLocation()
  const [showDelete, setShowDelete] = useState(false)
  const [ statusMessage, setStatusMessage ] = useState(status?.message)
  const [moving, setMoving] = useState(false);
  const [type, setType] = useState(item.type);
  const { baseUrl, setOpen, setHistoryOpen} = React.useContext(CMSContext)
  const NoOp = () => {}

  useEffect(() => {
    setStatusMessage(status?.message)
    toast.success(status?.message, {
      toastId: 'page-update-success',
      position: "bottom-right",
      autoClose: 5000,
      transition: Slide,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: "light",
    })
  },[status])

  const duplicateItem = () => {
    const highestIndex = dataItems
    .filter(d => !d.parent)
    .reduce((out,d) => {
      return Math.max(isNaN(d.index) ? -1 : d.index  , out)
    },-1)

    const newItem = cloneDeep(item)
    delete newItem.id
    newItem.title += ' Dup'
    newItem.index = highestIndex + 1
    newItem.url_slug = getUrlSlug(newItem, dataItems)
    newItem.sections.forEach(s => {
      delete s.ref
      delete s.id
    })
    
    submit(json2DmsForm(newItem), { method: "post", action: pathname })
  }

  const insertSubPage = async () => {
    const highestIndex = dataItems
    .filter(d => d.parent === item.id)
    .reduce((out,d) => {
      return Math.max(isNaN(d.index) ? 0 : d.index  , out)
    },0)

    //console.log(highestIndex, dataItems)
    const newItem = {
      title: 'New Page',
      parent: item.id,
      index: highestIndex + 1,
      published: 'draft'
    }
    newItem.url_slug = `${getUrlSlug(newItem,dataItems)}`

    submit(json2DmsForm(newItem), { method: "post", action: pathname })
  }
    

  const saveItem = async () => {
    const newItem = cloneDeep(item)
    newItem.url_slug = getUrlSlug(newItem, dataItems)
    submit(json2DmsForm(newItem), { method: "post", action: `${baseUrl}/edit/${newItem.url_slug}` })

  }

  const getChildren = ({item, dataItems, children}) => {
    const currentChildren = dataItems.filter(di => di.parent === item.id);
    if(currentChildren.length){
      children.push(...currentChildren)
      currentChildren.forEach(child => getChildren({item: child, dataItems, children}))
    }
  }

  const movePages = async (type) => {
    const children = []
    getChildren({item, dataItems, children});

    [...children, item]
    .reduce(async (acc, currItem) => {
      await acc;
      const newItem = {id: currItem.id, type}
      submit(json2DmsForm(newItem, 'updateType'), { method: "post", action: `${baseUrl}/edit/` })

    }, Promise.resolve())
    setMoving(false);
    setType(item.type);
  }

  const toggleSidebar = async (type, value='') => {
    const newItem = cloneDeep(item)
    newItem[type] = value
    updateAttribute(type, value)
    submit(json2DmsForm(newItem), { method: "post", action: pathname })
  }

   const TitleEdit = attributes['title'].EditComp
  
  //console.log('showDelete', showDelete)
  return (
    <>
        {edit &&
          <div className='p-4'>
            <div className='w-full flex justify-center pb-6'>
              <div 
                onClick={saveItem}
                className='inline-flex w-36 justify-center rounded-lg cursor-pointer text-sm font-semibold py-2 px-4 bg-blue-600 text-white hover:bg-blue-500 shadow-lg border border-b-4 border-blue-800 hover:border-blue-700 active:border-b-2 active:mb-[2px] active:shadow-none'>
                <span className='flex items-center'>
                  <span className='pr-2'>Save</span>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>

                </span>
              </div>
            </div>
            <div className='pl-4 pb-4'>
              <TitleEdit
                className='w-full px-2 py-1 text font-medium text-slate-500 focus:outline-none border-slate-300 border-b-2 focus:border-blue-500'
                value={item['title']} 
                onChange={(v) => updateAttribute('title', v)}        
                {...attributes['title']}
              />
            </div>
            <div className='pl-6 pb-2 text-gray-500 text-xs'>{item['id']}</div>

            {(!item?.parent || item?.parent === '') &&
                <div className={theme.pageControls.controlItem}>
                  <i className={'fa-solid fa-up-down-left-right text-sm'} />
                  <select
                      title={'Move Page'}
                      className={theme.pageControls.select}
                      value={type}
                      onChange={e => {
                        setMoving(true); // doesn't work yet
                        return movePages(e.target.value);
                      }}
                  >
                    <option key={'cms'} value={'docs-page'} className={theme.pageControls.selectOption}>Live</option>
                    <option key={'draft'} value={'docs-draft'} className={theme.pageControls.selectOption}>Draft</option>
                    <option key={'playground'} value={'docs-play'} className={theme.pageControls.selectOption}>Playground</option>
                  </select>
                </div>
            }

            <div onClick={() => setOpen(true)}
              className={theme.pageControls.controlItem}
            >
              {'☲ Edit Pages'}
            </div>
            <div onClick={() => setHistoryOpen(true)}
              className={theme.pageControls.controlItem}
            >
              {'☲ History'}
            </div>
            <div onClick={insertSubPage}
              className={theme.pageControls.controlItem}
            >
              {'☲ Insert Subpage'}
            </div>
            <div onClick={duplicateItem}
              className={theme.pageControls.controlItem}
            >
              {'☳ Duplicate'}
            </div>
            <div onClick={() => setShowDelete(true)}
              className={theme.pageControls.controlItem}
            >
              { '☵ Delete' }
              <DeleteModal
                item={item}
                open={showDelete}
                setOpen={setShowDelete}
              />
            </div>
            <div className='h-[20px]'/>
            <div className={theme.pageControls.controlItem } >
              <SidebarSwitch
                item={item}
                type='sidebar'
                toggleSidebar={toggleSidebar}
              />
              Show Sidebar
              
            </div>
            <div className={theme.pageControls.controlItem } >
              <SidebarSwitch
                type='header'
                item={item}
                toggleSidebar={toggleSidebar}
              />
              Show Header
              
            </div>
            <div className={theme.pageControls.controlItem } >
              <SidebarSwitch
                type='footer'
                item={item}
                toggleSidebar={toggleSidebar}
              />
              Show Footer
            </div>
          </div>
        }
        <ToastContainer />
    </>
  )
}

export function SidebarSwitch({type,item,toggleSidebar}) {
  let enabled = item[type] === 'show'
  return (
    <Switch
      checked={enabled}
      onChange={(e) => toggleSidebar(type,enabled ? '' : 'show')}
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

export function DeleteModal ({item, open, setOpen})  {
  const cancelButtonRef = useRef(null)
  const submit = useSubmit()
  const { baseUrl } = React.useContext(CMSContext)
  const [loading, setLoading] = useState(false)
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      initialFocus={cancelButtonRef}
    >
      <div className="sm:flex sm:items-start">
        <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
          <ExclamationTriangleIcon className="h-6 w-6 text-red-600" aria-hidden="true" />
        </div>
        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
          <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
            Delete Page {item.title} {item.id}
          </Dialog.Title>
          <div className="mt-2">
            <p className="text-sm text-gray-500">
              Are you sure you want to delete this page? All of the page data will be permanently removed
              from our servers forever. This action cannot be undone.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
        <button
          type="button"
          disabled={loading}
          className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto"
          onClick={async () => {
            setLoading(true)
            await submit(json2DmsForm(item,'delete'), { method: "post", action: `${baseUrl}/edit/`})
            setLoading(false);
            setOpen(false);
          }}
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

