import React, { useContext , useMemo, useCallback, Fragment, useRef} from 'react'
import { SymbologyContext } from '../../'
import SourceSelector from './SourceSelector'
import { DndList } from '~/modules/avl-components/src'
import { Menu, Transition, Tab, Dialog } from '@headlessui/react'
import { useParams, useNavigate, Link } from 'react-router'
import { Fill, Line, Circle, Eye, EyeClosed, MenuDots , CaretDown} from '../icons'
import get from 'lodash/get'
import { ZoomToFit } from './ZoomToFit'
import { DuplicateLayerItem } from './DuplicateLayerItem'

const typeIcons = {
  'fill': Fill,
  'circle': Circle,
  'line': Line
}


export function LayerMenu({layer, button, location='left-0'}) {
  const { state, setState  } = React.useContext(SymbologyContext);

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
          <Menu.Items className={`absolute ${location} mt-1 w-36 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none`}>
            <div className="px-1 py-1 ">
              <Menu.Item>
                <ZoomToFit layer={layer}/>
              </Menu.Item>
              <Menu.Item>
                <DuplicateLayerItem layer={layer}/>
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <div 
                    className={`${
                      active ? 'bg-pink-50 ' : ''
                    } group flex w-full items-center text-red-400 rounded-md px-2 py-2 text-sm`}
                    onClick={() => {
                      setState(draft => {
                        delete draft.symbology.layers[layer.id]
                        Object.values(draft.symbology.layers)
                          .sort((a, b) => a.order - b.order)
                          .forEach((l,i) => l.order = i)
                      })
                    }}
                  >Remove</div>
                )}
              </Menu.Item>
            </div>
          </Menu.Items>
        </Transition>
      </Menu>
  )
} 

export function LayerInfo({ layer, button, source, baseUrl, location = "left-0" }) {
  const sourceUrl = `${baseUrl}/source/${layer.source_id}`
  return (
    <Menu as="div" className="relative inline-block text-left">
      <Menu.Button>{button}</Menu.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items
          className={`absolute ${location} mt-1 w-64 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none`}
        >
          <div className="px-2 py-2 flex gap-2 flex-col">
            <div><b>Source Name:</b> {source?.attributes?.name}</div>
            <div><b>Source Id:</b> {source?.attributes?.source_id}</div>
            <Link className="text-blue-600 hover:text-pink-400" to={sourceUrl} target="_blank" rel="noopener noreferrer">
              Link to Data Manager Source
            </Link>
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}

function LayerRow ({index, layer, i}) {
  const { state, setState  } = React.useContext(SymbologyContext);
  const { activeLayer } = state.symbology;
  const toggleSymbology = () => {
    setState(draft => {
        draft.symbology.activeLayer = activeLayer === layer.id ? '' : layer.id
    })
  }
  const Icon = typeIcons[layer.type] || <span />
  const visible = layer.visible

  return (
    <div className={`w-full ${activeLayer == layer.id ? 'bg-pink-100' : ''} p-2 py-1 flex border-white/85 border hover:border-pink-500 group items-center`}>
      <div className='px-1'><Icon className='fill-slate-400' /></div>
      <div onClick={toggleSymbology} className='text-sm text-slate-600 font-medium truncate flex-1'>{layer.name}</div>
      {/*<div className='flex items-center text-xs text-slate-400'>{layer.order}</div>*/}
      <div className='text-sm pt-1 px-0.5 flex items-center'>
        <LayerMenu 
          layer={layer}
          button={<MenuDots className={` ${activeLayer == layer.id ? 'fill-pink-100' : 'fill-white'} cursor-pointer group-hover:fill-gray-400 group-hover:hover:fill-pink-700`}/>}
        />
      </div>
      <div onClick={() => {
        setState(draft => {
          draft.symbology.layers[layer.id].visible = !draft.symbology.layers[layer.id].visible
        })}}
      >
        {visible ? 
          <Eye 
            className={` ${activeLayer == layer.id ? 'fill-pink-100' : 'fill-white'} cursor-pointer group-hover:fill-gray-400 group-hover:hover:fill-pink-700`}
              
          /> : 
          <EyeClosed 
          className={` ${activeLayer == layer.id ? 'fill-pink-100' : 'fill-white'} cursor-pointer group-hover:fill-gray-400 group-hover:hover:fill-pink-700`}
            
          />
        }
      </div>
    </div>
  )
}

function LayerManager (props) {
  const { state, setState  } = React.useContext(SymbologyContext);
  const layers = useMemo(() => state.symbology?.layers ||  {}, [state])
  //console.log('layers', layers)
  const droppedSection = React.useCallback((start, end) => {
    setState(draft => {
    const sections = Object.values(draft.symbology.layers)
        
    let listLen = Object.values(draft.symbology.layers).length - 1
    let orderStart =  listLen - start
    let orderEnd = listLen - end 

    const [item] = sections.splice(orderStart, 1);
    sections.splice(orderEnd, 0, item);

    sections.forEach((item, i) => {
        item.order = i
    })
    
    draft.symbology.layers = sections
        .reduce((out,sec) => {
          out[sec.id] = sec;
          return out 
        },{})
    })
  }, [])

  return (
    <>     
      {/* ------Layer Pane ----------- */}
      <div className='min-h-20 relative'>
        <DndList onDrop={droppedSection} offset={{x:16, y: 45}}>
        {Object.values(layers)
          .sort((a,b) => b.order - a.order)
          .map((layer,i) => <LayerRow key={layer.id} layer={layer} i={i} />)}
        </DndList>
      </div>
    </>
  )
}

export default LayerManager