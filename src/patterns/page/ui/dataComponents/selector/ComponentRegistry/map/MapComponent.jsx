import React, {useEffect, useMemo, createContext} from "react";
import isEqual from "lodash/isEqual"
import { AvlMap } from "~/modules/avl-map-2/src"
import { PMTilesProtocol } from './pmtiles'
import { useImmer } from 'use-immer';
import LegendPanel from './LegendPanel/LegendPanel'
import SymbologyViewLayer from './SymbologyViewLayer'
import { usePrevious } from './utils'
import {CMSContext} from "../../../../../siteConfig";
import {SymbologySelector} from "./SymbologySelector";
import {useSearchParams} from "react-router-dom";
import FilterControls from "./controls/FilterControls";
import {defaultStyles, blankStyles} from "./styles";
import MoreControls from "./controls/MoreControls";
export const HEIGHT_OPTIONS = {
    "full": 'calc(95vh)',
    1: "900px",
    "2/3": "600px",
    "1/3": "300px",
    "1/4": "150px",
};
const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

export const MapContext = createContext(undefined);

const getData = async () => {
    return {}
}

const Edit = ({value, onChange, size}) => {
    // const {falcor, falcorCache} = useFalcor();
    // controls: symbology, more, filters: lists all interactive and dynamic filters and allows for searchParams match.
    const isEdit = Boolean(onChange);
    const { falcor, falcorCache, pgEnv } = React.useContext(CMSContext);
    const cachedData = typeof value === 'object' ? value : value && isJson(value) ? JSON.parse(value) : {};
    const [state,setState] = useImmer({
        tabs: cachedData.tabs || [{"name": "Layers", rows: []}],
        symbologies: cachedData.symbologies || {},
        isEdit,
        setInitialBounds: cachedData.setInitialBounds || false,
        initialBounds: cachedData.initialBounds || null,
        hideControls: cachedData.hideControls || false,
        blankBaseMap: cachedData.blankBaseMap || false,
        height: cachedData.height || "full",
        zoomPan: typeof cachedData.zoomPan === 'boolean' ? cachedData.zoomPan : true,
        zoomToFitBounds: cachedData.zoomToFitBounds
    })
    const [mapLayers, setMapLayers] = useImmer([])
    const [searchParams] = useSearchParams();
    const isReady = useMemo(() => {
        return Object.values(state.symbologies || {}).some(symb => Object.keys(symb?.symbology?.layers || {}).length > 0);
    }, [state.symbologies]);

    useEffect(() => {
        const activeSym = Object.keys(state.symbologies || {}).find(sym => state.symbologies[sym].isVisible);
        const activeSymSymbology = state.symbologies[activeSym]?.symbology;
        const activeLayer = activeSymSymbology?.layers?.[activeSymSymbology?.activeLayer];
        const useSearchParams = activeLayer?.useSearchParams;
        const searchParamKey = activeLayer?.searchParamKey;

        const interactiveFilterOptions = (activeLayer?.['interactive-filters'] || []);
        if(!useSearchParams) return;

        const searchParamFilterKey = searchParams.get(searchParamKey);
        const fI = interactiveFilterOptions.findIndex(f => f.searchParamValue === searchParamFilterKey || f.label === searchParamFilterKey)

        const dynamicFilterOptions = (activeLayer?.['dynamic-filters'] || []);

        const getSearchParamKey = f => f.searchParamKey || f.column_name;
        const searchParamValues = dynamicFilterOptions.reduce((acc, curr) => ({...acc, [getSearchParamKey(curr)]: searchParams.get(getSearchParamKey(curr))}), {});

        setState(draft => {
            if(fI !== -1){
                draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer].selectedInteractiveFilterIndex = fI;
            }

            if(dynamicFilterOptions?.length){
                draft.symbologies[activeSym].symbology.layers[activeSymSymbology.activeLayer]['dynamic-filters']
                    .filter(f => searchParamValues[getSearchParamKey(f)])
                    .forEach(filter => {
                        const newValues = searchParamValues[getSearchParamKey(filter)].split('|||')
                        filter.values = newValues?.length ? newValues : filter.defaultValue?.length ? [filter.defaultValue] : []
                    })
            }
        })
    }, [searchParams])

    useEffect(() => {
        // -----------------------
        // Update map layers on map
        // when state.symbology.layers update
        // -----------------------

        // console.log('symbology layers effect')
        const updateLayers = async () => {
            if(isReady) {
                
                let allLayers = (Object.values(state.symbologies).reduce((out,curr) => {
                    let ids = out.map(d => d.id)
                    let newValues = Object.keys(curr?.symbology?.layers)
                        .reduce((layerOut, layerKey) => {
                            if( !ids.includes(layerKey) ) {
                                layerOut[layerKey] = curr?.symbology?.layers?.[layerKey]
                            }
                            return layerOut
                        },{})
                        
                    return [...out,  ...Object.values(newValues)]
                    
                },[]))

                setMapLayers(draftMapLayers => {
                    let newLayers = allLayers
                      .filter(d => d)
                      // .filter(d => !currentLayerIds.includes(d.id))
                      .sort((a,b) => b.order - a.order)
                      .map(l => {
                        return new SymbologyViewLayer(l)
                      })

                    const oldIds = allLayers.map(d => d.id)
                    let oldLayers = draftMapLayers.filter(d => {
                        return oldIds.includes(d.id)
                    })

                    const out = [
                        // keep existing layers & filter
                        // ...oldLayers,
                        // add new layers
                        ...newLayers
                    ].sort((a,b) => b.order - a.order)
                    return out
                })
            }
        }
        updateLayers()
    }, [state.symbologies, isReady])

    const layerProps = useMemo(() =>  {
        return Object.values(state.symbologies).reduce((out,curr) => {
            return {
                ...out,
                ...Object.keys((curr?.symbology?.layers || {}))
                    .reduce((acc, layerId) => ({
                            ...acc,
                            [layerId]: {...(curr?.symbology?.layers?.[layerId] || {}), zoomToFitBounds: state.zoomToFitBounds}}
                        ), {})
            }
        }, {})
    }, [state?.symbologies, state.zoomToFitBounds]);

    const isHorizontalLegendActive = Object.values(state?.symbologies)
      ?.filter((symb) => symb.isVisible)
      .some((symb) => {
        return Object.values(symb?.symbology?.layers).some(
          (symbLayer) => symbLayer["legend-orientation"] === "horizontal"
        );
      });


    const interactiveFilterIndicies = useMemo(() => {
        const activeSym = Object.keys(state.symbologies || {}).find(sym => state.symbologies[sym].isVisible);
        const activeSymSymbology = state.symbologies[activeSym]?.symbology;
        return state.symbologies[activeSym]?.symbology.layers[activeSymSymbology?.activeLayer]?.selectedInteractiveFilterIndex
    }, [state.symbologies]);

      useEffect(() => {
        setState((draft) => {
          Object.keys(draft.symbologies)
            .forEach(topSymbKey => {
                const curTopSymb = draft.symbologies[topSymbKey];
                Object.keys(curTopSymb.symbology.layers)
                  .forEach((lKey) => {
                    const layer = draft.symbologies[topSymbKey].symbology.layers[lKey];
                    const draftFilters = layer['interactive-filters'] || {};
                    const draftDynamicFilters = layer['dynamic-filters'];
                    const draftFilterIndex = +layer.selectedInteractiveFilterIndex;
                    const draftInteractiveFilter = draftFilters?.[draftFilterIndex]

                    if(draftInteractiveFilter) {
                      const newSymbology = {
                        ...layer,
                        ...draftInteractiveFilter,
                        order: layer.order,
                        "layer-type": "interactive",
                        "interactive-filters": draftFilters,
                        "dynamic-filters": draftDynamicFilters,
                        selectedInteractiveFilterIndex: draftFilterIndex
                      };
  
                      newSymbology.layers.forEach((d, i) => {
                        newSymbology.layers[i].layout.visibility = curTopSymb.isVisible ? 'visible' :  "none";
                      });
                      draft.symbologies[topSymbKey].symbology.layers[lKey] = newSymbology;
                    }
                  });
            })
        });
      }, [interactiveFilterIndicies])

    const heightStyle = HEIGHT_OPTIONS[state.height];
    const activeSym = Object.keys(state.symbologies || {}).find(sym => state.symbologies[sym].isVisible);
    const activeSymSymbology = state.symbologies[activeSym]?.symbology;
    const activeLayer = activeSymSymbology?.layers?.[activeSymSymbology?.activeLayer];
    const activeFilter = activeLayer?.selectedInteractiveFilterIndex;
    const { center, zoom } = state.initialBounds ? state.initialBounds : {
        center: [-75.17, 42.85],
        zoom: 6.6
    }

    useEffect(() => {
        onChange && onChange(state)
    },[state])

    return (
        <MapContext.Provider value={{state, setState, falcor, falcorCache, pgEnv}}>
            {
                isEdit ? (
                    <>
                        <SymbologySelector context={MapContext}/>
                        <FilterControls />
                        <MoreControls />
                    </>
                ) : null
            }
            <div id='dama_map_edit' className="w-full relative" style={{height: heightStyle}}>
                <AvlMap
                  layers={ mapLayers }
                  layerProps = { layerProps }
                  hideLoading={true}
                  showLayerSelect={true}
                  mapOptions={{
                    center: center,
                    zoom: zoom,
                    protocols: [PMTilesProtocol],
                    styles: state.blankBaseMap ? blankStyles : defaultStyles,
                      dragPan: state.zoomPan,
                      scrollZoom: state.zoomPan,
                      dragRotate: state.zoomPan
                  }}
                  leftSidebar={ false }
                  rightSidebar={ false }
                />
                <div className={'absolute inset-0 flex pointer-events-none'}>
                    <div className='flex-1'/>
                    <div className={isHorizontalLegendActive ? 'max-w-[350px]' : 'max-w-[300px]'}><LegendPanel /></div>
                </div>
            </div>
        </MapContext.Provider>
    )
}

Edit.settings = {
    hasControls: false,
    name: 'ElementEdit'
}

export default {
    "name": 'Map',
    "type": 'Map',
    "variables": 
    [],
    getData,

    "EditComp": Edit,
    "ViewComp": Edit
}