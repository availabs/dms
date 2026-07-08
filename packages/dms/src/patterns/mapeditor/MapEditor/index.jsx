import React from "react"
import { useImmer } from 'use-immer';
import mapboxgl from "maplibre-gl";
import { useNavigate } from "react-router";
import {get, set, omit, isEqual, cloneDeep } from "lodash-es"
import { usePrevious } from './components/LayerManager/utils'
import { AvlMap as AvlMap2 } from "../../../ui/components/map"
import { rgb2hex } from './components/LayerManager/utils'
import { categoryPaint, isValidCategoryPaint ,choroplethPaint } from './components/LayerEditor/datamaps'


// import { ViewAttributes } from "../Source/attributes"
import { MapEditorContext } from "../context"

import LayerManager from './components/LayerManager'
import LayerEditor from './components/LayerEditor'
import InternalPluginPanel from './components/InternalPluginPanel'
import ExternalPluginPanel from './components/ExternalPluginPanel'

import SymbologyViewLayer from './components/SymbologyViewLayer'
import PluginLayer from './components/PluginLayer'

import {
  SourceAttributes,
  ViewAttributes,
  getAttributes
} from "../attributes";

//import { DMS_DATA_ITEM_ATTRIBUTES } from "../attributes"

import { buildLayerUdaFilterOptions, extractState, fetchBoundsForFilter, setDefaultActiveLayer } from './stateUtils';

export const SymbologyContext = React.createContext(undefined);

export const PLUGIN_TYPE = 'plugin'

/**
 * Returns the join-authored tile columns that should be treated as runtime
 * feature properties for the active MapEditor layer.
 */
const getJoinTileColumns = (layerConfig) =>
  Array.isArray((layerConfig?.join || layerConfig?.["linked-data"])?.tileColumns)
    ? (layerConfig.join || layerConfig["linked-data"]).tileColumns.filter(Boolean)
    : [];

/**
 * Normalizes the saved join config into one runtime shape so MapEditor can
 * read current and legacy join keys through the same helper path.
 */
const normalizeJoinRuntimeConfig = (layerConfig = {}) => {
  const joinConfig = layerConfig?.join || layerConfig?.["linked-data"] || null;
  if (!joinConfig) return null;
  return {
    ...joinConfig,
    source: joinConfig.source || joinConfig.linked || {},
    joinColumn: joinConfig.joinColumn || joinConfig.linkedJoinColumn || "",
    query: joinConfig.query || joinConfig.linkedQuery || {},
  };
};

/**
 * Converts the join query filter rows from editor state into the UDA filter
 * payload needed by legend-domain and join-aware runtime fetches.
 */
const buildJoinFilterOptions = (joinQuery = {}) => {
  const filterRows = Array.isArray(joinQuery?.filterRows) ? joinQuery.filterRows : [];
  const filterMode = joinQuery?.filterMode === "any" ? "OR" : "AND";
  const groups = filterRows.reduce((acc, row) => {
    if (!row?.column) return acc;
    const values = String(row.valuesText || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!values.length) return acc;
    acc.push({
      op: "filter",
      col: row.column,
      value: values,
    });
    return acc;
  }, []);

  if (groups.length) {
    return {
      filterGroups: {
        op: filterMode,
        groups,
      },
    };
  }

  return joinQuery?.filters && Object.keys(joinQuery.filters).length
    ? joinQuery.filters
    : {};
};

/**
 * Finds the SQL select expression that produces a given join output name so
 * runtime requests can fetch the expression rather than assuming the alias is
 * a physical source-table column.
 */
const getJoinQueryAttributeByOutputName = (layerConfig, outputName) => {
  const joinConfig = normalizeJoinRuntimeConfig(layerConfig);
  const joinAttributes = Array.isArray(joinConfig?.query?.columns)
    ? joinConfig.query.columns
    : [];

  return joinAttributes.find((attribute) => {
    const aliasMatch = String(attribute).match(/\s+as\s+("?)([^"]+)\1\s*$/i);
    const resolvedName = aliasMatch?.[2] || String(attribute).trim();
    return resolvedName === outputName;
  }) || null;
};

/**
 * Builds the join payload used by MapEditor legend-domain requests.
 *
 * Besides the currently styled join column, this includes join-backed filter
 * and dynamic-filter columns so the editor legend stays aligned with the full
 * filtered join dataset.
 */
const buildJoinOptions = (layerConfig, dataColumn = null) => {
  const joinConfig = normalizeJoinRuntimeConfig(layerConfig);
  if (
    !joinConfig?.enabled ||
    !joinConfig?.source?.viewId ||
    !joinConfig?.featureKeyColumn ||
    !joinConfig?.joinColumn
  ) {
    return null;
  }

  const queryConfig = joinConfig.query || {};
  const groupBy = Array.isArray(queryConfig?.groupBy) ? queryConfig.groupBy : [];
  const tileColumns = getJoinTileColumns(layerConfig);
  const groupBySet = new Set(groupBy);

  // Resolve a join output column to its SELECT expression: prefer the join
  // query's own column expression, else fall back to the bare column name for
  // a GROUP BY key (valid to select alongside the aggregate). Returns null for
  // anything the join can't produce (e.g. a base-table column).
  const resolveAttr = (col) =>
    getJoinQueryAttributeByOutputName(layerConfig, col) || (groupBySet.has(col) ? col : null);
  const isJoinColumn = (col) => Boolean(col) && (Boolean(resolveAttr(col)) || tileColumns.includes(col));

  // Every column the query needs the join to supply: the colored column when
  // it's joined, plus any static or dynamic filter column that targets a
  // joined column. Base-table columns are excluded — the geometry side
  // supplies those — so a filter on a base column doesn't force a join.
  const filterColumns = Object.keys(layerConfig?.filter || {});
  const dynamicFilterColumns = (layerConfig?.["dynamic-filters"] || [])
    .filter((dynamicFilter) => Array.isArray(dynamicFilter?.values) && dynamicFilter.values.length > 0)
    .map((dynamicFilter) => dynamicFilter.column_name);
  const joinedFilterColumns = [...filterColumns, ...dynamicFilterColumns].filter(isJoinColumn);
  const coloredColumnIsJoined = isJoinColumn(dataColumn);

  // No join needed unless the colored column or a filter targets the join.
  if (!coloredColumnIsJoined && joinedFilterColumns.length === 0) {
    return null;
  }

  const requiredColumns = Array.from(new Set([
    joinConfig.joinColumn,
    ...(coloredColumnIsJoined ? [dataColumn] : []),
    ...joinedFilterColumns,
  ].filter(Boolean)));
  const resolved = requiredColumns
    .map((col) => ({ col, attr: resolveAttr(col) }))
    .filter((entry) => entry.attr);

  return {
    viewId: joinConfig.source.viewId,
    localKey: joinConfig.featureKeyColumn,
    joinKey: joinConfig.joinColumn,
    options: { ...buildJoinFilterOptions(queryConfig), groupBy },
    attributes: resolved.map((entry) => entry.attr),
    // Expose everything except the join key as tile/feature columns so tile
    // rendering and client-side map filters can read the joined values too.
    tileCols: resolved.filter((entry) => entry.col !== joinConfig.joinColumn).map((entry) => entry.col),
  };
};

