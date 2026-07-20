import React from "react"

import { get, set, isEqual } from 'lodash-es'
import mapboxgl from "maplibre-gl";
import { useNavigate, Link } from 'react-router'

import {
  Fill, Line, Eye, EyeClosed, MenuDots, CircleInfoI,
  CaretDown, CaretDownSolid, CaretUpSolid, SquarePlusSolid
} from './icons'
import { SourceAttributes, ViewAttributes, getAttributes } from "../../attributes"
import { ThemeContext } from "../../../../ui/themeContext"
import useMapLegendTheme from "../../../../ui/components/map/useMapLegendTheme"
import useMapTheme from "../../../../ui/components/map/useMapTheme"
import { fnumIndex } from './LayerEditor/datamaps'
import { extractState } from '../stateUtils'

import { SymbologyContext } from '../MapViewer'
import { MapEditorContext } from "../../context"

import useZoomToFit from "./LayerManager/ZoomToFit/useZoomToFit"

function LayerInfo({ layer, button, source, baseUrl }) {
  const { UI } = React.useContext(ThemeContext) || {};
  const { Popup } = UI || {};
  const mapTheme = useMapTheme();
  return (
    <Popup button={button}>
      <div className={mapTheme.popup.infoPanel}>
        <div><b>Source Name:</b> {source?.attributes?.name}</div>
        <div><b>Source Id:</b> {source?.attributes?.source_id}</div>
      </div>
    </Popup>
  );
}

export const ZoomToFit = ({ layer }) => {
  const { isZoomActive, extentBox } = useZoomToFit(layer, false);
  const { state, setState } = React.useContext(SymbologyContext);
  const legendTheme = useMapLegendTheme();
  const { activeLayer } = state.symbology;
  const controlButtonStateClass = activeLayer == layer.id
    ? legendTheme.controlButtonActive
    : legendTheme.controlButtonInactive;
  return (
    <SquarePlusSolid size={ 20 }
      onClick={ () => {
        setState(draft => {
          if (isZoomActive) {
            set(draft, `symbology.zoomToFit`, []);
          }
          else {
            set(draft, `symbology.zoomToFit`, extentBox);
          }
        })
      }}
      className={ `
        ${controlButtonStateClass}
        ${legendTheme.controlButtonReveal}
        ${legendTheme.controlButton}
      ` }
    />
  )
}

// export const ZoomToFit = ({ layer }) => {

//   const { state, setState  } = React.useContext(SymbologyContext);
//   const { activeLayer } = state.symbology;
//   const { useFalcor, pgEnv } = React.useContext(MapEditorContext);
//   const { falcor, falcorCache } = useFalcor();
//   const { view_id } = layer;

//   const { zoomToFit } = React.useMemo(() => ({
//     zoomToFit: get(state,`symbology.zoomToFit`),
//   }),[state]);

//   React.useEffect(() => {
//     if(view_id) {
//       falcor.get([
//           "dama", pgEnv, "views", "byId", view_id, "attributes", "metadata"
//       ]);
//     }
//   },[view_id]);

//   const viewMetadata = React.useMemo(() => {
//     let out = get(falcorCache, [
//         "dama", pgEnv, "views", "byId", view_id, "attributes", "metadata", "value", "columns"
//     ], []);
//     if(out.length === 0) {
//       out = get(falcorCache, [
//         "dama", pgEnv, "views", "byId", view_id, "attributes", "metadata", "value"
//       ], []);
//     }
//     return out;
//   }, [view_id, falcorCache]);

//   const extent = React.useMemo(() => {
//     return viewMetadata['extent'];
//   }, [viewMetadata]);

