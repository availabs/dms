import React, { useEffect, useContext , useMemo, useRef } from 'react'
//import {Button} from '~/modules/avl-components/src'
import {SymbologyContext} from '../../..'
import { MapEditorContext } from "../../../../context"
import { get, set } from 'lodash-es'
import { getLayer } from '../utils'
import { Plus, Close } from '../../icons'
import { Modal } from "../SymbologyControl";
import { Menu, Transition, Tab, Dialog } from '@headlessui/react'

import { SourceAttributes, ViewAttributes, getAttributes } from "../../../../attributes"

import SourcesList from './SourceList';

export const DEFAULT_SOURCE = {
  active: false,
  sourceId: null,
  viewId: null,
  add: false
};

function SourceSelector () {
  const { state, setState } = React.useContext(SymbologyContext);
  const { pgEnv, baseUrl, falcor, falcorCache } = React.useContext(MapEditorContext);

  const [source, setSource] = React.useState(DEFAULT_SOURCE);

  // ---------------------------------
  // -- get sources to list
  // ---------------------------------
  useEffect(() => {
    async function fetchData() {
      const lengthPath = ["dama", pgEnv, "sources", "length"];
      const resp = await falcor.get(lengthPath);
      await falcor.get([
        "dama", pgEnv, "sources", "byIndex",
        { from: 0, to: get(resp.json, lengthPath, 0) - 1 },
        "attributes", Object.values(SourceAttributes)
      ]);
    }
    fetchData();
  }, [falcor, pgEnv]);

  const sources = useMemo(() => {
    return Object.values(get(falcorCache, ["dama", pgEnv, "sources", "byIndex"], {}))
      .map(v => getAttributes(get(falcorCache, v.value, { "attributes": {} })["attributes"]));
  }, [falcorCache, pgEnv]);

  //----------------------------------
  // -- get selected source views
  // ---------------------------------
  useEffect(() => {
    async function fetchData() {
      //console.time("fetch data");
      const {sourceId} = source
      const lengthPath = ["dama", pgEnv, "sources", "byId", sourceId, "views", "length"];
      const resp = await falcor.get(lengthPath);
      return await falcor.get([
        "dama", pgEnv, "sources", "byId", sourceId, "views", "byIndex",
        { from: 0, to: get(resp.json, lengthPath, 0) - 1 },
        "attributes", Object.values(ViewAttributes)
      ]);
    }
    if(source.sourceId) {
      fetchData();
    }
  }, [source.sourceId, falcor, pgEnv]);

  const views = useMemo(() => {
    return []
  }, [falcorCache, source.sourceId, pgEnv]);

  const selectedView = useMemo(() => {
    const views = Object.values(get(falcorCache, ["dama", pgEnv, "sources", "byId", source.sourceId, "views", "byIndex"], {}))
      .map(v => getAttributes(get(falcorCache, v.value, { "attributes": {} })["attributes"]));
    return views.find(v => v.view_id == source.viewId) || {};
  }, [falcorCache, source.sourceId, pgEnv, source.viewId, views]);

  const selectedViewLayerType = useMemo(() => {
    return selectedView?.metadata?.tiles?.layers?.[0]?.type;
  }, [selectedView])

  const [layerType, setLayerType] = React.useState(undefined);

  React.useEffect(() => {
    setLayerType(selectedViewLayerType);
  }, [selectedViewLayerType]);

// console.log("SourceSelector::source", source);
// console.log("SourceSelector::view", selectedView);
// console.log("SourceSelector::selectedViewLayerType", selectedViewLayerType);
// console.log("SourceSelector::layerType", layerType);

  const layers = useMemo(() => state.symbology?.layers || [], [state.symbology])

  const addLayer = () => {
    const newSource = sources.filter(d => d.source_id === +source.sourceId)?.[0] || {}
    const view = selectedView;//views.filter(d => d.view_id === +source.viewId)?.[0] || {}
    const layerId = Math.random().toString(36).replace(/[^a-z]+/g, '')
    const viewLayer = view?.metadata?.tiles?.layers?.[0]
    // console.log('newSource', newSource)
    //--------------------------------------------
    // Format for adding a layer
    // -------------------------------------------
    const newLayer = {
      // generated unique Id 
      id: layerId,
      // meta data
      name: `${newSource.display_name || newSource.name} ${view.version || view.view_id}`,
      // isDynamic: true,
      source_id: newSource.source_id,
      view_id: source.viewId,
      "layer-type": layerType === "heatmap" ? "heatmap" : 'simple',
      type: layerType,
      // mapbox sources and layers
      sources: (view?.metadata?.tiles?.sources || []).map(s => {
        const newS = {...s}
        newS.id = `${s.id}_${layerId}`
        return newS;
      }),
      layers: getLayer(layerId, viewLayer, layerType),
      // state data about the layer on the map
      isVisible: true,
      hover: "hover",
      order: Object.keys(state?.symbology?.layers || {})?.length || 0,
      filterGroupEnabled: false,
      viewGroupEnabled: false,
    }

    if (layerType === "heatmap") {
      newLayer['radius-data-column'] = "default";
      newLayer['weight-data-column'] = "default";
    }

// console.log('SourceSelector::addLayer::newLayer', newLayer)

    setState(draft => {
      if(!draft?.symbology){
        draft.symbology = { }
      }
      if(!draft?.symbology?.layers) {
        draft.symbology.layers = {}
      }
      set(draft, `symbology.layers[${layerId}]`,newLayer);
      if(!draft.symbology.activeLayer || !draft.symbology.layers[draft.symbology.activeLayer]){
        set(draft, `symbology.activeLayer`,newLayer.id)
      }
    })
    setSource({ add: false, sourceId: null, viewId: null})
  }

  const canAddLayer = (source?.sourceId && source?.viewId);
  return (
    <div className='relative'>
      <div
        className='p-1 rounded hover:bg-slate-100 m-1'
        onClick={() => setSource({ ...source, add: !source.add })}
      >
        {source.add ? (
          <Close className='fill-slate-500' />
        ) : (
          <Plus className='fill-slate-500' />
        )}
      </div>

      <Modal
        open={source.add}
        setOpen={() => setSource({ ...source, add: !source.add })}
        width={'w-[1200px]'}
      >
        <div className='sm:flex sm:items-start'>
          <div className='mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10'>
            <i
              className='fad fa-layer-group text-blue-600'
              aria-hidden='true'
            />
          </div>
          <div className='mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full'>
            <Dialog.Title
              as='h3'
              className='text-base font-semibold leading-6 text-gray-900'
            >
              Add Layer
            </Dialog.Title>
          </div>
        </div>
        <div className="mt-2 w-full">
          <SourcesList selectedSource={source} setSource={setSource}/>
        </div>

        <div className='mt-5 sm:mt-4 grid grid-cols-12'>
          <div className="col-span-10 grid grid-cols-10">

            { selectedViewLayerType !== "circle" ? null :
              <>
                <div className="col-span-6 text-right">
                  <div>
                    You selected a view with a layer of type "circle"
                  </div>
                  <div>
                    Choose between type "circle" or type "heatmap"
                  </div>
                </div>

                <div className="col-span-4">
                  <select value={ layerType }
                    onChange={ e => setLayerType(e.target.value) }
                    className="ml-8 outline-2"
                  >
                    <option value="circle">Circle</option>
                    <option value="heatmap">Heat Map</option>
                  </select>
                </div>
              </>
            }

          </div>
          <div className='col-span-2'>
          
            <button
              type='button'
              themeOptions={{color:"cancel"}}
              className='inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto'
              onClick={() => setSource({ ...DEFAULT_SOURCE })}
            >
              Cancel
            </button>
            <button
              type='button'
              themeOptions={canAddLayer ? {color:"primary"} : {color:"transparent"}}

              disabled={!canAddLayer}
              className='inline-flex ml-1 w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto'
              onClick={ addLayer }
            >
              Add layer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default SourceSelector;
