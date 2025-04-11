import React, { useMemo, Fragment, useEffect} from 'react'
import { MapContext } from '../MapComponent'
import { Menu, Transition, Tab } from '@headlessui/react'
import { Fill, Line, Circle, MenuDots, CaretUpSolid, CaretDownSolid, Plus} from '../../../../../icons'
import get from 'lodash/get'
import { SelectSymbology } from './SymbologySelector'
import set from 'lodash/set'
import {isValidCategoryPaint, choroplethPaint} from '../utils'
import colorbrewer from '../colors'

import cloneDeep from 'lodash/cloneDeep'
import { getAttributes } from '~/pages/DataManager/Collection/attributes'
import { ViewAttributes } from "~/pages/DataManager/Source/attributes"
const typeIcons = {
  'fill': Fill,
  'circle': Circle,
  'line': Line
}


let iconList = [
  'fad fa-wrench',
  'fad fa-train',
  'fad fa-subway',
  'fad fa-traffic-light',
  'fad fa-traffic-cone',
  'fad fa-ship',
  'fad fa-route',
  'fad fa-road',
  'fad fa-plane-alt',
  'fad fa-parking',
  'fad fa-map-signs',
  'fad fa-map-pin',
  'fad fa-map-marker',
  'fad fa-map-marker-alt',
  'fad fa-map',
  'fad fa-location-circle',
  'fad fa-location-arrow',
  'fad fa-location',
  'fad fa-info',
  'fad fa-info-circle',
  'fad fa-industry-alt',
  'fad fa-globe',
  'fad fa-directions',
  'fad fa-car',
  'fad fa-cars',
  'fad fa-bus',
  'fad fa-truck',
  'fad fa-bicycle',
  'fad fa-layer-group',
  'fad fa-tachometer-fastest',
]

function arraymove(arr, fromIndex, toIndex) {
  var element = arr[fromIndex];
  arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, element);
}


function SymbologyMenu({button, location='left-0', width='w-36', children}) {
  

  return (
      <Menu as="div" className="relative inline-block text-left">
        <Menu.Button>
          {button}
        </Menu.Button>
        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <Menu.Items className={`absolute ${location} mt-1 ${width} origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none`}>
            {children}
          </Menu.Items>
        </Transition>
      </Menu>
  )
}


