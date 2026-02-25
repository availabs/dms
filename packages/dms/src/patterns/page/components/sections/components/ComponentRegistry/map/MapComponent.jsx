import React, {useEffect, useMemo, createContext} from "react";
import get from "lodash/get"
import mapboxgl from "maplibre-gl";
import isEqual from "lodash/isEqual"
import { AvlMap } from "~/modules/avl-map-2/src"
import { PMTilesProtocol } from './pmtiles/index'
import { useImmer } from 'use-immer';
import LegendPanel from './LegendPanel/LegendPanel.jsx'
import SymbologyViewLayer from './SymbologyViewLayer.jsx'
import { PageContext, CMSContext } from "~/modules/dms/src/patterns/page/context.js";
import {SymbologySelector} from "./SymbologySelector.jsx";
import {useSearchParams} from "react-router";
import FilterControls from "./controls/FilterControls.jsx";
import {defaultStyles, blankStyles} from "./styles.js";
import MoreControls from "./controls/MoreControls.jsx";
import PluginLayer from "../../PluginLayer"
import { PluginLibrary, PLUGIN_TYPE } from "../../../";
import ExternalPluginPanel from "../../ExternalPluginPanel";
import {fetchBoundsForFilter} from '../../../stateUtils';

export const HEIGHT_OPTIONS = {
    "full": 'calc(95vh)',
    1: "900px",
    "2/3": "600px",
    "1/3": "300px",
    "1/4": "150px",
};

