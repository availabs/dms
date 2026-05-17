import React, { useContext , useMemo}from 'react'
import {SymbologyContext} from '../../'
import { ThemeContext } from "../../../../../ui/themeContext"
import { Plus, Close, MenuDots } from '../icons'
import { LayerMenu } from '../LayerManager/LayerPanel'

import { extractState } from '../../stateUtils';

import StyleEditor from './StyleEditor'
import PopoverEditor from './PopoverEditor'
import LegendEditor from './LegendEditor'
import FilterEditor from './FilterEditor'


const LAYER_EDITOR_TABS = [
  { name: 'Style', Component: StyleEditor },
  { name: 'Legend', Component: LegendEditor },
  { name: 'Popup', Component: PopoverEditor },
  { name: 'Filter', Component: FilterEditor },
];

function LayerManager (props) {
  const { state, setState } = React.useContext(SymbologyContext);
  const { UI } = React.useContext(ThemeContext) || {};
  const { Tabs } = UI || {};
  const { activeLayer, isActiveLayerPlugin, controllingPluginName } = useMemo(() => {
    return extractState(state);
  }, [state]);

  return activeLayer && (
    <div className='p-4'>
      <div className='bg-white/95 w-[312px] rounded-lg drop-shadow-lg pointer-events-auto min-h-[400px] max-h-[calc(100vh_-_161px)]  '>
        <div className='flex justify-between items-center border-b'>
          <div className='flex text-slate-700 p-2 '>
            <input 
              type="text"
              className='block w-[220px] border border-transparent hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent py-1 px-2 text-slate-800 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6'
              placeholder={'Layer Name'}
              value={state?.symbology?.layers?.[state?.symbology?.activeLayer]?.name}
              onChange={(e) => setState(draft => { 
                if(draft.symbology.activeLayer){
                  draft.symbology.layers[draft.symbology.activeLayer].name = e.target.value 
                }
              })}
            />
          </div>
          <div className='text-sm pt-1.5 px-1.5  hover:bg-slate-100 flex items-center'>
            <LayerMenu
              location={'right-0'}
              layer={activeLayer}
              button={<MenuDots className={` cursor-pointer group-hover:fill-gray-400 group-hover:hover:fill-pink-700`}/>}
            />
          </div>
          <div 
            onClick={() => setState(draft => {  draft.symbology.activeLayer = null})} 
            className='p-2.5 rounded hover:bg-slate-100 m-1 cursor-pointer'>
              <Close className='fill-slate-500' /> 
          </div>
        </div>
        {
          isActiveLayerPlugin ? 
            <div className="min-h-[400px] bg-gray-200 flex flex-col justify-center content-center text-center">
              <div className="text-md">
                Layer is controlled by Plugin
              </div>
              <div className="text-sm">
                To enable this panel, remove the <b>"{controllingPluginName}" plugin</b>, or link it to a different layer
                </div>
            </div> :
            <div className='min-h-20 relative'>
              <Tabs tabs={LAYER_EDITOR_TABS} activeStyle="panel" />
            </div>
        }
      </div>
    </div>
  )
} 

export default LayerManager