//   React.useEffect(() => {
//     const getExtent = async () => {
//       const newOptions = JSON.stringify({
//       })
//       const resp = await falcor.get([
//         'dama',pgEnv,'viewsbyId', view_id, 'options', newOptions, 'databyIndex',{ },['ST_AsGeojson(ST_Extent(wkb_geometry)) as bextent']
//       ]);
//       const newExtent = get(resp, ['json','dama',pgEnv,'viewsbyId', view_id, 'options', newOptions, 'databyIndex',0,['ST_AsGeojson(ST_Extent(wkb_geometry)) as bextent'] ])
//       falcor.call(
//         ["dama", "views", "metadata", "update"],
//         [pgEnv, view_id, { extent: newExtent }]
//       )//.then(res => console.log("resp from saving view extent:", res))
//     }
//     if(Object.keys(viewMetadata).length > 0 && !extent) {
//       getExtent()
//     }
//   }, [viewMetadata, extent]);

//   const extentBox = React.useMemo(() => {
//     if (extent) {
//       const parsedExtent = JSON.parse(extent);      
//       const coordinates = parsedExtent.coordinates[0];
//       const mapGeom = coordinates.reduce((bounds, coord) => {
//         return bounds.extend(coord);
//       }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
//       return [mapGeom['_sw'], mapGeom['_ne']]
//     } else {
//       return null;
//     }
//   }, [extent]);

//   const isZoomActive = isEqual(JSON.stringify(zoomToFit), JSON.stringify(extentBox));

//   return (
//   <SquarePlusSolid size={20}
//     onClick={() => {
//       setState(draft => {
//         if(isZoomActive){
//           set(draft,`symbology.zoomToFit`,[]);
//         }
//         else {
//           set(draft,`symbology.zoomToFit`,extentBox);
//         }
//       })
//     }}
//     className={` ${activeLayer == layer.id ? 'fill-pink-100' : 'fill-white'} collapse group-hover:visible cursor-pointer group-hover:fill-gray-400 group-hover:hover:fill-pink-700`}
//     />
// )}

function VisibilityButton ({layer}) {
  const { state, setState  } = React.useContext(SymbologyContext);
  const legendTheme = useMapLegendTheme();
  const { activeLayer } = state.symbology;
  const controlButtonStateClass = activeLayer == layer.id
    ? legendTheme.controlButtonActive
    : legendTheme.controlButtonInactive;
  const visible = layer.isVisible
  const onClick = () => {
    setState(draft => {
      draft.symbology.layers[layer.id].isVisible = !draft.symbology.layers[layer.id].isVisible
      draft.symbology.layers[layer.id].layers.forEach((d,i) => {
        let val = get(state, `symbology.layers[${layer.id}].layers[${i}].layout.visibility`,'')
        let update = val === 'visible' ? 'none' : 'visible'
        draft.symbology.layers[layer.id].layers[i].layout =  { "visibility": update }
      })
    })
  }
  return (
    <>
      {visible ?
        <Eye size={20}
          onClick={onClick}
          className={`${controlButtonStateClass} ${legendTheme.controlButton}`}
        /> :
        <EyeClosed size={20}
          onClick={onClick}
          className={`${controlButtonStateClass} ${legendTheme.controlButton}`}
        />
      }
    </>
  )
}

const LegendSymbol = ({ layer, color, legendTheme }) => {
  return layer?.type === "circle" ? (
    <div className={legendTheme.symbolWrapper}>
      <div className="w-3 h-3 rounded-full"
        style={ {
          backgroundColor: color,
          borderColor: get(layer, `layers[0].paint['circle-stroke-color']`, '#ccc')
        } }
      />
    </div>
  ) : layer?.type === "line" ? (
    <div className={legendTheme.symbolWrapper}>
      <div className="w-4 h-1"
        style={ {
          backgroundColor: color
        } }
      />
    </div>
  ) : (
    <div className={legendTheme.symbolWrapper}>
      <div className="w-4 h-4 rounded"
        style={ {
          backgroundColor:color
        } }
      />
    </div>
  )
}

