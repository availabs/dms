import React, {useContext} from 'react'
import { ThemeContext } from '../../../../../../../../../ui/useTheme'
import { cloneDeep } from 'lodash-es'
import { Dialog } from '@headlessui/react'
import { SymbologiesList } from './SymbologiesList';
import { Modal, INITIAL_NEW_MAP_MODAL_STATE } from '../../../../../../../../mapeditor/MapEditor/components/LayerManager/SymbologyControl';
import { MapContext } from '../../'

export const SelectSymbology = ({ modalState, setModalState, tabIndex }) => {
  const { UI } = useContext(ThemeContext) || {};
  const { Button } = UI;
  const { setState, doApiLoad } = useContext(MapContext);

  const [symbologies, setSymbologies] = React.useState([]);

  React.useEffect(() => {
    doApiLoad().then(res => setSymbologies(res));
  }, [doApiLoad]);

  const addLayer = () => {
    const { symbologyId } = modalState; 
    setState(draft => {
      let newSymbology = cloneDeep(symbologies.find(d => +d.id === +symbologyId))
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
        symbologyId: newSymbology.id 
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
