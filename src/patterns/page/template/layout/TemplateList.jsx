import React, { useState, useRef } from 'react'
import { Link, useSubmit, useLocation } from "react-router-dom";
import { Dialog  } from '@headlessui/react'
import { Modal } from "~/modules/dms/src/patterns/page/layout/page-controls"
import { json2DmsForm } from "~/modules/dms/src/patterns/page/layout/nav"

function TemplateRow ({ item={} }) {
  const [showDelete, setShowDelete] = useState(false)
  return (
    <div className='grid grid-cols-4 px-2 py-3 border-b hover:bg-blue-50'>
      <div>
        <Link to={`/admin/templates/edit/${item.id}`} > 
          <div className='px-2 font-medium text-lg text-slate-700'>
            {item.title}
          </div>
          <div className='px-2 text-xs text-slate-400'>{item.id}</div>
        </Link>
      </div>
      <div></div>
      <div></div>
      <div className='text-right flex items-center flex-row justify-end px-2 '>
          <Link to={`/admin/templates/pages/${item.id}`}
                className={'fa-thin fa-memo px-2 py-1 mx-2 text-bold cursor-pointer'}
                title={'pages'}
          />
        <i 
          className='fa fa-trash text-red-300 hover:text-red-500 cursor-pointer' 
          onClick={() =>setShowDelete(!showDelete)}
        />
        <DeleteModal
          item={item}
          open={showDelete}
          setOpen={setShowDelete}
        />
      </div>
    </div>
  )
}


export default function TemplateList ({children, dataItems, edit, baseUrl='', ...props}) {
  const {path} = useLocation()
  const [showNew, setShowNew] = useState(false)

  
  return (
   <div className='py-6 h-full'>
     <div className='bg-white h-full shadow border max-w-6xl mx-auto px-6'>
          <div className='flex items-center'>
              <div className='text-2xl p-3 font-thin flex-1'>Templates</div>
              {
                path === '/admin/templates' ? 
                   <div className='px-1'><Link to={`${baseUrl}`} className='inline-flex w-36 justify-center rounded-lg cursor-pointer text-sm font-semibold py-1 px-4 bg-blue-600 text-white hover:bg-blue-500 shadow-lg border border-b-4 border-blue-800 hover:border-blue-700 active:border-b-2 active:mb-[2px] active:shadow-none'> Templates </Link></div>
                :  <div className='px-1' ><div onClick={()=> setShowNew(!showNew)} className='inline-flex w-36 justify-center rounded-lg cursor-pointer text-sm font-semibold py-1 px-4 bg-blue-600 text-white hover:bg-blue-500 shadow-lg border border-b-4 border-blue-800 hover:border-blue-700 active:border-b-2 active:mb-[2px] active:shadow-none'> New Template</div></div>
              }
          </div>
          <div className='px-6 pt-8'>
            <div className='shadow rounded border'>
              {dataItems.map(item => (
                <TemplateRow key={item.id} item={item} />
              ))}
            </div>
          </div>
          <NewTemplateModal
            open={showNew}
            setOpen={setShowNew}
          />
      </div>
    </div>
  )
}

function NewTemplateModal ({ open, setOpen})  {
  const cancelButtonRef = useRef(null)
  const submit = useSubmit()
  //const { baseUrl } = React.useContext(CMSContext)
  const { pathname = '/edit' } = useLocation()
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      initialFocus={cancelButtonRef}
    >
      <div className="sm:flex sm:items-start">
        <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
          <i className='fa fa-plus text-blue-400' />
        </div>
        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full px-2">
          <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
            New Template 
          </Dialog.Title>
          <div className="mt-2 w-full">
            <input 
              className='w-full px-2 py-1 text font-medium text-slate-500 focus:outline-none border-slate-300 border-b-2 focus:border-blue-500' 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder={'Template Title'}
            />
          </div>
        </div>
      </div>
      <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
        <button
          type="button"
          disabled={loading || title.length < 3}
          className="inline-flex w-full justify-center rounded-md disabled:bg-slate-300 bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:ml-3 sm:w-auto"
          onClick={async () => {
            
            
            const newItem = {
              title
            }
            setLoading(true)
            await submit(json2DmsForm(newItem), { method: "post", action: pathname })
            setLoading(false);
            setOpen(false);
          }}
        >
          Creat{loading ? 'ing...' : 'e'}
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

export function DeleteModal ({item, open, setOpen})  {
  const cancelButtonRef = useRef(null)
  const submit = useSubmit()
  const { pathname = '/edit' } = useLocation()
  // const { baseUrl } = React.useContext(CMSContext)
  const [loading, setLoading] = useState(false)
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      initialFocus={cancelButtonRef}
    >
      <div className="sm:flex sm:items-start">
        <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
          <i className='fa fa-exlamation-triangle' />
        </div>
        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
          <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
            Delete Page {item.title} {item.id}
          </Dialog.Title>
          <div className="mt-2">
            <p className="text-sm text-gray-500">
              Are you sure you want to delete this Template? All of the page data will be permanently removed
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
            await submit(json2DmsForm(item,'delete'), { method: "post", action: pathname})
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