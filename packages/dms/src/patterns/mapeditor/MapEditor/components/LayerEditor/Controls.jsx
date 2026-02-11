import React, { useMemo, useEffect, Fragment, useState }from 'react'
import {SymbologyContext} from '../../'
import { MapEditorContext } from "../../../context"
import { Menu, Transition, Switch } from '@headlessui/react'
import isEqual from 'lodash/isEqual'
import { CaretDown, Close } from '../icons'
import { rgb2hex, toHex, categoricalColors, rangeColors } from '../LayerManager/utils'
import {categoryPaint, isValidCategoryPaint ,choroplethPaint} from './datamaps'
import colorbrewer from '../LayerManager/colors'//"colorbrewer"
import { StyledControl } from './ControlWrappers'
import get from 'lodash/get'
import set from 'lodash/set'
import cloneDeep from 'lodash/cloneDeep'
import { CategoryControl } from './CategoryControl';
import { InteractiveFilterControl } from './InteractiveFilterControl';
import { FilterGroupControl } from './FilterGroupControl';
import { ViewGroupControl } from './ViewGroupControl';

function ControlMenu({ button, children}) {
  const { state, setState  } = React.useContext(SymbologyContext);

  return (
      <Menu as="div" className="relative inline-block text-left w-full">
        <Menu.Button className='w-full'>
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
          <Menu.Items className='absolute -right-[10px] w-[226px] max-h-[400px] overflow-auto py-2 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none z-20'>
            {children}
          </Menu.Items>
        </Transition>
      </Menu>
  )
}

export function SelectTypeControl({path, datapath, params={}}) {
  const { state, setState } = React.useContext(SymbologyContext);
  const { falcor, falcorCache, pgEnv } = React.useContext(MapEditorContext);
  //console.log('select control', {path, datapath, params})

  const pathBase =
    params?.version === "interactive"
      ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
      : `symbology.layers[${state.symbology.activeLayer}]`;

  let { sourceId, column, } = useMemo(() => {
    return {

      sourceId: get(state,`symbology.layers[${state.symbology.activeLayer}].source_id`),
      column: get(state, `${pathBase}['data-column']`, ''),

    }
  },[state])

  useEffect(() => {
    //console.log('getmetadat', sourceId)
    if(sourceId) {
      falcor.get([
          "dama", pgEnv, "sources", "byId", sourceId, "attributes", "metadata"
      ])//.then(d => console.log('source metadata sourceId', sourceId, d));
    }
  },[sourceId])

  const metadata = useMemo(() => {
    //console.log('getmetadata', falcorCache)
      let out = get(falcorCache, [
          "dama", pgEnv, "sources", "byId", sourceId, "attributes", "metadata", "value", "columns"
      ], [])
      if(out.length === 0) {
        out = get(falcorCache, [
          "dama", pgEnv, "sources", "byId", sourceId, "attributes", "metadata", "value"
        ], [])
      }
      return out

  }, [sourceId,falcorCache])


  return (
    <label className='flex w-full'>
      <div className='flex w-full items-center'>
        <select
          className='w-full p-2 bg-transparent'
          value={get(state, `${pathBase}.${path}`, params.default || params?.options?.[0]?.value ) || ""}
          onChange={(e) => setState(draft => {
            if(!column && e.target.value === 'categories') {
              const defaultColorColumn = metadata?.filter(col => !['integer', 'number'].includes(col.type))[0]?.name ?? metadata[0]?.name;
              set(draft, `${pathBase}['data-column']`, defaultColorColumn)
            } else if (e.target.value === 'choropleth') {
              const currentColumn = metadata?.find(col => col.name === column);
              if(!['integer', 'number'].includes(currentColumn?.type)) {
                const defaultColorColumn = metadata.filter(col => ['integer', 'number'].includes(col.type))[0]?.name ?? metadata[0]?.name;
                set(draft, `${pathBase}['data-column']`, defaultColorColumn)
              }
            }
            set(draft, `${pathBase}.${path}`, e.target.value)
          })}
        >
          {(params.options || []).map((opt,i) => {
            return (
              <option key={i} value={opt.value}>{opt.name}</option>
            )
          })}
        </select>
      </div>
    </label>
  )
} 

