import { useEffect, useMemo, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import {Button} from '~/modules/avl-components/src'
import get from 'lodash/get'
import { Dialog } from '@headlessui/react'
import cloneDeep from 'lodash/cloneDeep'
import { SymbologiesList } from './SymbologiesList';
import { Modal, INITIAL_NEW_MAP_MODAL_STATE } from '~/pages/DataManager/MapEditor/components/LayerManager/SymbologyControl';
import { MapContext } from '../../MapComponent'
import { SymbologyAttributes, getAttributes } from "../../utils"

export const SelectSymbology = ({ modalState, setModalState, tabIndex }) => {
  const { state, setState, falcor, falcorCache, pgEnv } = useContext(MapContext);
  // ---------------------------------
  // -- get Symbologies to list
  // ---------------------------------
  useEffect(() => {
    async function fetchData() {
      console.log('pgEnv', pgEnv)

      const lengthPath = ["dama", pgEnv, "symbologies", "length"];
      const resp = await falcor.get(lengthPath);

      await falcor.get([
        "dama", pgEnv, "symbologies", "byIndex",
        { from: 0, to: get(resp.json, lengthPath, 0) - 1 },
        "attributes", Object.values(SymbologyAttributes)
      ]);
    }
    fetchData();
  }, [falcor, pgEnv]);

  const symbologies = useMemo(() => {
    return Object.values(get(falcorCache, ["dama", pgEnv, "symbologies", "byIndex"], {}))
      .map(v => getAttributes(get(falcorCache, v.value, { "attributes": {} })["attributes"]));
  }, [falcorCache, pgEnv]);

  // add a symbology
  const addLayer = () => {
    const { symbologyId } = modalState; 
    setState(draft => {
      let newSymbology = cloneDeep(symbologies.find(d => +d.symbology_id === +symbologyId))
      newSymbology.isVisible = false;

      Object.keys(newSymbology.symbology.layers).forEach(layerId => {
        newSymbology.symbology.layers[layerId].layers.forEach((d,i) => {
          newSymbology.symbology.layers[layerId].layers[i].layout =  { "visibility": 'none' }
        })

        newSymbology.symbology.layers[layerId]["interactive-filters"]?.forEach(
          (iFilter, filterIndex) => {
            (iFilter?.layers || []).forEach((d, i) => {
              newSymbology.symbology.layers[layerId]["interactive-filters"][
                filterIndex
              ].layers[i].layout = { visibility: "none" };
            });
          }
        );
      })

      draft.symbologies[''+symbologyId] = newSymbology

      draft.tabs[tabIndex].rows = [...draft.tabs[tabIndex].rows, {
        type: 'symbology', 
        name: newSymbology.name,
        symbologyId: newSymbology.symbology_id 
      }]
    })
    setModalState(INITIAL_NEW_MAP_MODAL_STATE)
  }

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
            symbologies={symbologies}
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
                addLayer();
              }}
            >
              Add Layer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
