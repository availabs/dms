import React, { useEffect, useContext, useRef } from "react"
import { get, isEqual, cloneDeep } from "lodash-es"
import { AvlLayer } from "../../../../../../../ui/components/map"
import useMapTheme from "../../../../../../../ui/components/map/useMapTheme"
import { ThemeContext, getComponentTheme } from "../../../../../../../ui/useTheme"
import { usePrevious } from './utils.js'
import { MapContext } from "./"
import { CMSContext } from '../../../../../context'
import { PageContext } from '../../../../../context'
import { normalizeLayerClickFilterConfig } from '../../../../../../mapeditor/MapEditor/stateUtils';
import { formatFunctions } from "../../dataWrapper/utils/utils.jsx"
import bbox from '@turf/bbox';
import { featureCollection } from '@turf/helpers';

/**
 * Utility predicate for array filtering when we want to keep only the first
 * occurrence of each value. Used while building unique field/column lists for
 * layer tile URLs and other map-derived collections.
 */
function onlyUnique(value, index, array) {
  return array.indexOf(value) === index;
}

/**
 * Returns the rendered MapLibre layer ids that should participate in generic
 * hover/click interactions for one logical DMS map layer.
 *
 * We intentionally skip `_case` render layers here because those are support
 * layers created for visual styling, while interaction handling should usually
 * target the main rendered layer ids only.
 */
const getLayerInteractionIds = (candidateLayerProps = {}) =>
  (candidateLayerProps?.layers || [])
    .map((mapLayer) => mapLayer?.id)
    .filter((layerId) => layerId && !layerId.includes("_case"));

/**
 * Shared check for whether an interaction/subscriber value is meaningful
 * enough to publish or match. This keeps empty string / null / undefined
 * values from creating stale action filters or empty highlight overlays.
 */
const hasInteractionValue = (value) =>
  value !== undefined && value !== null && value !== "";

/**
 * Provider config is stored with the map section's other display settings under
 * `state.display._functions.providers`.
 *
 * Each provider entry is declared in `map/config.jsx`, configured in the shared
 * section menu, and then consumed here at runtime to decide whether this layer
 * should publish hover/click values into `pageState.filters`.
 */
const getInteractionProviders = (state) => state?.display?._functions?.providers || [];

/**
 * Subscriber config follows the same storage path as providers, but under
 * `state.display._functions.subscribers`.
 *
 * These entries tell the map which shared page action key to listen to
 * (`paramKey`), which logical map layer should react (`args.layerId`), and
 * which feature property should be matched (`args.field`).
 */
const getInteractionSubscribers = (state) => state?.display?._functions?.subscribers || [];

/**
 * Builds the MapLibre layer id used for a temporary subscriber highlight
 * overlay. Each base rendered layer gets separate hover/click overlay ids so
 * the highlight lifecycle can be managed without mutating the original layer.
 */
const getSubscriberHighlightLayerId = (layerId, mode) =>
  `${layerId}__subscriber_${mode}_highlight`;

/**
 * Builds the companion GeoJSON source id for a subscriber highlight overlay.
 * The highlight source stores only the currently matched features for a given
 * mode and rendered layer.
 */
const getSubscriberHighlightSourceId = (layerId, mode) =>
  `${layerId}__subscriber_${mode}_highlight_source`;

/**
 * Chooses which rendered layers should receive subscriber highlight overlays
 * for one logical DMS layer.
 *
 * We prefer non-`_case` layers to avoid duplicating highlight work across
 * support styling layers. If a logical layer only has `_case` layers, we fall
 * back to the full rendered layer list so the subscriber still works.
 */
const getSubscriberHighlightLayers = (layerProps = {}) => {
  const nonCaseLayers = (layerProps?.layers || []).filter(
    (mapLayer) => mapLayer?.id && !mapLayer.id.includes("_case")
  );

  return nonCaseLayers.length ? nonCaseLayers : (layerProps?.layers || []);
};

/**
 * Compares only the dynamic-filter fields that actually affect rendered data.
 * Config-only edits such as search key / display label / type should not force
 * a source rebuild in the runtime map.
 */
const getDynamicFilterDataSignature = (dynamicFilters = []) =>
  (dynamicFilters || []).map((filter) => ({
    column_name: filter?.column_name,
    values: Array.isArray(filter?.values) ? filter.values : [],
  }));

/**
 * Removes any temporary subscriber highlight layers and their GeoJSON sources
 * for the provided logical layer.
 *
 * This is used during unmount, source refresh, and highlight recomputation so
 * stale overlays do not survive map rebuilds or block source removal.
 */
const removeSubscriberHighlightLayers = (maplibreMap, layerProps = {}) => {
  if (
    !maplibreMap ||
    typeof maplibreMap.getLayer !== "function" ||
    typeof maplibreMap.removeLayer !== "function" ||
    typeof maplibreMap.getSource !== "function" ||
    typeof maplibreMap.removeSource !== "function"
  ) {
    return;
  }

  getSubscriberHighlightLayers(layerProps).forEach((mapLayer) => {
    ["hover", "click"].forEach((mode) => {
      const highlightLayerId = getSubscriberHighlightLayerId(mapLayer?.id, mode);
      const highlightSourceId = getSubscriberHighlightSourceId(mapLayer?.id, mode);
      try {
        if (highlightLayerId && maplibreMap.getLayer(highlightLayerId)) {
          maplibreMap.removeLayer(highlightLayerId);
        }
        if (highlightSourceId && maplibreMap.getSource(highlightSourceId)) {
          maplibreMap.removeSource(highlightSourceId);
        }
      } catch (error) {
        // Layer/source teardown can race during map refresh; ignore cleanup misses.
      }
    });
  });
};

/**
 * Creates the paint object for a subscriber highlight overlay based on the
 * rendered layer type. The overlay intentionally uses a fixed fallback style
 * so matching features are visually distinct without altering the base layer.
 */
const buildSubscriberHighlightPaint = (mapLayer = {}) => {
  const currentPaint = mapLayer.paint || {};

  switch (mapLayer.type) {
    case "fill":
      return {
        ...currentPaint,
        "fill-color": "#facc15",
        "fill-opacity": 0.65,
        "fill-outline-color": "#111827",
      };
    case "line":
      return {
        ...currentPaint,
        "line-color": "#facc15",
        "line-width": 4,
        "line-opacity": 1,
      };
    case "circle":
      return {
        ...currentPaint,
        "circle-color": "#facc15",
        "circle-opacity": 1,
        "circle-radius": 8,
        "circle-stroke-color": "#111827",
        "circle-stroke-width": 2,
      };
    default:
      return null;
  }
};

/**
 * Builds the actual MapLibre layer definition for a subscriber highlight
 * overlay. The overlay mirrors the base layer's type/layout, but swaps in the
 * temporary GeoJSON source and highlight paint.
 */
const buildSubscriberHighlightLayer = ({ mapLayer, mode }) => {
  const paint = buildSubscriberHighlightPaint(mapLayer);
  if (!paint) return null;

  return {
    id: getSubscriberHighlightLayerId(mapLayer.id, mode),
    type: mapLayer.type,
    source: getSubscriberHighlightSourceId(mapLayer.id, mode),
    layout: cloneDeep(mapLayer.layout || {}),
    paint,
  };
};

/**
 * Main runtime renderer for one logical map layer.
 *
 * This component synchronizes rendered MapLibre sources/layers with DMS layer
 * state, handles hover/click publishing into shared page action filters, and
 * renders temporary subscriber highlight overlays when shared action filters
 * target this layer.
 */