function ColorControl({ path, params = {} }) {
  const { state, setState } = React.useContext(SymbologyContext);

  const pathBase =
    params?.version === "interactive"
      ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
      : `symbology.layers[${state.symbology.activeLayer}]`;

  return (
        <input
          type='color' 
          value={toHex(get(state, `${pathBase}.${path}`, '#ccc'))}
          onChange={(e) => setState(draft => {
            set(draft, `${pathBase}.${path}`, e.target.value)
          })}
        />
  );
}

function HexColor({ path, params = {} }) {
  const { state, setState } = React.useContext(SymbologyContext);

  const pathBase =
    params?.version === "interactive"
      ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
      : `symbology.layers[${state.symbology.activeLayer}]`;

  return (
    <input
      className="max-w-[50%] ml-2"
      type="text"
      value={get(state, `${pathBase}.${path}`)}
      onChange={(e) =>
        setState((draft) => {
          set(draft, `${pathBase}.${path}`, e.target.value);
        })
      }
    />
  );
}

function RangeControl({path,params={}}) {
  const { state, setState } = React.useContext(SymbologyContext);
  const identity = (d) => d
  const f = params?.format || identity  
  
  const pathBase =
    params?.version === "interactive"
      ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
      : `symbology.layers[${state.symbology.activeLayer}]`;

  return (
    <div className='flex w-full  items-center'>
      <div className='flex-1 flex w-full'>
        <input
          className='w-full flex-1 accent-slate-600 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700">'
          type='range'
          min={params.min || "0"}
          max={params.max || "1"}
          step={params.step || "0.01"}
          value={get(state, `${pathBase}].${path}`, params.default || "1")}
          onChange={(e) => setState(draft => {
            set(draft, `${pathBase}].${path}`, +e.target.value)
          })}
        />
      </div>
      <div className='pl-2'>
        <input 
          className='w-14 px-2 py-1 bg-transparent'
          value={`${f(get(state, `${pathBase}].${path}`, params.default || "1"))}${params.units ? params.units : ''}`} 
          onChange={() => {}}
        />
      </div>
    </div>
  )
}

function SimpleControl({path, params={}}) {
  const { state, setState } = React.useContext(SymbologyContext);

  const pathBase =
    params?.version === "interactive"
      ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
      : `symbology.layers[${state.symbology.activeLayer}]`;

  return (
    <label className='flex'>
      <div className='flex items-center'>
        <input
          className='w-full'
          type='text' 
          value={get(state, `${pathBase}.${path}`, params?.default ?? '#ccc')}
          onChange={(e) => setState(draft => {
            set(draft, `${pathBase}.${path}`, e.target.value)
          })}
        />
      </div>
    </label>
  )
}

function ToggleControl({path, params={title:"", default: false}}) {
  const { state, setState } = React.useContext(SymbologyContext);

  const pathBase =
    params?.version === "interactive"
      ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
      : `symbology.layers[${state.symbology.activeLayer}]`;

  const { value } = useMemo(() => {
    return {
      value: get(state, `${pathBase}.${path}`, params.default),
    }
  },[state]);

  return (
    <label className='flex'>
      <div className='flex items-center'>
        <Switch
          checked={value}
          onChange={()=>{
            setState(draft=> {
              set(draft, `${pathBase}${path}`,!value)
            })
          }}
          className={`${
            value ? 'bg-blue-500' : 'bg-gray-200'
          } relative inline-flex h-4 w-8 items-center rounded-full `}
        >
          <span className="sr-only">{params.title}</span>
          <div
            className={`${
              value ? 'translate-x-5' : 'translate-x-0'
            } inline-block h-4 w-4  transform rounded-full bg-white transition border-[0.5] border-slate-600`}
          />
        </Switch>
      </div>
    </label>
  )
}

export function SelectControl({path, params={}}) {
  //console.log("select control path::", path)
  const { state, setState } = React.useContext(SymbologyContext);
  //console.log('select control', params)
  const pathBase =
    params?.version === "interactive"
      ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
      : `symbology.layers[${state.symbology.activeLayer}]`;

  return (
    <label className='flex w-full'>
      <div className='flex w-full items-center'>
        <select
          className='w-full py-2 bg-transparent'
          value={get(state, `${pathBase}.${path}`, params.default || params?.options?.[0]?.value )}
          onChange={(e) => setState(draft => {
            set(draft, `${pathBase}.${path}`, e.target.value)
          })}
        >
          {(params?.options || []).map((opt,i) => {
            return (
              <option key={i} value={opt.value}>{opt.name}</option>
            )
          })}
        </select>
      </div>
    </label>
  )
}



