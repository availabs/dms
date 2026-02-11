import React, { useMemo, useEffect }from 'react'
import { Button } from "~/modules/avl-components/src";
import {SymbologyContext} from '../../../'
import { Close, Plus } from '../../icons'
import get from 'lodash/get'
import set from 'lodash/set'
import StyleEditor from '../StyleEditor';
import { generateDefaultName } from '../../LayerManager/SymbologyControl/components/SaveChangesMenu';

function InteractiveFilterControl({ path, params = {enableBuilder: true} }) {
  const { enableBuilder } = params;
  const { state, setState } = React.useContext(SymbologyContext);
  const { value: interactiveFilters, selectedInteractiveFilterIndex, layerName, activeLayer } = useMemo(() => {
    return {
      value: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}].${path}`,
        []
      ),
      selectedInteractiveFilterIndex: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}]['selectedInteractiveFilterIndex']`
      ),
      layerName: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}]['name']`,
        ''
      ),
      activeLayer: get(state,`symbology.layers[${state?.symbology?.activeLayer}]`, {})
    };
  }, [state]);
  useEffect(() => {
    if(selectedInteractiveFilterIndex !== undefined && !interactiveFilters[selectedInteractiveFilterIndex]){
      setState(draft => {
        set(draft, `symbology.layers[${state.symbology.activeLayer}]['selectedInteractiveFilterIndex']`, undefined)
      })
    }
  }, [interactiveFilters])
  const shouldDisplayInteractiveBuilder = enableBuilder && selectedInteractiveFilterIndex !== undefined && selectedInteractiveFilterIndex !== null;
  return (
    <div className=" w-full items-center mt-2">
      <div className='w-full text-slate-500 text-[14px] flex justify-between '>
        Interactive Filters
        {enableBuilder && <div className="flex justify-end">
          <Button
            themeOptions={{ size: "xs", color: 'danger' }}
            className={"col-span-2 capitalize mb-2 mr-6"}
            onClick={() => {
              setState(draft => {
                const oldInteractiveFilters = get(
                  draft,
                  `symbology.layers[${state.symbology.activeLayer}].${path}`
                )
                oldInteractiveFilters.splice(selectedInteractiveFilterIndex,1);
                set(draft,`symbology.layers[${state.symbology.activeLayer}].${path}`, oldInteractiveFilters )
              })
            }}
          >
            <Close size={12} className='fill-gray-200'/>
          </Button>
          <Button
            themeOptions={{ size: "xs", color: 'primary' }}
            className={"col-span-2 capitalize mb-2"}
            onClick={() => {
              setState(draft => {
                const baseFilterName = interactiveFilters[interactiveFilters.length-1]?.label || layerName;
                const newFilterName = generateDefaultName(baseFilterName);
                const newInteractiveFilter = {
                  ...activeLayer,
                  "layer-type": 'simple',
                  "label": newFilterName,
                  selectedInteractiveFilterIndex: undefined,
                  filterGroupEnabled: false,
                  viewGroupEnabled: false,
                  'filter-group': [],
                  'filter-group-name': '',
                  'view-group-name': '',
                  'filter-source-views': [],
                  'interactive-filters': null
                }
                const newInteractiveFilters = [...interactiveFilters, newInteractiveFilter];
                set(draft,`symbology.layers[${state.symbology.activeLayer}].${path}`, newInteractiveFilters )
                set(draft,`symbology.layers[${state.symbology.activeLayer}]['selectedInteractiveFilterIndex']`, newInteractiveFilters.length-1 )
              })
            }}
          >
            <Plus className='fill-gray-200 p-0.5'/>
          </Button>
        </div>
      }
      </div>
      <div 
        className='w-full p-2 bg-blue-100 text-slate-700 text-sm mb-2 rounded'>
        <select
          className='bg-blue-100 w-full'
          value={selectedInteractiveFilterIndex}
          onChange={(e) => {
            setState(draft => {
              set(draft, `symbology.layers[${state.symbology.activeLayer}]['selectedInteractiveFilterIndex']`, e.target.value)
            })
          }}
        >
          {(interactiveFilters || [])
            .map((iFilter, i) => {
              return (
                <option key={i} value={i}>{iFilter.label}</option>
              )
          })}
        </select>
      </div>

      {
        shouldDisplayInteractiveBuilder && <InteractiveFilterbuilder />
      }
    </div>
  );
}

export const InteractiveFilterbuilder = () => {
  const { state, setState } = React.useContext(SymbologyContext);
  const { interactiveFilters, selectedInteractiveFilterIndex } = useMemo(() => {
    return {
      interactiveFilters: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}]['interactive-filters']`,
        []
      ),
      selectedInteractiveFilterIndex: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}]['selectedInteractiveFilterIndex']`,
        []
      ),
    };
  }, [state]);
  return (
    <>
      
      <div className="truncate col-span-10 group">
      Editing: 
        <input
          type="text"
          className=" px-2  border text-sm border-transparent group-hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent text-slate-700 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6"
          value={interactiveFilters[selectedInteractiveFilterIndex]?.label}
          onChange={(e) => {
            setState(draft => {
              set(draft,`symbology.layers[${state.symbology.activeLayer}]['interactive-filters'][${selectedInteractiveFilterIndex}].label`, e.target.value )
            })
          }}
        />
      </div>
      <StyleEditor
        type={"interactive"}
        pathPrefix={`['interactive-filters'][${selectedInteractiveFilterIndex}]`}
      />
    </>
  );
};


export {InteractiveFilterControl}