const ViewLayerRender = ({
  maplibreMap,
  layer,
  layerProps,
  allLayerProps
}) => {
  const mctx = useContext(MapContext);
  const { state, setState } = mctx ? mctx : {state: {}, setState:() => {}};
  const { pageState, setPageState, updatePageStateFilters, setActionParam, clearActionParam } = useContext(PageContext) || {};
  const { falcor, pgEnv } = mctx || {};

  const [sourceReady, setSourceReady] = React.useState(false);
  const cachedFilterPropsRef = useRef(null);
  const pageFiltersRef = useRef(pageState?.filters || []);

  useEffect(() => {
    pageFiltersRef.current = pageState?.filters || [];
  }, [pageState?.filters]);

  useEffect(() => {
    const sourceId = layerProps?.sources?.[0]?.id;
    if (!sourceId) return;

    if (maplibreMap.getSource(sourceId)) {
      setSourceReady(true);
    } else {
      const check = () => {
        if (maplibreMap.getSource(sourceId)) {
          setSourceReady(true);
          maplibreMap.off('sourcedata', check);
        }
      };
      maplibreMap.on('sourcedata', check);
      return () => {
        maplibreMap.off('sourcedata', check);
      };
    }
  }, [maplibreMap, layerProps?.sources?.[0]?.id]);
  // ------------
  // avl-map doesn't always automatically remove layers on unmount
  // so do it here
  // ---------------
  useEffect(() => {  
    return () => { 
      removeSubscriberHighlightLayers(maplibreMap, layerProps);
      //console.log('unmount', layer.id, layerProps.name, layer)
      layer.layers.forEach(l => {
        try {
          if (maplibreMap && maplibreMap.getLayer(l.id)) {
            maplibreMap.removeLayer(l.id)
          }
        } catch (e) {
          //console.log('catch', e)
        }
      })
    }
  }, [])

  const mapCenter = maplibreMap.getCenter();
  const mapZoom = maplibreMap.getZoom();

  useEffect(() => {
    if(state.setInitialBounds) {
      setState(draft => {
        draft.setInitialBounds = false;
        const newBounds = {
          center: mapCenter,
          zoom: mapZoom
        };
        if(!isEqual(state.initialBounds, newBounds)){
          draft.initialBounds = newBounds;
        }
      })
    }
  }, [maplibreMap, state.setInitialBounds]);

  // to detect changes in layerprops
  const prevLayerProps = usePrevious(layerProps);
  // - On layerProps change
  // const doesSourceExistOnMap = maplibreMap.getSource(layerProps?.sources?.[0]?.id);

  const didFilterGroupColumnsChange =
      layerProps.filterGroupEnabled &&
      !isEqual(layerProps?.["filter-group"], prevLayerProps?.["filter-group"]);

  const didDataColumnChange =
      !layerProps.filterGroupEnabled &&
      layerProps?.["data-column"] !== prevLayerProps?.["data-column"];

  const didFilterChange = layerProps?.filter !== prevLayerProps?.["filter"];
  /**
   * Only treat dynamic-filter edits as data changes when the column/value
   * payload changes. UI-only edits like type or search key should not rebuild
   * the runtime layer source.
   */
  const didDynamicFilterChange = !isEqual(
    getDynamicFilterDataSignature(layerProps?.["dynamic-filters"]),
    getDynamicFilterDataSignature(prevLayerProps?.["dynamic-filters"])
  );

  useEffect(() => {
    // ------------------------------------------------------
    // Change Source to Update feature properties dynamically
    // ------------------------------------------------------
    const shouldApplyFilters = didFilterGroupColumnsChange || didDataColumnChange || didFilterChange || didDynamicFilterChange;

    if (shouldApplyFilters) {
      cachedFilterPropsRef.current = layerProps;
    }

    if (!sourceReady) return;

    if(sourceReady && cachedFilterPropsRef.current) {
      if(maplibreMap.getSource(layerProps?.sources?.[0]?.id)){
        // console.log('debug map if', maplibreMap.getSource(layerProps?.sources?.[0]?.id))
        let newSource = cloneDeep(layerProps.sources?.[0])
        let tileBase = newSource.source.tiles?.[0];

        if(tileBase){
          newSource.source.tiles = [getLayerTileUrl(tileBase, layerProps)];
        } else if(newSource?.source?.url) {
          newSource.source.url = getLayerTileUrl(newSource.source.url, layerProps);
        }

        layerProps?.layers?.forEach(l => {
          ["hover", "click"].forEach((mode) => {
            const highlightLayerId = getSubscriberHighlightLayerId(l?.id, mode);
            if(maplibreMap.getLayer(highlightLayerId)){
              maplibreMap.removeLayer(highlightLayerId)
            }
          })
          if(maplibreMap.getLayer(l?.id) && maplibreMap.getLayer(l?.id)){
            maplibreMap.removeLayer(l?.id) 
          }
        })

        maplibreMap.removeSource(newSource.id)
        if(!maplibreMap.getSource(newSource.id)){
          maplibreMap.addSource(newSource.id, newSource.source)
        }

        let beneathLayer = Object.values(allLayerProps).find(l => l?.order === (layerProps.order+1))
        layerProps?.layers?.forEach(l => {
          if(maplibreMap.getLayer(beneathLayer?.id)){
            maplibreMap.addLayer(l, beneathLayer?.id) 
          } else {
            maplibreMap.addLayer(l) 
          }
        })
        cachedFilterPropsRef.current = null;
      }
    }

    if(Object.keys(layerProps)?.length && layerProps.view_id !== prevLayerProps?.view_id) {
      if(maplibreMap.getSource(prevLayerProps?.sources?.[0]?.id)){
        const oldSource = cloneDeep(prevLayerProps.sources?.[0])
        let newSource = cloneDeep(layerProps.sources?.[0])
        let tileBase = newSource?.source.tiles?.[0];

        if(tileBase){
          newSource.source.tiles = [getLayerTileUrl(tileBase, layerProps)];
        }

        layerProps?.layers?.forEach(l => {
          ["hover", "click"].forEach((mode) => {
            const highlightLayerId = getSubscriberHighlightLayerId(l?.id, mode);
            if(maplibreMap.getLayer(highlightLayerId)){
              maplibreMap.removeLayer(highlightLayerId)
            }
          })
          if(maplibreMap.getLayer(l?.id) && maplibreMap.getLayer(l?.id)){
            maplibreMap.removeLayer(l?.id) 
          }
        })

        maplibreMap.removeSource(oldSource.id)
        if(!maplibreMap.getSource(newSource.id)){
          maplibreMap.addSource(newSource.id, newSource.source)
        }

        let beneathLayer = Object.values(allLayerProps).find(l => l?.order === (layerProps.order+1))
        layerProps?.layers?.forEach(l => {
          if(maplibreMap.getLayer(beneathLayer?.id)){
            maplibreMap.addLayer(l, beneathLayer?.id) 
          } else {
            maplibreMap.addLayer(l) 
          }
        })
      }
    }

    if(prevLayerProps?.order !== undefined && layerProps?.order < prevLayerProps?.order) {
      let beneathLayer = Object.values(allLayerProps).find(l => l?.order === (layerProps?.order+1))
      layerProps?.layers?.forEach(l => {
        if(maplibreMap.getLayer(l?.id)){
          maplibreMap.moveLayer(l?.id, beneathLayer?.id) 
        }
      })
    }

    // -------------------------------
    // update paint Properties
    // -------------------------------
    layerProps?.layers?.forEach((l,i) => {
      if(maplibreMap.getLayer(l.id)){
        Object.keys(l.paint).forEach(paintKey => {
          if(!isEqual(prevLayerProps?.layers?.[i]?.paint?.[paintKey], l?.paint?.[paintKey])) {
            //  console.log('update paintKey', l.id, paintKey, prevLayerProps?.layers?.[i]?.paint?.[paintKey], l?.paint?.[paintKey])
            maplibreMap.setPaintProperty(l.id, paintKey, l.paint[paintKey])
          }
        })
      }
    })

    // -------------------------------
    // update layout Properties
    // -------------------------------
    layerProps?.layers?.forEach((l,i) => {
      if(maplibreMap.getLayer(l.id)){
        Object.keys(l?.layout || {}).forEach(layoutKey => {
          if(!isEqual(prevLayerProps?.layers?.[i]?.layout?.[layoutKey], l?.layout?.[layoutKey])) {
            // console.log('update layoutKey', l.id, layoutKey, prevLayerProps?.layers?.[i]?.paint?.[layoutKey], l?.paint?.[layoutKey])
            maplibreMap.setLayoutProperty(l.id, layoutKey, l.layout[layoutKey])
          }
        })
      }
    })
    

    // -------------------------------
    // Apply filters
    // -------------------------------
    const { filter: layerFilter, ["dynamic-filters"]:dynamicFilter } = layerProps;
    layerProps?.layers?.forEach((l,i) => {
      if(maplibreMap.getLayer(l.id)){
        let mapLayerFilter = [];
        if(layerFilter){
          mapLayerFilter = Object.keys(layerFilter).map(
            (filterColumnName) => {
              let mapFilter = [];
              //TODO actually handle calculated columns
              if(filterColumnName.includes("rpad(substring(prop_class, 1, 1), 3, '0')")) {
                const filterColumnClause = ["slice", ["get", "prop_class"], 0, 1];
                const filterOperator = layerFilter[filterColumnName].operator;
                const filterValues = layerFilter?.[filterColumnName]?.value.map(fVal => fVal?.substring(0,1))

                mapFilter = [
                  "in",
                  filterColumnClause,
                  ["literal", filterValues]
                ];

                if(filterOperator === "!="){
                  mapFilter = ["!", mapFilter];
                }
              }
              else {
                const filterOperator = layerFilter[filterColumnName].operator;
                const filterValue = layerFilter[filterColumnName].value;
                const filterColumnClause = ["get", filterColumnName];

                let parseMapDataFunction = '';

                if(filterOperator === 'between') {
                  //between is only supported for numeric fields
                  parseMapDataFunction = "to-number"
                  mapFilter = [
                    "all",
                    [">=", [parseMapDataFunction, filterColumnClause], [parseMapDataFunction, filterValue?.[0]]],
                    ["<=", [parseMapDataFunction, filterColumnClause], [parseMapDataFunction, filterValue?.[1]]],
                  ];
                }
                else {
                  //determine if this is number or non-number
                  const numRegex = /^-?\d+(\.\d+)?$/;
                  if(!numRegex.test(filterValue)){
                    parseMapDataFunction = "to-string"
                  } else {
                    parseMapDataFunction = "to-number"
                  }
                  if (["==", "!="].includes(filterOperator)) {
                    // "in"Allows for `or`, i.e. ogc_fid = 123 or 456
                    mapFilter = [
                      "in",
                      filterColumnClause,
                      ["literal", filterValue]
                    ];
  
                    if(filterOperator === "!="){
                      mapFilter = ["!", mapFilter];
                    }
                  }
                  else {
                    mapFilter = [
                      filterOperator,
                      [parseMapDataFunction, filterColumnClause],
                      [parseMapDataFunction, filterValue]
                    ];
                  }
                }
              }
              return mapFilter;
            }
          );
        }
        const layerHasDynamicFilter =
          dynamicFilter &&
          dynamicFilter?.length > 0 &&
          dynamicFilter.some((dFilter) => dFilter?.values?.length > 0);
        let dynamicMapLayerFilters = [];
        if (layerHasDynamicFilter) {
          dynamicMapLayerFilters = dynamicFilter
            ?.filter((dFilter) => dFilter?.values?.length > 0)
            .map((dFilter) => {
              let mapFilter = [];

              const filterValue = dFilter.values;
              let parsedFilterValues; 

              let parseMapDataFunction = '';
              //determine if this is number or non-number
              const numRegex = /^-?\d+(\.\d+)?$/;
              if(!numRegex.test(filterValue)){
                parseMapDataFunction = "to-string"
                parsedFilterValues = dFilter.values.map(val => val.toString());
              } else {
                parseMapDataFunction = "to-number"
                parsedFilterValues = dFilter.values.map(val => parseFloat(val));
              }

              const filterColumnClause = ["get", dFilter.column_name];
              //"in" Allows for `or`, i.e. ogc_fid = 123 or 456
              mapFilter = ["in", [parseMapDataFunction, filterColumnClause], ["literal", parsedFilterValues]];
              return mapFilter;
            });
        }
        const curLayerFilterMode = allLayerProps[l.id]?.filterMode;
        maplibreMap.setFilter(l.id, [curLayerFilterMode || 'all', ...mapLayerFilter, ...dynamicMapLayerFilters]);
      }
    });

    maplibreMap.once('idle', () => {
      if(layerProps?.zoomToFitBounds){
        const layers = (layerProps?.layers || []).map(l => l.id);
        const renderedFeatures = maplibreMap.queryRenderedFeatures(undefined, { layers });

        if (renderedFeatures.length > 0) {
          const fc = featureCollection(renderedFeatures);
          const bounds = bbox(fc); // [minX, minY, maxX, maxY]

          maplibreMap.fitBounds(
              [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
              {
                padding: 40,
                duration: 2000,
                easing: t => 1 - (1 - t) * (1 - t),
                // easing: t => t * t,
              }
          );
        }
      }
    });
  }, [sourceReady, didFilterGroupColumnsChange, didDataColumnChange, didFilterChange, didDynamicFilterChange, layerProps, allLayerProps]);

  useEffect(() => {
    if (maplibreMap && allLayerProps && allLayerProps?.zoomToFit?.length > 0){
      maplibreMap.fitBounds(allLayerProps.zoomToFit, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        duration: 400
      });
    }
  }, [maplibreMap, allLayerProps?.zoomToFit]);

  useEffect(() => {
    if (maplibreMap && layerProps && layerProps?.zoomToFilterBounds?.length > 0 &&  layerProps?.zoomToFilterBounds[0] !== null){
      maplibreMap.fitBounds(layerProps.zoomToFilterBounds, {
        padding: { top: 200, bottom: 200, left: 200, right: 200 },
        duration: 400
      });
    }
  }, [maplibreMap, allLayerProps]);

  /**
   * Resolves the feature properties needed by map interactions before we try to
   * publish values to shared page filters.
   *
   * In many cases, the rendered map feature already includes the field we need
   * in `feature.properties`, so this helper simply returns those properties as-is.
   * However, some map sources only include a partial property set in the vector
   * tile / rendered feature payload. When that happens, an interaction may be
   * configured to publish a field that is not currently present on the feature.
   *
   * This helper checks which requested `fieldNames` are missing, and if enough
   * context is available (`falcor`, `pgEnv`, `view_id`, and `feature.id`), it
   * performs a fallback fetch against the backing view record to retrieve just
   * those missing fields. The fetched values are then merged back into the
   * existing `feature.properties` object and returned as one resolved property bag.
   *
   * That lets hover/click providers stay generic:
   * - the interaction config only names a `field`
   * - the runtime does not have to know whether that field is already present
   *   on the rendered feature or must be fetched from the data source
   *
   * This is especially important for layer interactions because both click-filter
   * mappings and hover/click publish providers rely on a consistent way to read
   * feature values, even when map rendering and backing data do not expose the
   * exact same property set.
   */
  const resolveFeatureProperties = React.useCallback(async ({ feature, candidateLayerProps, fieldNames = [] }) => {
    let resolvedProperties = feature?.properties || {};
    const missingFields = fieldNames.filter(
      (fieldName) =>
        fieldName &&
        (resolvedProperties?.[fieldName] === undefined ||
          resolvedProperties?.[fieldName] === null ||
          resolvedProperties?.[fieldName] === "")
    );
    const {
      joinConfig,
      joinFields,
      baseFields,
      fieldToRequestAttribute,
      requestAttributes,
    } = getJoinFieldLookup(candidateLayerProps, missingFields);

    if (
      baseFields.length &&
      falcor &&
      pgEnv &&
      candidateLayerProps?.view_id &&
      feature?.id !== undefined &&
      feature?.id !== null
    ) {
      try {
        const response = await falcor.get([
          "uda",
          pgEnv,
          "viewsById",
          candidateLayerProps.view_id,
          "dataById",
          String(feature.id),
          baseFields
        ]);

        const fetchedProperties = get(response, [
          "json",
          "uda",
          pgEnv,
          "viewsById",
          candidateLayerProps.view_id,
          "dataById",
          String(feature.id)
        ], {});

        resolvedProperties = {
          ...resolvedProperties,
          ...fetchedProperties
        };
        } catch (error) {
        console.error("[MapInteractions] failed to fetch missing fields", error);
      }
    }

    if (
      joinFields.length &&
      falcor &&
      pgEnv &&
      joinConfig?.enabled &&
      joinConfig?.source?.viewId &&
      joinConfig?.featureKeyColumn &&
      joinConfig?.joinColumn
    ) {
      try {
        let localJoinValue = resolvedProperties?.[joinConfig.featureKeyColumn];

        if (
          !hasResolvedValue(localJoinValue) &&
          candidateLayerProps?.view_id &&
          feature?.id !== undefined &&
          feature?.id !== null
        ) {
          const localKeyResponse = await falcor.get([
            "uda",
            pgEnv,
            "viewsById",
            candidateLayerProps.view_id,
            "dataById",
            String(feature.id),
            [joinConfig.featureKeyColumn]
          ]);

          const localKeyProperties = get(localKeyResponse, [
            "json",
            "uda",
            pgEnv,
            "viewsById",
            candidateLayerProps.view_id,
            "dataById",
            String(feature.id)
          ], {});

          resolvedProperties = {
            ...resolvedProperties,
            ...localKeyProperties
          };
          localJoinValue = localKeyProperties?.[joinConfig.featureKeyColumn];
        }

        if (hasResolvedValue(localJoinValue) && requestAttributes.length) {
          const joinQuery = joinConfig.query || {};
          const joinFilterOptions = buildJoinFilterOptions(joinQuery);
          let joinOptions = {
            ...joinFilterOptions,
            groupBy: Array.isArray(joinQuery.groupBy) ? joinQuery.groupBy : [],
          };

          if (joinFilterOptions?.filterGroups) {
            joinOptions = {
              ...joinOptions,
              filterGroups: {
                op: "AND",
                groups: [
                  ...(joinFilterOptions.filterGroups.groups || []),
                  {
                    op: "filter",
                    col: joinConfig.joinColumn,
                    value: [localJoinValue],
                  },
                ],
              },
            };
          } else {
            joinOptions = {
              ...joinOptions,
              filter: {
                ...(joinFilterOptions?.filter || {}),
                [joinConfig.joinColumn]: [localJoinValue],
              },
            };
          }

          const joinOptionsKey = JSON.stringify(joinOptions);
          const joinResponse = await falcor.get([
            "uda",
            pgEnv,
            "viewsById",
            joinConfig.source.viewId,
            "options",
            joinOptionsKey,
            "dataByIndex",
            { from: 0, to: 0 },
            requestAttributes
          ]);

          const joinRow = get(joinResponse, [
            "json",
            "uda",
            pgEnv,
            "viewsById",
            joinConfig.source.viewId,
            "options",
            joinOptionsKey,
            "dataByIndex",
            0
          ], {});

          const joinResolvedProperties = joinFields.reduce((acc, fieldName) => {
            const requestAttribute = fieldToRequestAttribute[fieldName];
            if (Object.prototype.hasOwnProperty.call(joinRow || {}, requestAttribute)) {
              acc[fieldName] = joinRow[requestAttribute];
            }
            return acc;
          }, {});

          resolvedProperties = {
            ...resolvedProperties,
            ...joinResolvedProperties
          };
        }
      } catch (error) {
        console.error("[MapInteractions] failed to fetch join fields", error);
      }
    }

    return resolvedProperties;
  }, [falcor, pgEnv]);

  useEffect(() => {
    if (!maplibreMap) return;
    if (typeof setActionParam !== "function") return;

    const orderedLayerConfigs = Object.values(allLayerProps || {})
      .map((candidateLayerProps) => ({
        id: candidateLayerProps?.id,
        layerProps: candidateLayerProps,
        hoverableLayerIds: getLayerInteractionIds(candidateLayerProps),
        order: candidateLayerProps?.order ?? 0,
      }))
      .filter((config) => config.hoverableLayerIds.length > 0)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return String(a.id).localeCompare(String(b.id));
      });

    if (!orderedLayerConfigs.length) return;

    const hoverHandlerOwnerId = orderedLayerConfigs[0]?.id;
    if (layerProps?.id !== hoverHandlerOwnerId) return;

    const hoverableLayerIds = orderedLayerConfigs.flatMap((config) => config.hoverableLayerIds);
    let lastPublishedValue;
    let lastPublishedKey;

    /**
     * Hover publisher runtime:
     * - finds the top-most hovered interaction layer
     * - resolves the configured feature field
     * - publishes that value into the shared page action filter bus
     * - remembers the last published key/value so we only republish when the
     *   hovered feature or target action key actually changes
     */
    const handleHoverMove = async (event) => {
      const features = maplibreMap.queryRenderedFeatures(event.point, { layers: hoverableLayerIds });
      if (!features?.length) return;

      for (const feature of features) {
        const ownerLayerConfig = orderedLayerConfigs.find((config) =>
          config.hoverableLayerIds.includes(feature?.layer?.id)
        );
        if (!ownerLayerConfig) continue;
        const hoverPublishCfg = getInteractionProviders(state)?.find(
          (provider) =>
            provider?.functionId === "hover_publish" &&
            provider?.enabled &&
            provider?.args?.layerId === ownerLayerConfig.layerProps?.id
        );
        if (!hoverPublishCfg?.paramKey || !hoverPublishCfg?.args?.field) continue;

        const resolvedProperties = await resolveFeatureProperties({
          feature,
          candidateLayerProps: ownerLayerConfig.layerProps,
          fieldNames: [hoverPublishCfg.args.field],
        });

        const publishedValue = resolvedProperties?.[hoverPublishCfg.args.field];
        if (!hasInteractionValue(publishedValue)) continue;

        if (lastPublishedValue !== String(publishedValue) || lastPublishedKey !== hoverPublishCfg.paramKey) {
          if (lastPublishedKey && lastPublishedKey !== hoverPublishCfg.paramKey) {
            clearActionParam?.(lastPublishedKey);
          }
          lastPublishedKey = hoverPublishCfg.paramKey;
          lastPublishedValue = String(publishedValue);
          setActionParam(hoverPublishCfg.paramKey, publishedValue);
        }
        return;
      }
    };

    /**
     * Clears the transient hover action filter when the cursor leaves the
     * hovered feature/layer. Hover interactions are intentionally temporary,
     * so leaving the layer should remove the shared action state as well.
     */
    const handleHoverLeave = () => {
      lastPublishedValue = undefined;
      if (lastPublishedKey) {
        clearActionParam?.(lastPublishedKey);
      }
      lastPublishedKey = undefined;
    };

    hoverableLayerIds.forEach((hoverLayerId) => {
      maplibreMap.on("mousemove", hoverLayerId, handleHoverMove);
      maplibreMap.on("mouseleave", hoverLayerId, handleHoverLeave);
    });

    return () => {
      hoverableLayerIds.forEach((hoverLayerId) => {
        maplibreMap.off("mousemove", hoverLayerId, handleHoverMove);
        maplibreMap.off("mouseleave", hoverLayerId, handleHoverLeave);
      });
      if (lastPublishedKey) {
        clearActionParam?.(lastPublishedKey);
      }
    };
  }, [
    maplibreMap,
    allLayerProps,
    layerProps?.id,
    resolveFeatureProperties,
    setActionParam,
    clearActionParam,
  ]);

  /**
   * Coordinates click-filter handling for the whole DMS map.
   *
   * Rather than letting each rendered layer update search params on its own,
   * this effect installs one shared click handler that batches all eligible
   * click-filter mappings, resolves missing base or join-backed fields, and
   * applies one merged page-filter update for the click.
   */
  useEffect(() => {
    if (!maplibreMap) return;

    const clickableLayerConfigs = Object.values(allLayerProps || {})
      .map((candidateLayerProps) => {
        const clickFilterConfig = normalizeLayerClickFilterConfig(
          candidateLayerProps?.["click-filter"] || {}
        );
        const isClickFilterEnabled = clickFilterConfig.enabled === true;
        const activeMappings = (clickFilterConfig.mappings || []).filter(
          (mapping) =>
            isClickFilterEnabled &&
            mapping?.variable &&
            mapping?.field &&
            mapping?.useSearchParams === true
        );
        const clickableLayerIds = (candidateLayerProps?.layers || [])
          .map((layer) => layer?.id)
          .filter((layerId) => layerId && !layerId.includes("_case"));

        if (!isClickFilterEnabled || !activeMappings.length || !clickableLayerIds.length) {
          return null;
        }

        return {
          id: candidateLayerProps?.id,
          layerProps: candidateLayerProps,
          activeMappings,
          clickableLayerIds,
          order: candidateLayerProps?.order ?? 0
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.order !== b.order) {
          return a.order - b.order;
        }
        return String(a.id).localeCompare(String(b.id));
      });

    const mapClickableLayerConfigs = Object.values(allLayerProps || {})
      .map((candidateLayerProps) => ({
        id: candidateLayerProps?.id,
        layerProps: candidateLayerProps,
        clickableLayerIds: getLayerInteractionIds(candidateLayerProps),
        order: candidateLayerProps?.order ?? 0,
      }))
      .filter((config) => config.clickableLayerIds.length > 0)
      .sort((a, b) => {
        if (a.order !== b.order) {
          return a.order - b.order;
        }
        return String(a.id).localeCompare(String(b.id));
      });

    if (!clickableLayerConfigs.length && !mapClickableLayerConfigs.some((config) =>
      getInteractionProviders(state)?.some(
        (provider) =>
          provider?.functionId === "click_publish" &&
          provider?.enabled &&
          provider?.paramKey &&
          provider?.args?.field &&
          provider?.args?.layerId === config.layerProps?.id
      )
    )) {
      return;
    }

    const clickHandlerOwnerId = mapClickableLayerConfigs[0]?.id || clickableLayerConfigs[0]?.id;
    if (layerProps?.id !== clickHandlerOwnerId) {
      return;
    }

    const clickableLayerIds = mapClickableLayerConfigs.flatMap((config) => config.clickableLayerIds);

    /**
     * Applies click-filter URL/search-param mappings for the map click system.
     *
     * Important: this merge intentionally ignores `type: "action"` filters so
     * transient interaction state continues to be owned exclusively by
     * `setActionParam`, while click-filter mappings only manage normal page
     * filters/search-param values.
     */
    const updateFilterValues = (nextFilterEntries) => {
      const existingFilters = Array.isArray(pageFiltersRef.current) ? pageFiltersRef.current : [];
      const existingNonActionFilters = existingFilters.filter((filter) => filter?.type !== "action");
      const nextFilters = existingNonActionFilters
        .filter((filter) =>
          !nextFilterEntries.some((entry) => entry.searchKey === filter?.searchKey)
        )
        .concat(
          nextFilterEntries.map((entry) => {
            const matchingFilter = existingNonActionFilters.find(
              (filter) => filter?.searchKey === entry.searchKey
            );
            return {
              ...(matchingFilter || {}),
              searchKey: entry.searchKey,
              values: [entry.value],
              useSearchParams: matchingFilter?.useSearchParams ?? Boolean(entry.useSearchParams),
            };
          })
        );

      if (typeof updatePageStateFilters === "function") {
        updatePageStateFilters(nextFilters);
        return;
      }

      if (typeof setPageState === "function") {
        setPageState((draft) => {
          if (!Array.isArray(draft.filters)) {
            draft.filters = [];
          }

          nextFilterEntries.forEach((entry) => {
            const filterIndex = draft.filters.findIndex(
              (filter) => filter?.searchKey === entry.searchKey
            );

            if (filterIndex >= 0) {
              draft.filters[filterIndex].values = [entry.value];
              draft.filters[filterIndex].useSearchParams =
                draft.filters[filterIndex].useSearchParams ?? Boolean(entry.useSearchParams);
            } else {
              draft.filters.push({
                searchKey: entry.searchKey,
                values: [entry.value],
                useSearchParams: Boolean(entry.useSearchParams),
              });
            }
          });
        });
      }
    };

    /**
     * Shared click handler for all click-enabled map layers.
     *
     * On each click it:
     * 1. resolves mapped click-filter values for search-param/page-filter
     *    updates,
     * 2. resolves the configured `click_publish` provider value for the first
     *    matching interaction feature, and
     * 3. sends the two update streams through their respective systems:
     *    - `setActionParam` for transient interaction state
     *    - `updatePageStateFilters` for normal page filters
     */
    const handleMapClick = async (event) => {
      const features = maplibreMap.queryRenderedFeatures(event.point, {
        layers: clickableLayerIds,
      });

      const nextFilterEntries = (
        await Promise.all(
          clickableLayerConfigs.map(async (clickableLayerConfig) => {
            const feature = features.find((candidateFeature) =>
              clickableLayerConfig.clickableLayerIds.includes(candidateFeature?.layer?.id)
            );

            if (!feature) return [];

            const resolvedProperties = await resolveFeatureProperties({
              feature,
              candidateLayerProps: clickableLayerConfig.layerProps,
              fieldNames: clickableLayerConfig.activeMappings.map((mapping) => mapping.field)
            });

            return clickableLayerConfig.activeMappings.reduce((acc, mapping) => {
              const value = resolvedProperties?.[mapping.field];
              if (value !== undefined && value !== null && value !== "") {
                acc.push({
                  searchKey: mapping.variable,
                  value,
                  useSearchParams: mapping.useSearchParams,
                });
              }
              return acc;
            }, []);
          })
        )
      ).flat();

      if (typeof setActionParam === "function") {
        for (const feature of features || []) {
          const ownerLayerConfig = mapClickableLayerConfigs.find((config) =>
            config.clickableLayerIds.includes(feature?.layer?.id)
          );
          if (!ownerLayerConfig) continue;
          const clickPublishCfg = getInteractionProviders(state)?.find(
            (provider) =>
              provider?.functionId === "click_publish" &&
              provider?.enabled &&
              provider?.args?.layerId === ownerLayerConfig.layerProps?.id
          );
          if (!clickPublishCfg?.paramKey || !clickPublishCfg?.args?.field) continue;

          const resolvedProperties = await resolveFeatureProperties({
            feature,
            candidateLayerProps: ownerLayerConfig.layerProps,
            fieldNames: [clickPublishCfg.args.field],
          });

          const publishedValue = resolvedProperties?.[clickPublishCfg.args.field];
          if (hasInteractionValue(publishedValue)) {
            setActionParam(clickPublishCfg.paramKey, publishedValue);
            break;
          }
        }
      }

      if (!features?.length) return;
      if (!nextFilterEntries.length) return;
      updateFilterValues(nextFilterEntries);
    };

    maplibreMap.on("click", handleMapClick);

    return () => {
      if (!maplibreMap?.loaded()) return;

      maplibreMap.off("click", handleMapClick);
    };
  }, [
    maplibreMap,
    layerProps,
    allLayerProps,
    setPageState,
    updatePageStateFilters,
    setActionParam,
    resolveFeatureProperties,
    state?.display?._functions,
  ]);

  useEffect(() => {
    if (!maplibreMap || !layerProps?.id || !sourceReady) return;

    /**
     * For the current logical map layer, read the enabled subscriber configs
     * that should react to shared page action params.
     *
     * The config is layer-scoped by `args.layerId`, so even though the page may
     * have many map layers and many subscriber definitions, this render instance
     * only reacts to the ones explicitly targeting `layerProps.id`.
     */
    const hoverSubscriberCfg = getInteractionSubscribers(state)?.find(
      (subscriber) =>
        subscriber?.functionId === "hover_highlight" &&
        subscriber?.enabled &&
        subscriber?.args?.layerId === layerProps.id
    );

    const clickSubscriberCfg = getInteractionSubscribers(state)?.find(
      (subscriber) =>
        subscriber?.functionId === "click_highlight" &&
        subscriber?.enabled &&
        subscriber?.args?.layerId === layerProps.id
    );

    /**
     * Action params are the shared cross-component bus. Publishers write them
     * into `pageState.filters` with `type: "action"`, and subscribers read them
     * back using the configured `paramKey`.
     *
     * These lookups bridge:
     * - another component publishing a value
     * - this map layer deciding whether it should render a highlight overlay
     */
    const hoverParam = hoverSubscriberCfg?.paramKey
      ? pageState?.filters?.find(
          (filter) =>
            filter?.searchKey === hoverSubscriberCfg.paramKey &&
            filter?.type === "action"
        )
      : undefined;

    const clickParam = clickSubscriberCfg?.paramKey
      ? pageState?.filters?.find(
          (filter) =>
            filter?.searchKey === clickSubscriberCfg.paramKey &&
            filter?.type === "action"
        )
      : undefined;

    /**
     * These are the live subscribed values currently driving highlight state.
     *
     * If a value exists, the matching highlight layer for that mode can be
     * built. If the value disappears, the temporary highlight overlay is
     * removed and the base layer continues rendering unchanged.
     */
    const hoverValue = hoverParam?.values?.[0];
    const clickValue = clickParam?.values?.[0];

    /**
     * Rebuilds the subscriber highlight overlay for one interaction mode.
     *
     * The flow is:
     * - remove any old temporary overlay for this layer+mode
     * - query rendered features from the preferred rendered layer(s)
     * - resolve the configured match field on each feature
     * - keep only features whose value matches the subscribed action value
     * - write the matches into a GeoJSON source
     * - add or update the highlight overlay layer
     */
    const applyHighlight = async (mode, subscriberCfg, subscribedValue) => {
      getSubscriberHighlightLayers(layerProps).forEach((mapLayer) => {
        const highlightLayerId = getSubscriberHighlightLayerId(mapLayer?.id, mode);
        const highlightSourceId = getSubscriberHighlightSourceId(mapLayer?.id, mode);
        if (highlightLayerId && maplibreMap.getLayer(highlightLayerId)) {
          maplibreMap.removeLayer(highlightLayerId);
        }
        if (highlightSourceId && maplibreMap.getSource(highlightSourceId)) {
          maplibreMap.removeSource(highlightSourceId);
        }
      });

      if (!subscriberCfg?.args?.field || !hasInteractionValue(subscribedValue)) return;

      for (const mapLayer of getSubscriberHighlightLayers(layerProps)) {
        const highlightLayer = buildSubscriberHighlightLayer({
          mapLayer,
          mode,
        });

        if (!highlightLayer) continue;

        const renderedFeatures = maplibreMap.queryRenderedFeatures(undefined, {
          layers: [mapLayer.id],
        });

        const matchedFeatures = [];
        for (const feature of renderedFeatures) {
          const resolvedProperties = await resolveFeatureProperties({
            feature,
            candidateLayerProps: layerProps,
            fieldNames: [subscriberCfg.args.field],
          });

          if (String(resolvedProperties?.[subscriberCfg.args.field]) === String(subscribedValue)) {
            matchedFeatures.push({
              type: "Feature",
              id: feature.id,
              properties: resolvedProperties,
              geometry: cloneDeep(feature.geometry),
            });
          }
        }

        if (!matchedFeatures.length || !maplibreMap.getLayer(mapLayer.id)) continue;

        const highlightSourceId = getSubscriberHighlightSourceId(mapLayer.id, mode);
        const highlightData = featureCollection(matchedFeatures);
        const existingHighlightSource = maplibreMap.getSource(highlightSourceId);

        if (existingHighlightSource && typeof existingHighlightSource.setData === "function") {
          existingHighlightSource.setData(highlightData);
        } else {
          maplibreMap.addSource(highlightSourceId, {
            type: "geojson",
            data: highlightData,
          });
        }

        if (!maplibreMap.getLayer(highlightLayer.id)) {
          maplibreMap.addLayer(highlightLayer);
        }
      }
    };

    applyHighlight("hover", hoverSubscriberCfg, hoverValue);
    applyHighlight("click", clickSubscriberCfg, clickValue);

    return () => {
      removeSubscriberHighlightLayers(maplibreMap, layerProps);
    };
  }, [
    maplibreMap,
    layerProps,
    sourceReady,
    pageState?.filters,
    state?.display?._functions,
  ]);
}