function CategoryLegend({ layer, toggleSymbology }) {
  const legendTheme = useMapLegendTheme();

  // const Symbol = React.useMemo(() => {
  //   return typeSymbols[layer.type] || typeSymbols['fill'];
  // }, [layer.type]);

  const legenddata = React.useMemo(() => {
    const legenddata = layer?.['legend-data'] || [];
    if (!legenddata || (legenddata.length === 0)) {
      return [];
    }
    return legenddata;
  }, [layer]);

  return (
    <div
      className='w-full max-h-[250px] overflow-x-auto'
      onClick={toggleSymbology}
    >
      { legenddata.map((d, i) => (
          <div key={ i } className={`w-full flex items-center border-0 ${legendTheme.rowHover}`}>
            <LegendSymbol layer={ layer } color={ d.color } legendTheme={legendTheme}/>
            <div className={legendTheme.label}>{d.label}</div>
          </div>
        ))
      }
    </div>
  )
}

const GET_PAINT_VALUE = {
  'fill': (layer) => {
    const opacity = get(layer, `layers[1].paint['fill-opacity']`, '#ccc');
    return opacity === 0 ? get(layer, `layers[0].paint['line-color']`, '#ccc') : get(layer, `layers[1].paint['fill-color']`, '#ccc')
  },
  'circle': (layer) => {
    return  get(layer, `layers[0].paint['circle-color']`, '#ccc')
  },
  'line': (layer) => {
    return get(layer, `layers[1].paint['line-color']`, '#ccc')
  }
}

function InteractiveLegend({ layer, toggleSymbology }) {
  const legendTheme = useMapLegendTheme();
  const { state, setState } = React.useContext(SymbologyContext);

  let { interactiveFilters } = React.useMemo(() => {
    return {
      interactiveFilters: get(layer, `['interactive-filters']`, []),
    };
  }, [layer]);

  const selectedInteractiveFilterIndex = layer?.selectedInteractiveFilterIndex;
  const activeFilterLayerType = layer?.['interactive-filters']?.[selectedInteractiveFilterIndex]?.['layer-type'];
  return (
    <div
      className={legendTheme.horizontalPanel}
    >
      {activeFilterLayerType === 'categories' && <CategoryLegend layer={layer} toggleSymbology={toggleSymbology}/>}
      {activeFilterLayerType === 'choropleth' && <StepLegend layer={layer} toggleSymbology={toggleSymbology}/>}
      {activeFilterLayerType === 'circles' && (<CircleLegend layer={layer} toggleSymbology={toggleSymbology} />)}
    </div>
  );
}

function CircleLegend({ layer, toggleSymbology }) {
  const legendTheme = useMapLegendTheme();
 // console.log("CircleLegend", layer);
  let { minRadius, maxRadius, lowerBound, upperBound, isLoadingColorbreaks, dataColumn } = React.useMemo(() => {
    return {
      isLoadingColorbreaks: get(layer, `['is-loading-colorbreaks']`, false),
      minRadius: get(layer,`['min-radius']`, 8),
      maxRadius: get(layer,`['max-radius']`, 128),
      lowerBound: get(layer,`['lower-bound']`, null),
      upperBound: get(layer,`['upper-bound']`, null),
      dataColumn: get(layer, `['data-column']`, null)
    };
  }, [layer]);
  if (isLoadingColorbreaks) {
    return (
      <div className="w-full max-h-[250px] overflow-x-auto scrollbar-sm">
        <div className={legendTheme.loading}>
          Creating legend...
          <span
            style={{ fontSize: "1.5rem" }}
            className={`ml-2 fa-solid fa-spinner fa-spin`}
          />
        </div>
      </div>
    );
  }
  return (
    <div
      className="w-[100%] text-sm max-h-[250px] overflow-x-auto scrollbar-sm px-4"
      onClick={toggleSymbology}
    >
      <div className="w-[33%] text-sm max-h-[250px] overflow-x-auto scrollbar-sm px-4">
        <div className="flex w-full justify-between">
          <div>{minRadius}px</div>
          <div>{maxRadius}px</div>
        </div>
        <div className="ml-8">
          <i
            class="fa-solid fa-arrow-right-long"
            style={{ transform: "scaleX(3)" }}
          ></i>
        </div>
        <div className="flex w-full justify-between">
          <div>{fnumIndex(lowerBound)}</div>
          <div>{fnumIndex(upperBound)}</div>
        </div>
      </div>
      <div>{dataColumn}</div>
    </div>
  );
}

