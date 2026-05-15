import { useContext, useState } from 'react'
import { SymbologyContext } from '../../..'
import { Plus, FolderOpen, Trash, FloppyDisk } from '../../icons'

import { SelectSymbology } from '../SymbologySelector';
import { set } from 'lodash-es'
import { CreateSymbologyMenu, SymbologyControlMenu, SaveChangesMenu } from './components'







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