/**
 * Returns the join-authored tile columns that should be emitted as feature
 * properties on rendered vector tiles for this map layer.
 */
const getJoinTileColumns = (layerProps) =>
  Array.isArray((layerProps?.join || layerProps?.["linked-data"])?.tileColumns)
    ? (layerProps.join || layerProps["linked-data"]).tileColumns.filter(Boolean)
    : [];

/**
 * Normalizes the saved join config so the DMS runtime can consume one shape
 * even while older symbologies still carry legacy nested join keys.
 */
const normalizeJoinRuntimeConfig = (layerProps = {}) => {
  const joinConfig = layerProps?.join || layerProps?.["linked-data"] || null;
  if (!joinConfig) return null;
  return {
    ...joinConfig,
    source: joinConfig.source || joinConfig.linked || {},
    joinColumn: joinConfig.joinColumn || joinConfig.linkedJoinColumn || "",
    query: joinConfig.query || joinConfig.linkedQuery || {},
  };
};

/**
 * Converts editor-managed join filter rows into the UDA options payload used
 * by tile requests and on-demand join-side field resolution.
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
 * Serializes the layer join config into the encoded `join` param appended to
 * tile URLs for the DMS runtime map.
 */
const buildJoinParam = (layerProps) => {
  const joinConfig = normalizeJoinRuntimeConfig(layerProps);
  if (!joinConfig?.enabled || !joinConfig?.source?.viewId || !joinConfig?.featureKeyColumn || !joinConfig?.joinColumn) {
    return "";
  }

  const queryConfig = joinConfig.query || {};
  const groupBy = Array.isArray(queryConfig?.groupBy) ? queryConfig.groupBy : [];
  const columns = Array.isArray(queryConfig?.columns) ? queryConfig.columns : [];
  return encodeURIComponent(JSON.stringify({
    viewId: joinConfig.source.viewId,
    localKey: joinConfig.featureKeyColumn,
    joinKey: joinConfig.joinColumn,
    options: { ...buildJoinFilterOptions(queryConfig), groupBy },
    attributes: columns,
    tileCols: getJoinTileColumns(layerProps),
  }));
};

