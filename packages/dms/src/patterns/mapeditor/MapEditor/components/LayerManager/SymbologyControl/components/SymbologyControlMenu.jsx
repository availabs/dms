import React from 'react'
import { MapEditorContext } from "../../../../../context"
import { Button } from "~/modules/avl-components/src";
import { Dialog } from '@headlessui/react'
import { useParams, useNavigate } from 'react-router'
import { LOCAL_STORAGE_KEY_BASE } from '../../../../'
import { Modal } from '../'

export function SymbologyControlMenu({ button, className }) {
  const [showSaveChanges, setShowSaveChanges] = React.useState(false)

  return (
      <div 
        onClick={() => setShowSaveChanges(true)}
        className={className}
      >
        <DeleteSymbologyModal open={showSaveChanges} setOpen={setShowSaveChanges}/>
        {button}
      </div>
  )
}

const DeleteSymbologyModal = ({open, setOpen}) => {
  const { app, type, falcor, baseUrl, params } = React.useContext(MapEditorContext);
  const { id: symbologyId } = params;
  const navigate = useNavigate();

/*
  const deleteSymbology = async () => {
    const resp = await falcor.call(
      ["dama", "symbology", "symbology", "delete"],
      [pgEnv, symbologyId]
    );
    await falcor.invalidate(
      ["dama", pgEnv, "symbologies", "byIndex"],
      ["dama", pgEnv, "symbologies", "byId", symbologyId],
      ["dama", pgEnv, "symbologies", "length"]
    )

    const symbologyLocalStorageKey = LOCAL_STORAGE_KEY_BASE + `${ symbologyId }`;
    window.localStorage.setItem(symbologyLocalStorageKey, null);

    navigate(baseUrl);
  }
*/

  const deleteSymbology = React.useCallback(e => {
    falcor.call(
        ["dms", "data", "delete"],
        [app, type, symbologyId]
      )
      // .then(() => {
      //   const appKey = `${ app }+${ type }`;
      //   return falcor.invalidate(
      //     ["dms", "data", appKey, "length"],
      //     ["dms", "data", appKey, "byIndex"],
      //     ["dms", "data", "byId"]
      //   )
      // })
      .then(() => {
        const symbologyLocalStorageKey = LOCAL_STORAGE_KEY_BASE + `${ symbologyId }`;
        window.localStorage.removeItem(symbologyLocalStorageKey);
        navigate(baseUrl);
      });
  }, [app, type, symbologyId, navigate, baseUrl]);

  return (
    <Modal
      open={open}
      setOpen={setOpen}
    >
      <div className="sm:flex sm:items-start">
        <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
          <i className="fad fa-layer-group text-blue-600" aria-hidden="true" />
        </div>
        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
          <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
            Delete Symbology
          </Dialog.Title>
        </div>
      </div>
      <div className='flex items-center'>
        Are you sure you want to delete this symbology? This action cannot be undone.
      </div>
      <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
        <div className='px-1'>
          <Button
            themeOptions={{ size: "sm", color: 'danger' }}
            className={" capitalize"}
            onClick={deleteSymbology}
          >
            Delete
          </Button>
        </div>
        <div className='px-1'>
          <Button
            themeOptions={{ size: "sm", color: 'transparent' }}
            className={" capitalize"}
            onClick={() => setOpen(false) }
          >
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}