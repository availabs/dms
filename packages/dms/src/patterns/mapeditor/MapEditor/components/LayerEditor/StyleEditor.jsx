import React, { useContext , useMemo, Fragment}from 'react'
import {SymbologyContext} from '../../'
import { Plus, Close, MenuDots, CaretDown } from '../icons'
import { Menu, Popover, Transition, Tab, Dialog } from '@headlessui/react'
import { toHex } from '../LayerManager/utils'
import get from 'lodash/get'
import set from 'lodash/set'

import { LayerMenu } from '../LayerManager/LayerPanel'
import typeConfigs from './typeConfigs'
import { wrapperTypes } from './ControlWrappers'
import { controlTypes } from './Controls'


const layerTypeNames = {
  'fill': 'Polygons',
  'line': 'Lines',
  'circle': 'Points'
}

function StyleEditor (props) {
  const { state, setState } = React.useContext(SymbologyContext);
  const activeLayer = useMemo(() => state.symbology?.layers?.[state.symbology.activeLayer] || null, [state])
  let config = useMemo(() => typeConfigs[activeLayer.type] || []
    ,[activeLayer.type]);

  if(props.type === 'interactive') {
    config = config.filter(c => c.label !== 'Interactive Filters').map(c => {
      let newControls = [...c.controls];
      let newConditonal;

      newControls = newControls.map(ic => ({...ic, params:{...ic.params, pathPrefix: props.pathPrefix, version: 'interactive'}}))
      if(c.conditional){
        if(Array.isArray(c.conditional)){
          newConditonal = c.conditional.map(cond => ({...cond, path: props.pathPrefix + cond.path}))
        }
        else {
          newConditonal = {...c.conditional, path: props.pathPrefix + c.conditional['path']} ;
        }

      }

      return {...c, controls: newControls, conditional: newConditonal}
    })
  }

  return activeLayer && (
    <div>
      <div className={`${props.type === 'interactive' ? 'mt-2 border-2 p-1 border-gray-100 rounded' : 'p-4'}`}>
      <div className='font-bold tracking-wider text-sm text-slate-700'>{layerTypeNames[activeLayer.type]}</div>
      {config
        .filter(c => {
          if(!c.conditional) {
            return true
          } else {
            if(Array.isArray(c.conditional)){
              return c.conditional.every(cond => {
                const condValue = get(state, `symbology.layers[${state.symbology.activeLayer}].${cond.path}`, '-999')
                return cond.conditions.includes(condValue)
              });
            }
            else {
              // console.log('has conditional')
              const condValue = get(state, `symbology.layers[${state.symbology.activeLayer}].${c.conditional.path}`, '-999')
              // console.log('has conditional',c.conditional, condValue)
              return c.conditional.conditions.includes(condValue)
            }
          }
        })
        .map((control,i) => {
          let ControlWrapper = wrapperTypes[control.type] || wrapperTypes['inline'];
          return (
            <div className='flex flex-wrap' key={i}>
                <ControlWrapper
                  label={control.label}
                  controls={control.controls}
                />
            </div>
        )
      })}

    </div>
    </div>
  )
} 

export default StyleEditor