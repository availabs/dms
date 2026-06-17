import React, { useContext , useMemo, useCallback, useRef} from 'react'
import { SymbologyContext } from '../../'
import { ThemeContext } from "../../../../../ui/themeContext"
import useMapTheme from "../../../../../ui/components/map/useMapTheme"
import SourceSelector from './SourceSelector'
import { useParams, useNavigate, Link } from 'react-router'
import { Fill, Line, Circle, Eye, EyeClosed, MenuDots , CaretDown} from '../icons'
import { get } from 'lodash-es'
import { ZoomToFit } from './ZoomToFit'
import { DuplicateLayerItem } from './DuplicateLayerItem'

import {
  VisibilityButton,
  useHeatmapRadialGradient,
  GET_PAINT_VALUE
} from "./LegendPanel"

export function LayerMenu({layer, button}) {
  const { state, setState  } = React.useContext(SymbologyContext);
  const { UI } = React.useContext(ThemeContext) || {};
  const { NavigableMenu } = UI || {};

  return (
    <NavigableMenu
      showTitle={false}
      config={[
        { name: 'zoom-to-fit', type: () => <ZoomToFit layer={layer}/> },
        { name: 'duplicate', type: () => <DuplicateLayerItem layer={layer}/> },
        {
          name: <span className='text-red-400'>Remove</span>,
          onClick: () => {
            setState(draft => {
              delete draft.symbology.layers[layer.id]
              Object.values(draft.symbology.layers)
                .sort((a, b) => a.order - b.order)
                .forEach((l, i) => l.order = i)
            })
          }
        }
      ]}
    >
      {button}
    </NavigableMenu>
  )
}

export function LayerInfo({ layer, button, source, baseUrl }) {
  const { UI } = React.useContext(ThemeContext) || {};
  const { Popup, Button } = UI || {};
  const mapTheme = useMapTheme();
  return (
    <Popup button={<Button type="plain" className="p-0">{button}</Button>}>
      <div className={mapTheme.popup.infoPanel}>
        <div><b>Source Name:</b> {source?.name}</div>
        <div><b>Source Id:</b> {source?.source_id}</div>
      </div>
    </Popup>
  );
}

const NoIcon = () => <span />

const HeatMapIcon = ({ layer }) => {
  const colors = React.useMemo(() => {
    return GET_PAINT_VALUE["heatmap"](layer);
  }, [layer]);

  const gradient = useHeatmapRadialGradient(colors);

  return (
    <div className="h-[20px] w-[20px] rounded-full"
      style={ {
        background: Array.isArray(colors) ? gradient : null,
        backgroundColor: Array.isArray(colors) ? null : colors
      } }/>
    )
}

const typeIcons = {
  'fill': Fill,
  'circle': Circle,
  'line': Line,
  'heatmap': HeatMapIcon
}

function LayerRow ({index, layer, i}) {
  const { state, setState  } = React.useContext(SymbologyContext);
  const { activeLayer } = state.symbology;
  const toggleSymbology = () => {
    setState(draft => {
        draft.symbology.activeLayer = activeLayer === layer.id ? '' : layer.id
    })
  }
  const Icon = typeIcons[layer.type] || NoIcon;
  const visible = layer.isVisible;

  return (
    <div className={`w-full ${activeLayer == layer.id ? 'bg-pink-100' : ''} p-2 py-1 flex border-white/85 border hover:border-pink-500 group items-center`}>
      <div className='px-1'><Icon layer={ layer } className='fill-slate-400' /></div>
      <div onClick={toggleSymbology} className='text-sm text-slate-600 font-medium truncate flex-1'>{layer.name}</div>
      {/*<div className='flex items-center text-xs text-slate-400'>{layer.order}</div>*/}
      <div className='text-sm pt-1 px-0.5 flex items-center'>
        <LayerMenu 
          layer={layer}
          button={<MenuDots className={` ${activeLayer == layer.id ? 'fill-pink-100' : 'fill-white'} cursor-pointer group-hover:fill-gray-400 group-hover:hover:fill-pink-700`}/>}
        />
      </div>
      <div>
        <VisibilityButton layer={ layer }/>
      </div>
    </div>
  )
}

function LayerManager (props) {
  const { state, setState  } = React.useContext(SymbologyContext);
  const { UI } = React.useContext(ThemeContext) || {};
  const { DndList } = UI;
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
