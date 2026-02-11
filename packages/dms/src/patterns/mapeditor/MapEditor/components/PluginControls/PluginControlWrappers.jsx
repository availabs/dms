import React, { useContext , useMemo, Fragment}from 'react'
import {SymbologyContext} from '../..'
import { Plus, Close, MenuDots, CaretDown } from '../icons'
import { Menu, Popover, Transition, Tab, Dialog } from '@headlessui/react'
import { toHex } from '../LayerManager/utils'
import { ChromePicker } from 'react-color';
import get from 'lodash/get'
import set from 'lodash/set'


import { pluginControlTypes } from './PluginControls'

export function StyledControl ({children}) {
  return (
    <div className='rounded-md flex w-full max-w-[216px] p-2 items-center border  border-slate-100 hover:bg-white cursor-pointer hover:border-slate-200'>
      {children}
    </div>
  )
}

function PopoverControl ({values,title='',children}) {
  const filteredValues = values.filter(v => v.value !== null)
  return (
    <StyledControl> 
      <Popover className="relative w-full">
          {({ open }) => (
            <>
              <Popover.Button className='w-full'>
               <div className='w-full flex items-center group'>
                <div className='flex items-center group-hover:flex-1'>
                  {(filteredValues || []).map((v,i) => {
                    // console.log('test', v.value)
                    return <Fragment key={i}>
                      {v.type === 'color' && <div className='h-4 w-4 border' style={{backgroundColor:toHex(v.value)}}/> }
                      <div className='px-1 py-1 truncate'><span className=''>{v.type === 'color' ? toHex(v.value) : v.value}</span>{v.unit ? v.unit : ''} </div>
                      <div className='px-1 py-1 truncate'>{i < filteredValues.length - 1 ? '/' : ''}</div>
                    </Fragment>
                  })}
                </div>
                <div className='flex items-center '><CaretDown className='fill-slate-400 group-hover:fill-slate-800'/>
              </div>
            </div>
              </Popover.Button>
              <Transition
                as={Fragment}
                enter="transition ease-out duration-200"
                enterFrom="opacity-0 translate-y-1"
                enterTo="opacity-100 translate-y-0"
                leave="transition ease-in duration-150"
                leaveFrom="opacity-100 translate-y-0"
                leaveTo="opacity-0 translate-y-1"
              >
                <Popover.Panel className="absolute w-[250px] left-0  z-10 mt-3 -translate-x-[325px] -translate-y-[78px] transform px-4  ">
                  {({ close }) => (
                    <div className="overflow-hidden rounded-lg shadow-lg ring-1 ring-black/5 bg-white/95">
                      <div className='flex justify-between items-center'>
                        <div className=' w-full flex text-slate-700 py-1 px-2 text-sm font-semibold tracking-wider'>
                          {title}
                        </div>
                        <div 
                          onClick={() => close()} 
                          className='p-0.5 rounded hover:bg-slate-100 m-1 cursor-pointer'>
                            <Close className='fill-slate-700' /> 
                        </div>
                      </div>
                      <div className="relative">
                        {children}
                      </div>
                    </div>
                  )}
                </Popover.Panel>
              </Transition>
            </>
          )}
      </Popover>
    </StyledControl> 
  )
}

function SimpleControlWrapper ({label, controls}) {
  return (
    <>
      <div className='w-24 text-slate-500 text-[14px] tracking-wide min-h-[32px] flex items-center'>{label}</div>
      <div className='flex-1 flex items-center'>
        <StyledControl>
          {controls
            ?.map((c,i) => {
              const Control = pluginControlTypes[c.type] || pluginControlTypes['simple'];
              return <Control key={i} path={c.path} datapath={c.datapath} params={c.params} />
          })}
        </StyledControl>
      </div>
    </>
  )
}

function FullWidthWrapper({ label, controls }) {
  return (
    <>
      <div className="flex-1 flex items-center">
          {controls?.map((c, i) => {
            const Control = pluginControlTypes[c.type] || pluginControlTypes["simple"];
            return (
              <Control
                key={i}
                path={c.path}
                datapath={c.datapath}
                params={c.params}
              />
            );
          })}

      </div>
    </>
  );
}

function PopoverControlWrapper (props) {
  const {label, controls} = props;
  const { state, setState } = React.useContext(SymbologyContext);
  const values = useMemo(() => {
    return controls.map(c => {
      const pathBase =
        c.params?.version === "interactive"
          ? `symbology.layers[${state.symbology.activeLayer}]${c.params.pathPrefix}`
          : `symbology.layers[${state.symbology.activeLayer}]`;

      const identity = d => d
      let format = c?.params?.format || identity
      let value = format(get(state, `${pathBase}.${c.path}`, ''))
      return {
        type: c?.type,
        unit: c?.unit,
        value: value
      }
    })
  }, [state,controls])
  return (
    <> 
      <div className='w-16 text-slate-500 text-[14px] tracking-wide min-h-[32px] flex items-center'>{label}</div>
      <div className='flex-1 flex items-center'>
        <PopoverControl
          values={values}
          title={label}
        >
          {controls.map((c,i) => {
            const Control = pluginControlTypes[c.type] || pluginControlTypes['simple']
            return <Control key={i} path={c.path} datapath={c.datapath}  params={c.params}/>
          })}
        </PopoverControl>
      </div>
    </>
  )
}

export const wrapperTypes = {
  'popover': PopoverControlWrapper,
  'inline': SimpleControlWrapper,
  'full-width': FullWidthWrapper
}
