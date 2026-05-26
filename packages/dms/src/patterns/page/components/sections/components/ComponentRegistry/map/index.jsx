import React, {useEffect, useMemo, createContext, useRef} from "react";
import { get, cloneDeep, isEqual } from "lodash-es"
import mapboxgl from "maplibre-gl";
import { AvlMap } from "../../../../../../../ui/components/map"
// import { PMTilesProtocol } from './pmtiles/index'
import { useImmer } from 'use-immer';
import LegendPanel from './LegendPanel/LegendPanel.jsx'
import SymbologyViewLayer from './SymbologyViewLayer.jsx'
import { PageContext, CMSContext } from "../../../../../context.js";
// import {SymbologySelector} from "./SymbologySelector.jsx";
// import {useSearchParams} from "react-router";
// import FilterControls from "./controls/FilterControls.jsx";
import {defaultStyles, blankStyles} from "./styles.js";
// import MoreControls from "./controls/MoreControls.jsx";
import PluginLayer from "../../../../../../mapeditor/MapEditor/components/PluginLayer"
import { PluginLibrary, PLUGIN_TYPE } from "../../../../../../mapeditor/MapEditor";
import ExternalPluginPanel from "../../../../../../mapeditor/MapEditor/components/ExternalPluginPanel";
import { buildLayerUdaFilterOptions, fetchBoundsForFilter } from '../../../../../../mapeditor/MapEditor/stateUtils';
import { choroplethPaint } from "./utils.js";

import mapeditorFormat from "../../../../../../mapeditor/mapeditor.format"

// const MAP_EDITOR_FORMAT = cloneDeep(mapeditorFormat);

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

const EMPTY_TABS = [{ "name": "Layers", rows: [] }];
const EMPTY_OBJECT = {};

/**
 * Reuses the saved category legend rows as the source of truth for labels and
 * colors, then narrows that legend to only the categories present after the
 * current runtime filters have been applied.
 */
const getCategoryLegendFromFilteredData = (layer, filteredData = []) => {
    const dataColumn = layer?.["data-column"];
    const baseLegend = layer?.__runtimeBaseLegendData || layer?.["legend-data"] || [];
    const baseCategoryData = layer?.__runtimeBaseCategoryData || layer?.["category-data"] || [];
    const colorSet = layer?.["color-set"] || [];

    const baseLegendByValue = new Map(
        (baseCategoryData || []).map((row, index) => [
            String(row?.[dataColumn]),
            baseLegend[index] || null,
        ])
    );

    return (filteredData || [])
        .map((row, index) => {
            const value = row?.[dataColumn];
            if (value === undefined || value === null) return null;
            const savedLegendRow = baseLegendByValue.get(String(value));
            return {
                color: savedLegendRow?.color || colorSet[index % colorSet.length] || "#ccc",
                label: savedLegendRow?.label || String(value),
            };
        })
        .filter(Boolean);
};

