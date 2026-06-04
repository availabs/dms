import React, { useEffect } from "react"
import {get, isEqual, cloneDeep} from 'lodash-es'
import { AvlLayer } from "../../../../ui/components/map"
import { usePrevious } from './LayerManager/utils'

import { MapEditorContext } from "../../context"

function onlyUnique(value, index, array) {
  return array.indexOf(value) === index;
}
const ViewLayerRender = (props) => {
  const {
  maplibreMap,
  layer,
  layerProps,
  allLayerProps
} = props;

  // const mctx = useContext(MapContext);
  // const { state, setState } = mctx ? mctx : {state: {}, setState:() => {}};
  // ------------
  // avl-map doesn't always automatically remove layers on unmount
  // so do it here
  // ---------------
  useEffect(() => {
    return () => {
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


  // to detect changes in layerprops
  const prevLayerProps = usePrevious(layerProps);
  // - On layerProps change
  const doesSourceExistOnMap = maplibreMap.getSource(layerProps?.sources?.[0]?.id);

  useEffect(() => {
    // ------------------------------------------------------
    // Change Source to Update feature properties dynamically
    // ------------------------------------------------------
    const didFilterGroupColumnsChange =
      layerProps.filterGroupEnabled &&
      !isEqual(layerProps?.["filter-group"], prevLayerProps?.["filter-group"]);

    const didDataColumnChange =
      !layerProps.filterGroupEnabled &&
      layerProps?.["data-column"] !== prevLayerProps?.["data-column"];

    const didFilterChange = layerProps?.filter !== prevLayerProps?.["filter"];
    const didDynamicFilterChange = layerProps?.['dynamic-filters'] !== prevLayerProps?.['dynamic-filters'];

    if (
      didFilterGroupColumnsChange ||
      didDataColumnChange ||
      didFilterChange ||
      didDynamicFilterChange
    ) {
      let newSource = cloneDeep(layerProps.sources?.[0]);
      let tileBase = newSource?.source?.tiles?.[0];
      if (newSource) {
        if (tileBase) {
          newSource.source.tiles = [getLayerTileUrl(tileBase, layerProps)];
        } else if(newSource?.source?.url) {
          newSource.source.url = getLayerTileUrl(newSource.source.url, layerProps);
        }
        layerProps?.layers?.forEach((l) => {
          if (maplibreMap.getLayer(l?.id)) {
            maplibreMap.removeLayer(l?.id);
          }
        });

        if (maplibreMap.getSource(newSource.id)) {
          maplibreMap.removeSource(newSource.id);
        }
        if (!maplibreMap.getSource(newSource.id)) {
          maplibreMap.addSource(newSource.id, newSource.source);
        }

        let beneathLayer = Object.values(allLayerProps).find(
          (l) => l?.order === layerProps.order + 1
        );
        layerProps?.layers?.forEach((l) => {
          if (maplibreMap.getLayer(beneathLayer?.id)) {
            maplibreMap.addLayer(l, beneathLayer?.id);
          } else {
            maplibreMap.addLayer(l);
          }
        });
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
              //console.log({filterColumnName})
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
              //Determine if this is a numeric or string field
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
        maplibreMap.setFilter(l.id, [layerProps.filterMode || 'all', ...mapLayerFilter, ...dynamicMapLayerFilters]);
      }
    });
  }, [doesSourceExistOnMap, layerProps]);

  useEffect(() => {
    if (maplibreMap && allLayerProps && allLayerProps?.zoomToFit?.length > 0){
      maplibreMap.fitBounds(allLayerProps.zoomToFit, {
        padding: { top: 20, bottom: 20, left: 20, right: 20 },
        duration: 400
      });
    }
  }, [maplibreMap, allLayerProps?.zoomToFit]);
  //TODO maybe use `zoomToFit` for both of these zooms?
  useEffect(() => {
    if (maplibreMap && allLayerProps && allLayerProps?.zoomToFilterBounds?.length > 0 &&  allLayerProps?.zoomToFilterBounds[0] !== null){
      maplibreMap.fitBounds(allLayerProps.zoomToFilterBounds, {
        padding: { top: 150, bottom: 150, left: 150, right: 150 },
        duration: 400
      });
    }
  }, [maplibreMap, allLayerProps?.zoomToFilterBounds]);
}

/**
 * Returns the join-authored tile columns that should be treated as feature
 * properties on the rendered MapEditor layer.
 */
const getJoinTileColumns = (layerProps) =>
  Array.isArray((layerProps?.join || layerProps?.["linked-data"])?.tileColumns)
    ? (layerProps.join || layerProps["linked-data"]).tileColumns.filter(Boolean)
    : [];

/**
 * Normalizes the saved join config into one runtime shape so MapEditor can
 * read both current and legacy join key paths consistently.
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
 * by tile joins and on-demand join-side hover field resolution.
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
 * tile URLs rendered by the MapEditor map preview.
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
 * Shared guard for whether a value should count as "already resolved" while
 * still treating `0` and `false` as valid interaction values.
 */
const hasResolvedValue = (value) =>
  !(value === undefined || value === null || value === "");

/**
 * Splits requested hover fields into base-table fields vs join-owned outputs
 * and prepares the expression lookup needed to fetch joined values from the
 * correct source view.
 */
const getJoinFieldLookup = (layerProps, fieldNames = []) => {
  const joinConfig = normalizeJoinRuntimeConfig(layerProps);
  if (!joinConfig) {
    return {
      joinConfig: null,
      joinFields: [],
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
    fieldToRequestAttribute,
    requestAttributes,
  };
};

const getLayerTileUrl = (tileBase, layerProps) => {
  let newTileUrl = tileBase;
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

  /**
   * colsToAppend contains all the data columns used for:
   * filter groups and/or data-column (filter group allows user to change the data-column)
   * dynamic columns
   *
   * This conditional modifies `newTileUrl` to include those columns
   */
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

    //If we added a column already to the URL, and we still have to process the filter columns, add a comma
    //This adds a trailing comma if we KNOW we are going to add another column after
    //TODO 10/15 RYAN TEST THIS GOD PLEASE
    //I COMMENTED OUT
    // if (colsToAppend && newTileUrl.includes(colsToAppend) && layerHasFilter) {
    //   console.log("inside this thicc conditional")
    //   newTileUrl += ",";
    // }

    /**
     * this conditional modifies `newTileUrl` with any columns used
     */
    if (layerHasFilter) {
      const filterColumns = Object.keys(layerProps.filter).filter((filterCol) => !joinTileColumnSet.has(filterCol));
      const splitUrl = newTileUrl.split("?cols=");
      //console.log("new split url::", splitUrl)
      //If url already contains stuff after the `cols`, we need a comma before we add more columns
      //TODO 10/15 RYAN TEST THIS GOD PLEASE
      //major change
      if (splitUrl[1].length !== 0 && filterColumns.length) {
        newTileUrl += ",";
      }

      //loop over filter columns. Append the column, then add a `comma` if it isn't the last one
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




/**
 * Default hover popup for the MapEditor map preview.
 *
 * It resolves the configured hover fields from feature props when available,
 * falls back to base `dataById` reads for source-backed fields, and resolves
 * missing join-backed fields from the join source using the live join config.
 */
const HoverComp = ({ data, layer }) => {

  if(!layer.props.hover) return
  const { source_id, view_id } = layer?.props?.view_id ? layer.props : layer;
  // const dctx = React.useContext(DamaContext);
  // const cctx = React.useContext(CMSContext);
  // const ctx = dctx?.falcor ? dctx : cctx;
  // const [attributes, setAttributes] = React.useState();
  // const [metadata, setMetadata] = React.useState([]);
  const [attrInfo, setAttrInfo] = React.useState({});
  const { pgEnv, useFalcor, user } = React.useContext(MapEditorContext);
  const { falcor, falcorCache } = useFalcor();
  //console.log({dctx, cctx})

  // const falcorCache = falcor.getCache();
  const id = React.useMemo(() => get(data, "[0]", null), [data]);
  const featureProps = React.useMemo(() => get(data, "[2]", {}), [data]);
  // console.log(source_id, view_id, id)

  const hoverColumns = React.useMemo(() => {
    return layer.props['hover-columns'];
  }, [layer]);

  const joinedTileColumns = React.useMemo(() => {
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
    if (source_id && falcor && pgEnv) {
      falcor.get([
          "uda", pgEnv, "sources", "byId", source_id, "metadata"
      ]);
    }
  }, [source_id, hoverColumns, falcor, pgEnv]);

  const attributes = React.useMemo(() => {
    if (!hoverColumns) {
      let out = get(falcorCache, [
        "uda", pgEnv, "sources", "byId", source_id, "metadata", "value", "columns"
      ], [])
      if (out.length === 0) {
        out = get(falcorCache, [
          "uda", pgEnv, "sources", "byId", source_id, "metadata", "value"
        ], [])
      }
      return out;
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
    (
      typeof attributes?.[0] === 'string'
        ? attributes
        : (attributes && attributes.length ? attributes : []).map(d => d.name || d.column_name)
    ).filter(d => !['wkb_geometry'].includes(d))
  ), [attributes]);

  const featureBackedAttributes = React.useMemo(
    () => requestedAttributes.filter(
      (attribute) =>
        joinedTileColumns.includes(attribute) ||
        Object.prototype.hasOwnProperty.call(featureProps || {}, attribute)
    ),
    [requestedAttributes, joinedTileColumns, featureProps]
  );
  const baseAttributes = React.useMemo(
    () => requestedAttributes.filter((attribute) => !featureBackedAttributes.includes(attribute)),
    [requestedAttributes, featureBackedAttributes]
  );
  const joinedAttrInfo = React.useMemo(() => featureBackedAttributes.reduce((acc, attribute) => {
    if (Object.prototype.hasOwnProperty.call(featureProps || {}, attribute)) {
      acc[attribute] = featureProps[attribute];
    }
    return acc;
  }, {}), [featureBackedAttributes, featureProps]);

  const joinMissingAttributes = React.useMemo(
    () => featureBackedAttributes.filter(
      (attribute) =>
        joinedTileColumns.includes(attribute) &&
        !Object.prototype.hasOwnProperty.call(featureProps || {}, attribute)
    ),
    [featureBackedAttributes, joinedTileColumns, featureProps]
  );

// console.log("HoverComp::requestedAttributes", requestedAttributes)

// ####################################################
// ####################################################
  
// NEEDS DMS SERVER FIX
// dataById queries for column "id"

  // ####################################################
  // ####################################################
  /**
   * Hydrates the hover popup with both base-table and join-backed fields so
   * preview hover mirrors the same joined feature behavior as the saved map.
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

        const out = get(
          response,
          [
            "json",
            "uda", pgEnv, "viewsById", view_id, "dataById", ''+id
          ],
          {}
        );
        nextAttrInfo = {
          ...out,
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
            [
              "json",
              "uda", pgEnv, "viewsById", view_id, "dataById", ''+id
            ],
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

      setAttrInfo((prev) => isEqual(prev, nextAttrInfo) ? prev : nextAttrInfo);
    };

    fetchAttrInfo();

    return () => {
      cancelled = true;
    };
  }, [falcor, pgEnv, view_id, id, joinedAttrInfo, baseAttributes, joinMissingAttributes, layer]);

  return (
    <div className="bg-white p-4 max-h-64 max-w-lg min-w-[300px] scrollbar-xs overflow-y-scroll">
      <div className="font-medium pb-1 w-full border-b ">
        {layer?.name || ''}
      </div>
      {Object.keys(attrInfo).length === 0 && attributes?.length !== 0 ? `Fetching Attributes ${id}` : ""}
      {Object.keys(attrInfo)
        .filter((k) => typeof attrInfo[k] !== "object")
        .sort((a,b) =>{
          const aIndex = (hoverColumns?.findIndex(column => column.column_name === a) || 0);
          const bIndex = (hoverColumns?.findIndex(column => column.column_name === b) || 0);
          return aIndex - bIndex;
        })
        .map((k, i) => {
          //console.log({k})
          const hoverAttr = (attributes || []).find(attr => attr.name === k || attr.column_name === k) || {};

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
