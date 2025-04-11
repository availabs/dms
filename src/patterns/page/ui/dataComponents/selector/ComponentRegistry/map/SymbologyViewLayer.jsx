import React, { useEffect, useContext, useRef } from "react"
import get from "lodash/get"
import isEqual from "lodash/isEqual"
import cloneDeep from "lodash/cloneDeep"
import { AvlLayer } from "~/modules/avl-map-2/src"
import { usePrevious } from './utils'
import { MapContext } from "./MapComponent"
import {CMSContext} from "../../../../../siteConfig";
function onlyUnique(value, index, array) {
  return array.indexOf(value) === index;
}
const ViewLayerRender = ({
  maplibreMap,
  layer,
  layerProps,
  allLayerProps
}) => {
  const mctx = useContext(MapContext);
  const { state, setState } = mctx ? mctx : {state: {}, setState:() => {}};
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

    if(didFilterGroupColumnsChange || didDataColumnChange || didFilterChange || didDynamicFilterChange) {
      if(maplibreMap.getSource(layerProps?.sources?.[0]?.id)){
        let newSource = cloneDeep(layerProps.sources?.[0])
        let tileBase = newSource.source.tiles?.[0];

        if(tileBase){
          newSource.source.tiles = [getLayerTileUrl(tileBase, layerProps)];
        }

        layerProps?.layers?.forEach(l => {
          if(maplibreMap.getLayer(l?.id) && maplibreMap.getLayer(l?.id)){
            maplibreMap.removeLayer(l?.id) 
          }
        })

        maplibreMap.removeSource(newSource.id)
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

                if(filterOperator === 'between') {
                  mapFilter = [
                    "all",
                    [">=", ["to-string", filterColumnClause], ["to-string", filterValue?.[0]]],
                    ["<=", ["to-string", filterColumnClause], ["to-string", filterValue?.[1]]],
                  ];
                }
                else {
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
                      ["to-string", filterColumnClause],
                      ["to-string", filterValue]
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
              const filterColumnClause = ["get", dFilter.column_name];
              //"in" Allows for `or`, i.e. ogc_fid = 123 or 456
              mapFilter = ["in", filterColumnClause, ["literal", filterValue]];
              return mapFilter;
            });
        }
        maplibreMap.setFilter(l.id, ["all", ...mapLayerFilter, ...dynamicMapLayerFilters]);
      }
    });
  }, [layerProps]);

  useEffect(() => {
    if (maplibreMap && allLayerProps && allLayerProps?.zoomToFit?.length > 0){
      maplibreMap.fitBounds(allLayerProps.zoomToFit, {
        duration: 400
      });
    }
  }, [maplibreMap, allLayerProps?.zoomToFit]);
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

    if (colsToAppend && newTileUrl.includes(colsToAppend) && layerHasFilter) {
      newTileUrl += ",";
    }

    if (layerHasFilter) {
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
  const { source_id, view_id } = layer;
  const { pgEnv, falcor, falcorCache } = React.useContext(CMSContext);
  const id = React.useMemo(() => get(data, "[0]", null), [data]);
  // console.log(source_id, view_id, id)

  const hoverColumns = React.useMemo(() => {
    return layer.props['hover-columns'];
  }, [layer]);

  useEffect(() => {
    if(source_id) {
      falcor.get([
          "dama", pgEnv, "sources", "byId", source_id, "attributes", "metadata"
      ]);
    }
    
  }, [source_id, hoverColumns]);



  // useEffect(() => {
  //   if(view_id) {
  //     falcor.get([
  //        "dama", pgEnv, "viewsbyId", view_id, "databyId", ''+id
  //     ]).then(d => console.log('getting', [ "dama", pgEnv, "viewsbyId", view_id, "databyId", id], d))
  //   }
  // },[pgEnv,view_id,id])

  const attributes = React.useMemo(() => {
    if (!hoverColumns) {
      let out = get(falcorCache, [
        "dama", pgEnv, "sources", "byId", source_id, "attributes", "metadata", "value", "columns"
      ], [])
      if(out.length === 0) {
          out = get(falcorCache, [
            "dama", pgEnv, "sources", "byId", source_id, "attributes", "metadata", "value"
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
      "dama", pgEnv, "sources", "byId", source_id, "attributes", "metadata", "value", "columns"
    ], [])
    if(out.length === 0) {
        out = get(falcorCache, [
          "dama", pgEnv, "sources", "byId", source_id, "attributes", "metadata", "value"
        ], [])
      }
    return out
  }, [source_id, falcorCache]);

  let getAttributes = (typeof attributes?.[0] === 'string' ?
    attributes : attributes.map(d => d.name || d.column_name)).filter(d => !['wkb_geometry'].includes(d))

  React.useEffect(() => {
    falcor.get([
      "dama",
      pgEnv,
      "viewsbyId",
      view_id,
      "databyId",
      id,
      getAttributes
    ])
    //.then(d => console.log('got attributes', d));
  }, [falcor, pgEnv, view_id, id, attributes]);

  const attrInfo = React.useMemo(() => {
    return get(
      falcorCache,
      ["dama", pgEnv, "viewsbyId", view_id, "databyId", ''+id],
      {}
    )
  }, [id, falcorCache, view_id, pgEnv]);

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