export const MapSection = ({ value, onChange, isEdit, onHandle }) => {
    // const {falcor, falcorCache} = useFalcor();
    // controls: symbology, more, filters: lists all interactive and dynamic filters and allows for searchParams match.

// console.log("Map::value", value);
// console.log("Map::isEdit", isEdit);

    const { falcor, falcorCache, pgEnv, apiLoad, mapeditorKeys } = React.useContext(CMSContext);
    const { pageState, setPageState } =  React.useContext(PageContext) || {}
    const cachedData = typeof value === 'object' ? value : value && isJson(value) ? JSON.parse(value) : {};
    const cachedDisplay = cachedData.display || {};
    const [state, setState] = useImmer({
        tabs: cachedData.tabs || EMPTY_TABS,
        symbologies: cachedData.symbologies || EMPTY_OBJECT,
        display: {
            ...cachedDisplay,
            _functions: cachedDisplay._functions || cachedData._functions || { providers: [], subscribers: [] },
        },
        isEdit,
        setInitialBounds: cachedData.setInitialBounds || false,
        initialBounds: cachedData.initialBounds || null,
        hideControls: cachedData.hideControls || false,
        //blankBaseMap: cachedData.blankBaseMap || false,
        height: cachedData.height || "full",
        zoomPan: typeof cachedData.zoomPan === 'boolean' ? cachedData.zoomPan : true,
        zoomToFitBounds: cachedData.zoomToFitBounds || false,
        legendPosition: cachedData.legendPosition || Object.keys(PANEL_POSITION_OPTIONS)[2], //defaults to `top-right`
        pluginControlPosition: cachedData.pluginControlPosition || Object.keys(PANEL_POSITION_OPTIONS)[0], //defaults to `top-left`
        basemapStyle: cachedData.basemapStyle || "Default"
    });

    const doApiLoad = React.useCallback(() => {
        return mapeditorKeys.reduce((a, c) => {
            // `mapeditorKeys` entries are `{app}+{patternInstance}` (e.g.
            // 'mitigat-ny-prod+map_editor_test'). Symbology rows live at type
            // `{patternInstance}|symbology` — build the full type from the
            // format's leaf kind.
            const [app, patternInstance] = c.split("+");
            const format = {
                ...cloneDeep(mapeditorFormat),
                app,
                type: `${patternInstance}|${mapeditorFormat.type}`,
            };
            return a.then(aa => {
                return apiLoad({
                    ...format,
                    format,
                    children: [
                        {   type: () => {},
                            action: "list",
                            path: "/"
                        }
                    ]
                }).then(cc => [...aa, ...cc]);
            })
        }, Promise.resolve([]));
    }, [apiLoad, mapeditorKeys]);

    const interactionOptions = useMemo(() => {
        const mapLayers = Object.values(state.symbologies || {}).flatMap((symbology) =>
            Object.values(symbology?.symbology?.layers || {}).map((layer, index) => ({
                label: layer.name?.length && layer.name !== " " ? layer.name : `layer - ${index + 1}`,
                value: layer.id,
            }))
        );

        return { mapLayers };
    }, [state.symbologies]);

    /**
     * Exposes live map state and the map-specific API to the outer section settings shell.
     * Map Settings is rendered outside this component tree, so it needs this handle bridge.
     */
    /**
     * Runtime-only legend refresh for DMS map layers.
     *
     * Interactive filter switching already swaps the active layer config, but
     * dynamic-filter value changes only update rendered features. This effect
     * keeps legend data in sync with those live filtered results without
     * persisting temporary legend changes back into the saved symbology.
     */
    useEffect(() => {
        if (!onHandle) return;
        onHandle({
            state,
            setState,
            mapAPI: {
                state: { ...state, interactionOptions },
                setState,
                doApiLoad
            }
        });
    }, [onHandle, state, setState, doApiLoad, interactionOptions]);

// console.log("Map::pageState", pageState);

    const [mapLayers, setMapLayers] = useImmer([]);

    const isReady = useMemo(() => {
        return Object.values(state.symbologies || {}).some(symb => Object.keys(symb?.symbology?.layers || {}).length > 0);
    }, [state.symbologies]);

    const activeSym = useMemo(() => {
        return Object.keys(state.symbologies || {}).find(sym => state.symbologies[sym].isVisible);
    }, [state.symbologies])

    const activeSymSymbology = useMemo(()=> {
        return state.symbologies[activeSym]?.symbology || {};
    }, [state.symbologies[activeSym]])

// console.log("Map::activeSymSymbology", activeSymSymbology);

    const activeLayer = useMemo(() => {
        return activeSymSymbology?.layers?.[activeSymSymbology?.activeLayer];
    },[activeSymSymbology])

// console.log("Map::activeLayer", activeLayer);

    const pageFilters = useMemo(() => {
        return pageState.filters
    },[pageState])

    /**
     * `pageState.filters` now contains both "real" page filters and temporary
     * interaction filters (`type: 'action'`) published by components such as
     * Map/Card/Spreadsheet on hover or click.
     *
     * The map's symbology/filter sync should only react to real data/search
     * filters. If action filters are included here, a hover/click interaction
     * would be treated like a true map filter change, which can trigger map
     * state updates and visible layer/source refreshes.
     *
     * To avoid that, `dataPageFilters` keeps only the non-action filters that
     * should participate in the map's normal filter synchronization flow.
     */
    const dataPageFilters = useMemo(() => {
        return (pageFilters || []).filter(filter => filter?.type !== 'action');
    }, [pageFilters]);

    /**
     * `pageState.filters` receives a new array reference whenever action filters
     * are set/cleared, even if the underlying non-action filters did not change.
     *
     * This ref stores the previous non-action filter snapshot so we can compare
     * it with the current `dataPageFilters` value and skip the map filter-sync
     * effect when only temporary interaction state changed.
     *
     * In practice, this prevents hover/click provider updates from retriggering
     * expensive map sync work and causing the layer refresh behavior we saw
     * earlier.
     */
    const prevDataPageFiltersRef = useRef(dataPageFilters);
    useEffect(() => {
        if (isEqual(prevDataPageFiltersRef.current, dataPageFilters)) {
            return;
        }
        prevDataPageFiltersRef.current = dataPageFilters;

        const usePageFilters = Object.values(activeSymSymbology.layers || {}).some(layer => layer['dynamic-filters']?.length);

        if(!usePageFilters) return;

        // get interactive filters for active layer
        const interactiveFilterOptions = (activeLayer?.['interactive-filters'] || []);

// console.log("interactiveFilterOptions", interactiveFilterOptions)

        const searchParamKey = activeLayer?.searchParamKey;
        const searchParamFilterKey = (dataPageFilters || []).find(f => f.searchKey === searchParamKey)?.values;

// console.log("searchParamFilterKey", searchParamFilterKey)

        const fI = interactiveFilterOptions.findIndex((f) => {
            const filterValues = Array.isArray(searchParamFilterKey) ? searchParamFilterKey : [searchParamFilterKey];
            return filterValues.some(
                value => String(f.searchParamValue) === String(value) || String(f.label) === String(value)
            );
        })

// console.log("fI", fI)

        // dynamic filters update for all layers
        const getSearchParamKey = f => f.searchParamKey || f.column_name;
        const searchParamValues = dynamicFilterOptions =>
            dynamicFilterOptions.reduce((acc, curr) => ({...acc, [getSearchParamKey(curr)]: (dataPageFilters || []).find(f => f.searchKey === getSearchParamKey(curr))?.values}), {});

        setState(draft => {
            if(fI !== -1){
                draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer].selectedInteractiveFilterIndex = fI;
            }

            Object.values(draft.symbologies[activeSym].symbology.layers)
                .filter(l => l['dynamic-filters'])
                .forEach(layer => {
                    layer['dynamic-filters']
                        .filter(dynamicFilterOptions => {
                            return searchParamValues([dynamicFilterOptions])[getSearchParamKey(dynamicFilterOptions)]
                        })
                        .forEach(filter => {

// console.log("filter:", filter)

                            const isNumeric = filter.dataType === 'numeric';
                            const newValues = searchParamValues(layer['dynamic-filters'])[getSearchParamKey(filter)];

                            filter.values =
                                Array.isArray(newValues) && newValues?.length ? newValues.map(v => isNumeric ? +v : v) :
                                    typeof newValues === 'string' ? [isNumeric ? +newValues : newValues] :
                                        filter.defaultValue?.length ? [isNumeric ? +filter.defaultValue : filter.defaultValue] : []
                        })
                })
        })
    }, [dataPageFilters])

    const dynamicFilterOptions = useMemo(() => {
        return (activeLayer?.['dynamic-filters'] || []);
    },[activeLayer]);

