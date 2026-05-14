import React, { useEffect, useContext, useRef } from "react"
import { get, isEqual, cloneDeep } from "lodash-es"
import { AvlLayer } from "../../../../../../../ui/components/map"
import { usePrevious } from './utils.js'
import { MapContext } from "./"
import { CMSContext } from '../../../../../context'
import { PageContext } from '../../../../../context'
import { normalizeLayerClickFilterConfig } from '../../../../../../mapeditor/MapEditor/stateUtils';
import bbox from '@turf/bbox';
import { featureCollection } from '@turf/helpers';
function onlyUnique(value, index, array) {
  return array.indexOf(value) === index;
}

const getLayerInteractionIds = (candidateLayerProps = {}) =>
  (candidateLayerProps?.layers || [])
    .map((mapLayer) => mapLayer?.id)
    .filter((layerId) => layerId && !layerId.includes("_case"));

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

const getSubscriberHighlightLayerId = (layerId, mode) =>
  `${layerId}__subscriber_${mode}_highlight`;

const getSubscriberHighlightSourceId = (layerId, mode) =>
  `${layerId}__subscriber_${mode}_highlight_source`;

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

  (layerProps?.layers || []).forEach((mapLayer) => {
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
  const didDynamicFilterChange = layerProps?.['dynamic-filters'] !== prevLayerProps?.['dynamic-filters'];

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
                    [">=", ["to-string", filterColumnClause], ["to-string", filterValue?.[0]]],
                    ["<=", ["to-string", filterColumnClause], ["to-string", filterValue?.[1]]],
                  ];
                }
                else {
                  //attempt to parseFloat the value from the user. If NaN, we are comparing strings
                  if(isNaN(parseFloat(filterValue))){
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
              //Determine if this is a numeric or string field
              if(isNaN(parseFloat(filterValue))){
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

    if (
      missingFields.length &&
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
          missingFields
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

  // Coordinate click-filter handling at the map level instead of per layer.
  // This effect:
  // 1. collects every layer that has click-filter enabled and at least one
  //    mapping using URL params,
  // 2. attaches a single shared map click handler from one owner layer,
  // 3. gathers matching feature values across all eligible layers for one click,
  // 4. resolves any missing mapped fields from Falcor when needed, and
  // 5. sends one merged filter update so later layer handlers do not overwrite
  //    earlier ones from the same click.
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

    const updateFilterValues = (nextFilterEntries) => {
      const existingFilters = Array.isArray(pageState?.filters) ? pageState.filters : [];
      const nextFilters = existingFilters
        .filter((filter) => !nextFilterEntries.some((entry) => entry.searchKey === filter?.searchKey))
        .concat(
          nextFilterEntries.map((entry) => {
            const matchingFilter = existingFilters.find(
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

    const handleMapClick = async (event) => {
      const features = maplibreMap.queryRenderedFeatures(event.point, {
        layers: clickableLayerIds,
      });

      if (!features?.length) return;

      const nextFilterEntries = [];

      for (const clickableLayerConfig of clickableLayerConfigs) {
        const feature = features.find((candidateFeature) =>
          clickableLayerConfig.clickableLayerIds.includes(candidateFeature?.layer?.id)
        );

        if (!feature) continue;

        const resolvedProperties = await resolveFeatureProperties({
          feature,
          candidateLayerProps: clickableLayerConfig.layerProps,
          fieldNames: clickableLayerConfig.activeMappings.map((mapping) => mapping.field)
        });

        clickableLayerConfig.activeMappings.forEach((mapping) => {
          const value = resolvedProperties?.[mapping.field];
          if (value !== undefined && value !== null && value !== "") {
            nextFilterEntries.push({
              searchKey: mapping.variable,
              value,
              useSearchParams: mapping.useSearchParams,
            });
          }
        });
      }

      if (typeof setActionParam === "function") {
        for (const feature of features) {
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
    pageState?.filters,
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

    const applyHighlight = async (mode, subscriberCfg, subscribedValue) => {
      (layerProps?.layers || []).forEach((mapLayer) => {
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

      for (const mapLayer of (layerProps?.layers || [])) {
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
        maplibreMap.addSource(highlightSourceId, {
          type: "geojson",
          data: featureCollection(matchedFeatures),
        });

        console.log("[MapSubscriber] add highlight layer", {
          mode,
          baseLayerId: mapLayer.id,
          highlightLayerId: highlightLayer.id,
          highlightSourceId,
          field: subscriberCfg.args.field,
          subscribedValue,
          matchCount: matchedFeatures.length,
        });

        maplibreMap.addLayer(highlightLayer);
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

const getLayerTileUrl = (tileBase, layerProps) => {
  let newTileUrl = `${tileBase}`;


  const layerHasFilter = (layerProps?.filter && Object.keys(layerProps?.filter)?.length > 0) 

  const dataFilterCols =
    layerProps?.filterGroupEnabled && layerProps?.["filter-group"]?.length > 0
      ? layerProps?.["filter-group"]
          ?.map((filterObj) => filterObj.column_name)
      : [layerProps?.["data-column"]];
  
  const dynamicCols = layerProps?.["dynamic-filters"]
    ?.filter((dFilter) => dFilter?.values?.length > 0)
    .map((dFilter) => dFilter.column_name); 
  const colsToAppend = dataFilterCols.concat(dynamicCols).filter(onlyUnique).filter(col => !!col).join(",")

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
      const splitUrl = newTileUrl.split("?cols=");
      if (splitUrl[1].length !== 0) {
        newTileUrl += ",";
      }
      Object.keys(layerProps.filter).forEach((filterCol, i) => {
        //TODO actually handle calculated columns
        if(filterCol.includes("rpad(substring(prop_class, 1, 1), 3, '0')")){
          newTileUrl += `prop_class`;
        }
        else {
          newTileUrl += `${filterCol}`;
        }

        if (i < Object.keys(layerProps.filter).length - 1) {
          newTileUrl += ",";
        }
      });
    }
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




const HoverComp = ({ data, layer }) => {
  if(!layer.props.hover) return
  const { source_id, view_id } = layer?.props?.view_id ? layer.props : layer;
  const mctx = React.useContext(MapContext);
  const cctx = React.useContext(CMSContext);
  const ctx = mctx?.falcor ? mctx : cctx;

  const { pgEnv, falcor } = ctx;
  const falcorCache = falcor.getCache();
  const id = React.useMemo(() => get(data, "[0]", null), [data]);
  // console.log(source_id, view_id, id)
  const [attrInfo, setAttrInfo] = React.useState({});
  const hoverColumns = React.useMemo(() => {
    return layer.props['hover-columns'];
  }, [layer]);

  useEffect(() => {
    if(source_id) {
      falcor.get([
          "uda", pgEnv, "sources", "byId", source_id, "metadata"
      ]);
    }

  }, [source_id, hoverColumns]);

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

  let getAttributes = (typeof attributes?.[0] === 'string' ?
    attributes : attributes.map(d => d.name || d.column_name)).filter(d => !['wkb_geometry'].includes(d))

  React.useEffect(() => {
    falcor.get([
      "uda",
      pgEnv,
      "viewsById",
      view_id,
      "dataById",
      id,
      getAttributes
    ]).then(d => {
      let out = get(
          d,
          [
            "json",
            "uda", pgEnv, "viewsById", view_id, "dataById", ''+id
          ],
          []
        );
      setAttrInfo(out)
    });
  }, [falcor, pgEnv, view_id, id, attributes]);

  return (
    <div className="bg-white p-4 max-h-64 max-w-lg min-w-[300px] scrollbar-xs overflow-y-scroll">
      <div className="font-medium pb-1 w-full border-b ">
        {layer?.name || ''}
      </div>
      {Object.keys(attrInfo).length === 0 && attributes.length !== 0 ? `Fetching Attributes ${id}` : ""}
      {Object.keys(attrInfo)
        .filter((k) => typeof attrInfo[k] !== "object")
        .sort((a,b) =>{
          const aIndex = (hoverColumns?.findIndex(column => column.column_name === a) || 0);
          const bIndex = (hoverColumns?.findIndex(column => column.column_name === b) || 0);
          return aIndex - bIndex;
        })
        .map((k, i) => {
          const hoverAttr = attributes.find(attr => attr.name === k || attr.column_name === k) || {};

          const metadataAttr = metadata.find(attr => attr.name === k || attr.column_name === k) || {};
          const columnMetadata = JSON.parse(metadataAttr?.meta_lookup || "{}");
          if ( !(hoverAttr.name || hoverAttr.display_name) ) {
            return <span key={i}></span>;
          }
          else {
            return (
              <div className="flex border-b pt-1" key={i}>
                <div className="flex-1 font-medium text-xs text-slate-400 pl-1">{hoverAttr.display_name || hoverAttr.name }</div>
                <div className="flex-1 text-right text-sm font-thin pl-4 pr-1">
                  {attrInfo?.[k] !== "null" ? get(columnMetadata, attrInfo?.[k],attrInfo?.[k]) : ""}
                </div>
              </div>
            );
          }
        })}
    </div>
  );
};
