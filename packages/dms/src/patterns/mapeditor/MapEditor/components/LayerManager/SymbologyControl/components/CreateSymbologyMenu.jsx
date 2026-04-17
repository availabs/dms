import React from 'react'
import { SymbologyContext } from '../../../..'
import { MapEditorContext } from "../../../../../context"
import { Dialog } from '@headlessui/react'
import { useNavigate } from 'react-router'
import { get } from 'lodash-es'
import { Modal } from '../'


export function CreateSymbologyMenu({ button, className}) {
  const [showCreate, setShowCreate] = React.useState(false)

  return (
      <div 
        onClick={() => setShowCreate(true)}
        className={className}
      >
        <CreateSymbologyModal open={showCreate} setOpen={setShowCreate}/>
        {button}
      </div>
  )
}

const DEFAULT_CREATE_SYMBOLOGY_MODAL_STATE = {
  name: '',
  loading: false
};

function CreateSymbologyModal ({ open, setOpen })  {
  const cancelButtonRef = React.useRef(null)
  const { app, type, useFalcor, baseUrl } = React.useContext(MapEditorContext);
  const { falcor } = useFalcor();
  const { state, setState } = React.useContext(SymbologyContext)
  const navigate = useNavigate();
  const [modalState, setModalState] = React.useState(DEFAULT_CREATE_SYMBOLOGY_MODAL_STATE)

/*
  const createSymbologyMap = async () => {
    const newSymbology = {
      name: modalState.name,
      description: 'map',
      symbology: {
        layers: {}
      }
    }

    let resp = await falcor.call(
        ["dama", "symbology", "symbology", "create"],
        [pgEnv, newSymbology]
    )
    const newSymb = Object.values(
      get(resp, ["json", "dama", pgEnv, "symbologies", "byId"], {})
    ).filter((item) => Object.keys(item).includes("attributes"))?.[0]
      ?.attributes;

    let { symbology_id } = newSymb || false;
    
    if(symbology_id) {
      await falcor.invalidate(
        ["dama", pgEnv, "symbologies", "byIndex"],
        ["dama", pgEnv, "symbologies", "byId"],
        ["dama", pgEnv, "symbologies", "length"]
      )
      setOpen(false);
      setState(newSymb);
      setModalState(DEFAULT_CREATE_SYMBOLOGY_MODAL_STATE);
      navigate(`${baseUrl}/edit/${symbology_id}`)
    }
  }
*/

  const createSymbologyMap = React.useCallback(() => {

    const newSymbology = {
      name: modalState.name,
      description: 'map',
      symbology: {
        layers: {}
      }
    }

    falcor.call(
      ["dms", "data", "create"],
      [app, type, newSymbology]
    )
    .then(res => {
// console.log("SYMBOLOGY CREATE RESPONSE:", res)
      const dataIdPath = ["json", "dms", "data", "byId"];
      const dataById = get(res, dataIdPath, {});
      const [dataId] = Object.keys(dataById);
// console.log("DATA ID:", dataId);
      if (dataId) {
        const symbologyPath = [...dataIdPath, dataId, "data"];
        const symbology = get(res, symbologyPath);
        setOpen(false);
        setState(symbology);
        setModalState(DEFAULT_CREATE_SYMBOLOGY_MODAL_STATE);
        navigate(`${ baseUrl }/edit/${ dataId }`);
      }
    })
  }, [app, type, falcor, baseUrl, modalState.name, setOpen, setState, navigate]);
  
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      initialFocus={cancelButtonRef}
    >
      <div className="sm:flex sm:items-start">
        <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
          <i className="fad fa-layer-group text-blue-600" aria-hidden="true" />
        </div>
        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
          <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
            Create New Map
          </Dialog.Title>
          <div className="mt-2 w-full">
            <input
              value={modalState.name}
              onChange={e => setModalState({...state, name: e.target.value})} 
              className='p-2 bg-slate-100 text-lg font-medium w-full' placeholder={'Map Name'}/>
          </div>
        </div>
      </div>
      <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
        <button
          type="button"
          disabled={modalState.loading || modalState.name?.length < 4}
          className="disabled:bg-slate-300 disabled:cursor-warning inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:ml-3 sm:w-auto"
          onClick={createSymbologyMap}
        >
          Creat{modalState.loading ? 'ing...' : 'e'}
        </button>
        <button
          type="button"
          className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
          onClick={() => {
            setOpen(false);
            setModalState(DEFAULT_CREATE_SYMBOLOGY_MODAL_STATE);
          }}
          ref={cancelButtonRef}
        >
          Cancel
        </button>
      </div>
    </Modal>
  )

}