function SelectViewColumnControl({path, datapath, params={}}) {
  const { state, setState } = React.useContext(SymbologyContext);
  const { falcor, falcorCache, pgEnv } = React.useContext(MapEditorContext);

  const pathBase =
    params?.version === "interactive"
      ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
      : `symbology.layers[${state.symbology.activeLayer}]`;

  const { layerType, viewId, sourceId, method } = useMemo(() => ({
    layerType: get(state,`${pathBase}['layer-type']`),
    viewId: get(state,`symbology.layers[${state.symbology.activeLayer}].view_id`),
    sourceId: get(state,`symbology.layers[${state.symbology.activeLayer}].source_id`),
    method: get(state, `${pathBase}['bin-method']`, 'ckmeans'),
  }),[state])

  const column = useMemo(() => {
    return get(state, `${pathBase}.${path}`, null )
  },[state, path])

  useEffect(() => {
    if(sourceId) {
      falcor.get([
          "dama", pgEnv, "sources", "byId", sourceId, "attributes", "metadata"
      ]);
    }
  },[pgEnv, sourceId])

  const metadata = useMemo(() => {
    let out = get(falcorCache, [
          "dama", pgEnv, "sources", "byId", sourceId, "attributes", "metadata", "value", "columns"
      ], [])
    if(out.length === 0) {
        out = get(falcorCache, [
          "dama", pgEnv, "sources", "byId", sourceId, "attributes", "metadata", "value"
        ], [])
      }
    return out
  }, [pgEnv, sourceId, falcorCache])

  return (
    <label className='flex w-full'>
      <div className='flex w-full items-center'>
        <select
          className='w-full p-2 bg-transparent'
          value={column}
          onChange={(e) => setState(draft => {
            let sourceTiles = get(state, `${pathBase}.sources[0].source.tiles[0]`, 'no source tiles').split('?')[0]
            
            if(sourceTiles !== 'no source tiles') {
              set(draft, `${pathBase}.sources[0].source.tiles[0]`, sourceTiles+`?cols=${e.target.value}`)
            }
            if(layerType === 'circles') {
              set(draft, `${pathBase}['lower-bound']`, null);
              set(draft, `${pathBase}['upper-bound']`, null);
              set(draft, `${pathBase}['min-radius']`, 8);
              set(draft, `${pathBase}['max-radius']`, 128);
            }

            // Custom color scale relies on a premade scale
            // So, when we change data columns, we need to reset the color scale first
            if(method === 'custom') {
              set(draft, `${pathBase}['bin-method']`, 'ckmeans');
            }
            set(draft, `${pathBase}['choroplethdata']`, {});
            set(draft, `${pathBase}['categories']`, {});
            set(draft, `${pathBase}.${path}`, e.target.value)
          })}
        >
          {(metadata && metadata.length ? metadata : [])
            .filter(d => {
              if(layerType === 'choropleth' && !['integer', 'number'].includes(d.type)){
                return false
              }
              return true
            })
            .filter(d => !['wkb_geometry'].includes(d.name))
            .sort((a,b) => {
              const aLabel = a.display_name || a.name;
              const bLabel = b.display_name || b.name;
              if(aLabel < bLabel) {
                return -1
              } else {
                return 1
              }
            })
            .map((col,i) => {
            return (
              <option key={i} value={col.name}>{col.display_name || col.name}</option>
            )
          })}
        </select>
      </div>
    </label>
  )
}

