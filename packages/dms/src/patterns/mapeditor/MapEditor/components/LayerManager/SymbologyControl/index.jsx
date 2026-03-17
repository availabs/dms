import { useContext, useState, Fragment, useRef } from 'react'
import { SymbologyContext } from '../../..'
// import { useParams } from "react-router";
import { Transition, Dialog } from '@headlessui/react'
import { Plus, FolderOpen, Trash, FloppyDisk } from '../../icons'

import { SelectSymbology } from '../SymbologySelector';
import { set } from 'lodash-es'
import { CreateSymbologyMenu, SymbologyControlMenu, SaveChangesMenu } from './components'


export function Modal({open, setOpen, width='sm:my-8 sm:w-full sm:max-w-lg sm:p-6', initialFocus, children}) {
  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-30 " initialFocus={initialFocus} onClose={setOpen}>
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
              <Dialog.Panel className={`relative transform overflow-auto rounded-lg bg-white px-4 h-[calc(100vh_-_100px)] pb-4 pt-5 text-left shadow-xl transition-all ${width}`}>
                {children}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}







export const INITIAL_NEW_MAP_MODAL_STATE = {
  open: false,
  symbologyId: null
};

function SymbologyControl () {
  const { state, setState, params } = useContext(SymbologyContext);
  const { id: symbologyId } = params;

// console.log("SymbologyControl::symbologyId", symbologyId);

  const [newMapModalState, setNewMapModalState] = useState(INITIAL_NEW_MAP_MODAL_STATE);
  const menuButtonContainerClassName = ' p-1 rounded hover:bg-slate-100 group';
  return (
    <div className='p-1 flex'>
      <div className='w-full px-1 flex bg-slate-100 border border-transparent hover:border-slate-300 group rounded-md shadow-sm ring-1 ring-inset ring-slate-100 focus-within:ring-2 focus-within:ring-inset focus-within:ring-pink-600 sm:max-w-md'>
        <input
          type="text"
          className='block w-[220px] flex-1 outline-0  bg-transparent p-2 text-slate-800 placeholder:text-gray-400  focus:border-0  sm:leading-6'
          placeholder={'Select / Create New Map'}
          value={state?.name}
          onClick={!symbologyId ? (() => setNewMapModalState({...newMapModalState, open: true})) : undefined}
          onChange={(e) => {
            setState(draft => {
              set(draft, `name`, e.target.value);
            })
          }}
        />
        <div className='flex items-center'>
          <div className='flex  mr-2'>
            <CreateSymbologyMenu 
              className="relative inline-block text-left"
              button={
                <Plus
                  size={14}
                  className={`cursor-pointer fill-none group-hover:fill-gray-400 group-hover:hover:fill-pink-700`}
                />
              }
            />
          </div>
          { symbologyId && 
            <>
              <div
                className='flex  mr-2'
                onClick={() => setNewMapModalState({...newMapModalState, open: true})}
              >
                <FolderOpen
                  size={14}
                  className={`cursor-pointer fill-none group-hover:fill-gray-400 group-hover:hover:fill-pink-700`} 
                />
              </div>
              <div className='flex  mr-2'>
                <SaveChangesMenu 
                  button={
                    <FloppyDisk
                      size={14}
                      className={`cursor-pointer fill-none group-hover:fill-gray-400 group-hover:hover:fill-pink-700`}
                    />
                  }
                />
              </div>
              <div className='flex'>
                <SymbologyControlMenu 
                  button={
                    <Trash
                      size={14}   
                      className={`cursor-pointer fill-none group-hover:fill-gray-400 group-hover:hover:fill-pink-700`}
                    />
                  }
                />
              </div>
            </>
          }
        </div>

      </div>
      <div className='flex items-center ml-1'>
        <SelectSymbology 
          className={menuButtonContainerClassName}
          modalState={newMapModalState}
          setModalState={setNewMapModalState}
        />
      </div>
    </div>
  )
}

export default SymbologyControl;