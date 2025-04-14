import React, {useEffect, useMemo, useRef, createContext} from "react";
import isEqual from "lodash/isEqual"
import { AvlMap } from "~/modules/avl-map-2/src"
import { PMTilesProtocol } from '~/pages/DataManager/utils/pmtiles/index.ts'
import { useImmer } from 'use-immer';
import MapManager from './MapManager/MapManager'
import LegendPanel from './LegendPanel/LegendPanel'
import SymbologyViewLayer from './SymbologyViewLayer'
import { usePrevious } from './utils'
import {CMSContext} from "../../../../../siteConfig";
import { HEIGHT_OPTIONS } from "./MapManager/MapManager";
import {SymbologySelector} from "./SymbologySelector";
import {useSearchParams} from "react-router-dom";
import FilterControls from "./controls/FilterControls";
import {defaultStyles, blankStyles} from "./styles";

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
    const { falcor, falcorCache, pgEnv } = React.useContext(CMSContext);
    const mounted = useRef(false);
    const cachedData = typeof value === 'object' ? value : value && isJson(value) ? JSON.parse(value) : {};
    const [state,setState] = useImmer({
        tabs: cachedData.tabs || [{"name": "Layers", rows: []}],
        symbologies: cachedData.symbologies || {},
        isEdit: true,
        setInitialBounds: cachedData.setInitialBounds || false,
        initialBounds: cachedData.initialBounds || null,
        hideControls: cachedData.hideControls || false,
        blankBaseMap: cachedData.blankBaseMap || false,
        height: cachedData.height || "full",
        zoomPan: typeof cachedData.zoomPan === 'boolean' ? cachedData.zoomPan : true,
    })
    const [mapLayers, setMapLayers] = useImmer([])
    const [searchParams] = useSearchParams();

    useEffect(() => {
        const activeSym = Object.keys(state.symbologies || {}).find(sym => state.symbologies[sym].isVisible);
        const activeSymSymbology = state.symbologies[activeSym]?.symbology;
        const activeLayer = activeSymSymbology?.layers?.[activeSymSymbology?.activeLayer];
        const useSearchParams = activeLayer?.useSearchParams;
        const searchParamKey = activeLayer?.searchParamKey;
        if(!useSearchParams) return;

        const interactiveFilterOptions = (activeLayer?.['interactive-filters'] || []);
        const searchParamFilterKey = searchParams.get(searchParamKey);
        const fI = interactiveFilterOptions.findIndex(f => f.searchParamValue === searchParamFilterKey || f.label === searchParamFilterKey)

        if(fI !== -1){
            setState(draft => {
                draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer].selectedInteractiveFilterIndex = fI;
            })
        }
    }, [searchParams])

    useEffect(() => {
        // -----------------------
        // Update map layers on map
        // when state.symbology.layers update
        // -----------------------

        // console.log('symbology layers effect')
        const updateLayers = async () => {
            if(mounted.current) {
                
                let allLayers = (Object.values(state.symbologies).reduce((out,curr) => {
                    let ids = out.map(d => d.id)
                    let newValues = Object.keys(curr?.symbology?.layers)
                        .reduce((layerOut, layerKey) => {
                            if( !ids.includes(layerKey) ) {
                                layerOut[layerKey] = curr?.symbology?.layers[layerKey]
                            }
                            return layerOut
                        },{})
                        
                    return [...out,  ...Object.values(newValues)]
                    
                },[]))
                // console.log('allLayers', allLayers.length, mapLayers.length)
                //if(mapLayers.length === 0) {
                    setMapLayers(draftMapLayers => {

                        let currentLayerIds = draftMapLayers.map(d => d.id).filter(d => d)
                  
                        // let allLayers = (Object.values(state.symbologies).reduce((out,curr) => {
                        //     return [...out, ...Object.values(curr?.symbology?.layers || {})]
                        // },[]))

                        //console.log('allLayers', allLayers)
                        let newLayers = allLayers
                          .filter(d => d)
                          .filter(d => !currentLayerIds.includes(d.id))
                          .sort((a,b) => b.order - a.order)
                          .map(l => {
                            return new SymbologyViewLayer(l)
                          })

                        const oldIds = allLayers.map(d => d.id)
                        //console.log('old ids', oldIds)
                        let oldLayers = draftMapLayers.filter(d => {
                            //console.log(d.id)
                            return oldIds.includes(d.id)
                        })
                        
                        const out = [
                            // keep existing layers & filter
                            ...oldLayers, 
                            // add new layers
                            ...newLayers
                        ].sort((a,b) => b.order - a.order)
                        // console.log('update layers old:', oldLayers, 'new:', newLayers, 'out', out)
                        return out
                    })
                //}
            }
        }
        updateLayers()
    }, [state.symbologies])

    const layerProps = useMemo(() =>  {
        return Object.values(state.symbologies).reduce((out,curr) => {
            return {...out, ...(curr?.symbology?.layers || {})}
        },{}) 
    }, [state?.symbologies]);

    const isHorizontalLegendActive = Object.values(state?.symbologies)
      ?.filter((symb) => symb.isVisible)
      .some((symb) => {
        return Object.values(symb?.symbology?.layers).some(
          (symbLayer) => symbLayer["legend-orientation"] === "horizontal"
        );
      });


    const interactiveFilterIndicies = useMemo(
        () =>
          Object.values(state.symbologies).map(
            (topSymb) => {
                return Object.values(topSymb.symbology.layers).map(l => l.selectedInteractiveFilterIndex)
            }
          ),
        [state.symbologies]
      );

      useEffect(() => {
        setState((draft) => {
          Object.keys(draft.symbologies)
            .forEach(topSymbKey => {
                const curTopSymb = draft.symbologies[topSymbKey];
                Object.keys(curTopSymb.symbology.layers)
                  .filter((lKey) => {
                    return curTopSymb.symbology.layers[lKey]["layer-type"] === "interactive"
                  })
                  .forEach((lKey) => {
                    const layer = draft.symbologies[topSymbKey].symbology.layers[lKey];
                    const draftFilters = layer['interactive-filters'];
                    const draftFilterIndex = layer.selectedInteractiveFilterIndex;
                    const draftInteractiveFilter = draftFilters[draftFilterIndex] 

                    if(draftInteractiveFilter) {
                      const newSymbology = {
                        ...layer,
                        ...draftInteractiveFilter,
                        order: layer.order,
                        "layer-type": "interactive",
                        "interactive-filters": draftFilters,
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
    const interactiveFilterOptions = (activeLayer?.['interactive-filters'] || []);
    const activeFilter = activeLayer?.selectedInteractiveFilterIndex;
    const { center, zoom } = state.initialBounds ? state.initialBounds : {
        center: [-75.17, 42.85],
        zoom: 6.6
    }
      console.log('debug MapComponent',state.symbologies[activeSym], activeLayer)
      console.log('debug MapComponent filters', activeLayer?.selectedInteractiveFilterIndex, interactiveFilterOptions, activeFilter)


    useEffect(() => {
        async function updateData() {
            onChange && onChange(state)
        }

        if(!isEqual(state, value)) {
            updateData()
        }
    },[state])

    return (
        <MapContext.Provider value={{state, setState, falcor, falcorCache, pgEnv}}>
            <SymbologySelector context={MapContext}/>
            <FilterControls />
            <div id='dama_map_edit' className="w-full relative" style={{height: heightStyle}} ref={mounted}>
                <AvlMap
                  layers={ mapLayers }
                  layerProps = { layerProps }
                  hideLoading={true}
                  showLayerSelect={true}
                  mapOptions={{
                    center: center,
                    zoom: zoom,
                    protocols: [PMTilesProtocol],
                    styles: state.blankBaseMap ? blankStyles : defaultStyles
                  }}
                  leftSidebar={ false }
                  rightSidebar={ false }
                />
                <div className={'absolute inset-0 flex pointer-events-none'}>
                    {/*<div className=''><MapManager /></div>*/}
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

const View = ({value, size}) => {
    // console.log('Dama Map: View')
    // const {falcor, falcorCache} = useFalcor();
    const { falcor, falcorCache, pgEnv } = React.useContext(CMSContext)
    const mounted = useRef(false);
    const cachedData = typeof value === 'object' ? value : value && isJson(value) ? JSON.parse(value) : {};
    const [searchParams] = useSearchParams()
    //console.log('cachedData', cachedData, value)
    const [state,setState] = useImmer({
        tabs: cachedData.tabs || [{"name": "Layers", rows: []}],
        symbologies: cachedData.symbologies || {},
        initialBounds: cachedData.initialBounds || null,
        hideControls: cachedData.hideControls || false,
        blankBaseMap: cachedData.blankBaseMap || false,
        height: cachedData.height || "full",
        zoomPan: typeof cachedData.zoomPan === 'boolean' ? cachedData.zoomPan : true,
    })
    const [mapLayers, setMapLayers] = useImmer([])
    useEffect(() => {
        const activeSym = Object.keys(state.symbologies || {}).find(sym => state.symbologies[sym].isVisible);
        const activeSymSymbology = state.symbologies[activeSym]?.symbology;
        const activeLayer = activeSymSymbology?.layers?.[activeSymSymbology?.activeLayer];
        const useSearchParams = activeLayer?.useSearchParams;
        const searchParamKey = activeLayer?.searchParamKey;
        if(!useSearchParams) return;

        const interactiveFilterOptions = (activeLayer?.['interactive-filters'] || []);
        const searchParamFilterKey = searchParams.get(searchParamKey);
        const fI = interactiveFilterOptions.findIndex(f => f.searchParamValue === searchParamFilterKey || f.label === searchParamFilterKey)

        if(fI !== -1){
            setState(draft => {
                draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer].selectedInteractiveFilterIndex = fI;
            })
        }
    }, [searchParams])
    //console.log('render map component view', state)
    useEffect(() => {
        // -----------------------
        // Update map layers on map
        // when state.symbology.layers update
        // -----------------------
        const updateLayers = async () => {
            if(mounted.current) {
                
                let allLayers = (Object.values(state.symbologies).reduce((out,curr) => {
                    let ids = out.map(d => d.id)
                    let newValues = Object.keys(curr?.symbology?.layers)
                        .reduce((layerOut, layerKey) => {
                            if( !ids.includes(layerKey) ) {
                                layerOut[layerKey] = curr?.symbology?.layers[layerKey]
                            }
                            return layerOut
                        },{})
                        
                    return [...out,  ...Object.values(newValues)]
                    
                },[]))
                //if(mapLayers.length === 0) {
                    setMapLayers(draftMapLayers => {

                        let currentLayerIds = draftMapLayers.map(d => d.id).filter(d => d)
                  
                        // let allLayers = (Object.values(state.symbologies).reduce((out,curr) => {
                        //     return [...out, ...Object.values(curr?.symbology?.layers || {})]
                        // },[]))

                        //console.log('allLayers', allLayers)
                        let newLayers = allLayers
                          .filter(d => d)
                          .filter(d => !currentLayerIds.includes(d.id))
                          .sort((a,b) => b.order - a.order)
                          .map(l => {
                            return new SymbologyViewLayer(l)
                          })

                        const oldIds = allLayers.map(d => d.id)
                        //console.log('old ids', oldIds)
                        let oldLayers = draftMapLayers.filter(d => {
                            //console.log(d.id)
                            return oldIds.includes(d.id)
                        })
                        
                        const out = [
                            // keep existing layers & filter
                            ...oldLayers, 
                            // add new layers
                            ...newLayers
                        ].sort((a,b) => b.order - a.order)
                        // console.log('update layers old:', oldLayers, 'new:', newLayers, 'out', out)
                        return out
                    })
                //}
            }
        }
        updateLayers()
    }, [state?.symbologies])

    const layerProps = useMemo(() =>  {
        return Object.values(state.symbologies).reduce((out,curr) => {
            return {...out, ...(curr?.symbology?.layers || {})}
        },{}) 
    }, [state?.symbologies]);

    const isHorizontalLegendActive = Object.values(state?.symbologies)
      ?.filter((symb) => symb.isVisible)
      .some((symb) => {
        return Object.values(symb?.symbology?.layers).some(
          (symbLayer) => symbLayer["legend-orientation"] === "horizontal"
        );
      });

    const interactiveFilterIndicies = useMemo(
        () =>
          Object.values(state.symbologies).map(
            (topSymb) => {
                return Object.values(topSymb.symbology.layers).map(l => l.selectedInteractiveFilterIndex)
            }
          ),
        [state.symbologies]
      );
      const prevInteractiveIndicies = usePrevious(interactiveFilterIndicies);
    
      useEffect(() => {
        setState((draft) => {
          Object.keys(draft.symbologies)
            .forEach(topSymbKey => {
                const curTopSymb = draft.symbologies[topSymbKey];
  
                Object.keys(curTopSymb.symbology.layers)
                  .filter((lKey) => {
                    return curTopSymb.symbology.layers[lKey]["layer-type"] === "interactive"
                  })
                  .forEach((lKey) => {
                    const layer = draft.symbologies[topSymbKey].symbology.layers[lKey];
                
                    const draftFilters = layer['interactive-filters'];
                    const draftFilterIndex = layer.selectedInteractiveFilterIndex;
                    const draftInteractiveFilter = draftFilters[draftFilterIndex] 
                    if(draftInteractiveFilter) {
                      const newSymbology = {
                        ...layer,
                        ...draftInteractiveFilter,
                        order: layer.order,
                        "layer-type": "interactive",
                        "interactive-filters": draftFilters,
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
      }, [isEqual(interactiveFilterIndicies, prevInteractiveIndicies)])

    /*

    -73.77114629819935,
          42.653137397916566
    */
        
    const { center, zoom } = state.initialBounds ? state.initialBounds : {
        center: [-75.17, 42.85],
        zoom: 6.6
    }
    const heightStyle = HEIGHT_OPTIONS[state.height];
    return (
        <MapContext.Provider value={{state, setState, falcor, falcorCache, pgEnv}}>
            <div id='dama_map_view' className="w-full relative" style={{height: heightStyle}} ref={mounted}>
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
                    {/*{!state.hideControls && <div className=''><MapManager /></div>}*/}
                    <div className='flex-1'/>
                    <div className={isHorizontalLegendActive ? 'max-w-[350px]' : 'max-w-[300px]'}><LegendPanel /></div>
                </div>
            </div>
        </MapContext.Provider>
    )
}

export default {
    "name": 'Map',
    "type": 'Map',
    "variables": 
    [       
        {
            name: 'geoid',
            default: '36'
        }
    ],
    getData,

    "EditComp": Edit,
    "ViewComp": View
}