/**
 * Returns every output name exposed by the join, combining explicit tile
 * columns with aliased query expressions so downstream runtime lookups can
 * recognize join-backed fields consistently.
 */
const getJoinOutputColumns = (layerProps) => {
  const joinConfig = normalizeJoinRuntimeConfig(layerProps);
  if (!joinConfig) return [];

  const tileColumns = Array.isArray(joinConfig?.tileColumns)
    ? joinConfig.tileColumns.filter(Boolean)
    : [];
  const queryColumns = Array.isArray(joinConfig?.query?.columns)
    ? joinConfig.query.columns.map((expr) => {
        const aliasMatch = String(expr).match(/\s+as\s+("?)([^"]+)\1\s*$/i);
        return aliasMatch?.[2] || String(expr).trim();
      }).filter(Boolean)
    : [];

  return Array.from(new Set([...tileColumns, ...queryColumns]));
};

/**
 * Extracts the resolved output alias from a SQL join expression so runtime
 * fetches can map a requested join field back to the expression that creates
 * it on the join side.
 */
const getJoinOutputNameFromExpr = (expr) => {
  const aliasMatch = String(expr).match(/\s+as\s+("?)([^"]+)\1\s*$/i);
  if (aliasMatch?.[2]) return aliasMatch[2];
  return String(expr).trim();
};