function ColorRangeControl({path, params={}}) {
  const { state, setState } = React.useContext(SymbologyContext);
  
  const pathBase =
    params?.version === "interactive"
      ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
      : `symbology.layers[${state.symbology.activeLayer}]`;

  let rangeColorKey = get(state, `${pathBase}['range-key']`,colorbrewer.schemeGroups.sequential[0])
  let numbins = get(state, `${pathBase}['num-bins']`, 9)
  // console.log('select control', colorbrewer,rangeColorKey, numbins)
  let value = get(state, `${pathBase}.${path}`, colorbrewer[rangeColorKey][numbins])
  
  // console.log('value', value, path, colorbrewer)

  return (
      <div className='flex w-full items-center'>
        <ControlMenu 
          button={<div className='flex items-center w-full cursor-pointer flex-1'>
            <div className='flex-1 flex justify-center '>
              {(value.map ? value : []).map((d,i) => <div key={i} className='flex-1 h-4' style={{backgroundColor: d}} />)}
            </div>
            <div className='flex items-center px-1 border-2 border-transparent h-8  hover fill-slate-400 hover:fill-slate-800 cursor-pointer'> 
              <CaretDown  className=''/> 
            </div>
          </div>
          }
        >
          <Menu.Item className='z-20'>
            <div className='px-4 font-semibold text-sm text-slate-600'>SEQUENTIAL</div>
          </Menu.Item>
          {[
            ...colorbrewer.schemeGroups.sequential,
            ...colorbrewer.schemeGroups.singlehue
            ].map(colorKey => {
            //console.log('color', colorKey)
            return (
              <Menu.Item className='z-20' key={colorKey}>
                {({ active }) => (
                  <div className={`${active ? 'bg-blue-50 ' : ''} flex`} >
                    <div className='w-4 h-4' />
                    <div
                      className = {`flex-1 flex w-full p-2`}
                      onClick={() => setState(draft => {
                        set(draft, `${pathBase}.${path}`, colorbrewer[colorKey][numbins])
                        set(draft, `${pathBase}['range-key']`, colorKey)
                      })}
                    >
                      {colorbrewer[colorKey][numbins].map((d,i) => <div key={i} className='flex-1 h-4' style={{backgroundColor: d}} />)}
                    </div>
                  </div>
                )}
              </Menu.Item>
            )
          })}
          <Menu.Item className='z-20'>
            <div className='px-4 font-semibold text-sm text-slate-600'>Diverging</div>
          </Menu.Item>
          {colorbrewer.schemeGroups.diverging.map(colorKey => {
            return (
              <Menu.Item className='z-20' key={colorKey}>
                {({ active }) => (
                  <div className={`${active ? 'bg-blue-50 ' : ''} flex`} >
                    <div className='w-4 h-4' />
                    <div
                      className = {`flex-1 flex w-full p-2`}
                      onClick={() => setState(draft => {
                        set(draft, `${pathBase}.${path}`, colorbrewer[colorKey][numbins])
                        set(draft, `${pathBase}['range-key']`, colorKey)
                      })}
                    >
                      {colorbrewer[colorKey][numbins].map((d,i) => <div key={i} className='flex-1 h-4' style={{backgroundColor: d}} />)}
                    </div>
                  </div>
                )}
              </Menu.Item>
            )
          })}
        </ControlMenu>
      </div>
    )
}

function CategoricalColorControl({path, params={}}) {
  const { state, setState } = React.useContext(SymbologyContext);
  // console.log('select control', params)
  let colors = categoricalColors;

  const pathBase =
    params?.version === "interactive"
      ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
      : `symbology.layers[${state.symbology.activeLayer}]`;

  let { value, categories } = useMemo(() => {
    return {
      value: get(state, `${pathBase}.${path}`, colors['cat1']),
      categories: get(state, `${pathBase}['categories']`, {}),
    }
  }, [state]);

  const replaceCategoryPaint = (oldCategories, newColors) => {
    const newLegend = oldCategories.legend.map((row, i) => {
      return { ...row, color: toHex(newColors[i]) };
    });

    const newPaint = oldCategories.paint.map((row, i) => {
      if (i < 3 || i === oldCategories.paint.length - 1) {
        return row;
      } else if (i % 2 === 1) {
        return toHex(newColors[((i + 1) / 2 - 2) % newColors.length]);
      } else {
        return row;
      }
    });
    return { paint: newPaint, legend: newLegend };
  };

  // console.log('value', value, path)
  return (
      <div className='flex w-full items-center'>
        <ControlMenu 
          button={<div className='flex items-center w-full cursor-pointer flex-1'>
            <div className='flex-1 flex justify-center '>
              {(value.map ? value : []).map((d,i) => <div key={i} className='w-4 h-4' style={{backgroundColor: d}} />)}
            </div>
            <div className='flex items-center px-1 border-2 border-transparent h-8  hover fill-slate-400 hover:fill-slate-800 cursor-pointer'> 
              <CaretDown  className=''/> 
            </div>
          </div>
          }
        >
          {Object.keys(colors).map(colorKey => {
            return (
              <Menu.Item className='z-20' key={colorKey}>
                {({ active }) => (
                  <div className={`${active ? 'bg-blue-50 ' : ''} flex`} >
                    <div className='w-4 h-4' />
                    <div
                      className = {`flex-1 flex w-full p-2`}
                      onClick={() => {
                        setState(draft => {
                          const newCategories = replaceCategoryPaint(categories, colors[colorKey]);
                          set(draft, `${pathBase}.${path}`, colors[colorKey]);
                          set(draft, `${pathBase}['categories']`, newCategories);
                        });
                      }}
                    >
                      {colors[colorKey].map((d,i) => <div key={i} className='w-4 h-4' style={{backgroundColor: d}} />)}
                    </div>
                  </div>
                )}
              </Menu.Item>
            )
          })}
        </ControlMenu>
      </div>
    )
}