function SymbologyRow ({tabIndex, row, rowIndex}) {
  const { state, setState, falcor, falcorCache, pgEnv  } = React.useContext(MapContext);
  // const { activeLayer } = state.symbology;

  const { sourceId, symbology, layer, selectedInteractiveFilterIndex, layerType,dataColumn , interactiveFilters, filterGroupEnabled, filterGroup, filterGroupLegendColumn,filterGroupName, viewGroupEnabled, viewGroup, viewGroupName, } = useMemo(() => {
    const symbology = get(state, `symbologies[${row.symbologyId}]`, {});
    const layer = get(symbology,`symbology.layers[${Object.keys(symbology?.symbology?.layers || {})[0]}]`, {});
    return {
      symbology,
      layer,
      sourceId: get(layer, `['source_id']`),
      dataColumn: get(layer, `['data-column']`),
      selectedInteractiveFilterIndex: get(layer, `['selectedInteractiveFilterIndex']`),
      layerType:get(layer, `['layer-type']`, 'simple'),
      interactiveFilters: get(layer, `['interactive-filters']`, []),
      filterGroupEnabled: get(layer, `['filterGroupEnabled']`),
      filterGroup: get(layer, `['filter-group']`, []),
      filterGroupName: get(layer, `['filter-group-name']`, ''),
      filterGroupLegendColumn: get(layer, `['filter-group-legend-column']`, ''),
      viewGroupEnabled: get(layer, `['viewGroupEnabled']`),
      viewGroup: get(layer, `['filter-source-views']`, []),
      viewGroupName: get(layer, `['view-group-name']`, ''),
    }
  },[row, state])

  //const Icon = typeIcons?.[layer?.type] || typeIcons['Line']
  const visible = state?.symbologies?.[symbology.symbology_id]?.isVisible

  const toggleVisibility = useMemo(() => {
    return () => setState(draft => {
      draft.symbologies[symbology.symbology_id].isVisible  = !draft.symbologies[symbology.symbology_id].isVisible
      Object.keys(draft.symbologies[symbology.symbology_id].symbology.layers).forEach(layerId => {
        const curLayer = draft.symbologies[symbology.symbology_id].symbology.layers[layerId];
        curLayer.layers.forEach((d,i) => {
          let val = get(state, `symbologies[${symbology.symbology_id}].symbology.layers[${layerId}].layers[${i}].layout.visibility`,'') 
          let update = val === 'visible' ? 'none' : 'visible'
          draft.symbologies[symbology.symbology_id].symbology.layers[layerId].layers[i].layout =  { "visibility": update }
        })
      })
    })
  }, [state, setState]);


  const symbologies = useMemo(() => {
    return Object.values(get(falcorCache, ["dama", pgEnv, "symbologies", "byIndex"], {}))
      .map(v => getAttributes(get(falcorCache, v.value, { "attributes": {} })["attributes"]));
  }, [falcorCache, pgEnv]);

  const numRows = useMemo(() => {
    return state.tabs[tabIndex].rows.length;
  }, [state.tabs[tabIndex].length]);

  React.useEffect(() => {
    async function fetchData() {
      //console.time("fetch data");
      const lengthPath = ["dama", pgEnv, "sources", "byId", sourceId, "views", "length"];
      const resp = await falcor.get(lengthPath);
      return await falcor.get([
        "dama", pgEnv, "sources", "byId", sourceId, "views", "byIndex",
        { from: 0, to: get(resp.json, lengthPath, 0) - 1 },
        "attributes", Object.values(ViewAttributes)
      ]);
    }
    if(sourceId) {
      fetchData();
    }
  }, [sourceId, falcor, pgEnv]);

  const views = useMemo(() => {
    return Object.values(get(falcorCache, ["dama", pgEnv, "sources", "byId", sourceId, "views", "byIndex"], {}))
      .map(v => getAttributes(get(falcorCache, v.value, { "attributes": {} })["attributes"]));
  }, [falcorCache, sourceId, pgEnv]);

  const groupSelectorElements = [];
  if (layerType === "interactive") {
    groupSelectorElements.push(
      <div className="text-slate-600 font-medium text-xs  truncate flex-1 pl-3 pr-1 pb-1 w-full">
        <div className="text-black">Filters:</div>
        <div className="rounded-md h-[36px] pl-0 pr-1 flex w-full w-[216px] items-center border border-transparent cursor-pointer hover:border-slate-300">
          <select
            className="w-full bg-transparent"
            value={selectedInteractiveFilterIndex}
            onChange={(e) => {
              setState((draft) => {
                draft.symbologies[row.symbologyId].symbology.layers[
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

  if(filterGroupEnabled) {
    groupSelectorElements.push(
      <div className="text-slate-600 font-medium text-xs  truncate flex-1 pl-3 pr-1 pb-1 w-full">
        <div className='text-black'>{filterGroupName}:</div>
        <div className="rounded-md h-[36px] pl-0 pr-1 flex w-full w-[216px] items-center border border-transparent cursor-pointer hover:border-slate-300">
          <select
            className="w-full bg-transparent"
            value={dataColumn}
            onChange={(e) => {
              setState((draft) => {
                draft.symbologies[row.symbologyId].symbology.layers[layer.id]["data-column"] = e.target.value
                if(layerType === 'categories') {
                  draft.symbologies[row.symbologyId].symbology.layers[layer.id]['categories'] = {};
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
  if(layer.viewGroupEnabled) {
    groupSelectorElements.push(
      <div className="text-slate-600 font-medium text-xs  truncate flex-1 pl-3 pr-1 pb-1 w-full ">
        <div className=' text-black'>{viewGroupName}: </div>
        <div className="rounded-md h-[36px]  pl-0 pr-1 flex w-full w-[216px] items-center border border-transparent cursor-pointer hover:border-slate-300">
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
                  JSON.stringify(draft.symbologies[row.symbologyId].symbology.layers[layer.id].layers).replaceAll(
                    layer.view_id,
                    e.target.value
                  )
                );
                draft.symbologies[row.symbologyId].symbology.layers[layer.id].layers = newLayer;

                //sources[0].id
                //sources[0].source.tiles
                const newSources = JSON.parse(
                  JSON.stringify(
                    draft.symbologies[row.symbologyId].symbology.layers[layer.id].sources
                  ).replaceAll(layer.view_id, e.target.value)
                );
                draft.symbologies[row.symbologyId].symbology.layers[layer.id].sources = newSources;
                draft.symbologies[row.symbologyId].symbology.layers[layer.id].view_id = e.target.value
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

  useEffect(() => {
    if(layer) {
      setState((draft => {
        const polygonLayerType = layer.type
        const paintPaths = {
          'fill':"layers[1].paint['fill-color']",
          'circle':"layers[0].paint['circle-color']",
          'line':"layers[1].paint['line-color']"
        }
    
        const layerPaintPath = paintPaths[polygonLayerType];
        const {
          choroplethdata = {},
          colorrange = colorbrewer["seq1"][9],
          numbins=9,
          method,
          ["category-show-other"]: showOther = "#ccc",
        } = layer;
        const { breaks, max } = choroplethdata;
    
        let { paint } = choroplethPaint(dataColumn, max, colorrange, numbins, method, breaks, showOther);
        if(isValidCategoryPaint(paint)) {    
          set(draft, `symbologies[${[row.symbologyId]}].symbology.layers[${layer.id}].${layerPaintPath}`, paint)
        }
      }))
    }
  }, [dataColumn])

  return (
    <div className='border-white/85 border hover:border-pink-500 group'>
      <div className={`w-full  px-2 flex  items-center`}>
        <div className='pr-2 flex items-center'><input 
          type='checkbox'
          checked={visible}
          className='h-4 w-4 rounded border-slate-300 text-pink-600 focus:ring-pink-600'
          onChange={toggleVisibility}
        /></div>
        <div 
          onClick={state.isEdit ? () => {}: toggleVisibility}
          className='text-[13px] cursor-pointer font-regular hover:text-slate-900 text-slate-600 truncate flex items-center flex-1'
        >
          { state.isEdit ? (
              <input
                className="block w-[240px] flex flex-1 bg-transparent text-slate-800 placeholder:text-gray-400  focus:border-0"
                value={symbology?.name}
                placeholder='Layer Name'
                type='text'
                onChange={(e) => {
                  const layerName = e.target.value;
                  setState(draft => {
                    const newLayers = Object.keys(draft.symbologies[row.symbologyId].symbology.layers).reduce((acc, layerKey) => {
                      acc[layerKey] = {...draft.symbologies[row.symbologyId].symbology.layers[layerKey], name: layerName}
                      return acc;
                    }, {})
                    draft.symbologies[row.symbologyId].symbology.layers = newLayers;
                    draft.symbologies[row.symbologyId].name = layerName;
                    draft.tabs[tabIndex].rows[rowIndex].name =  layerName;
                  })
                }}
              />
            ) : 
              symbology?.name || ' no name'
          }
        </div>
        {state.isEdit &&
          <>
            <div
              className={`${rowIndex === 0 ? 'pointer-events-none' : ''}`}
              onClick={ () => {
                setState(draft => {
                  arraymove(draft.tabs[tabIndex].rows, rowIndex, rowIndex-1);
                })
              }}
            >
              <CaretUpSolid
                className={`pt-[2px] fill-white cursor-pointer group-hover:fill-gray-400 group-hover:hover:fill-pink-700`} 
                size={20}
              />
            </div>
            <div
              className={`${rowIndex === numRows-1 ? 'pointer-events-none' : ''}`}
              onClick={() => {
                setState(draft => {
                  arraymove(draft.tabs[tabIndex].rows, rowIndex, rowIndex+1);
                })
              }}
            >
              <CaretDownSolid
                className={`pb-[2px] fill-white cursor-pointer group-hover:fill-gray-400 group-hover:hover:fill-pink-700`}
                size={20}
              />
            </div>
          </>
        }
        {state.isEdit && (<div className='text-sm pt-1 px-0.5 flex items-center'>
          <SymbologyMenu 
            button={<MenuDots className={ `fill-white cursor-pointer group-hover:fill-gray-400 group-hover:hover:fill-pink-700`}/>}
          >
            <div className="px-1 py-1 ">
                <Menu.Item >
                  {({ active }) => (
                    <div 
                      className={`${
                        active ? 'bg-pink-50 ' : ''
                      } group flex w-full items-center text-red-400 rounded-md px-2 py-2 text-sm`}
                      onClick={() => {
                        setState(draft => {
                          delete draft.symbologies[symbology.symbology_id]
                          draft.tabs[tabIndex].rows.splice(rowIndex, 1)
                        })
                      }}
                    >Remove</div>
                  )}
                </Menu.Item>
              </div>
              <div className="px-1 py-1 ">
                <Menu.Item >
                  {({ active }) => (
                    <div 
                      className={`${
                        active ? 'bg-pink-50 ' : ''
                      } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
                      onClick={async () => {
                        console.log("updating symbology for::", row.symbologyId);
                        setState(draft => {
                          let newSymbology = cloneDeep(symbologies.find(d => +d.symbology_id === +row.symbologyId))
                    
                          Object.keys(newSymbology.symbology.layers).forEach(layerId => {
                            newSymbology.symbology.layers[layerId].layers.forEach((d,i) => {
                              const val = get(state, `symbologies[${symbology.symbology_id}].symbology.layers[${layerId}].layers[${i}].layout.visibility`,'')
                              newSymbology.symbology.layers[layerId].layers[i].layout =  { "visibility": val }
                            })
                          })
                    
                          draft.symbologies[''+row.symbologyId] = newSymbology;
                          draft.symbologies[symbology.symbology_id].isVisible = visible;
                        })
                      }}
                    >Update symbology</div>
                  )}
                </Menu.Item>
              </div>
          </SymbologyMenu>
        </div>)}
      </div>
      <div className="text-sm mr-1 flex flex-col justify-start align-start content-start flex-wrap w-full">
        {groupSelectorElements}
      </div>

    </div>
  )
}

function CategoryRow ({row}) {
  return (
     <div>{row.name}</div>
  )
}

const rowTypes = {
  'symbology': SymbologyRow,
  'category': CategoryRow
}
export const INITIAL_NEW_MAP_MODAL_STATE = {
  open: false,
  symbologyId: null
};
function TabPanel ({tabIndex, tab}) {
  const { state, setState } = React.useContext(MapContext);
  const menuButtonContainerClassName = ' p-1 rounded hover:bg-slate-100 group';
  const [addSymbologyModalState, setAddSymbologyModalState] = React.useState(INITIAL_NEW_MAP_MODAL_STATE);

  const numTabs = useMemo(() => {
    return state.tabs.length;
  }, [state.tabs.length]);

  return (
    <div className='w-full'>
      {/* --- Header --- */}
      <div className='flex'>
        <div className='flex-1 items-center'>
         {state.isEdit && <input 
            type="text"
            className='border w-[180px] font-medium border-transparent hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent py-1 px-2 text-slate-800 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6'
            value={tab.name}
            onChange={(e) => setState(draft => { 
               
                draft.tabs[tabIndex].name = e.target.value                           
            })}
          />}
          {
            !state.isEdit && <div className='font-medium py-1 px-2 text-slate-800'>{tab.name}</div>
          }
        </div>
        {state.isEdit && (
          <div className='w-[28px] h-[28px] justify-center m-1 rounded hover:bg-slate-100 flex items-center flex'
            onClick={() => {
              setAddSymbologyModalState({...addSymbologyModalState, open: true})}
            }
          >
            <Plus className='fill-slate-500 hover:fill-pink-300 hover:cursor-pointer' 
          />
          </div>
        )}
        {state.isEdit && (<>
          <SymbologyMenu 
            button={
              <div 
                className='w-[28px] h-[28px] justify-center m-1 rounded hover:bg-slate-100 flex items-center' 
              >
                <MenuDots className='fill-slate-500 hover:fill-pink-300' />
              </div>
            }
          >
            <div className="px-1 py-1 ">
                <Menu.Item >
                  {({ active }) => (
                    <div 
                      className={`${
                        active ? 'bg-pink-50 ' : ''
                      } group flex w-full items-center text-red-400 rounded-md px-2 py-2 text-sm`}
                      onClick={() => {
                        setState(draft => {
                          console.log('remove tab', state, tabIndex)
                          draft.tabs.splice(tabIndex,1)
                        })
                      }}
                    >Remove</div>
                  )}
                </Menu.Item>
              </div>
              {tabIndex !== 0 && <div className="px-1 py-1 ">
                <Menu.Item >
                  {({ active }) => (
                    <div 
                      className={`${
                        active ? 'bg-pink-50 ' : ''
                      } group flex w-full items-center  rounded-md px-2 py-2 text-sm`}
                      onClick={() => {
                        setState(draft => {
                          arraymove(draft.tabs, tabIndex, tabIndex-1);
                        })
                      }}
                    >Move section up</div>
                  )}
                </Menu.Item>
              </div>}
              {tabIndex !== numTabs-1 && <div className="px-1 py-1 ">
                <Menu.Item >
                  {({ active }) => (
                    <div  
                      className={`${
                        active ? 'bg-pink-50 ' : ''
                      } group flex w-full items-center  rounded-md px-2 py-2 text-sm`}
                      onClick={() => {
                        setState(draft => {
                          arraymove(draft.tabs, tabIndex, tabIndex+1);
                        })
                      }}
                    >Move section down</div>
                  )}
                </Menu.Item>
              </div>}
          </SymbologyMenu>
          <SymbologyMenu 
            button={
              <div 
                className='w-[28px] h-[28px] justify-center m-1 rounded hover:bg-slate-100 flex items-center' 
              >
                  <i className={`text-lg text-slate-400 hover:text-pink-300 ${tab?.icon || 'fad fa-layer-group'} fa-fw mx-auto`} />
              </div>
            }
            width={'w-[190px]'}
          >
            <div className="px-1 py-1 flex flex-wrap">
                {iconList.map(icon => {
                  return (
                    <Menu.Item key={icon}>
                      {({ active }) => (
                        <div 
                          className={`${
                            active ? 'bg-pink-50 ' : ''
                          } rounded-md p-1 text-lg`}
                          onClick={() => {
                            setState(draft => {
                              draft.tabs[tabIndex].icon = icon
                              //console.log('remove tab', state, tabIndex)
                              //draft.tabs.splice(tabIndex,1)
                            })
                          }}
                        >
                          <div className={` cursor-pointer w-[28px] h-[28px] justify-center rounded hover:bg-slate-100 flex items-center ${icon}`} />
                          
                        </div>
                      )}
                    </Menu.Item>
                  )
                })}
              </div>
          </SymbologyMenu>
          <div className='flex items-center ml-1'>
            <SelectSymbology
              tabIndex={tabIndex}
              className={menuButtonContainerClassName}
              modalState={addSymbologyModalState}
              setModalState={setAddSymbologyModalState}
            />
          </div>
        </>
        )}
      </div>
      {/* --- Rows --- */}
      {/* --   -- */}
      <div className='flex flex-col '>
        {(tab?.rows || []).map((row,i) => {
          let RowComp = rowTypes[row.type] || rowTypes['category']
          return (
            <RowComp row={row} rowIndex={i} tabIndex={tabIndex} key={i} />
          )
        })}
      </div>
    </div>

  )
}

export const HEIGHT_OPTIONS = {
  "full": 'calc(95vh)',
  1: "900px",
  "2/3": "600px",
  "1/3": "300px",
  "1/4": "150px",
};

function MapManager () {
  const { state, setState } = React.useContext(MapContext);
  
  const { blankBaseMap, isEdit, hideControls, initialBounds, tabs, height, zoomPan } = useMemo(() => {  
    return {
      isEdit: get(state, ['isEdit'], false),
      blankBaseMap: get(state, ['blankBaseMap'], false),
      hideControls: get(state, ['hideControls'], false),
      initialBounds: get(state, ['initialBounds'], {}),
      height: get(state, ['height'], "full"),
      tabs: get(state, ['tabs'], []),
      zoomPan: get(state, ['zoomPan'], true),
    };
  }, [state]);
  const containerOverflow = isEdit ? 'overflow-x-auto overflow-x-visible' : 'overflow-y-auto';
  return(
    <div className='p-4'>
      <div className={`bg-white/95 w-[340px] ${containerOverflow} rounded-lg drop-shadow-lg pointer-events-auto  min-h-[400px] max-h-[calc(100vh_-_111px)] scrollbar-sm `}>
        <Tab.Group className='flex'>
          <div className='flex flex-col justify-between items-center border-r'>
            <Tab.List className='flex w-[40px] flex-1 flex-col '>
              {tabs.map((tab,i) => (
                <Tab  key={tab.name} as={Fragment}>
                  {({ selected }) => (
                    <div
                      className={`
                        ${selected ? 
                          'text-blue-500 border-r-2 border-blue-600' : 
                          'text-slate-400'} text-sm cursor-pointer
                      `}
                    >
                      <div className='w-full flex items-center'>
                        <i className={`text-lg hover:text-blue-500 ${tab?.icon || 'fad fa-layer-group'} fa-fw mx-auto`} />
                      </div>
                      
                    </div>
                  )}
                </Tab>
              ))}
            </Tab.List>
            {
              isEdit && (
              <>
                <SymbologyMenu 
                  button={
                    <div 
                      className='w-[28px] h-[28px] justify-center m-1 rounded hover:bg-slate-100 flex items-center' 
                    >
                      <MenuDots className='fill-slate-500 hover:fill-pink-300' />
                    </div>
                  }
                >
                  <div className="px-1 py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <div 
                          className={`${
                            active ? 'bg-pink-50 ' : ''
                          } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
                        >
                          Height:
                          <select
                            className={`ml-1 bg-transparent`}
                            value={height}
                            onChange={(e) => {
                              setState((draft) => {
                                console.log("setting new map hieght::", e)
                                draft.height = e.target.value;
                              });
                            }}
                          >
                            {Object.keys(HEIGHT_OPTIONS).map((hOptionKey, i) => {
                              return (
                                <option key={i} value={hOptionKey}>
                                  {HEIGHT_OPTIONS[hOptionKey]}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}
                    </Menu.Item>
                  </div>
                  <div className="px-1 py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <div 
                          className={`${
                            active ? 'bg-pink-50 ' : ''
                          } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
                          onClick={() => {
                            setState(draft => {
                              draft.hideControls = !draft.hideControls;
                            })
                          }}
                        >
                          {hideControls ? "Display Map Controls" : "Hide Map Controls"}
                        </div>
                      )}
                    </Menu.Item>
                  </div>
                  <div className="px-1 py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <div 
                          className={`${
                            active ? 'bg-pink-50 ' : ''
                          } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
                          onClick={() => {
                            setState(draft => {
                              draft.zoomPan = !draft.zoomPan;
                            })
                          }}
                        >
                          {zoomPan ? "Disable zoom/pan" : "Enable zoom/pan"}
                        </div>
                      )}
                    </Menu.Item>
                  </div>
                  <div className="px-1 py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <div 
                          className={`${
                            active ? 'bg-pink-50 ' : ''
                          } group flex w-full items-center rounded-md px-2 py-2 text-sm`}

                          onClick={() => {
                            setState(draft => {
                              draft.setInitialBounds = true;
                            })
                          }}
                        >
                          Set Initial Viewport
                        </div>
                      )}
                    </Menu.Item>
                  </div>
                  {
                    initialBounds && (                  
                      <div className="px-1 py-1">
                        <Menu.Item>
                          {({ active }) => (
                            <div 
                              className={`${
                                active ? 'bg-pink-50 ' : ''
                              } group flex w-full items-center text-red-400 rounded-md px-2 py-2 text-sm`}
    
                              onClick={() => {
                                setState(draft => {
                                  draft.setInitialBounds = false;
                                  draft.initialBounds = null;
                                })
                              }}
                            >
                              Remove Initial Viewport
                            </div>
                          )}
                        </Menu.Item>
                      </div>
                    )
                  }
                  <div className="px-1 py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <div 
                          className={`${
                            active ? 'bg-pink-50 ' : ''
                          } group flex w-full items-center rounded-md px-2 py-2 text-sm`}

                          onClick={() => {
                            setState(draft => {
                              draft.blankBaseMap = !draft.blankBaseMap;
                              console.log("Settting draft.blankBaseMap::", draft.blankBaseMap)
                            })
                          }}
                        >
                          {blankBaseMap ? "Reset base map layer" : "Use blank basemap"}
                        </div>
                      )}
                    </Menu.Item>
                  </div>
                </SymbologyMenu>
                <div 
                  className='p-1 rounded hover:bg-slate-100 m-1 cursor-pointer' 
                  onClick={() => setState(draft => {
                    draft.tabs.push({name: `Layers ${tabs.length - 1}`, icon: 'fad fa-layer-group' ,rows:[]})
                  })}
                >
                  <Plus className='fill-slate-500 hover:fill-pink-700' />
                </div>
              </>
          )}  
          </div>

          <Tab.Panels className='flex-1 w-[220px] '>
            {tabs.map((tab,i) => (
              <Tab.Panel key={i} className='w-full'>
                <TabPanel  tab={tab} tabIndex={i} />
              </Tab.Panel>)
            )}
          </Tab.Panels>
        </Tab.Group>
      </div>
    </div>
  )
}



export default MapManager