/**
 * Shared guard for whether a value should count as "already resolved" by the
 * interaction system while still treating `0` and `false` as valid values.
 */
const hasResolvedValue = (value) =>
  !(value === undefined || value === null || value === "");

/**
 * Splits requested interaction fields into base-table fields vs join-owned
 * outputs and prepares the expression lookup needed to fetch joined values
 * from the correct source.
 */
const getJoinFieldLookup = (layerProps, fieldNames = []) => {
  const joinConfig = normalizeJoinRuntimeConfig(layerProps);
  if (!joinConfig) {
    return {
      joinConfig: null,
      joinFields: [],
      baseFields: fieldNames,
      fieldToRequestAttribute: {},
      requestAttributes: [],
    };
  }

  const joinOutputs = new Set(getJoinOutputColumns(layerProps));
  const queryColumns = Array.isArray(joinConfig?.query?.columns)
    ? joinConfig.query.columns
    : [];
  const outputToExpression = queryColumns.reduce((acc, expr) => {
    acc[getJoinOutputNameFromExpr(expr)] = expr;
    return acc;
  }, {});

  const joinFields = fieldNames.filter((fieldName) => joinOutputs.has(fieldName));
  const baseFields = fieldNames.filter((fieldName) => !joinOutputs.has(fieldName));
  const fieldToRequestAttribute = joinFields.reduce((acc, fieldName) => {
    acc[fieldName] = outputToExpression[fieldName] || fieldName;
    return acc;
  }, {});
  const requestAttributes = Array.from(
    new Set(Object.values(fieldToRequestAttribute).filter(Boolean))
  );

  return {
    joinConfig,
    joinFields,
    baseFields,
    fieldToRequestAttribute,
    requestAttributes,
  };
};