/**
 * PLUGIN STRUCTURE:
 * {
 *    id: "pluginid",
 *    type: "plugin",
 *    mapRegister: (map, state, setState) => { returns null; }
 *      // stuff to do when plugin is initialized. only runs once
 *      // runs within a hook, so it CANNOT use hooks itself (i.e. no useMemo, useEffect, useState, etc.)
 *    dataUpdate: (map, state, setState) => { returns null; }
 *      // fires when symbology.pluginData['${pluginid}'] changes
 *      // runs within a hook, so it CANNOT use hooks itself (i.e. no useMemo, useEffect, useState, etc.)
 *    comp: ({ state, setState, map }) => { returns React component; }
 *      // can use "position:absolute" to place anywhere, render anything, etc.
 *      // can use hooks
 *    internalPanel : ({ state, setState }) => { returns array of json; }
 *      // json describes the `formControls` for use within MapEditor
 *      // can use hooks
 *    externalPanel : ({ state, setState }) => { returns array of json; }
 *      // json describes the `formControls` for end user in DMS
 *      // panel position can be set within DMS
 *      // can use hooks
 *    cleanup: (map, state, setState) => { returns null; }
 *      // if plugin is removed, this should undo any changes made directly to the map (i.e. custom on-click)
 *      // runs within a hook, so it CANNOT use hooks itself (i.e. no useMemo, useEffect, useState, etc.)
 * }
 * NOTES:
 *  All components (except for `internalPanel`) must work in both MapEditor and DMS
 *    This generally means 2 things:
 *      You need to dynamically determine the `symbology` and/or `pluginData` path
 *      You need to dynamically determine which context to use (for falcor, mostly)
 *    There are examples in the `macroview` plugin (TransportNY repo)
 *  The layer(s) the plugin controls MUST use the `'active-layers'` path/field
 *    Otherwise, a bunch of default functions from the vanilla `MapEditor` will still run, and that is probably not good
 *    There are examples in `macroview.internalPanel` on how to create controls that the MapEditor user can use to select/set these layers
 *    this is an (abbreviated/simplified) example of what each plugin's `InternalPanel` should return
 *     [{
 *       type: "select",
 *       params: {
 *         options: [
 *           ...Object.keys(state.symbology.layers)
 *             .map((layerKey, i) => ({
 *               value: layerKey,
 *               name: state.symbology.layers[layerKey].name,
 *             })),
 *         ],
 *         default: "",
 *       },
 *       path: `['active-layers'][${PM3_LAYER_KEY}]`,
 *     }]
 */
export const PluginLibrary = {};

export const RegisterPlugin = (name, plugin) => {
  PluginLibrary[name] = plugin
}

export const INITIAL_PLUGIN_DATA_STATE = {
  'default-legend': true,
  'active-layers' : {}
}

export const LOCAL_STORAGE_KEY_BASE = 'mapeditor_symbology_';

const DEFAULT_BLANK_SYMBOLOGY = {
  name: '',
  description: '',
  symbology: {
    layers: {},
    plugins: {},
    pluginData: {}
  },
};
const NUM_DEFAULT_SYMBOLOGY_KEYS = Object.keys(DEFAULT_BLANK_SYMBOLOGY).length;

export const MAP_STYLES = [
  { name: "Dark",
    style: "https://api.maptiler.com/maps/dataviz-dark/style.json?key=mU28JQ6HchrQdneiq6k9"
  },
  {
    name: "Default",
    style: "https://api.maptiler.com/maps/dataviz/style.json?key=mU28JQ6HchrQdneiq6k9"
  },
  { name: "Satellite",
    style: "https://api.maptiler.com/maps/hybrid/style.json?key=mU28JQ6HchrQdneiq6k9",
  },
  { name: "Streets",
    style: "https://api.maptiler.com/maps/streets-v2/style.json?key=mU28JQ6HchrQdneiq6k9",
  },

  { name: "Light",
    style: "https://api.maptiler.com/maps/dataviz-light/style.json?key=mU28JQ6HchrQdneiq6k9"
  },
  // {
  //   name: 'Sattelite 3d ',
  //   style: terrain_3d_source
  // }
]