function CircleControl({path, params={}}) {
  const { state, setState } = React.useContext(SymbologyContext);
  const { falcor, falcorCache, pgEnv } = React.useContext(MapEditorContext);
  // console.log('CircleControl', params)

  const pathBase =
    params?.version === "interactive"
      ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
      : `symbology.layers[${state.symbology.activeLayer}]`;

  let { lowerBound, upperBound, minRadius, maxRadius, radiusCurve, curveFactor } = useMemo(() => {
    return {
      lowerBound: get(state, `${pathBase}.layers[0].paint['circle-radius'][3]`),
      minRadius: get(state, `${pathBase}.layers[0].paint['circle-radius'][4]`),
      upperBound: get(state, `${pathBase}.layers[0].paint['circle-radius'][5]`),
      maxRadius: get(state, `${pathBase}.layers[0].paint['circle-radius'][6]`),
      radiusCurve: get(state, `${pathBase}.layers[0].paint['circle-radius'][1][0]`, 'linear'),
      curveFactor: get(state, `${pathBase}.layers[0].paint['circle-radius'][1][1]`, 1),
    }
  },[state]);

  //layerPaintPath = "layers[0].paint['circle-radius']"
  //"layers[0].paint['circle-radius'][1][0]" is the curve function
  //"layers[0].paint['circle-radius'][1][1]" is the `base` 
      //Controls the rate at which the output increases: higher values make the output 
      //increase more towards the high end of the range. 
      //With values close to 1 the output increases linearly.
  //"layers[0].paint['circle-radius'][3]" is the lower bound for interpolation function
  //"layers[0].paint['circle-radius'][4]" is the min radius of the circle
  //"layers[0].paint['circle-radius'][5]" is the upper bound for the interpolation function
  //"layers[0].paint['circle-radius'][6]" is the max radius of the circle
  return (
    <div className=" w-full items-center">
      <div className="flex items-center">
        <div className="text-sm text-slate-400 pl-2">Radius curve:</div>
        <div className="w-full border border-transparent hover:border-slate-200 rounded mr-1 mb-1">
          <select
            className='w-full p-2 pl-0 bg-transparent text-slate-700 text-sm'
            value={radiusCurve}
            onChange={(e) => {
              setState((draft) => {
                set(
                  draft,
                  `${pathBase}['radius-curve']`,
                  e.target.value
                );
              });
            }}
          >
            <option value='linear'>Linear</option>
            <option value='exponential'>Exponential</option>
          </select>
        </div>
      </div>
      {radiusCurve === 'exponential' && <div className="flex items-center">
        <div className="text-sm text-slate-400 px-2">Curve Factor:</div>
        <div className="border border-transparent hover:border-slate-200 m-1 rounded ">
          <input
            className="block w-full border border-transparent hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent py-1 px-1 text-slate-800 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6"
            type="number"
            value={curveFactor}
            step=".1"
            onChange={(e) => {
              setState((draft) => {
                set(
                  draft,
                  `${pathBase}['curve-factor']`,
                  parseFloat(e.target.value)
                );
              });
            }}
          />
        </div>
      </div>}
      <div className="flex items-center">
        <div className="text-sm text-slate-400 px-2">Min Radius:</div>
        <div className="border border-transparent hover:border-slate-200 m-1 rounded ">
          <input
            className="block w-full border border-transparent hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent py-1 px-1 text-slate-800 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6"
            type="number"
            value={minRadius}
            onChange={(e) => {
              setState((draft) => {
                set(
                  draft,
                  `${pathBase}['min-radius']`,
                  parseInt(e.target.value)
                );
              });
            }}
          />
        </div>
      </div>
      <div className="flex items-center">
        <div className="text-sm text-slate-400 px-2">Max Radius:</div>
        <div className="border border-transparent hover:border-slate-200 m-1 rounded ">
          <input
            className="block w-full border border-transparent hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent py-1 px-1 text-slate-800 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6"
            type="number"
            value={maxRadius}
            onChange={(e) => {
              setState((draft) => {
                set(
                  draft,
                  `${pathBase}['max-radius']`,
                  parseInt(e.target.value)
                );
              });
            }}
          />
        </div>
      </div>
      <div className="flex items-center">
        <div className="text-sm text-slate-400 px-2">Lower Bound:</div>
        <div className="border border-transparent hover:border-slate-200 m-1 rounded ">
          <input
            className="block w-full border border-transparent hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent py-1 px-1 text-slate-800 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6"
            type="number"
            value={lowerBound}
            onChange={(e) => {
              setState((draft) => {
                set(
                  draft,
                  `${pathBase}['lower-bound']`,
                  parseInt(e.target.value)
                );
              });
            }}
          />
        </div>
      </div>
      <div className="flex items-center">
        <div className="text-sm text-slate-400 px-2">Upper Bound:</div>
        <div className="border border-transparent hover:border-slate-200 m-1 rounded ">
          <input
            className="block w-full border border-transparent hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent py-1 px-1 text-slate-800 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6"
            type="number"
            value={upperBound}
            onChange={(e) => {
              setState((draft) => {
                set(
                  draft,
                  `${pathBase}['upper-bound']`,
                  parseInt(e.target.value)
                );
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}

function roundToNearestTen(v) {
  return Math.pow(10, Math.round(Math.log10(v)));
}

function ChoroplethControl({path, params={}}) {
  const { state, setState } = React.useContext(SymbologyContext);
  const { falcor, falcorCache, pgEnv } = React.useContext(MapEditorContext);
  // console.log('select control', params)
  //let colors = categoricalColors
  const pathBase =
    params?.version === "interactive"
      ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
      : `symbology.layers[${state.symbology.activeLayer}]`;

  let { numbins, method, colorKey, legenddata, showOther, choroplethdata, isLoadingColorbreaks } = useMemo(() => {
    return {
      numbins: get(state, `${pathBase}['num-bins']`, 9),
      colorKey: get(state, `${pathBase}['range-key']`, 'seq1'),
      method: get(state, `${pathBase}['bin-method']`, 'ckmeans'),
      legenddata: get(state, `${pathBase}['legend-data']`),
      choroplethdata: get(state, `${pathBase}['choroplethdata']`, { breaks: [] }),
      showOther: get(state, `${pathBase}['category-show-other']`, '#ccc'),
      isLoadingColorbreaks: get(state, `${pathBase}['is-loading-colorbreaks']`, false)
    }
  },[state])

  const { breaks, max } = choroplethdata;

  const categories = breaks?.map((d,i) => {
    return {color: legenddata[i]?.color, label: `${breaks[i]?.toLocaleString('en-US')} - ${breaks[i+1]?.toLocaleString('en-US') || max}`}
  })
  .filter(d => d.color && d.label);

  const isShowOtherEnabled = showOther === '#ccc'
  const breakInputs = breaks?.map((breakValue, breakIndex) => {
    const displayedValue = breakIndex === 0 ? `Minimum: ${breakValue}`: breakValue
    return (
      <input
        key={`custom_breaks_${breakIndex}`}
        className='block w-full border border-transparent hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent py-1 px-1 text-slate-800 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6'
        type='text' 
        value={displayedValue}
        disabled={breakIndex === 0}
        onChange={(e) => {
          setState(draft => {
            const newBreaks = [...breaks];
            let parsedVal = e.target.value;

            //If last element is a decimal, and the new string is longer than the previous string
            if(parsedVal.slice(-1) === '.' && parsedVal.length > breaks[breakIndex].toString().length) {
              //User is attempting to input a decimal place
              //Add a `1` to the end so that is parses correctly
              //Adding a `0` will not allow the user to continue to add digits after the decimal
              parsedVal = parsedVal + "1"
            }

            newBreaks[breakIndex] = parseFloat(parsedVal)

            if(Number.isNaN(newBreaks[breakIndex])){
              newBreaks[breakIndex] = 0;
            }
            set(draft, `${pathBase}['choroplethdata']['breaks']`, newBreaks)
          })
        }}
      />
    )
  });
  if(breakInputs){
    breakInputs.push(
      <input
        key={`${max}`}
        className="block w-full border border-transparent hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent py-1 px-1 text-slate-800 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6"
        type="text"
        value={`Maximum: ${max}`}
        disabled={true}
      />
    );
  }

  /**
   * categories[0] is breaks[0] to breaks[1]
   * categories[n-1] (last element) is breaks[n-1] to max
   * minimum value of non-first break, is the value of the prior break + 1
   * max value of non-last break, is the value of the next break - 1
   */
    // console.log("inside choropleth, categories::", categories)
  const rangeInputs = categories?.map((category, catIndex) => {
    return (
      <div key={`range_input_${catIndex}`}>
        <div
          key={catIndex}
          className="w-full flex items-center hover:bg-slate-100 cursor-auto"
        >
          <div className="flex items-center h-8 w-8 justify-center  border-r border-b ">
            <div
              className="w-4 h-4 rounded border-[0.5px] border-slate-600"
              style={{ backgroundColor: category.color }}
            />
          </div>
          <div className="flex items-center justify-between text-center flex-1 px-2 text-slate-600 border-b h-8 truncate overflow-auto w-full">
            <div className='px-2 w-[10px]'>
              {
                catIndex !== 0 && 
                  <i 
                    className="fa-solid fa-chevron-left cursor-pointer hover:text-pink-700"
                    onClick={() => {
                      console.log("move lower bound for range::", category.label);
                      setState((draft) => {
                        const minBreakValue = breaks[catIndex-1] + 1;
                        const newBreaks = [...breaks];
                        newBreaks[catIndex] = catIndex !== 0 ? Math.max(newBreaks[catIndex] - roundToNearestTen(newBreaks[catIndex]/10), minBreakValue) : newBreaks[catIndex] - roundToNearestTen(newBreaks[catIndex]/10);
                        set(draft, `${pathBase}['choroplethdata']['breaks']`, newBreaks)
                      })
                    }}
                  />
              }
            </div>
            {category.label}
            <div className='px-2 w-[10px]'>
              {
                catIndex !== categories.length-1 && 
                  <i 
                    className="fa-solid fa-chevron-right cursor-pointer hover:text-pink-700"
                    onClick={() => {
                      console.log("move upper bound for range::", category.label);
                      setState((draft) => {
                        const newBreaks = [...breaks];
                        if(catIndex !== categories.length-1){
                          const maxBreakValue = catIndex === categories.length-2 ? max - 1 : breaks[catIndex+2] - 1;
                          newBreaks[catIndex+1] = Math.min(newBreaks[catIndex+1] + roundToNearestTen(newBreaks[catIndex+1]/10), maxBreakValue);
                          set(draft, `${pathBase}['choroplethdata']['breaks']`, newBreaks)
                        }
                        else {
                          //adjust max
                          const newMax = max + roundToNearestTen(max/10);
                          set(draft, `${pathBase}['choroplethdata']['max']`, newMax)
                        }
                      })
                    }}
                  />
              }
            </div>
          </div>
        </div>
      </div>
    );
  });

  return (
      <div className=' w-full items-center'>
        <div className='flex items-center'>
          <div className='text-sm text-slate-400 px-2'>Showing</div>
          <div className='border border-transparent hover:border-slate-200 m-1 rounded '>
            <select
              className='w-full p-2 bg-transparent text-slate-700 text-sm'
              value={numbins}
              onChange={(e) => setState(draft => {
                set(draft, `${pathBase}.['num-bins']`, e.target.value)
                if(method === 'custom'){
                  const diffBins = numbins - e.target.value;
                  if(diffBins > 0) {
                    const newBreaks = [...breaks].slice(0,-diffBins);
                    set(draft, `${pathBase}['choroplethdata']['breaks']`, newBreaks)
                  } else {
                    const numBinsToAdd = diffBins * -1;
                    //Add empty positions
                    const newBreaks = [...breaks];
                    for(let i=0; i<numBinsToAdd; i++) {
                      newBreaks.push(max)
                    }
                    set(draft, `${pathBase}['choroplethdata']['breaks']`, newBreaks);
                  }
                }
                else {
                  set(draft, `${pathBase}.['choroplethdata']`, {});
                }
                set(draft, `${pathBase}.['color-range']`, colorbrewer[colorKey][e.target.value])
              })}
            >
              {(Object.keys(colorbrewer[colorKey]) || [])
                .map((val,i) => {
                  return (
                    <option key={i} value={val}>{val}</option>
                  )
              })}
            </select>
          </div>
        </div>
        <div className='flex items-center'>
          <div className='text-sm text-slate-400 px-2'>Method</div>
          <div className='border border-transparent hover:border-slate-200 m-1 rounded '>
            <select
              className='w-full p-2 bg-transparent text-slate-700 text-sm'
              value={method}
              onChange={(e) => setState(draft => {
                if(e.target.value !== "custom") {
                  set(draft, `${pathBase}.['choroplethdata']`, {});
                }
                set(draft, `${pathBase}['bin-method']`, e.target.value)
              })}
            >
              <option  value={'ckmeans'}>ck-means</option>
              {/* <option  value={'pretty'}>Pretty Breaks</option> */}
              <option  value={'equalInterval'}>Equal Interval</option>
              <option  value={'custom'}>Custom</option>
             
            </select>
          </div>
        </div>
        <div className='flex items-center pb-2'>
          <div className='text-sm text-slate-400 px-2'>Show missing data</div>
          <div className='flex items-center'>
            <Switch
              checked={isShowOtherEnabled}
              onChange={()=>{
                setState(draft=> {
                  const update = isShowOtherEnabled ? 'rgba(0,0,0,0)' : '#ccc';
                  set(draft, `${pathBase}['category-show-other']`,update)
                })
              }}
              className={`${
                isShowOtherEnabled ? 'bg-blue-500' : 'bg-gray-200'
              } relative inline-flex h-4 w-8 items-center rounded-full `}
            >
              <span className="sr-only">Show other</span>
              <div
                className={`${
                  isShowOtherEnabled ? 'translate-x-5' : 'translate-x-0'
                } inline-block h-4 w-4  transform rounded-full bg-white transition border-[0.5] border-slate-600`}
              />
            </Switch>

          </div>

        </div>
        {
          method === 'custom' && <div className='flex flex-col px-2'>
            <>Breaks:{breakInputs}</>
          </div>
        }
        <div className='w-full max-h-[300px] overflow-auto'>
          {
            isLoadingColorbreaks ?  (
                <div className="flex w-full justify-center overflow-hidden pb-2" >
                  Creating scale...
                  <span style={ { fontSize: "1.5rem" } } className={ `ml-2 fa-solid fa-spinner fa-spin` }/> 
                </div>
              ) : method === 'custom' ? <><div className='p-2'>Ranges:</div>{rangeInputs}</> : rangeInputs
          }
          {isShowOtherEnabled && <div className='w-full flex items-center hover:bg-slate-100'>
            <div className='flex items-center h-8 w-8 justify-center  border-r border-b '>
              <div className='w-4 h-4 rounded border-[0.5px] border-slate-600' style={{backgroundColor: showOther }}/>
            </div>
            <div className='flex items-center text-center flex-1 px-4 text-slate-600 border-b h-8 truncate'>No data</div>
            </div>
          }
        </div>
      </div>
    )
}

export const AddColumnSelectControl = ({setState, availableColumnNames, selectedColumns, label="Add Column"}) => {
  //IDK why but I can't get the array of objects to sort. So we make a sorted array of labels and then look stuff up later
  const sortedColNames = availableColumnNames.map(d => d.label).sort();
  return (
    <>
      <div className='text-slate-500 text-[14px] tracking-wide min-h-[32px] flex items-center ml-4'>
          {label}
      </div>
      <div className="flex-1 flex items-center mx-4">
        <StyledControl>
          <label className='flex w-full'>
            <div className='flex w-full items-center'>
              <select
                className='w-full py-2 bg-transparent'
                value={''}
                onChange={(e) =>
                  setState(e.target.value)
                }
              >
                <option key={-1} value={""}></option>
                {(sortedColNames || []).map((opt, i) => (
                  <option key={i} value={availableColumnNames.find(col => col.label === opt)?.value}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </StyledControl>
      </div>
    </>
  )
}

export const controlTypes = {
  'color': ColorControl,
  'hexColor': HexColor,
  'categoricalColor': CategoricalColorControl,
  'rangeColor': ColorRangeControl,
  'categoryControl': CategoryControl,
  'choroplethControl':ChoroplethControl,
  'circleControl': CircleControl,
  'interactiveFilterControl': InteractiveFilterControl,
  'range': RangeControl,
  'simple': SimpleControl,
  'select': SelectControl,
  'selectType': SelectTypeControl,
  'selectViewColumn': SelectViewColumnControl,
  'filterGroupControl': FilterGroupControl,
  'viewGroupControl': ViewGroupControl,
  'toggleControl': ToggleControl,
}