const getLayerTileUrl = (tileBase, layerProps) => {
  let newTileUrl = `${tileBase}`;
  if (typeof newTileUrl === "string") {
    newTileUrl = newTileUrl.split("?")[0];
  }
  const joinTileColumns = getJoinTileColumns(layerProps);
  const joinTileColumnSet = new Set(joinTileColumns);

  const layerHasFilter = (layerProps?.filter && Object.keys(layerProps?.filter)?.length > 0) 

  const dataFilterCols =
    layerProps?.filterGroupEnabled && layerProps?.["filter-group"]?.length > 0
      ? layerProps?.["filter-group"]
          ?.map((filterObj) => filterObj.column_name)
      : [layerProps?.["data-column"]];
  
  const dynamicCols = layerProps?.["dynamic-filters"]
    ?.filter((dFilter) => dFilter?.values?.length > 0)
    .map((dFilter) => dFilter.column_name); 
  const colsToAppend = dataFilterCols
    .concat(dynamicCols)
    .filter(onlyUnique)
    .filter((col) => !!col && !joinTileColumnSet.has(col))
    .join(",")

  if (newTileUrl && (colsToAppend || layerHasFilter)) {
    if (!newTileUrl?.includes("?cols=")) {
      newTileUrl += `?cols=`;
    }

    const splitUrl = newTileUrl.split("?cols=");
    //If layerProps has a data column, and the URL has nothing after the ?cols=, append data column
    if (colsToAppend && splitUrl[1].length === 0) {
      newTileUrl += colsToAppend;
    }

    //If layerProps has a data column, and the URL already has something after the ?cols=, replace it with data column
    if (colsToAppend && splitUrl[1].length > 0) {
      newTileUrl = newTileUrl.replace(splitUrl[1], colsToAppend);
    }

    if (layerHasFilter) {
      const filterColumns = Object.keys(layerProps.filter).filter((filterCol) => !joinTileColumnSet.has(filterCol));
      const splitUrl = newTileUrl.split("?cols=");
      if (splitUrl[1].length !== 0 && filterColumns.length) {
        newTileUrl += ",";
      }
      filterColumns.forEach((filterCol, i) => {
        //TODO actually handle calculated columns
        if(filterCol.includes("rpad(substring(prop_class, 1, 1), 3, '0')")){
          newTileUrl += `prop_class`;
        }
        else {
          newTileUrl += `${filterCol}`;
        }

        if (i < filterColumns.length - 1) {
          newTileUrl += ",";
        }
      });
    }
  }

  const joinParam = buildJoinParam(layerProps);
  if (joinParam) {
    newTileUrl += `${newTileUrl.includes("?") ? "&" : "?"}join=${joinParam}`;
  }

  // if(newTileUrl && newTileUrl?.includes('.pmtiles')){
  //   newTileUrl = newTileUrl
  //     .replace("$HOST", `${API_HOST}/tiles`)
  //     .replace('https://', 'pmtiles://')
  //     .replace('http://', 'pmtiles://')

  // } else {
  //   newTileUrl = newTileUrl.replace("$HOST", API_HOST)
  // }
  
  return newTileUrl;
};

/**
 * AvlLayer wrapper used by the map section runtime.
 *
 * It exposes the rendered MapLibre layer/source definitions, hover behavior,
 * and the React `RenderComponent` responsible for keeping the runtime layer
 * synchronized with DMS state.
 */
class ViewLayer extends AvlLayer { 
  // constructor makes onHover not work??
  // constructor(layer, view) { 
  //   super();

  //   this.id = layer.id;
  //   // this.name = `Layer ${ layer.layerId }`;
  //   //console.log('sources', layer.layers)
  //   //this.startActive = true;
  //   //this.viewId = layer.view_id;
  //   this.sources = layer.sources.map(s => {
  //     let newSource = cloneDeep(s)
  //     newSource.id = `${layer.id}_${newSource.id}`
  //     return newSource
  //   })
  //   this.layers = layer.layers.map(l => {
  //     let newLayer = cloneDeep(l)
  //     newLayer.source = `${layer.id}_${l.source}`
  //     return newLayer
  //   })
    
  // }

  onHover = {
    layers: this.layers
      .filter(d => d?.id?.indexOf('_case') === -1)
      .map((d) => d.id),
    callback: (layerId, features, lngLat) => {

      //console.log('hover callback')
      let feature = features[0];
      // console.log('testing feature', feature)

      let data = [feature.id, layerId, (features[0] || {}).properties];

      return data;
    },
    Component: HoverComp,
    // Component: ({ data, layer }) => { 
    //   if(!layer.props.hover) return
    //   return (
    //     <div className='p-2 bg-white'>
    //       <pre>{JSON.stringify(data,null,3)}</pre>
    //     </div>
    //   )
    // },
    isPinnable: this.isPinnable || true
  };
  