export const PANEL_POSITION_OPTIONS = {
    'top-left':"top-0 left-0",
    'top':"left-[40%] top-0",
    'top-right':"top-0 right-0",
    'bottom-left':"bottom-0 left-0",
    'bottom':"left-[40%] bottom-0",
    'bottom-right':"bottom-0 right-0",
    'hide':'hidden'
}

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
    const { pageState, setPageState } =  React.useContext(PageContext) || {}
    const cachedData = typeof value === 'object' ? value : value && isJson(value) ? JSON.parse(value) : {};
    const [state,setState] = useImmer({
        tabs: cachedData.tabs || [{"name": "Layers", rows: []}],
        symbologies: cachedData.symbologies || {},
        isEdit,
        setInitialBounds: cachedData.setInitialBounds || false,
        initialBounds: cachedData.initialBounds || null,
        hideControls: cachedData.hideControls || false,
        //blankBaseMap: cachedData.blankBaseMap || false,
        height: cachedData.height || "full",
        zoomPan: typeof cachedData.zoomPan === 'boolean' ? cachedData.zoomPan : true,
        zoomToFitBounds: cachedData.zoomToFitBounds,
        legendPosition: cachedData.legendPosition || Object.keys(PANEL_POSITION_OPTIONS)[2], //defaults to `top-right`
        pluginControlPosition: cachedData.pluginControlPosition || Object.keys(PANEL_POSITION_OPTIONS)[0], //defaults to `top-left`
        basemapStyle: cachedData.basemapStyle || "Default"
    })
    const [mapLayers, setMapLayers] = useImmer([])

    const isReady = useMemo(() => {
        return Object.values(state.symbologies || {}).some(symb => Object.keys(symb?.symbology?.layers || {}).length > 0);
    }, [state.symbologies]);

    const activeSym = useMemo(() => {
        return Object.keys(state.symbologies || {}).find(sym => state.symbologies[sym].isVisible);
    }, [state.symbologies])
    const activeSymSymbology = useMemo(()=> {
        return state.symbologies[activeSym]?.symbology || {};
    }, [state.symbologies[activeSym]])
    const activeLayer = useMemo(() => {
        return activeSymSymbology?.layers?.[activeSymSymbology?.activeLayer];
    },[activeSymSymbology])
    const pageFilters = useMemo(() => {
        return pageState.filters
    },[pageState])
    useEffect(() => {
        const usePageFilters = Object.values(activeSymSymbology.layers || {}).some(layer => layer['dynamic-filters']?.length);
        if(!usePageFilters) return;

        // get interactive filters for active layer
        const interactiveFilterOptions = (activeLayer?.['interactive-filters'] || []);
        const searchParamKey = activeLayer?.searchParamKey;
        const searchParamFilterKey = (pageFilters || []).find(f => f.searchKey === searchParamKey)?.values;
        const fI = interactiveFilterOptions.findIndex(f => f.searchParamValue === searchParamFilterKey || f.label === searchParamFilterKey)

        // dynamic filters update for all layers
        const getSearchParamKey = f => f.searchParamKey || f.column_name;
        const searchParamValues = dynamicFilterOptions =>
            dynamicFilterOptions.reduce((acc, curr) => ({...acc, [getSearchParamKey(curr)]: (pageFilters || []).find(f => f.searchKey === getSearchParamKey(curr))?.values}), {});

        setState(draft => {
            if(fI !== -1){
                draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer].selectedInteractiveFilterIndex = fI;
            }
            draft.symbologies[activeSym].symbology.pageFilters = pageFilters;

            Object.values(draft.symbologies[activeSym].symbology.layers)
                .filter(l => l['dynamic-filters'])
                .forEach(layer => {
                    layer['dynamic-filters']
                        .filter(dynamicFilterOptions => {
                            return searchParamValues([dynamicFilterOptions])[getSearchParamKey(dynamicFilterOptions)]
                        })
                        .forEach(filter => {
                            const isNumeric = filter.dataType === 'numeric';
                            const newValues = searchParamValues(layer['dynamic-filters'])[getSearchParamKey(filter)];

                            filter.values =
                                Array.isArray(newValues) && newValues?.length ? newValues.map(v => isNumeric ? +v : v) :
                                    typeof newValues === 'string' ? [isNumeric ? +newValues : newValues] :
                                        filter.defaultValue?.length ? [isNumeric ? +filter.defaultValue : filter.defaultValue] : []
                        })
                })
        })
    }, [pageFilters])

    const dynamicFilterOptions = useMemo(() => {
        return (activeLayer?.['dynamic-filters'] || []);
    },[activeLayer]);

    useEffect(() => {
        const getFilterBounds = async () => {
            const symbName = Object.keys(state.symbologies)[0];
            const symbPathBase = `symbologies['${symbName}']`;
            const symbData = get(state, symbPathBase, {})

            const newExtent = await fetchBoundsForFilter(symbData, falcor, pgEnv, dynamicFilterOptions);
            setState((draft) => {
                const parsedExtent = JSON.parse(newExtent);
                const coordinates = parsedExtent?.coordinates[0];
                const mapGeom = coordinates?.reduce((bounds, coord) => {
                return bounds.extend(coord);
                }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

                if(mapGeom && Object.keys(mapGeom).length > 0) {
                    draft.symbologies[activeSym].symbology.zoomToFilterBounds = [mapGeom['_sw'], mapGeom['_ne']];
                }
            })
        }
        if (
            dynamicFilterOptions.length > 0 &&
            dynamicFilterOptions.some((dynFilter) => dynFilter.zoomToFilterBounds) &&
            dynamicFilterOptions.some((dynFilter) => dynFilter?.values?.length > 0)
        ) {
            getFilterBounds();
        } else {
        if(state?.symbologies[activeSym]?.symbology?.length > 0) {
            setState((draft) => {
                 draft.symbologies[activeSym].symbology.zoomToFilterBounds = [];
            });
        }
        }
    }, [dynamicFilterOptions, pageFilters]);

    const arePluginsLoaded = Object.values((state.symbologies || {})).some(symb => Object.keys((symb?.symbology?.plugins || {})).length > 0);

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
                    let newSymbLayers = Object.keys(curr?.symbology?.layers)
                        .reduce((layerOut, layerKey) => {
                            if( !ids.includes(layerKey) ) {
                                layerOut[layerKey] = curr?.symbology?.layers?.[layerKey]
                            }
                            return layerOut
                        },{})
                  let newPlugins = Object.keys(curr?.symbology?.plugins || {})
                        .reduce((pluginOut, pluginKey) => {
                            if( !ids.includes(pluginKey) ) {
                                pluginOut[pluginKey] = curr?.symbology?.plugins?.[pluginKey]
                            }
                            return pluginOut
                        },{})


                    return [...out,  ...Object.values(newSymbLayers), ...Object.values(newPlugins)]

                },[]))

                setMapLayers(draftMapLayers => {
                    let currentLayerIds = draftMapLayers.map(d => d.id).filter(d => !!d)
                    let newLayers = allLayers
                      .filter(d => d)
                      .filter(d => !currentLayerIds.includes(d.id))
                      .sort((a,b) => b.order - a.order)
                      .map(l => {
                        if(l.type === PLUGIN_TYPE) {
                            //console.log("plugin layer")
                            return new PluginLayer(l)
                        } else {
                            return new SymbologyViewLayer(l)
                        }
                      })

                    const oldIds = allLayers.map(d => d.id)
                    let oldLayers = draftMapLayers.filter(d => {
                        return oldIds.includes(d.id)
                    })

                    const out = [
                        // keep existing layers & filter
                        ...oldLayers,
                        // add new layers
                        ...newLayers
                    ].sort((a,b) => b.order - a.order)
                    return out
                })
            }
        }
        updateLayers()
    }, [state.symbologies, isReady])

    //I want to check to see if the data-column is being updated in the symbology
    //Basically, the data-column update is not making it to the map layer. We need to know why
    //console.log("DMS Map state.symbologies::", Object.values(state.symbologies))
    //as of 8:58am 9/4, it is NOT making it to the symbology
    //HOWEVER -- it is propegating to the `pluginData` field.


    const layerProps = useMemo(() =>  {
        return Object.values(state.symbologies).reduce((out,curr) => {
            return {
                ...out,
                ...Object.keys((curr?.symbology?.layers || {}))
                    .reduce((acc, layerId) => ({
                            ...acc,
                            [layerId]: {...(curr?.symbology?.layers?.[layerId] || {}), zoomToFitBounds: state.zoomToFitBounds, zoomToFilterBounds: curr.symbology.zoomToFilterBounds }}
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
    const legendPositionStyle = PANEL_POSITION_OPTIONS[state.legendPosition];
    const pluginPositionStyle = PANEL_POSITION_OPTIONS[state.pluginControlPosition];
    const activeFilter = activeLayer?.selectedInteractiveFilterIndex;
    const { center, zoom } = state.initialBounds ? state.initialBounds : {
        center: [-75.17, 42.85],
        zoom: 6.6
    }

    useEffect(() => {
        onChange && onChange(state)
    },[state])

    defaultStyles.sort((a,b) => {
        if(a.name === state.basemapStyle) {
            return -1;
        } else if (b.name === state.basemapStyle) {
            return 1
        } else {
            return 0
        }
    })

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
                  onMapStyleSelect={(selectedStyle) => {
                      setState(draft => {
                        draft.basemapStyle = selectedStyle.name;
                      })
                  }}
                  leftSidebar={ false }
                  rightSidebar={ false }
                />
                <div className={`absolute ${legendPositionStyle} flex pointer-events-none`}>
                    <div className={isHorizontalLegendActive ? 'max-w-[350px]' : 'max-w-[300px]'}><LegendPanel position={state.legendPosition}/></div>
                </div>
                <div className={`absolute ${pluginPositionStyle} flex pointer-events-none`}>
                    {arePluginsLoaded && <ExternalPluginPanel />}
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
