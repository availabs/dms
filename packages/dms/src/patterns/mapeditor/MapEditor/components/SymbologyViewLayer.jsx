import React, { useEffect } from "react"
import {get, isEqual, cloneDeep} from 'lodash-es'
import { AvlLayer } from "../../../../ui/components/map"
import useMapTheme from "../../../../ui/components/map/useMapTheme"
import { ThemeContext, getComponentTheme } from "../../../../ui/useTheme"
import { usePrevious } from './LayerManager/utils'
import { formatFunctions } from "../../../page/components/sections/components/dataWrapper/utils/utils.jsx"

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
        } else {
          console.log("cant add", maplibreMap.getSource(newSource.id));
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
        } else {
          console.log('cant add',maplibreMap.getSource(newSource.id))
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

const getLayerTileUrl = (tileBase, layerProps) => {
  let newTileUrl = tileBase;


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
      const splitUrl = newTileUrl.split("?cols=");
      //console.log("new split url::", splitUrl)
      //If url already contains stuff after the `cols`, we need a comma before we add more columns
      //TODO 10/15 RYAN TEST THIS GOD PLEASE
      //major change
      if (splitUrl[1].length !== 0) {
        newTileUrl += ",";
      }

      //loop over filter columns. Append the column, then add a `comma` if it isn't the last one
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




const HoverComp = ({ data, layer }) => {
  const mapTheme = useMapTheme();
  const { theme: fullTheme = {} } = React.useContext(ThemeContext) || {};
  const textTheme = getComponentTheme(fullTheme, 'textSettings', 0) || {};
  const dataCardTheme = getComponentTheme(fullTheme, 'dataCard', 0) || {};
  const hoverFieldTheme = { ...textTheme, ...dataCardTheme };

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
  // console.log(source_id, view_id, id)

  const hoverColumns = React.useMemo(() => {
    return (layer.props['hover-columns'] || []).map(normalizeHoverColumn);
  }, [layer]);

  useEffect(() => {
    if (source_id) {
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

  let getAttributes = (
    typeof attributes?.[0] === 'string' ?
      attributes :
      (attributes && attributes.length ? attributes : []).map(d => d.name || d.column_name)
  ).filter(d => !['wkb_geometry'].includes(d));

// console.log("HoverComp::getAttributes", getAttributes)

// ####################################################
// ####################################################
  
// NEEDS DMS SERVER FIX
// dataById queries for column "id"

// ####################################################
// ####################################################
  React.useEffect(() => {
    falcor.get([
      "uda",
      pgEnv,
      "viewsById",
      view_id,
      "dataById",
      id,
      getAttributes
    ])
    .then(d => {
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

  const getFormattedValue = React.useCallback((hoverAttr, rawValue) => {
    if (rawValue === "null" || rawValue === null || rawValue === undefined) {
      return "";
    }

    const resolvedValue = get(JSON.parse(metadata.find(attr => attr.name === (hoverAttr.name || hoverAttr.column_name) || attr.column_name === (hoverAttr.name || hoverAttr.column_name))?.meta_lookup || "{}"), rawValue, rawValue);
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
          const hoverAttr = normalizeHoverColumn((attributes || []).find(attr => attr.name === k || attr.column_name === k) || {});

          if ( !(hoverAttr.name || hoverAttr.display_name) ) {
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