  RenderComponent = ViewLayerRender;
}

export default ViewLayer;

const justifyClass = {
  left: 'justifyTextLeft',
  right: 'justifyTextRight',
  center: 'justifyTextCenter',
  full: { header: 'justifyTextLeft', value: 'justifyTextRight' }
};

const justifyLayoutClass = {
  left: 'justify-start text-left',
  right: 'justify-end text-right',
  center: 'justify-center text-center',
  full: { header: 'justify-start text-left', value: 'justify-end text-right' }
};

const caseClass = {
  '': '',
  capitalize: 'capitalize',
  uppercase: 'uppercase',
  lowercase: 'lowercase',
};

const toImportantClasses = (className = '') =>
  String(className)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.startsWith('!') ? token : `!${token}`)
    .join(' ');

const hasPaddingOverride = (hoverAttr = {}) =>
  [
    'cellPadding',
    'cellPaddingTop',
    'cellPaddingRight',
    'cellPaddingBottom',
    'cellPaddingLeft',
  ].some((key) => {
    const value = hoverAttr?.[key];
    return value !== undefined && value !== null && `${value}`.trim() !== '';
  });

const HOVER_GRID_COLUMNS = 2;

const normalizeHoverColumn = (column) => {
  if (typeof column === "string") {
    return {
      column_name: column,
      display_name: column,
      customName: "",
      formatFn: " ",
      justify: "right",
      headerJustify: "",
      headerCase: "",
      headerFontStyle: "",
      valueFontStyle: "",
      cellPadding: "",
      cellPaddingTop: "",
      cellPaddingRight: "",
      cellPaddingBottom: "",
      cellPaddingLeft: "",
      cellSpan: "",
      cellRowSpan: "",
    };
  }

  return {
    ...column,
    column_name: column?.column_name || column?.name || "",
    display_name: column?.display_name || column?.column_name || column?.name || "",
    customName: column?.customName || "",
    formatFn: column?.formatFn || " ",
    justify: column?.justify || "right",
    headerJustify: column?.headerJustify || "",
    headerCase: column?.headerCase || "",
    headerFontStyle: column?.headerFontStyle || "",
    valueFontStyle: column?.valueFontStyle || "",
    cellPadding: column?.cellPadding ?? "",
    cellPaddingTop: column?.cellPaddingTop ?? "",
    cellPaddingRight: column?.cellPaddingRight ?? "",
    cellPaddingBottom: column?.cellPaddingBottom ?? "",
    cellPaddingLeft: column?.cellPaddingLeft ?? "",
    cellSpan: column?.cellSpan ?? "",
    cellRowSpan: column?.cellRowSpan ?? "",
  };
};



/**
 * Default hover popup component used by the base Map layer runtime.
 *
 * This is separate from the provider/subscriber interaction system: it reads
 * the hovered feature id, fetches additional attribute data when needed, and
 * renders the configured hover attributes for the user-facing popup.
 */