function StepLegend({ layer, toggleSymbology }) {
  const legendTheme = useMapLegendTheme();
  // console.log('StepLegend', layer)
  const { state, setState  } = React.useContext(SymbologyContext);
  let { legenddata, isLoadingColorbreaks } = React.useMemo(() => {
    return {
      legenddata : get(layer, `['legend-data']`, []),
      isLoadingColorbreaks: get(layer, `['is-loading-colorbreaks']`, false)
    }
  },[state]);
  // const Symbol = typeSymbols[layer.type] || typeSymbols['fill']``

  if(isLoadingColorbreaks){
    return (
      <div className='w-full max-h-[250px] overflow-x-auto scrollbar-sm'>
        <div className={legendTheme.loading} >
          Creating legend...
          <span style={ { fontSize: "1.5rem" } } className={ `ml-2 fa-solid fa-spinner fa-spin` }/>
        </div>
      </div>
    )
  }

  return (
    <div
      className='w-full max-h-[250px] overflow-x-auto scrollbar-sm'
      onClick={toggleSymbology}
    >
      {legenddata.map((d,i) => (
        <div key={i} className={`w-full flex items-center border-0 ${legendTheme.rowHover}`}>
          <LegendSymbol layer={ layer } color={ d.color } legendTheme={legendTheme}/>
          <div className={legendTheme.label}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

function HorizontalLegend({ layer, toggleSymbology }) {
  const legendTheme = useMapLegendTheme();
  const { state, setState  } = React.useContext(SymbologyContext);
  let { legenddata, isLoadingColorbreaks, showOther } = React.useMemo(() => {
    return {
      legenddata : get(layer, `['legend-data']`, []),
      isLoadingColorbreaks: get(layer, `['is-loading-colorbreaks']`, false),
      showOther: get(layer, `['category-show-other']`, '#ccc')
    }
  },[state]);
  const isShowOtherEnabled = showOther === '#ccc'

  if(isLoadingColorbreaks){
    return (
      <div className='w-full max-h-[250px] overflow-x-auto scrollbar-sm'>
        <div className={legendTheme.loading} >
          Creating legend...
          <span style={ { fontSize: "1.5rem" } } className={ `ml-2 fa-solid fa-spinner fa-spin` }/>
        </div>
      </div>
    )
  }

  return (
    <div
      className={legendTheme.horizontalPanel}
      onClick={toggleSymbology}
    >
      <div className={legendTheme.horizontalTrack}>
        {legenddata.map((d, i) => (
          <div className="flex-1 h-6" key={`horizontal_legend_item_${i}`}>
            <div className={`flex justify-self-end h-4 ${legendTheme.secondaryLabel}`}>
              { isShowOtherEnabled && i === legenddata.length-1 ? 'N/A' : legenddata[i].label}
            </div>

            <div
              key={i}
              className="flex-1 h-2"
              style={{ backgroundColor: d.color }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function LegendRow ({ layer, i, numLayers, onRowMove }) {
  const { state, setState  } = React.useContext(SymbologyContext);
  const { falcor, falcorCache, pgEnv, baseUrl } = React.useContext(MapEditorContext);
  const legendTheme = useMapLegendTheme();
  const { activeLayer } = state.symbology;

// console.log("LegendRow::layer", layer);

  let { layerType: type, legendOrientation,  selectedInteractiveFilterIndex, interactiveFilters, dataColumn, filterGroup, filterGroupLegendColumn,filterGroupName, viewGroup, viewGroupName, sourceId, dynamicFilters, isLayerControlledByPlugin } = React.useMemo(() => {
    const pluginData = get(state, `symbology.pluginData`, {});
    const isLayerControlledByPlugin = (Object.keys(pluginData) || []).some(pluginName => Object.values(pluginData[pluginName]['active-layers'] || {}).includes(layer.id))

    return {
      isLayerControlledByPlugin,
      initialViewId: get(layer,`initial-view-id`),
      sourceId: get(layer,`source_id`),
      legendOrientation: get(layer, `['legend-orientation']`, 'vertical'),
      layerType : get(layer, `['layer-type']`),
      selectedInteractiveFilterIndex: get(layer, `['selectedInteractiveFilterIndex']`),
      interactiveFilters: get(layer, `['interactive-filters']`, []),
      dataColumn: get(layer, `['data-column']`, []),
      filterGroup: get(layer, `['filter-group']`, []),
      filterGroupName: get(layer, `['filter-group-name']`, ''),
      filterGroupLegendColumn: get(layer, `['filter-group-legend-column']`, ''),
      viewGroup: get(layer, `['filter-source-views']`, []),
      viewGroupName: get(layer, `['view-group-name']`, ''),
      dynamicFilters:get(layer, `['dynamic-filters']`, []),
    }
  },[state, layer]);

// console.log("LegendRow::sourceId", sourceId);

  const toggleSymbology = () => {
    setState(draft => {
        draft.symbology.activeLayer = activeLayer === layer.id ? '' : layer.id
    })
  }
  const shouldDisplayColorSquare =
    type === "simple" ||
    (type === "interactive" &&
      interactiveFilters?.[selectedInteractiveFilterIndex]?.["layer-type"] ===
        "simple") ||
    !type;
  // const Symbol = typeSymbols[layer.type] || typeSymbols['fill']
  let paintValue = GET_PAINT_VALUE?.[layer?.type] ? GET_PAINT_VALUE?.[layer?.type](layer) : '#fff'
  const layerTitle = layer.name ?? filterGroupName;

  const layerSource = React.useMemo(
    () => get(falcorCache, ["uda", pgEnv, "sources", "byId", sourceId], {}),
    [sourceId, falcorCache]
  );

// console.log("LegendRow::layerSource", layerSource);

  const stopTheProp = React.useCallback(e => {
    e.stopPropagation();
  }, []);

  const legendTitle = (
    <div className='flex justify-between items-center justify w-full' onClick={toggleSymbology} >
      { shouldDisplayColorSquare && (
          <div className='pl-1 flex min-w-0'>
            <LegendSymbol layer={ layer } color={ paintValue } legendTheme={legendTheme}/>
            <span className={legendTheme.title} title={layerTitle}>{ layerTitle }</span>
          </div>
        )
      }
      {!shouldDisplayColorSquare && <span className={legendTheme.title} title={layerTitle}>{layerTitle}</span>}
      <div className='flex items-center' onClick={ stopTheProp }>
        {(() => {
          const controlButtonStateClass = activeLayer == layer.id
            ? legendTheme.controlButtonActive
            : legendTheme.controlButtonInactive;

          // Design-pass themes set `infoButtonFill` — keep the info control
          // always visible + brand-filled so the data page is discoverable;
          // themes without it keep the reveal-on-hover treatment.
          const infoButtonClass = legendTheme.infoButtonFill
            ? `${legendTheme.infoButtonFill} cursor-pointer`
            : `${controlButtonStateClass} ${legendTheme.controlButtonReveal}`;

          return (
            <>

              <LayerInfo
                source={ layerSource }
                layer={ layer }
                baseUrl={ baseUrl }
                button={
                  <CircleInfoI size={ 20 }
                    className={ `
                      ${infoButtonClass}
                      ${legendTheme.controlButton}
                    ` }
                  />
                }
              />

              <ZoomToFit layer={layer}/>

              <VisibilityButton layer={layer}/>
            </>
          );
        })()}
      </div>
    </div>
  );

  //----------------------------------
  // -- get selected source views
  // ---------------------------------
  React.useEffect(() => {
    async function fetchData() {
      const lengthPath = ["uda", pgEnv, "sources", "byId", sourceId, "views", "length"];
      const resp = await falcor.get(lengthPath);
      return await falcor.get([
        "uda", pgEnv, "sources", "byId", sourceId, "views", "byIndex",
        { from: 0, to: get(resp.json, lengthPath, 0) - 1 },
        Object.values(SourceAttributes)
      ]);
    }
    if(sourceId) {
      fetchData();
    }
  }, [sourceId, falcor, pgEnv]);

  const views = React.useMemo(() => {
    return Object.values(get(falcorCache, ["uda", pgEnv, "sources", "byId", sourceId, "views", "byIndex"], {}))
      .map(v => getAttributes(get(falcorCache, v.value, {})));
  }, [falcorCache, sourceId, pgEnv]);

  const groupSelectorElements = [];
  if (type === "interactive" && !isLayerControlledByPlugin) {
    groupSelectorElements.push(
      <div
        key={`symbrow_${layer.id}_interactive`}
        className={legendTheme.groupLabel}
      >
        <div className={legendTheme.groupMetaLabel}>Filters:</div>
        <div className={legendTheme.selectorBox}>
          <select
            className="w-full bg-transparent"
            value={selectedInteractiveFilterIndex}
            onChange={(e) => {
              setState((draft) => {
                draft.symbology.layers[
                  layer.id
                ].selectedInteractiveFilterIndex = parseInt(e.target.value);
              });
            }}
          >
            {interactiveFilters.map((iFilter, i) => {
              return (
                <option key={i} value={i}>
                  {iFilter.label}
                </option>
              );
            })}
          </select>
        </div>
      </div>
    )
  }
  if(layer.filterGroupEnabled && !isLayerControlledByPlugin) {
    groupSelectorElements.push(
      <div
        key={`symbrow_${layer.id}_filtergroup`}
        className={`${legendTheme.groupLabel} items-center`}
      >
        <div className={legendTheme.groupMetaLabel}>{filterGroupName}:</div>
        <div className={legendTheme.selectorBox}>
          <select
            className="w-full bg-transparent"
            value={dataColumn}
            onChange={(e) => {
              setState((draft) => {
                if(type === 'interactive'){
                  draft.symbology.layers[layer.id]['interactive-filters'][selectedInteractiveFilterIndex]["data-column"] = e.target.value

                  if(draft.symbology.layers[layer.id]['interactive-filters'][selectedInteractiveFilterIndex]['layer-type'] === 'categories') {
                    draft.symbology.layers[layer.id]['interactive-filters'][selectedInteractiveFilterIndex]['categories'] = {};
                  }
                } else {
                  draft.symbology.layers[layer.id]["data-column"] = e.target.value

                  if(type === 'categories') {
                    draft.symbology.layers[layer.id]['categories'] = {};
                  }
                }
              });
            }}
          >
            {filterGroup.map((gFilter, i) => {
              const itemSuffix =
                filterGroupLegendColumn === gFilter.column_name
                  ? "**"
                  : !!filterGroupLegendColumn
                  ? ` (${filterGroupLegendColumn})`
                  : "";
              return (
                <option key={i} value={gFilter.column_name}>
                  {gFilter.display_name} {itemSuffix}
                </option>
              );
            })}
          </select>
        </div>
      </div>
    );
  }
  if(layer.viewGroupEnabled && !isLayerControlledByPlugin) {
    groupSelectorElements.push(
      <div
        key={`symbrow_${layer.id}_viewgroup`}
        className={`${legendTheme.groupLabel} items-center`}
      >
        <div className={legendTheme.groupMetaLabel}>{viewGroupName}: </div>
        <div className={legendTheme.selectorBox}>
          <select
            className="w-full bg-transparent"
            value={layer.view_id}
            onChange={(e) => {
              setState((draft) => {
                //draft.symbology.layers[layer.id].layers[0].source
                //draft.symbology.layers[layer.id].layers[0].source-layer
                //draft.symbology.layers[layer.id].layers[1].source
                //draft.symbology.layers[layer.id].layers[1].source-layer
                const newLayer = JSON.parse(
                  JSON.stringify(draft.symbology.layers[layer.id].layers).replaceAll(
                    layer.view_id,
                    e.target.value
                  )
                );
                draft.symbology.layers[layer.id].layers = newLayer;

                //sources[0].id
                //sources[0].source.tiles
                const newSources = JSON.parse(
                  JSON.stringify(
                    draft.symbology.layers[layer.id].sources
                  ).replaceAll(layer.view_id, e.target.value)
                );
                draft.symbology.layers[layer.id].sources = newSources;

                draft.symbology.layers[layer.id].view_id = e.target.value
              });
            }}
          >
            {viewGroup.map((view_id, i) => {
              const curView = views.find((v) => v.view_id === view_id);
              return (
                <option key={i} value={view_id}>
                  {curView?.version ?? curView?.view_id}
                </option>
              );
            })}
          </select>
        </div>
      </div>
    );
  }
  if(dynamicFilters.length > 0 && !isLayerControlledByPlugin) {
    groupSelectorElements.push(<DynamicFilter key={`${layer.id}_dynamic_filter`} layer={layer}/>)
  }
  return (
    <div
      className={`${
        activeLayer == layer.id ? legendTheme.rowActive : ""
      } ${legendTheme.row} ${legendTheme.rowHover} group`}
    >
      <div
        className={`w-full pl-2 pt-1 pb-0 flex border-blue-50/50 border justify-between items-center ${
          type === "interactive" && !shouldDisplayColorSquare ? "pl-[3px]" : ""
        }`}
      >
        <div className="text-sm mr-1 flex flex-col justify-start align-start content-start flex-wrap w-full">
          {legendTitle}
          {groupSelectorElements}
        </div>
      </div>
      {
        legendOrientation !== "none" && (
          legendOrientation === "horizontal" ? (
            <HorizontalLegend layer={layer} toggleSymbology={toggleSymbology} />
          ) : (
            <>
              {type === "categories" && (
                <CategoryLegend layer={layer} toggleSymbology={toggleSymbology} />
              )}
              {type === 'circles' && (
                  <CircleLegend layer={layer} toggleSymbology={toggleSymbology} />
              )}
              {(type === "choropleth") && (
                <StepLegend layer={layer} toggleSymbology={toggleSymbology} />
              )}
              {type === "interactive" && (
                <InteractiveLegend
                  layer={layer}
                  toggleSymbology={toggleSymbology}
                />
              )}
            </>
          )
        )
      }
    </div>
  );
}

function LegendPanel (props) {
  const { state, setState } = React.useContext(SymbologyContext);
  const legendTheme = useMapLegendTheme();
  //console.log('layers', layers)
  const { allPluginActiveLayerIds, layers } = React.useMemo(() => {
    return extractState(state)
  }, [state])
  const droppedSection = React.useCallback((start, end) => {
    setState(draft => {
      const sections = Object.values(draft.symbology.layers);
      sections.sort((a,b) => b.order - a.order)
      const [item] = sections.splice(start, 1);
      sections.splice(end, 0, item);
      sections.reverse().forEach((item, i) => {
        item.order = i
      })
      draft.symbology.layers = sections.reverse()
        .reduce((out,sec) => {
          out[sec.id] = sec;
          return out
        },{})
    });
  }, []);

  const numLayers = React.useMemo(() => {
    return Object.values(layers).length;
  }, [layers]);
  return (
    <>
      {/* ------ Legend Pane ----------- */}
      <div className={`min-h-20 relative max-h-[calc(100vh_-_220px)] scrollbar-sm ${legendTheme.panelInner}`}>
        {Object.values(layers)
          .sort((a,b) => b.order - a.order)
          .filter((layer, i) => {
            const isControlledByPlugin = allPluginActiveLayerIds.includes(layer.id);
            //which plugin controls this layer? And does it want to show the default legend?

            if(isControlledByPlugin) {
              const controllingPlugin = Object.keys(state.symbology.pluginData).find((pluginName) => {
                const pluginData = state.symbology.pluginData[pluginName];
                return Object.values(pluginData?.['active-layers']).includes(layer.id);
              });

              return state.symbology.pluginData[controllingPlugin]['default-legend'];
            } else {
              //always display legend if layer is not controlled by plugin
              return true;
            }
          })
          .map((layer,i) => <LegendRow key={layer.id} layer={layer} i={i} numLayers={numLayers} onRowMove={droppedSection}/>)}
      </div>
    </>
  )
}
export default LegendPanel;

const DynamicFilter = ({layer}) => {
  const { state, setState  } = React.useContext(SymbologyContext);
  const { falcor, falcorCache, pgEnv } = React.useContext(MapEditorContext);
  let { layerType, dynamicFilters, viewId } = React.useMemo(() => {
    return {
      viewId:get(layer,`view_id`),
      layerType : get(layer, `['layer-type']`),
      dynamicFilters:get(layer, `['dynamic-filters']`, [])?.filter(dynamicF => !!dynamicF.column_name),
    }
  },[state, layer]);
  const selectedColumnNames = dynamicFilters?.map(dynamicF => dynamicF.column_name);

  React.useEffect(() => {
    if(selectedColumnNames.length > 0) {
      selectedColumnNames.forEach(colName => {
        const options = JSON.stringify({
          groupBy: [(colName).split('AS ')[0]],
          exclude: {[(colName).split('AS ')[0]]: ['null']},
          orderBy: {"2": 'desc'}
        })
        falcor.get([
          'dama',pgEnv,'viewsbyId', viewId, 'options', options, 'databyIndex', { from: 0, to: 200},[colName, 'count(1)::int as count']
        ])
      })
    }
  },[selectedColumnNames, layerType, viewId]);
  return (
    <div className="flex my-2 flex-col">
      <b>Dynamic Filters:</b>
      {
        dynamicFilters.map((dFilter, i) => {
          const colName  = dFilter.column_name;
          const options = JSON.stringify({
            groupBy: [(colName).split('AS ')[0]],
            exclude: {[(colName).split('AS ')[0]]: ['null']},
            orderBy: {"2": 'desc'}
          })
          const sampleData =  Object.values(
            get(falcorCache, [
              'dama',pgEnv,'viewsbyId', viewId, 'options', options, 'databyIndex'], [])
          ).map(v =>  v?.[colName]).filter(val => typeof val !== "object");

          sampleData.sort();
          return (
            <div key={`${colName}_${i}_legend_filter_option_row`} className='w-full'>
              <DynamicFilterControl
                layer={layer}
                filterIndex={i}
                sampleData={sampleData}
                button={
                  <div className='flex w-full p-1 pl-0 rounded items-center justify-between border-transparent border hover:border-gray-300'>{dFilter.display_name} <CaretDown  className=''/> </div>
                }
              />
            </div>
          )
        })
      }
    </div>
  )
}



function DynamicFilterControl({button, layer, sampleData, filterIndex}) {
  const { state, setState  } = React.useContext(SymbologyContext);
  const { UI } = React.useContext(ThemeContext) || {};
  const { Popup } = UI || {};
  const mapTheme = useMapTheme();

  const {filterValues} = React.useMemo(() => {
    return {
      filterValues:get(layer, `['dynamic-filters'][${filterIndex}].values`, []),
    }
  }, [state, filterIndex])
  return (
    <Popup button={button}>
      <div className={mapTheme.popup.listPanel}>
        {sampleData.map((datum) => (
          <div
            key={`menu_item_${datum}`}
            className={mapTheme.popup.listItem}
          >
            <input
              type="checkbox"
              checked={filterValues.includes(datum)}
              onChange={() => {
                if (filterValues.includes(datum)) {
                  setState((draft) => {
                    draft.symbology.layers[layer.id]["dynamic-filters"][filterIndex].values =
                      filterValues.filter((val) => val !== datum);
                  });
                } else {
                  setState((draft) => {
                    draft.symbology.layers[layer.id]["dynamic-filters"][filterIndex].values =
                      [...filterValues, datum];
                  });
                }
              }}
            />
            <div className={mapTheme.popup.listItemText}>
              {datum}
            </div>
          </div>
        ))}
      </div>
    </Popup>
  );
}
