import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import { MapEditorContext } from "../../../../context"
import { ThemeContext } from "../../../../../../ui/themeContext"

import { Dialog } from '@headlessui/react'

import { SymbologiesList } from './SymbologiesList';
import { Modal, INITIAL_NEW_MAP_MODAL_STATE } from '../SymbologyControl';

export const SelectSymbology = ({ modalState, setModalState }) => {
  const { baseUrl, falcor, app, type } = React.useContext(MapEditorContext);
  const { UI } = React.useContext(ThemeContext) || {};
  const { Button } = UI;
  const navigate = useNavigate();

  const deleteSymbology = React.useCallback(e => {
    falcor.call(
        ["dms", "data", "delete"],
        [app, type, modalState.symbologyId]
      )
      .then(() => {
        setModalState(INITIAL_NEW_MAP_MODAL_STATE)
      });
  }, [falcor, app, type, modalState.symbologyId, setModalState])

  return (
    <div>
      <Modal
        open={modalState.open}
        setOpen={() => setModalState({ ...modalState, open: !modalState.open })}
        width={"w-[1200px]"}
      >
        <div className="sm:flex sm:items-start">
          <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
            <i
              className="fad fa-layer-group text-blue-600"
              aria-hidden="true"
            />
          </div>
          <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
            <Dialog.Title
              as="h3"
              className="text-base font-semibold leading-6 text-gray-900"
            >
              Select Symbology
            </Dialog.Title>
          </div>
        </div>
        <div className="mt-2 ">
          <SymbologiesList
            selectedSymbologyId={modalState.symbologyId}
            setSelectedSymbologyId= {
              (newValue) => {
                setModalState({ ...modalState, symbologyId: newValue })
              }
            }
            />
        </div>
        <div className="mt-5 sm:mt-4 sm:flex justify-end">
          <div className="mr-1">
            <Button
              themeOptions={{ color: "danger" }}
              disabled={!modalState.symbologyId}
              onClick={ deleteSymbology }
            >
              Delete
            </Button>
          </div>
          <div className="mr-1">
            <Button
              type="button"
              themeOptions={{ color: "cancel" }}
              onClick={() => setModalState(INITIAL_NEW_MAP_MODAL_STATE)}
            >
              Cancel
            </Button>
          </div>
          <div>
            <Button
              type="button"
              themeOptions={
                modalState.symbologyId ? { color: "primary" } : { color: "transparent" }
              }
              disabled={!modalState.symbologyId}
              onClick={() => {
                navigate(`${baseUrl}/edit/${modalState.symbologyId}`)
                setModalState(INITIAL_NEW_MAP_MODAL_STATE)
              }}
            >
              Open Symbology
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