const MapEditor = props => {
  const mounted = React.useRef(false);
  const { useFalcor, pgEnv, baseUrl } = React.useContext(MapEditorContext);
  const { falcor, falcorCache } = useFalcor();
  const navigate = useNavigate();
  const { id: symbologyId } = props.params;


  const symbologies = React.useMemo(() => {
    return [...props.dataItems];
  }, [props.dataItems]);

  /**
   * Uses the url param to query the DB
   */
  // const dbSymbology = useMemo(() => {
  //   return symbologies?.find(s => +s.symbology_id === +symbologyId);
  // }, [symbologies, symbologyId]);

  // const NUM_DEFAULT_SYMBOLOGY_KEYS = Object.keys(DEFAULT_BLANK_SYMBOLOGY).length;
  // let initialSymbology = DEFAULT_BLANK_SYMBOLOGY;

  // const symbologyLocalStorageKey = LOCAL_STORAGE_KEY_BASE + `${symbologyId}`;
  // const rawLocalSymb = window?.localStorage?.getItem(symbologyLocalStorageKey);
  // const localStorageSymbology = rawLocalSymb !== "undefined" ? JSON.parse(rawLocalSymb) : null;
  // if(localStorageSymbology && Object.keys(localStorageSymbology).length >= NUM_DEFAULT_SYMBOLOGY_KEYS){
  //   initialSymbology = localStorageSymbology;
  // }
  // else if (dbSymbology) {
  //   initialSymbology = dbSymbology;
  // }

  const symbologyLocalStorageKey = React.useMemo(() => {
    return LOCAL_STORAGE_KEY_BASE + `${ symbologyId }`;
  }, [symbologyId]);

// console.log("MapEditor::symbologyLocalStorageKey", symbologyLocalStorageKey);

  // const initialSymbology = React.useMemo(() => {
  //   const dbSymbology = symbologies?.find(s => +s.symbology_id === +symbologyId);
  //   const rawLocalStorageSymbology = window?.localStorage?.getItem(symbologyLocalStorageKey);
  //   const localStorageSymbology = JSON.parse(rawLocalStorageSymbology || "null");
  //   if (localStorageSymbology && Object.keys(localStorageSymbology).length >= NUM_DEFAULT_SYMBOLOGY_KEYS){
  //     return localStorageSymbology;
  //   }
  //   else if (dbSymbology) {
  //     return dbSymbology;
  //   }
  //   return cloneDeep(DEFAULT_BLANK_SYMBOLOGY);
  // }, [symbologyId, symbologies, symbologyLocalStorageKey]);

  const dbSymbology = React.useMemo(() => {
    return symbologies?.find(s => +s.id === +symbologyId);
  }, [symbologyId, symbologies]);

  const localStorageSymbology = React.useMemo(() => {
    const rawLocalStorageSymbology = window?.localStorage?.getItem(symbologyLocalStorageKey);
    return JSON.parse(rawLocalStorageSymbology || "null");
  }, [symbologyLocalStorageKey]);

  const initialSymbology = React.useMemo(() => {
    if (localStorageSymbology && Object.keys(localStorageSymbology).length >= NUM_DEFAULT_SYMBOLOGY_KEYS){
      return setDefaultActiveLayer(localStorageSymbology);
    }
    else if (dbSymbology) {
      return setDefaultActiveLayer(dbSymbology);
    }
    return setDefaultActiveLayer(cloneDeep(DEFAULT_BLANK_SYMBOLOGY));
  }, [dbSymbology, localStorageSymbology]);

// console.log("MapEditor::initialSymbology", JSON.parse(JSON.stringify(initialSymbology)))



  // // Sets an initial `activeLayer`
  // React.useEffect(() => {
  //   if (
  //     !!initialSymbology?.symbology?.layers &&
  //     Object.keys(initialSymbology?.symbology?.layers).length > 0 &&
  //     (initialSymbology?.symbology?.activeLayer === "" ||
  //       !initialSymbology?.symbology.layers[initialSymbology?.symbology?.activeLayer]
  //     )
  //   ) {
  //     initialSymbology.symbology.activeLayer = Object.values(
  //       initialSymbology?.symbology?.layers
  //     ).find((layer) => layer.order === 0)?.id;
  //   }
  // }, [initialSymbology]);

  // --------------------------------------------------
  // Symbology Object
  // Single Source of truth for everything in this view
  // once loaded this is mutable here
  // and is written to db on change
  // ---------------------------------------------------
  const [state, setState] = useImmer(initialSymbology);

// console.log("MapEditor::state", state);

  // Resets state if URL param does not match symbology currently in state
  /**
   * Keeps the live legend/color-break state in sync with the active layer's
   * filter envelope. When the styled column comes from a join, this effect
   * sends the join payload into `colorDomain` so the editor legend reflects
   * the same joined dataset being drawn on the map.
   */
  React.useEffect(() => {
    // console.log('load', +symbologyId, symbologyId, symbologies)
    if (!!state.id && (+symbologyId !== +state.id)) {
      setState(initialSymbology);
    }
  },[initialSymbology]);

// console.log("MapEditor::isEqual(state, initialSymbology)", isEqual(state, initialSymbology))

  // Updates localStorage whenever state changes
  React.useEffect(() => {
    if (state?.symbology?.layers && !isEqual(state, initialSymbology)) {
      try {
        if (window.localStorage) {
          window.localStorage.setItem(symbologyLocalStorageKey, JSON.stringify(state));
        }
      }
      catch(e) {
        console.error(e);
      }
    }
  },[state,  initialSymbology, symbologyLocalStorageKey]);


  // If we don't have local storage data for this symbology, use data from API
  React.useEffect(() => {
    // -------------------
    // on navigate or load set state to symbology with data
    // TODO: load state.symbology here and dont autoload them in Collection/index
    // -------------------
    if ((!localStorageSymbology || Object.keys(localStorageSymbology).length <= NUM_DEFAULT_SYMBOLOGY_KEYS) && dbSymbology) {
      setState(dbSymbology)
    }
  }, [localStorageSymbology, dbSymbology]);

  //--------------------------
  // -- Map Layers are the instantation
  // -- of state.symbology.layers as SymbologyViewLayers
  // -------------------------
  const [mapLayers, setMapLayers] = useImmer([]);

  // console.log("state?.symbology?.layers",state?.symbology?.layers)

  // React.useEffect(() => {
  //   // -----------------------
  //   // Update map layers on map
  //   // when state.symbology.layers update
  //   // -----------------------

  //   // console.log('symbology layers effect')
  //   const updateLayers = async () => {
  //     if(mounted.current) {
  //         setMapLayers(draftMapLayers => {

  //           let currentLayerIds = draftMapLayers.map(d => d.id).filter(d => !!d)
  //           //console.log('draftMapLayers', draftMapLayers?.[0]?.layerType, currentLayerIds)
  //           //console.log("plugins in update layers",state.symbology.plugins)
  //           let newLayers = [
  //             ...Object.values(state?.symbology?.layers || {}),
  //             ...Object.values(state?.symbology?.plugins || {})
  //           ]
  //             .filter(d => d)
  //             .filter(d => !currentLayerIds.includes(d.id))
  //             .sort((a,b) => b.order - a.order)
  //             .map(l => {
  //               if(l.type === PLUGIN_TYPE) {
  //                 return new PluginLayer(l)
  //               } else {
  //                 return new SymbologyViewLayer(l)
  //               }
  //             })

  //           let oldLayers = draftMapLayers.filter(
  //             (d) =>
  //               Object.keys(state?.symbology?.layers || {}).includes(d.id) ||
  //               Object.keys(state?.symbology?.plugins || {}).includes(d.id)
  //           );



  //           const out = [
  //               // keep existing layers & filter
  //               ...oldLayers,
  //               // add new layers
  //               ...newLayers
  //           ]
  //           //.filter(d => state.symbology.layers[d.id])
  //           .sort((a,b) => state.symbology.layers[b?.id]?.order - state.symbology.layers[a?.id]?.order)
  //           //console.log('update layers old:', oldLayers, 'new:', newLayers, 'out', out)
  //           return out
  //         })
  //     }
  //   }
  //   updateLayers()
  // }, [state?.symbology?.layers, state?.symbology?.plugins, state?.symbology?.zoomToFit])

  React.useEffect(() => {
    if (mounted.current) {
      setMapLayers(draftMapLayers => {

        let currentLayerIds = draftMapLayers.map(d => d.id).filter(d => !!d);

        //console.log('draftMapLayers', draftMapLayers?.[0]?.layerType, currentLayerIds)
        //console.log("plugins in update layers",state.symbology.plugins)
        let newLayers = [
          ...Object.values(state?.symbology?.layers || {}),
          ...Object.values(state?.symbology?.plugins || {})
        ].filter(Boolean)
          .filter(d => !currentLayerIds.includes(d.id))
          .sort((a, b) => b.order - a.order)
          .map(l => {
            if(l.type === PLUGIN_TYPE) {
              return new PluginLayer(l);
            }
            else {
              return new SymbologyViewLayer(l);
            }
          });

        let oldLayers = draftMapLayers.filter(
          d =>
            Object.keys(state?.symbology?.layers || {}).includes(d.id) ||
            Object.keys(state?.symbology?.plugins || {}).includes(d.id)
        );

        const out = [
          // keep existing layers & filter
          ...oldLayers,
          // add new layers
          ...newLayers
        ]
        //.filter(d => state.symbology.layers[d.id])
        .sort((a, b) => state.symbology.layers[b?.id]?.order - state.symbology.layers[a?.id]?.order)
        //console.log('update layers old:', oldLayers, 'new:', newLayers, 'out', out)
        return out;
      })
    }
  }, [mounted.current,
      state?.symbology?.layers,
      state?.symbology?.plugins
  ]);

  let {
    pathBase,
    activeLayerId,
    activeLayer,
    layerType,
    viewId,
    sourceId,
    paintValue,
    breaks,
    column,
    categories,
    categorydata,
    colors,
    colorrange,
    numCategories,
    numbins,
    method,
    showOther,
    symbology_id,
    choroplethdata,
    filter,
    filterGroupEnabled,
    filterGroupLegendColumn,
    viewGroupEnabled,
    layerPaintPath,
    viewGroupId,
    initialViewId,
    baseDataColumn,
    legendOrientation,
    minRadius,
    maxRadius,
    lowerBound,
    upperBound,
    radiusCurve,
    curveFactor,
    legendData,
    pluginData,
    isActiveLayerPlugin,
    existingDynamicFilter,
    filterMode,
    hoverCasing,
    polygonLayerType
  } = React.useMemo(() => {
    return extractState(state);
  }, [state]);

// console.log("MapEditor::layerType", layerType);

// console.log("MapEditor::activeLayer", activeLayer);
// console.log("MapEditor::layerPaintPath", layerPaintPath)

  const layerProps = React.useMemo(() =>
    ({ ...state?.symbology?.layers, ...state?.symbology?.plugins,
      zoomToFit: state?.symbology?.zoomToFit,
      zoomToFilterBounds: state?.symbology?.zoomToFilterBounds } || {}
    ),
    [state?.symbology?.layers, state?.symbology?.zoomToFit,
      state?.symbology?.zoomToFilterBounds]
  );

  const { activeLayerType, selectedInteractiveFilterIndex, currentInteractiveFilter } = React.useMemo(() => {
    const selectedInteractiveFilterIndex = get(state,`symbology.layers[${state?.symbology?.activeLayer}]['selectedInteractiveFilterIndex']`, 0);
    return {
      selectedInteractiveFilterIndex,
      activeLayerType: get(state,`symbology.layers[${state?.symbology?.activeLayer}]['layer-type']`, {}),
      currentInteractiveFilter: get(
        state,
        `symbology.layers[${state?.symbology?.activeLayer}]['interactive-filters'][${selectedInteractiveFilterIndex}]`,
      )
    }
  },[state?.symbology.layers]);

  //Handles updates for Interactive Filters for the ACTIVE LAYER
  React.useEffect(() => {
    if ((activeLayerType === "interactive") &&
        (selectedInteractiveFilterIndex !== undefined)
      ) {
        setState((draft) => {
          const draftActiveLayer = draft.symbology.layers[draft?.symbology?.activeLayer];
          const draftFilters =  get(draft,`symbology.layers[${draft?.symbology?.activeLayer}]['interactive-filters']`);
          const draftInteractiveFilter = get(draft,`symbology.layers[${draft?.symbology?.activeLayer}]['interactive-filters'][${selectedInteractiveFilterIndex}]`)
          if(draftInteractiveFilter) {
            draft.symbology.layers[draft?.symbology?.activeLayer] = {
              ...draftActiveLayer,
              ...draftInteractiveFilter,
              name: draftActiveLayer.name,
              filter: draftInteractiveFilter.filter ?? {},
              order: draftActiveLayer.order,
              "layer-type": "interactive",
              "interactive-filters": draftFilters,
              selectedInteractiveFilterIndex: selectedInteractiveFilterIndex
            };
          }
        });
    }
  }, [selectedInteractiveFilterIndex, activeLayerType, currentInteractiveFilter]);

  const interactiveFilterIndicies = React.useMemo(
    () =>
      Object.values(state.symbology.layers).map(
        (l) => l.selectedInteractiveFilterIndex
      ),
    [state?.symbology?.layers]
  );
  const prevInteractiveIndicies = usePrevious(interactiveFilterIndicies);

  // Handles all non-active layers. We only need to listen for index changes.
  React.useEffect(() => {
    setState((draft) => {
      Object.values(draft.symbology.layers)
        .filter(l => l['layer-type'] === 'interactive' && l.id !== draft.symbology.activeLayer)
        .forEach(l => {
          const draftFilters =  get(l,`['interactive-filters']`);
          const draftFilterIndex = l.selectedInteractiveFilterIndex;
          const draftInteractiveFilter = draftFilters[draftFilterIndex]

          if(draftInteractiveFilter) {
            draft.symbology.layers[l.id] = {
              ...l,
              ...draftInteractiveFilter,
              order: l.order,
              "layer-type": "interactive",
              "interactive-filters": draftFilters,
              selectedInteractiveFilterIndex: draftFilterIndex
            };
          }
        })
    });
  }, [isEqual(interactiveFilterIndicies, prevInteractiveIndicies)]);

  React.useEffect(() => {
    //console.log('getmetadat', sourceId)
    if (sourceId) {
      falcor.get([
          "uda", pgEnv, "sources", "byId", sourceId, Object.values(SourceAttributes)
      ])//.then(d => console.log('source metadata sourceId', sourceId, d));
    }
  },[falcor, sourceId]);

  const metadata = React.useMemo(() => {
    //console.log('getmetadata', falcorCache)
      let out = get(falcorCache, [
          "uda", pgEnv, "sources", "byId", sourceId, "metadata", "value", "columns"
      ], [])
      if (out.length === 0) {
        out = get(falcorCache, [
          "uda", pgEnv, "sources", "byId", sourceId, "metadata", "value"
        ], [])
      }
      return out;
  }, [pgEnv, sourceId, falcorCache]);

// console.log("MapEditor::index::metadata", metadata);

  //----------------------------------
  // -- get selected source views
  // ---------------------------------
  React.useEffect(() => {
    if (sourceId) {
      const lengthPath = ["uda", pgEnv, "sources", "byId", sourceId, "views", "length"];
      falcor.get(lengthPath)
        .then(res => {
          falcor.get([
            "uda", pgEnv, "sources", "byId", sourceId, "views", "byIndex",
            { from: 0, to: get(res?.json, lengthPath, 0) - 1 },
            Object.values(ViewAttributes)
          ]);
        });
    }
  }, [sourceId, falcor, pgEnv]);

  const views = React.useMemo(() => {
    return Object.values(get(falcorCache, ["uda", pgEnv, "sources", "byId", sourceId, "views", "byIndex"], {}))
      .map(v => getAttributes(get(falcorCache, v.value, {})));
  }, [falcorCache, sourceId, pgEnv]);

// console.log("MapEditor::index::views", views);

  const prevViewGroupId = usePrevious(viewGroupId);
  React.useEffect(() => {
    const setPaint = async () => {
      if (layerType === 'categories') {
        let { paint, legend } = categories?.paint && categories?.legend
          ? cloneDeep(categories)
          : categoryPaint(
            baseDataColumn,
            categorydata,
            colors,
            numCategories,
            metadata
          );

        if (!(paint.length % 2)) {
          paint.push(showOther);
        } else {
          paint[paint.length-1] = showOther;
        }

        const isShowOtherEnabled = showOther === '#ccc';
        if(isShowOtherEnabled && legend) {
          if(legend[legend.length-1]?.label !== "Other") {
            legend.push({color: showOther, label: "Other"});
          }
          legend[legend.length-1].color = showOther;
        } else {
          if(legend[legend.length-1].label === "Other") {
            legend.pop();
          }
        }

        if(isValidCategoryPaint(paint) && !isEqual(paint,paintValue)) {
          setState(draft => {
            set(draft, `${pathBase}['categories']`, { paint, legend })
            set(draft, `${pathBase}.${layerPaintPath}`, paint)
            set(draft, `${pathBase}['legend-data']`, legend)
          })
        }
      } else if(layerType === 'choropleth' || layerType === 'circles') {
        const domainOptions = {
          column: baseDataColumn,
          numbins,
          method
        }
        let colorBreaks;
        let targetViewId = viewId;
        /**
         * Reuse the combined static + dynamic filter envelope for legend-domain
         * requests so the editor legend matches the filtered layer dataset.
         */
        const activeLegendFilters = buildLayerUdaFilterOptions({
          layerFilter: filter,
          dynamicFilters: existingDynamicFilter,
          filterMode,
        });
        /**
         * Cache legend breaks by both data target and active filter envelope so
         * we only reuse breaks when they were generated for the same filters.
         */
        const legendFilterKey = JSON.stringify({
          filters: activeLegendFilters || null,
          targetViewId: viewGroupEnabled ? viewGroupId : viewId,
          targetColumn: filterGroupEnabled ? filterGroupLegendColumn || baseDataColumn : baseDataColumn,
          join: buildJoinOptions(activeLayer, baseDataColumn),
        });

        let regenerateLegend = false;
        if(
          choroplethdata &&
          Object.keys(choroplethdata).length >= 2 &&
          viewGroupId === prevViewGroupId &&
          choroplethdata?.legendFilterKey === legendFilterKey
        ) {
          colorBreaks = choroplethdata;
        }
        else {
          regenerateLegend = true;
          if(filterGroupEnabled) {
            domainOptions['column'] = filterGroupLegendColumn;
          }
          if(viewGroupEnabled) {
            targetViewId = viewGroupId;
          }
          if (activeLegendFilters) {
            Object.assign(domainOptions, activeLegendFilters);
          }
          const joinOptions = buildJoinOptions(activeLayer, baseDataColumn);
          if (joinOptions) {
            domainOptions.join = joinOptions;
          }
          const optsKey = JSON.stringify(domainOptions);
          const cachedColorDomain = get(
            falcorCache,
            ["uda", pgEnv, "viewsById", +targetViewId, "colorDomain", optsKey, "value"],
            null
          ) || get(
            falcorCache,
            ["uda", pgEnv, "viewsById", +targetViewId, "colorDomain", optsKey],
            null
          );

          if (!cachedColorDomain) {
            setState(draft => {
              set(draft, `${pathBase}['is-loading-colorbreaks']`, true);
            });
          }
          const res = await falcor.get([
            "uda", pgEnv, "viewsById", +targetViewId, "colorDomain", optsKey
          ]);
          const cdResult = get(res, [
            "json", "uda", pgEnv, "viewsById", +targetViewId, "colorDomain", optsKey
          ]);
          colorBreaks = (cdResult && Array.isArray(cdResult.breaks) && cdResult.breaks.length)
            ? { breaks: cdResult.breaks, max: cdResult.max, legendFilterKey }
            : { breaks: [], max: 0, legendFilterKey };
          setState(draft => {
            set(draft, `${pathBase}['is-loading-colorbreaks']`, false);
          });
        }
        //console.log("colorBreaks['breaks']",colorBreaks['breaks'])
        let {paint, legend} = choroplethPaint(baseDataColumn, colorBreaks['max'], colorrange, numbins, method, colorBreaks['breaks'], showOther, legendOrientation);
        //TODO -- detect if the `colorBreaks` changed, to determine whether or not to regenerate legend
        //this will fix a problem with the custom scale
        if(!regenerateLegend && legendData.length > 0) {
          legend = cloneDeep(legendData)
        }
        if(layerType === 'circles') {
// console.log("---RECALCULATING CIRCLE RADIUS---")
          // lowerBound: get(state, `${pathBase}.layers[0].paint['circle-radius'][3]`),
          // minRadius: get(state, `${pathBase}.layers[0].paint['circle-radius'][4]`),
          // upperBound: get(state, `${pathBase}.layers[0].paint['circle-radius'][5]`),
          // maxRadius: get(state, `${pathBase}.layers[0].paint['circle-radius'][6]`),
          if(!lowerBound) {
            setState(draft => {
              set(draft,`${pathBase}['lower-bound']`, colorBreaks['breaks'][0])
            })
          }
          if(!upperBound) {
            setState(draft => {
              set(draft,`${pathBase}['upper-bound']`, colorBreaks['max'])
            })
          }
          const circleLowerBound = lowerBound !== null ? lowerBound : colorBreaks['breaks'][0];
          const circleUpperBound = upperBound !== null ? upperBound : colorBreaks['max'];
          paint = [
            "interpolate",
            [radiusCurve, curveFactor],
            ["number", ["get", baseDataColumn]],
            circleLowerBound, //min of dataset
            minRadius,//min radius (px) of circle
            circleUpperBound, //max of dataset
            maxRadius, //max radius (px) of circle
          ];
        }
        if((isValidCategoryPaint(paint) || layerType === 'circles') && !isEqual(paint, paintValue)) {
          const isShowOtherEnabled = showOther === '#ccc';
          if(isShowOtherEnabled) {
            if(legend[legend.length-1].label !== "No data") {
              legend.push({color: showOther, label: "No data"});
            }
            legend[legend.length-1].color = showOther;
          } else {
            if(legend[legend.length-1].label === "No data") {
              legend.pop();
            }
          }
          setState(draft => {
            set(draft, `${pathBase}.${layerPaintPath}`, paint)
            set(draft, `${pathBase}['legend-data']`, legend)
            set(draft, `${pathBase}['choroplethdata']`, colorBreaks)
          })
        }
      } else if((layerType === 'simple') && (typeof paintValue !== 'string')) {
// console.log('switch to simple???????????????????????????????????????', rgb2hex(null))
        setState(draft => {
          set(draft, `${pathBase}.${layerPaintPath}`, rgb2hex(null))
        })
      }
    }
    //TODO -- plugData.activeLayer should be an array
    if(!isActiveLayerPlugin) {
      setPaint();
    }
  }, [categories, layerType, baseDataColumn, categorydata, activeLayer.type,
      colors, numCategories, showOther, numbins, method,
      choroplethdata, viewGroupId, filterGroupLegendColumn, isActiveLayerPlugin,
      filter, existingDynamicFilter, filterMode
  ]);

  React.useEffect(() => {
    if(!pathBase.includes("undefined") && pathBase.length > 18 && polygonLayerType && polygonLayerType !== "circle"){
      if(hoverCasing){
        //invisible case, until user hover over the feature
        const hoverCaseOpacity = [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          1,
          0,
        ];
        setState((draft) => {
          set(draft, `${pathBase}.layers[0].paint['line-opacity']`, hoverCaseOpacity);
        });
      } else {
        //reset hover case opacity style
        setState((draft) => {
          set(draft, `${pathBase}.layers[0].paint['line-opacity']`, 1);
        });
      }
    }
  }, [hoverCasing, pathBase, polygonLayerType]);

  React.useEffect(() => {
    const getFilterBounds = async () => {
      const newExtent = await fetchBoundsForFilter(state, falcor, pgEnv, existingDynamicFilter);
      if (!newExtent || newExtent === "undefined") return;

      setState((draft) => {
        let parsedExtent;
        try {
          parsedExtent = typeof newExtent === "string" ? JSON.parse(newExtent) : newExtent;
        } catch (e) {
          console.warn("[MapEditor] Invalid filter bounds extent:", newExtent);
          return;
        }

        const coordinates = parsedExtent?.coordinates[0];
        const mapGeom = coordinates?.reduce((bounds, coord) => {
          return bounds.extend(coord);
        }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

        if(mapGeom && Object.keys(mapGeom).length > 0) {
          draft.symbology.zoomToFilterBounds = [mapGeom['_sw'], mapGeom['_ne']];
        }
      })
    }
    if (
      existingDynamicFilter.length > 0 &&
      existingDynamicFilter.some((dynFilter) => dynFilter.zoomToFilterBounds) &&
      existingDynamicFilter.some((dynFilter) => dynFilter?.values?.length > 0)
    ) {
      getFilterBounds();
    } else {
      if(state?.symbology?.zoomToFilterBounds?.length > 0) {
        setState((draft) => {
          draft.symbology.zoomToFilterBounds = [];
        });
      }
    }
  }, [existingDynamicFilter, filter]);

  React.useEffect(() => {
    if(method === "custom" && !isActiveLayerPlugin) {
// console.log("custom breaks changed")
      const colorBreaks = choroplethdata;
      let {paint, legend} = choroplethPaint(baseDataColumn, colorBreaks['max'], colorrange, numbins, method, breaks, showOther, legendOrientation);
      if(layerType === 'circles') {
// console.log("---RECALCULATING CIRCLE RADIUS---")
        // lowerBound: get(state, `${pathBase}.layers[0].paint['circle-radius'][3]`),
        // minRadius: get(state, `${pathBase}.layers[0].paint['circle-radius'][4]`),
        // upperBound: get(state, `${pathBase}.layers[0].paint['circle-radius'][5]`),
        // maxRadius: get(state, `${pathBase}.layers[0].paint['circle-radius'][6]`),
        if(!lowerBound) {
          setState(draft => {
            set(draft,`${pathBase}['lower-bound']`, breaks[0])
          })
        }
        if(!upperBound) {
          setState(draft => {
            set(draft,`${pathBase}['upper-bound']`, colorBreaks['max'])
          })
        }
        const circleLowerBound = lowerBound !== null ? lowerBound : breaks[0];
        const circleUpperBound = upperBound !== null ? upperBound : colorBreaks['max'];
        paint = [
          "interpolate",
          [radiusCurve, curveFactor],
          ["number", ["get", baseDataColumn]],
          circleLowerBound, //min of dataset
          minRadius,//min radius (px) of circle
          circleUpperBound, //max of dataset
          maxRadius, //max radius (px) of circle
        ];
      }
      if((isValidCategoryPaint(paint) || layerType === 'circles') && !isEqual(paint, paintValue)) {
        const isShowOtherEnabled = showOther === '#ccc';
        if(isShowOtherEnabled) {
          if(legend[legend.length-1].label !== "No data") {
            legend.push({color: showOther, label: "No data"});
          }
          legend[legend.length-1].color = showOther;
        } else {
          if(legend[legend.length-1].label === "No data") {
            legend.pop();
          }
        }
        setState(draft => {
          set(draft, `${pathBase}.${layerPaintPath}`, paint)
          set(draft, `${pathBase}['legend-data']`, legend)
        })
      }
    }
  }, [breaks, isActiveLayerPlugin])

  React.useEffect(() => {
    const setLegendAndPaint = () => {
      let newPaint;
      if(layerType === 'categories') {
        newPaint = cloneDeep(paintValue)
      } else {
        newPaint = cloneDeep(paintValue[3]);
      }
      if(newPaint?.length && legendData?.length) {
        for (let i = 0; i < newPaint?.length; i = i + 2) {
          //0, 2, 4...
          if (i == 0) {}
          else if (i == 2) {
            newPaint[i] = colorrange[0];
          } else {
            newPaint[i] = colorrange[i / 2 - 2];
          }
        }

        const newLegend = legendData?.map((legendRow, i) => ({
          ...legendRow,
          color: colorrange[i],
        }));

        setState((draft) => {
          set(draft, `${pathBase}.${layerPaintPath}`, newPaint);
          set(draft, `${pathBase}['legend-data']`, newLegend);
        });
      }
    }

    if(layerType !== 'simple' && typeof paintValue !== 'string' && !isActiveLayerPlugin) {
      setLegendAndPaint();
    }
  }, [colorrange, isActiveLayerPlugin]);

  React.useEffect(() => {
    if(choroplethdata && !legendData && !isActiveLayerPlugin) {
// console.log("---NEW LEGEND, switching legend orientation----");
      let { legend } = choroplethPaint(baseDataColumn, choroplethdata['max'], colorrange, numbins, method, choroplethdata['breaks'], showOther, legendOrientation);
      if(legend) {
        const isShowOtherEnabled = showOther === "#ccc";
        if (isShowOtherEnabled) {
          if (legend[legend.length - 1].label !== "No data") {
            legend.push({ color: showOther, label: "No data" });
          }
          legend[legend.length - 1].color = showOther;
        } else {
          if (legend[legend.length - 1].label === "No data") {
            legend.pop();
          }
        }

        setState((draft) => {
          set(draft, `${pathBase}['legend-data']`, legend);
        });
      }

    }
  }, [legendOrientation, legendData, isActiveLayerPlugin]);

  React.useEffect(() => {
    if(!!activeLayer){
      if(filterGroupEnabled && !filterGroupLegendColumn) {
        setState(draft => {
          const fullColumn = metadata.find(attr => attr.name === column)
          set(draft,`${pathBase}['filter-group-name']`, column)
          set(draft, `${pathBase}['filter-group-legend-column']`, column)
          set(draft, `${pathBase}['filter-group']`,[{display_name: fullColumn?.display_name || fullColumn.name, column_name: fullColumn.name}])
        })
      } else if (!filterGroupEnabled && !!activeLayer) {
        setState(draft => {
          omit(draft,`${pathBase}['filter-group-name']`);
          omit(draft, `${pathBase}['filter-group-legend-column']`);
          omit(draft, `${pathBase}['filter-group']`);
        })
      }
    }
  }, [filterGroupEnabled])

  React.useEffect(() => {
    if(!!activeLayer){
      if(viewGroupEnabled && !viewGroupId) {
        setState(draft => {
          const defaultView = views.find(v => v.view_id === viewId);
          const defaultGroupName = (defaultView?.version ?? defaultView?.view_id + " group");
          set(draft,`${pathBase}['filter-source-views']`, [viewId]);
          set(draft, `${pathBase}['view-group-name']`, defaultGroupName);
          set(draft, `${pathBase}['view-group-id']`, viewId);
        })
      } else if (!viewGroupEnabled) {
        setState(draft => {
          omit(draft,`${pathBase}['filter-source-views']`);
          omit(draft, `${pathBase}['view-group-name']`);
          omit(draft, `${pathBase}['view-group-id']`)
          set(draft, `${pathBase}['view_id']`, initialViewId ?? viewId);
        })
      }
    }

  }, [viewGroupEnabled])

  React.useEffect(() => {
    if(baseDataColumn && layerType === 'categories' && !isActiveLayerPlugin) {
      const colKey = (baseDataColumn).split('AS ')[0].trim();
      const joinConfig = activeLayer?.join ?? activeLayer?.['linked-data'] ?? null;
      const joinViewId = joinConfig?.source?.viewId ?? null;
      const joinTileColumns = new Set(Array.isArray(joinConfig?.tileColumns) ? joinConfig.tileColumns : []);
      const effectiveViewId = joinViewId && joinTileColumns.has(colKey) ? joinViewId : viewId;

      const optionsObject = {
        groupBy: [colKey],
        exclude: {[colKey]: ['null']},
        orderBy: {"2": 'desc'}
      };
      /**
       * Category legends should query against the same active static/dynamic
       * filter set as the rendered layer.
       */
      const activeLegendFilters = buildLayerUdaFilterOptions({
        layerFilter: filter,
        dynamicFilters: existingDynamicFilter,
        filterMode,
      });
      if (activeLegendFilters) {
        Object.assign(optionsObject, activeLegendFilters);
      }
      const options = JSON.stringify(optionsObject)
      falcor.get([
        'uda', pgEnv, 'viewsById', effectiveViewId, 'options', options, 'dataByIndex', { from: 0, to: 100 }, [baseDataColumn, 'count(1)::int as count']
      ])
    }
  },[baseDataColumn, layerType, viewId, activeLayer, isActiveLayerPlugin, filter, existingDynamicFilter, filterMode])

  React.useEffect(() => {
    if(baseDataColumn && layerType === 'categories' && !isActiveLayerPlugin) {
      const colKey = (baseDataColumn).split('AS ')[0].trim();
      const joinConfig = activeLayer?.join ?? activeLayer?.['linked-data'] ?? null;
      const joinViewId = joinConfig?.source?.viewId ?? null;
      const joinTileColumns = new Set(Array.isArray(joinConfig?.tileColumns) ? joinConfig.tileColumns : []);
      const effectiveViewId = joinViewId && joinTileColumns.has(colKey) ? joinViewId : viewId;

      const optionsObject = {
        groupBy: [colKey],
        exclude: {[colKey]: ['null']},
        orderBy: {"2": 'desc'}
      };
      /**
       * Read back category legend data from the same filtered cache key used by
       * the request effect above so the saved legend state stays in sync.
       */
      const activeLegendFilters = buildLayerUdaFilterOptions({
        layerFilter: filter,
        dynamicFilters: existingDynamicFilter,
        filterMode,
      });
      if (activeLegendFilters) {
        Object.assign(optionsObject, activeLegendFilters);
      }
      const options = JSON.stringify(optionsObject)
      let data = get(falcorCache, [
        'uda', pgEnv, 'viewsById', effectiveViewId, 'options', options, 'dataByIndex'
      ], {})
      setState(draft => {
        set(draft, `${pathBase}['category-data']`, data)
      })
    }
  }, [baseDataColumn, layerType, viewId, activeLayer, falcorCache, isActiveLayerPlugin, filter, existingDynamicFilter, filterMode]);

  const SymbologyContextValue = React.useMemo(() => {
    return { state, setState, symbologies, params: props.params };
  }, [state, setState, symbologies, props.params]);

// console.log("MAP LAYERS:", mapLayers);

  //console.log("---mapeditor index state::", state)
  return (
    <SymbologyContext.Provider value={ SymbologyContextValue }>
      <div className="w-screen h-screen relative" ref={ mounted }>
        <AvlMap2
          layers={ mapLayers }
          layerProps={ layerProps }
          hideLoading={ true }
          showLayerSelect={ true }
          mapOptions={ {
            center: [-76, 43.3],
            zoom: 6,
            maxPitch: 60,
            // protocols: [PMTilesProtocol],

            styles: MAP_STYLES
          } }
          leftSidebar={ false }
          rightSidebar={ false }
        />
        <div className={'absolute inset-0 flex pointer-events-none'}>
          <div>
            <LayerManager />
            {Object.keys(state.symbology?.plugins || {}).length > 0 && <ExternalPluginPanel />}
          </div>
          <div className='flex-1' />
          <div>
            <LayerEditor />
            {Object.keys(state.symbology?.plugins || {}).length > 0 && <InternalPluginPanel />}
          </div>
        </div>
      </div>
    </SymbologyContext.Provider>
	)
}



export default MapEditor;
