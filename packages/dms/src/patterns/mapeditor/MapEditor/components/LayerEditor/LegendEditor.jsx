import React, { useMemo}from 'react'
import {SymbologyContext} from '../../'
import { get, set } from 'lodash-es'

import { InteractiveFilterControl } from './InteractiveFilterControl'
import typeConfigs from './typeConfigs'


const typeSymbols = {
  'fill': ({layer,color}) => {
      //let color = get(layer, `layers[1].paint['fill-color']`, '#ccc')
      return (
        <div className='pr-2'>
          <div className={'w-4 h-4 rounded '} style={{backgroundColor:color}} />
        </div>
      )
  },
  'circle': ({layer,color}) => {
      //let color = get(layer, `layers[0].paint['circle-color']`, '#ccc')
      let borderColor = get(layer, `layers[0].paint['circle-stroke-color']`, '#ccc')
      return (
        <div className='pl-0.5 pr-2'>
          <div className={'w-3 h-3 rounded-full '} style={{backgroundColor:color, borderColor}} />
        </div>
      )
  },
  'line': ({layer, color}) => {
      return (
        <div className='pr-2'>
          <div className={'w-4 h-1'} style={{backgroundColor:color}} />
        </div>
      )
  }
}



function LegendEditor() {

// console.log("LegendEditor")

  const { state, setState  } = React.useContext(SymbologyContext);
  const { layerType, selectedInteractiveFilterIndex } = useMemo(() => {
    return {
      selectedInteractiveFilterIndex: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}]['selectedInteractiveFilterIndex']`
      ),
      layerType: get(state, `symbology.layers[${state.symbology.activeLayer}]['layer-type']`, 'fill'),
    }
  },[state]);

  let pathBase = `symbology.layers[${state.symbology.activeLayer}]`;
  if (layerType === "interactive") {
    pathBase = `symbology.layers[${state.symbology.activeLayer}]['interactive-filters'][${selectedInteractiveFilterIndex}]`;
  }
  
  const { type, legenddata, legendOrientation, showOther } = useMemo(() => {
    return {
      legendOrientation: get(state, `${pathBase}['legend-orientation']`, 'vertical'),
      legenddata : get(state, `${pathBase}['legend-data']`, []),
      type : get(state, `${pathBase}['type']`, 'fill'),
      showOther: get(state, `${pathBase}['category-show-other']`, '#ccc'),
    }
  },[state])

  const hideLegendEditor = !legenddata || (legenddata.length === 0);

  const isShowOtherEnabled = showOther === '#ccc';
  
  const Symbol = typeSymbols[type] || typeSymbols['fill'];

// console.log("LegendEditor::Symbol", Symbol);/

  return hideLegendEditor ?
    <div>No Legend Data</div> : (
    <div className="w-full max-h-[550px] pb-4 overflow-auto">
      <div className="flex p-4 pt-0 text-sm">
        <div className="pr-2"> Legend Type: </div>
        <select
          className="w-full py-2 bg-transparent"
          value={legendOrientation}
          onChange={(e) => {
            setState((draft) => {
              set(draft, `${pathBase}['legend-orientation']`, e.target.value);
            });
          }}
        >
          {layerType !== 'circles' && <option value="vertical">Vertical</option>}
          {layerType !== 'circles' && <option value="horizontal">Horizontal</option>}
          {layerType === 'circles' && <option value="vertical">Visible</option>}
          <option value="none">None</option>
        </select>
      </div>
      {layerType !== 'circles' && legendOrientation === "vertical" &&
        legenddata.map((d, i) => (
          <div key={`vertical_input_${i}`} className="w-full flex items-center hover:bg-pink-50">
            <div className="flex items-center h-6 w-10 justify-center  ">
              {/*<div className='w-4 h-4 rounded border-[0.5px] border-slate-600' style={{backgroundColor:d.color}}/>*/}
              {/*<Symbol color={d.color} />*/}
            </div>
            <div className="flex items-center text-center flex-1 px-4 text-slate-500  text-sm truncate">
              <input
                type="text"
                className="block w-full border border-transparent hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent py-1 px-2 text-slate-800 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6"
                value={legenddata[i].label}
                onChange={(e) =>
                  setState((draft) => {
                    set(
                      draft,
                      `${pathBase}['legend-data'][${i}].label`,
                      e.target.value
                    );
                  })
                }
              />
            </div>
          </div>
        ))}
      {layerType !== 'circles' && legendOrientation === "horizontal" && (
        <div className={`flex-1 flex w-full p-2`}>
          {legenddata.map((d, i) => (
            <div className="flex-1 h-6" key={`horizontal_input_${i}`}>
              <div className="flex justify-self-end text-xs">
                <input
                  type="text"
                  className="block w-full border border-transparent hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent px-1 text-slate-800 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6"
                  value={legenddata[i].label}
                  onChange={(e) =>
                    setState((draft) => {
                      set(
                        draft,
                        `${pathBase}['legend-data'][${i}].label`,
                        e.target.value
                      );
                    })
                  }
                />
              </div>
              <div
                key={i}
                className="flex-1 h-4"
                style={{ backgroundColor: d.color }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function LegendEditorContainer (props) {
  const { state, setState } = React.useContext(SymbologyContext);
  const activeLayer = useMemo(() => state.symbology?.layers?.[state.symbology.activeLayer] || null, [state])
  const config = useMemo(() => typeConfigs[activeLayer.type] || []
    ,[activeLayer.type])
  
  const layerType = activeLayer['layer-type'];

// console.log("LegendEditorContainer")

  return activeLayer && (
    <div>
      <div className=''>
        <div className='font-bold tracking-wider text-sm text-slate-700 p-4 pb-2'>Legend</div>
        {layerType === "interactive" && <div className='px-2'>
          <InteractiveFilterControl path={"['interactive-filters']"} params={{enableBuilder: false}}/>
        </div>}
        <LegendEditor />
      </div>
    </div>
  )
} 

export default LegendEditorContainer