// console.log("Map::dynamicFilterOptions", dynamicFilterOptions);

    useEffect(() => {
        const getFilterBounds = async () => {
            const symbName = Object.keys(state.symbologies)[0];
            const symbPathBase = `symbologies['${symbName}']`;
            const symbData = get(state, symbPathBase, {})

            const newExtent = await fetchBoundsForFilter(symbData, falcor, pgEnv, dynamicFilterOptions);
            // if (!newExtent || newExtent === "undefined") return;
            setState((draft) => {
                let parsedExtent;
                try {
                    parsedExtent = typeof newExtent === "string" ? JSON.parse(newExtent) : newExtent;
                } catch (e) {
                    console.warn("[Map] Invalid filter bounds extent:", newExtent);
                    return;
                }
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
    }, [dynamicFilterOptions, dataPageFilters]);

    /**
     * Keep runtime legend data aligned with the currently active layer filters.
     * When dynamic filters are active, refetch filtered legend inputs and store
     * the derived legend state on the live layer only. When filters clear,
     * restore the layer's original saved legend values.
     */
    useEffect(() => {
        if (isEdit || !activeSym || !isReady) return;

        let cancelled = false;

        const refreshLegendData = async () => {
            const visibleSymbologies = Object.entries(state.symbologies || {})
                .filter(([, symb]) => symb?.isVisible);

            for (const [symbologyId, symb] of visibleSymbologies) {
                const layers = Object.values(symb?.symbology?.layers || {});

                for (const layer of layers) {
                    /**
                     * Interactive layers keep the active variant nested under
                     * `interactive-filters`, while the top-level layer remains
                     * marked as `"interactive"`. Resolve the effective active
                     * legend type here so dynamic-filter legend refresh can
                     * still branch into categories / choropleth / circles.
                     */
                    const selectedInteractiveFilterIndex = layer?.selectedInteractiveFilterIndex;
                    const layerType = layer?.["layer-type"] === "interactive"
                        ? get(layer, `['interactive-filters'][${selectedInteractiveFilterIndex}]['layer-type']`)
                        : layer?.["layer-type"];
                    const dataColumn = layer?.["data-column"];
                    const viewId = layer?.view_id;
                    const activeLegendFilters = buildLayerUdaFilterOptions({
                        layerFilter: layer?.filter,
                        dynamicFilters: layer?.["dynamic-filters"],
                        filterMode: layer?.filterMode,
                    });

                    const hasActiveDynamicFilters = (layer?.["dynamic-filters"] || []).some(
                        (dynamicFilter) => Array.isArray(dynamicFilter?.values) && dynamicFilter.values.length > 0
                    );

                    /**
                     * Prevent repeated runtime legend fetches when the live
                     * filter envelope for this layer has not changed.
                     */
                    const runtimeLegendKey = JSON.stringify({
                        layerType,
                        viewId,
                        dataColumn,
                        filterMode: layer?.filterMode || "all",
                        filters: activeLegendFilters || null,
                    });

                    if (!hasActiveDynamicFilters || !activeLegendFilters || !dataColumn || !viewId) {
                        if (layer?.__runtimeLegendFilterKey) {
                            setState((draft) => {
                                const draftLayer = draft.symbologies?.[symbologyId]?.symbology?.layers?.[layer.id];
                                if (!draftLayer) return;
                                if (draftLayer.__runtimeBaseLegendData) {
                                    draftLayer["legend-data"] = cloneDeep(draftLayer.__runtimeBaseLegendData);
                                }
                                if (draftLayer.__runtimeBaseCategoryData) {
                                    draftLayer["category-data"] = cloneDeep(draftLayer.__runtimeBaseCategoryData);
                                }
                                delete draftLayer.__runtimeLegendFilterKey;
                            });
                        }
                        continue;
                    }

                    if (layer?.__runtimeLegendFilterKey === runtimeLegendKey) {
                        continue;
                    }

                    if (layerType === "categories") {
                        const options = JSON.stringify({
                            groupBy: [dataColumn.split("AS ")[0]],
                            exclude: { [dataColumn.split("AS ")[0]]: ["null"] },
                            orderBy: { "2": "desc" },
                            ...activeLegendFilters,
                        });

                        const response = await falcor.get([
                            "uda", pgEnv, "viewsById", viewId, "options", options,
                            "dataByIndex", { from: 0, to: 100 }, [dataColumn, "count(1)::int as count"]
                        ]);

                        if (cancelled) return;

                        const filteredData = get(
                            response,
                            ["json", "uda", pgEnv, "viewsById", viewId, "options", options, "dataByIndex"],
                            []
                        );
                        const nextLegendData = getCategoryLegendFromFilteredData(layer, filteredData);

                        setState((draft) => {
                            const draftLayer = draft.symbologies?.[symbologyId]?.symbology?.layers?.[layer.id];
                            if (!draftLayer) return;
                            if (!draftLayer.__runtimeBaseLegendData) {
                                draftLayer.__runtimeBaseLegendData = cloneDeep(draftLayer["legend-data"] || []);
                            }
                            if (!draftLayer.__runtimeBaseCategoryData) {
                                draftLayer.__runtimeBaseCategoryData = cloneDeep(draftLayer["category-data"] || []);
                            }
                            if (!isEqual(draftLayer["legend-data"], nextLegendData)) {
                                draftLayer["legend-data"] = nextLegendData;
                            }
                            if (!isEqual(draftLayer["category-data"], filteredData)) {
                                draftLayer["category-data"] = filteredData;
                            }
                            draftLayer.__runtimeLegendFilterKey = runtimeLegendKey;
                        });
                    }
                    else if (layerType === "choropleth" || layerType === "circles") {
                        const domainOptions = JSON.stringify({
                            column: dataColumn,
                            numbins: layer?.["num-bins"] || 9,
                            method: layer?.["bin-method"] || "ckmeans",
                            ...activeLegendFilters,
                        });

                        const response = await falcor.get([
                            "uda", pgEnv, "viewsById", +viewId, "colorDomain", domainOptions
                        ]);

                        if (cancelled) return;

                        const domainResult = get(
                            response,
                            ["json", "uda", pgEnv, "viewsById", +viewId, "colorDomain", domainOptions],
                            {}
                        );

                        const paintResult = choroplethPaint(
                            dataColumn,
                            domainResult?.max,
                            layer?.["color-range"] || [],
                            layer?.["num-bins"] || 9,
                            layer?.["bin-method"] || "ckmeans",
                            domainResult?.breaks || [],
                            layer?.["category-show-other"] || "#ccc",
                            layer?.["legend-orientation"] || "vertical"
                        );

                        const nextLegendData = paintResult?.legend || [];

                        setState((draft) => {
                            const draftLayer = draft.symbologies?.[symbologyId]?.symbology?.layers?.[layer.id];
                            if (!draftLayer) return;
                            if (!draftLayer.__runtimeBaseLegendData) {
                                draftLayer.__runtimeBaseLegendData = cloneDeep(draftLayer["legend-data"] || []);
                            }
                            if (!isEqual(draftLayer["legend-data"], nextLegendData)) {
                                draftLayer["legend-data"] = nextLegendData;
                            }
                            draftLayer.__runtimeLegendFilterKey = runtimeLegendKey;
                        });
                    }
                }
            }
        };

        refreshLegendData();

        return () => {
            cancelled = true;
        };
    }, [activeSym, falcor, isEdit, isReady, pgEnv, setState, state.symbologies]);

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
                        "click-filter": layer["click-filter"] ?? draftInteractiveFilter["click-filter"],
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
        if (isEdit && onChange && !isEqual(value, state)) {
            onChange(state)
        }
    }, [onChange, value, state, isEdit]);

//     useEffect(() => {
// console.log("CALLING ON CHANGE", state);
//         onChange && onChange(state);
//     },[onChange, state]);

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
        <MapContext.Provider value={{state, setState, falcor, falcorCache, pgEnv, doApiLoad}}>
            {/* {
                isEdit ? (
                    <>
                        <SymbologySelector context={MapContext}/>
                        <FilterControls />
                        <MoreControls />
                    </>
                ) : null
            } */}
            <div id='dama_map_edit' className="w-full relative" style={{height: heightStyle}}>
                <AvlMap
                  layers={ mapLayers }
                  layerProps = { layerProps }
                  hideLoading={true}
                  showLayerSelect={true}
                  mapOptions={{
                    center: center,
                    zoom: zoom,
                    //protocols: [PMTilesProtocol],
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

MapSection.settings = {
    hasControls: false,
    name: 'ElementEdit'
}