const HoverComp = ({ data, layer }) => {
  if(!layer.props.hover) return
  const mapTheme = useMapTheme();
  const { theme: fullTheme = {} } = React.useContext(ThemeContext) || {};
  const textTheme = getComponentTheme(fullTheme, 'textSettings', 0) || {};
  const dataCardTheme = getComponentTheme(fullTheme, 'dataCard', 0) || {};
  const hoverFieldTheme = { ...textTheme, ...dataCardTheme };
  const { source_id, view_id } = layer?.props?.view_id ? layer.props : layer;
  const mctx = React.useContext(MapContext);
  const cctx = React.useContext(CMSContext);
  const ctx = mctx?.falcor ? mctx : cctx;

  const { pgEnv, falcor } = ctx;
  const falcorCache = falcor.getCache();
  const id = React.useMemo(() => get(data, "[0]", null), [data]);
  // console.log(source_id, view_id, id)
  const [attrInfo, setAttrInfo] = React.useState({});
  const rawHoverColumns = layer?.props?.['hover-columns'] || null;
  const hoverColumns = React.useMemo(() => (
    Array.isArray(rawHoverColumns) ? rawHoverColumns.map(normalizeHoverColumn) : rawHoverColumns
  ), [rawHoverColumns]);

  const joinedColumns = React.useMemo(() => {
    const joinConfig = layer?.props?.join || layer?.props?.["linked-data"];
    const tileColumns = Array.isArray(joinConfig?.tileColumns)
      ? joinConfig.tileColumns.filter(Boolean)
      : [];
    const queryColumns = Array.isArray(joinConfig?.query?.columns)
      ? joinConfig.query.columns.map((expr) => {
          const aliasMatch = String(expr).match(/\s+as\s+("?)([^"]+)\1\s*$/i);
          return aliasMatch?.[2] || String(expr).trim();
        }).filter(Boolean)
      : [];
    return Array.from(new Set([...tileColumns, ...queryColumns]));
  }, [layer]);

  useEffect(() => {
    if(source_id && falcor && pgEnv) {
      falcor.get([
          "uda", pgEnv, "sources", "byId", source_id, "metadata"
      ]);
    }
  }, [falcor, pgEnv, source_id]);

  const attributes = React.useMemo(() => {
    if (!hoverColumns) {
      let out = get(falcorCache, [
        "uda", pgEnv, "sources", "byId", source_id, "metadata", "value", "columns"
      ], [])
      if(out.length === 0) {
          out = get(falcorCache, [
            "uda", pgEnv, "sources", "byId", source_id, "metadata", "value"
          ], [])
        }
      return out
    }
    else {
      return hoverColumns;
    }

  }, [source_id, falcorCache, hoverColumns]);

  const metadata = React.useMemo(() => {
    let out = get(falcorCache, [
      "uda", pgEnv, "sources", "byId", source_id, "metadata", "value", "columns"
    ], [])
    if(out.length === 0) {
        out = get(falcorCache, [
          "uda", pgEnv, "sources", "byId", source_id, "metadata", "value"
        ], [])
      }
    return Array.isArray(out) ? out : []
  }, [source_id, falcorCache]);

  const requestedAttributes = React.useMemo(() => (
    (typeof attributes?.[0] === 'string'
      ? attributes
      : attributes.map(d => d.name || d.column_name))
      .filter(d => !['wkb_geometry'].includes(d))
  ), [attributes]);
  const requestedAttributesKey = React.useMemo(
    () => requestedAttributes.join('|'),
    [requestedAttributes]
  );

  const featureProps = React.useMemo(() => get(data, "[2]", {}), [data]);
  const featureBackedAttributes = React.useMemo(
    () => requestedAttributes.filter(
      (attribute) =>
        joinedColumns.includes(attribute) ||
        Object.prototype.hasOwnProperty.call(featureProps, attribute)
    ),
    [requestedAttributes, joinedColumns, featureProps]
  );
  const baseAttributes = React.useMemo(
    () => requestedAttributes.filter((attribute) => !featureBackedAttributes.includes(attribute)),
    [requestedAttributes, featureBackedAttributes]
  );
  const baseAttributesKey = React.useMemo(
    () => baseAttributes.join('|'),
    [baseAttributes]
  );

  const joinedAttrInfo = React.useMemo(() => {
    return featureBackedAttributes.reduce((acc, attribute) => {
      if (Object.prototype.hasOwnProperty.call(featureProps, attribute)) {
        acc[attribute] = featureProps[attribute];
      }
      return acc;
    }, {});
  }, [featureBackedAttributes, featureProps]);

  const joinMissingAttributes = React.useMemo(
    () => featureBackedAttributes.filter(
      (attribute) =>
        joinedColumns.includes(attribute) &&
        !Object.prototype.hasOwnProperty.call(featureProps, attribute)
    ),
    [featureBackedAttributes, joinedColumns, featureProps]
  );
  const joinMissingAttributesKey = React.useMemo(
    () => joinMissingAttributes.join('|'),
    [joinMissingAttributes]
  );

  /**
   * Keeps the hover popup hydrated with both base-table and join-backed
   * attributes. Base fields come from `dataById`, while missing join outputs
   * are resolved from the join source using the same join filters and key as
   * the rendered layer.
   */
  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const fetchAttrInfo = async () => {
      let nextAttrInfo = { ...joinedAttrInfo };

      if (baseAttributes.length) {
        const response = await falcor.get([
          "uda",
          pgEnv,
          "viewsById",
          view_id,
          "dataById",
          id,
          baseAttributes
        ]);

        if (cancelled) return;

        const baseOut = get(
          response,
          ["json", "uda", pgEnv, "viewsById", view_id, "dataById", ''+id],
          {}
        );

        nextAttrInfo = {
          ...baseOut,
          ...nextAttrInfo,
        };
      }

      const {
        joinConfig,
        requestAttributes,
        fieldToRequestAttribute,
      } = getJoinFieldLookup(layer?.props, joinMissingAttributes);

      if (
        joinMissingAttributes.length &&
        joinConfig?.enabled &&
        joinConfig?.source?.viewId &&
        joinConfig?.featureKeyColumn &&
        joinConfig?.joinColumn
      ) {
        let localJoinValue = nextAttrInfo?.[joinConfig.featureKeyColumn];

        if (!hasResolvedValue(localJoinValue)) {
          const localKeyResponse = await falcor.get([
            "uda",
            pgEnv,
            "viewsById",
            view_id,
            "dataById",
            id,
            [joinConfig.featureKeyColumn]
          ]);

          if (cancelled) return;

          const localKeyOut = get(
            localKeyResponse,
            ["json", "uda", pgEnv, "viewsById", view_id, "dataById", ''+id],
            {}
          );

          nextAttrInfo = {
            ...localKeyOut,
            ...nextAttrInfo,
          };
          localJoinValue = localKeyOut?.[joinConfig.featureKeyColumn];
        }

        if (hasResolvedValue(localJoinValue) && requestAttributes.length) {
          const joinQuery = joinConfig.query || {};
          const joinFilterOptions = buildJoinFilterOptions(joinQuery);
          let joinOptions = {
            ...joinFilterOptions,
            groupBy: Array.isArray(joinQuery.groupBy) ? joinQuery.groupBy : [],
          };

          if (joinFilterOptions?.filterGroups) {
            joinOptions = {
              ...joinOptions,
              filterGroups: {
                op: "AND",
                groups: [
                  ...(joinFilterOptions.filterGroups.groups || []),
                  {
                    op: "filter",
                    col: joinConfig.joinColumn,
                    value: [localJoinValue],
                  },
                ],
              },
            };
          } else {
            joinOptions = {
              ...joinOptions,
              filter: {
                ...(joinFilterOptions?.filter || {}),
                [joinConfig.joinColumn]: [localJoinValue],
              },
            };
          }

          const joinOptionsKey = JSON.stringify(joinOptions);
          const joinResponse = await falcor.get([
            "uda",
            pgEnv,
            "viewsById",
            joinConfig.source.viewId,
            "options",
            joinOptionsKey,
            "dataByIndex",
            { from: 0, to: 0 },
            requestAttributes
          ]);

          if (cancelled) return;

          const joinRow = get(
            joinResponse,
            [
              "json",
              "uda",
              pgEnv,
              "viewsById",
              joinConfig.source.viewId,
              "options",
              joinOptionsKey,
              "dataByIndex",
              0
            ],
            {}
          );

          const joinResolvedProperties = joinMissingAttributes.reduce((acc, fieldName) => {
            const requestAttribute = fieldToRequestAttribute[fieldName];
            if (Object.prototype.hasOwnProperty.call(joinRow || {}, requestAttribute)) {
              acc[fieldName] = joinRow[requestAttribute];
            }
            return acc;
          }, {});

          nextAttrInfo = {
            ...joinResolvedProperties,
            ...nextAttrInfo,
          };
        }
      }

      setAttrInfo(nextAttrInfo);
    };

    fetchAttrInfo();

    return () => {
      cancelled = true;
    };
  }, [
    falcor,
    pgEnv,
    view_id,
    id,
    requestedAttributesKey,
    joinedAttrInfo,
    baseAttributesKey,
    joinMissingAttributesKey,
    layer
  ]);

  const getFormattedValue = React.useCallback((hoverAttr, rawValue) => {
    if (rawValue === "null" || rawValue === null || rawValue === undefined) {
      return "";
    }

    const metadataAttr = metadata.find(
      (attr) =>
        attr.name === (hoverAttr.name || hoverAttr.column_name) ||
        attr.column_name === (hoverAttr.name || hoverAttr.column_name)
    );
    const resolvedValue = get(
      JSON.parse(metadataAttr?.meta_lookup || "{}"),
      rawValue,
      rawValue
    );
    const formatFn = hoverAttr?.formatFn;

    if (!formatFn || formatFn === " ") {
      return resolvedValue;
    }

    if (formatFn === "title") {
      return typeof resolvedValue === "string" ? resolvedValue : String(resolvedValue);
    }

    const formatter = formatFunctions[formatFn];
    if (typeof formatter !== "function") {
      return resolvedValue;
    }

    try {
      return formatter(resolvedValue);
    } catch (e) {
      return resolvedValue;
    }
  }, [metadata]);

  const getFieldStyle = React.useCallback((hoverAttr) => {
    const hasExplicitColSpan =
      hoverAttr?.cellSpan !== undefined &&
      hoverAttr?.cellSpan !== null &&
      `${hoverAttr.cellSpan}`.trim() !== '';
    const span = hasExplicitColSpan
      ? Math.max(1, Math.min(HOVER_GRID_COLUMNS, +hoverAttr?.cellSpan || 1))
      : HOVER_GRID_COLUMNS;
    const rowSpan = +hoverAttr?.cellRowSpan || undefined;
    const padOverride = (key, fallback) => {
      const value = hoverAttr?.[key];
      if (value === undefined || value === null || value === '') return fallback;
      return +value;
    };

    return {
      gridColumn: `span ${span}`,
      ...(rowSpan ? { gridRow: `span ${rowSpan}` } : {}),
      height: '100%',
      minHeight: '100%',
      alignSelf: 'stretch',
      padding: padOverride('cellPadding', undefined),
      paddingTop: padOverride('cellPaddingTop', undefined),
      paddingRight: padOverride('cellPaddingRight', undefined),
      paddingBottom: padOverride('cellPaddingBottom', undefined),
      paddingLeft: padOverride('cellPaddingLeft', undefined),
    };
  }, []);

  return (
    <div
      className={mapTheme.hover.panel}
      style={{ width: "300px", minWidth: "300px", maxWidth: "300px" }}
    >
      <div className={mapTheme.hover.title}>
        {layer?.name || ''}
      </div>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${HOVER_GRID_COLUMNS}, minmax(0, 1fr))`,
          gridAutoRows: "minmax(0, auto)",
        }}
      >
      {Object.keys(attrInfo).length === 0 && attributes.length !== 0 ? `Fetching Attributes ${id}` : ""}
      {Object.keys(attrInfo)
        .filter((k) => typeof attrInfo[k] !== "object")
        .sort((a,b) =>{
          const aIndex = (hoverColumns?.findIndex(column => column.column_name === a) || 0);
          const bIndex = (hoverColumns?.findIndex(column => column.column_name === b) || 0);
          return aIndex - bIndex;
        })
        .map((k, i) => {
          const hoverAttr = normalizeHoverColumn(attributes.find(attr => attr.name === k || attr.column_name === k) || {});

          if (!(hoverAttr.name || hoverAttr.display_name || hoverAttr.column_name)) {
            return <span key={i}></span>;
          }
          else {
            const formattedValue = getFormattedValue(hoverAttr, attrInfo?.[k]);
            const headerJustifyKey = hoverAttr.headerJustify || 'left';
            const valueJustifyKey = hoverAttr.justify || 'right';
            const headerTextJustifyClass = justifyClass[headerJustifyKey]?.header || justifyClass[headerJustifyKey] || '';
            const valueTextJustifyClass = justifyClass[valueJustifyKey]?.value || justifyClass[valueJustifyKey] || '';
            const headerLayoutJustifyClass = justifyLayoutClass[headerJustifyKey]?.header || justifyLayoutClass[headerJustifyKey] || '';
            const valueLayoutJustifyClass = justifyLayoutClass[valueJustifyKey]?.value || justifyLayoutClass[valueJustifyKey] || '';
            const headerCase = caseClass[hoverAttr.headerCase || ''] || '';
            const headerFontClass = toImportantClasses(hoverFieldTheme[hoverAttr.headerFontStyle || 'textXS'] || '');
            const valueFontClass = hoverAttr.valueFontStyle && hoverAttr.valueFontStyle !== 'button'
              ? toImportantClasses(hoverFieldTheme[hoverAttr.valueFontStyle] || '')
              : '';
            const paddingResetClass = hasPaddingOverride(hoverAttr) ? '!p-0' : '';
            return (
              <div
                className={`${mapTheme.hover.row} !grid w-full items-start gap-x-3`}
                key={i}
                style={{
                  ...getFieldStyle(hoverAttr),
                  gridTemplateColumns: "minmax(0, 1fr) minmax(0, auto)",
                }}
              >
                <div className={`${mapTheme.hover.label} ${paddingResetClass} !block !min-w-0 !flex-none truncate ${headerLayoutJustifyClass} ${hoverFieldTheme[headerTextJustifyClass] || ''} ${headerCase} ${headerFontClass} ${hoverAttr.formatFn === "title" ? "capitalize" : ""}`}>{hoverAttr.customName || hoverAttr.display_name || hoverAttr.name || hoverAttr.column_name }</div>
                <div className={`${mapTheme.hover.value} ${paddingResetClass} !block !min-w-0 !flex-none whitespace-nowrap ${valueLayoutJustifyClass} ${hoverFieldTheme[valueTextJustifyClass] || ''} ${valueFontClass} ${hoverAttr.formatFn === "title" ? "capitalize" : ""}`}>
                  {formattedValue}
                </div>
              </div>
            );
          }
        })}
      </div>
    </div>
  );
};
