import React, { useMemo, useEffect }from 'react'
import { SymbologyContext } from '../../../'
import { MapEditorContext } from "../../../../context"
import { ThemeContext } from "../../../../../../ui/themeContext"
import { Switch } from '@headlessui/react'
import { Close } from '../../icons'
import { rgb2hex, toHex, categoricalColors } from '../../LayerManager/utils'
import { StyledControl } from '../ControlWrappers'
import { get, set } from 'lodash-es'

const getDiffColumns = (baseArray, subArray) => {
  return baseArray.filter(baseItem => !subArray.includes(baseItem))
}
function CategoryControl({path, params={}}) {
  const { state, setState } = React.useContext(SymbologyContext);
  const { falcor, falcorCache, pgEnv } = React.useContext(MapEditorContext);
  const { UI } = React.useContext(ThemeContext) || {};
  const { DndList } = UI;

  const pathBase =
    params?.version === "interactive"
      ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
      : `symbology.layers[${state.symbology.activeLayer}]`;

  let { value: mapPaint, column, categorydata, colors, sourceId, categories, showOther, legenddata } = useMemo(() => {
    return {
      sourceId: get(state,`symbology.layers[${state.symbology.activeLayer}].source_id`),
      value: get(state, `${pathBase}.${path}`, {}),
      column: get(state, `${pathBase}['data-column']`, ''),
      categorydata: get(state, `${pathBase}['category-data']`, {}),
      colors: get(state, `${pathBase}['color-set']`, categoricalColors['cat1']),
      categories: get(state, `${pathBase}['categories']`, {}),
      showOther: get(state, `${pathBase}['category-show-other']`, '#ccc'),
      legenddata : get(state, `${pathBase}['legend-data']`, []),
    }
  },[state])

  const [activeCatIndex, setActiveCatIndex] = React.useState();
  useEffect(() => {
    if(sourceId) {
      falcor.get([
          "dama", pgEnv, "sources", "byId", sourceId, "attributes", "metadata"
      ])
    }
  },[sourceId])

  const metadataLookup = useMemo(() => {
      let out = get(falcorCache, [
          "dama", pgEnv, "sources", "byId", sourceId, "attributes", "metadata", "value", "columns"
      ], [])
      if(out.length === 0) {
        out = get(falcorCache, [
          "dama", pgEnv, "sources", "byId", sourceId, "attributes", "metadata", "value"
        ], [])
      }
      return JSON.parse((out.filter(d => d.name === column)?.[0] || {})?.meta_lookup || "{}")
  }, [sourceId,falcorCache])

  //Number of total distinct values, not counting `null`
  const numCategories = useMemo(() => {
      return Object.values(categorydata)
        .reduce((out,cat) => {
          if(typeof cat[column] !== 'object') {
            out++
          }
          return out
        },0)
   }, [categorydata])

  const currentCategories = categories?.legend?.filter(row => row.label !== "Other") ?? [];
  const availableCategories = getDiffColumns(
    Object.values(categorydata)
      .filter((cat) => typeof cat[column] !== "object")
      .map((catData) => catData[column]),
    currentCategories.map((cat) => cat.label)
  ).map((cat) => ({ label: cat, value: cat }));

  const isShowOtherEnabled = showOther === '#ccc'
  const numCatOptions = [10,20,30,50,100];
  return (
   
      <div className=' w-full items-center'>
        {
          activeCatIndex !== undefined  && 
          <>
            <label className='flex'>
              <div className='flex items-center'>
                <input
                  type='color' 
                  value={toHex(get(state, `${pathBase}['categories'].legend[${activeCatIndex}].color`, colors[(activeCatIndex % colors.length)]))}
                  onChange={(e) => {
                    const updatedCategoryPaint = [...mapPaint];
                    const indexOfLabel = updatedCategoryPaint.indexOf(currentCategories[activeCatIndex].label);
                    updatedCategoryPaint.splice(indexOfLabel+1, 1, e.target.value);

                    setState(draft => {
                      const newLegend = currentCategories.map((d, i) => {
                        if (i === activeCatIndex) {
                          return { color: e.target.value, label: get(metadataLookup, d.label, d.label) }
                        }
                        else {
                          return { color: d.color, label: get(metadataLookup, d.label, d.label) }
                        }
                      })

                      set(draft, `${pathBase}['legend-data']`, newLegend)
                      set(draft, `${pathBase}['categories']`,{
                        paint: updatedCategoryPaint, legend: newLegend
                      });
                    })
                  }}
                />
              </div>
              <div className='flex items-center p-2'>Custom color for {currentCategories[activeCatIndex]?.label} </div>
            </label>
          </>
        }
        <div className='flex items-center'>
          <div className='text-sm text-slate-400 px-2'>Showing</div>
          <div className='border border-transparent hover:border-slate-200 m-1 rounded '>
            <select
              className='w-full p-2 bg-transparent text-slate-700 text-sm'
              value={currentCategories.length}
              onChange={(e) => {
                if(e.target.value <= activeCatIndex){
                  setActiveCatIndex(undefined);
                }
                setState(draft => {
                  set(draft, `${pathBase}['categories']`,{});
                  set(draft, `${pathBase}.['num-categories']`, e.target.value);
                })
              }}
            >
              <option key={'def'} value={currentCategories.length}>{currentCategories.length} Categories</option>
              {numCatOptions
                .filter((d, i) => {
                  return d !== currentCategories.length && 
                    (d < numCategories || 
                      (numCatOptions[i-1] < numCategories)
                    )  
                })
                .map((val,i) => (
                  <option key={i} value={val}>{val} Categories</option>
                ))}
            </select>
          </div>
        </div>
        <div className='flex items-center'>
          <div className='text-sm text-slate-400 px-2'>Show Other</div>
          <div className='flex items-center'>
            <Switch
              checked={isShowOtherEnabled}
              onChange={()=>{
                setState(draft=> {
                  const update = isShowOtherEnabled ? 'rgba(0,0,0,0)' : '#ccc';
                  set(draft, `${pathBase}['category-show-other']`, update) 
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
        <div className='w-full max-h-[250px] overflow-auto'>
          <DndList
            onDrop={(start, end) => {
              setState((draft) => {
                const newCategoryLegend = [...currentCategories];
                const [catItem] = newCategoryLegend.splice(start, 1);
                newCategoryLegend.splice(end, 0, catItem);
                set(
                  draft,
                  `${pathBase}['categories']['legend']`,
                  newCategoryLegend
                );

                const newLegendData = [...legenddata];
                const [legendItem] = newLegendData.splice(start, 1);
                newLegendData.splice(end, 0, legendItem);
                set(
                  draft,
                  `${pathBase}['legend-data']`,
                  newLegendData
                );                
              });
            }}
          >
            {currentCategories.map((d,i) => (
              <div key={i} className='group/title w-full flex items-center hover:bg-slate-100'>
                <div 
                  className='flex items-center h-8 w-8 justify-center  border-r border-b ' 
                  onClick={() => {
                    if (activeCatIndex !== i) {
                      setActiveCatIndex(i);
                    } else {
                      setActiveCatIndex(undefined);
                    }
                  }}
                >
                  <div className='w-4 h-4 rounded border-[0.5px] border-slate-600' style={{backgroundColor:d.color}}/>
                </div>
                <div className='flex items-center text-center flex-1 px-4 text-slate-600 border-b h-8 truncate'>{d.label}</div>
                <div
                  className="group/icon border-b w-8 h-8 flex items-center border-slate-200 cursor-pointer fill-white group-hover/title:fill-slate-300 hover:bg-slate-200"
                  onClick={() => {
                    const updatedCategoryPaint = [...mapPaint];
                    const updatedCategoryLegend = currentCategories.filter(cat => cat.label !== d.label);
                    const indexOfLabel = updatedCategoryPaint.indexOf(d.label);

                    //In filter array, the `label` preceeds its paint `value`
                    updatedCategoryPaint.splice(indexOfLabel, 2);
                    setState(draft=> {
                      set(draft, `${pathBase}['legend-data']`, updatedCategoryLegend)
                      set(draft, `${pathBase}.['num-categories']`, updatedCategoryLegend.length);
                      set(draft, `${pathBase}['categories']`,{
                        paint: updatedCategoryPaint, legend: updatedCategoryLegend.map(d => {
                          return {color: d.color, label: get(metadataLookup, d.label, d.label )}
                        })
                      });
                    });
                  }}
                >
                  <Close
                    className="mx-[6px] cursor-pointer group-hover/icon:fill-slate-500 "
                  />
                </div>
              </div> 
            ))}
          </DndList>
          {isShowOtherEnabled && <div className='w-full flex items-center hover:bg-slate-100'>
              <div className='flex items-center h-8 w-8 justify-center  border-r border-b '>
                <div className='w-4 h-4 rounded border-[0.5px] border-slate-600' style={{backgroundColor: showOther }}/>
              </div>
              <div className='flex items-center text-center flex-1 px-4 text-slate-600 border-b h-8 truncate'>Other</div>
            </div>
          }
          <>
            <div className='text-slate-500 text-[14px] tracking-wide min-h-[32px] flex items-center mx-4'>
                Add Column
            </div>
            <div className="flex-1 flex items-center mx-4 pb-4">
              <StyledControl>
                <label className='flex w-full'>
                  <div className='flex w-full items-center'>
                    <select
                      className='w-full py-2 bg-transparent'
                      value={''}
                      onChange={(e) =>
                        {
                          const updatedCategoryPaint = [...mapPaint];
                          const updatedCategoryLegend = [...currentCategories];

                          const lastColorUsed = updatedCategoryPaint[updatedCategoryPaint.length-2];
                          const lastColorIndex = colors.map(color => rgb2hex(color)).indexOf(lastColorUsed);
                          const nextColor = lastColorIndex < colors.length-1 ? colors[lastColorIndex+1] : colors[0];

                          updatedCategoryLegend.push({ color: nextColor, label: e.target.value })
                          updatedCategoryPaint.splice(mapPaint.length-1, 0, e.target.value, rgb2hex(nextColor));
                          
                          setState(draft=> {
                            set(draft, `${pathBase}['categories']`,{
                              paint: updatedCategoryPaint, legend: updatedCategoryLegend.map(d => {
                                return {color: d.color, label: get(metadataLookup, d.label, d.label )}
                              })
                            });
                            set(draft, `${pathBase}.['num-categories']`, updatedCategoryLegend.length);
                            set(draft, `${pathBase}['legend-data']`, updatedCategoryLegend) 
                          });
                        }
                      }
                    >
                      <option key={-1} value={""}></option>
                      {(availableCategories || []).sort((a,b) => a.label - b.label).map((opt, i) => (
                        <option key={i} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
              </StyledControl>
            </div>
          </>
        </div>
      </div>
    )
}

export {CategoryControl}