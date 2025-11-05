import React, {useEffect, useMemo,} from 'react'
import get from 'lodash/get'
import isEqual from 'lodash/isEqual'
import cloneDeep from 'lodash/cloneDeep'
import { getColorRange } from '../../../../../../utils/color-ranges'
import ckmeans from '../../../../../../utils/ckmeans'
import * as d3scale from "d3-scale"
import {  ColorInput, useFalcor } from "~/modules/avl-components/src"

import { DamaContext } from "~/pages/DataManager/store"


const SimpleColorControl = ({symbologySlice,updateSlice}) => {
  
  useEffect(() =>  {
    if(symbologySlice.type !== 'simple'){
      updateSlice({
        type: 'simple',
        value: '#6495ED',
      })
    }
  }, [symbologySlice])

  //console.log('SimpleColorControl',symbologySlice)

  return (
    <ColorInput 
    value={ symbologySlice?.value } small
    onChange={ v => {
      symbologySlice["value"] = v
      updateSlice(symbologySlice) 
    }}
    showInputs={ true }
   />
  )
}

const ThresholdScaleColorControl = ({
 symbologySlice,
 updateSlice,
 activeColumn,
 activeViewId
}) => {
  const {falcor, falcorCache} = useFalcor();
  const { pgEnv } = React.useContext(DamaContext)
 
  useEffect(() =>  {
    if(symbologySlice.type !== 'scale-threshold'){
      updateSlice({
        type: 'scale-threshold',
        value: '#6495ED',
        settings: {
          numBins: 5,
          domain: "[]",
          colorRange: 'YlOrRd'
        }
      })
    }
  }, [symbologySlice])

  useEffect(() => {
    if(activeColumn !== 'default') {
      
      //console.log('fetchData', activeViewId)
      console.time(`SymbologyData ${activeViewId} ${activeColumn}`) 
      return falcor.get(['dama',pgEnv, 'viewsbyId' ,activeViewId, 'data', 'length'])
        .then(d => {
          let length = get(d, 
            ['json', 'dama', pgEnv, 'viewsbyId' ,activeViewId, 'data', 'length'], 
          0)
          return falcor.chunk([
            'dama',
            pgEnv,
            'viewsbyId',
            activeViewId,
            'databyIndex', 
            [...Array(length).keys()],
            activeColumn
          ])
        }).then(d => {
          console.timeEnd(`SymbologyData ${activeViewId} ${activeColumn}`) 
        })
    }
  },[activeViewId, activeColumn])

  useEffect(() => {
    if(activeColumn !== 'default' && symbologySlice.type ==='scale-threshold') {
      const dataById = get(falcorCache, 
        ['dama', pgEnv, 'viewsbyId', activeViewId, 'databyId'], 
      {})
      
      const domainData = Object.values(dataById).map( d => d[activeColumn] )
      
      if(domainData.length > 0){
        let colorScale = getColorScale(
          domainData, 
          symbologySlice?.settings?.numBins || 5, 
          symbologySlice?.settings?.colorRange || 'YlOrRd'
        ) 
        let colors = Object.keys(dataById).reduce((out, id) => {
          out[+id] = colorScale(dataById[+id][activeColumn]) || "#000"
          return out
        },{})
        let output = ["get",["to-string",["get","ogc_fid"]], ["literal", colors]]
        
          
        if(!isEqual(symbologySlice.value, output)) {
          if(!symbologySlice.settings) {
            symbologySlice.settings = {}
          }
          symbologySlice.settings.domain = JSON.stringify(colorScale.domain())
          symbologySlice.settings.range = colorScale.range()
          symbologySlice.value = output
          //console.log('going to update slice', symbologySlice)
          updateSlice(symbologySlice)
        }
      }
      
    }
  }, [
    falcorCache, 
    symbologySlice,
    activeViewId,
    activeColumn
  ])

  

  return (
    <div>
      <select 
        className='p-2 w-full bg-white'
        value={symbologySlice?.settings?.numBins || 5} 
        onChange={e => {
          symbologySlice.settings.numBins = +e.target.value
          updateSlice(symbologySlice)
          }
        }>
          {[3,4,5,6,7,8,9,10,11,12].map(v => 
          <option value={v} key={v}>{v}</option>
        )}
        
      </select>
      Threshold {
        JSON.parse(get(symbologySlice,'settings.domain',"[]"))
          .map((d,i) => <div key={d}>{d}</div>)
      }
    </div>
  )

}   

const OrdinalScaleColorControl = ({value,onChange}) => 
    <div> Ordinal Scale Color Control </div>


function getColorScale(domain, numBins=5, color='YlOrRd') {
    return d3scale.scaleThreshold()
        .domain(ckmeans(domain,Math.min(numBins,domain.length)))
        .range(getColorRange(numBins,color));
  }

const ColorControl = ({
  paintAttribute,
  activeColumn,
  activeViewId, 
  symbology,
  setSymbology
}) => {
    const controls = {
      simple: SimpleColorControl,
      'scale-ordinal': OrdinalScaleColorControl,
      'scale-threshold': ThresholdScaleColorControl
    }

    const symbologySlice = React.useMemo(() => {
      // console.log(
      //   'get slice',
      //   get(symbology, `[${paintAttribute}].[${activeColumn}]`, {}), 
      //   symbology, 
      //   `[${paintAttribute}].[${activeColumn}]`
      // )
      return cloneDeep(get(symbology, `[${paintAttribute}].[${activeColumn}]`, {}))
    },
    [symbology, paintAttribute ,activeColumn])

    const [activeType,setActiveType] = React.useState(symbologySlice.type || 'simple')
        
    const Component = React.useMemo(() => 
      get(
        controls, 
        symbologySlice.type, 
        controls['simple']
      ) 
    ,[activeType])

    const updateSlice = (newSlice) => {
      setSymbology({type: 'update', payload:{
          [paintAttribute]: {
            [activeColumn] : newSlice
          }
      }})
    }

    return (
      <div>
        <div className='p-1'>
          <select 
            className='p-2 w-full bg-white'
            value={get(symbologySlice,'type', 'simple')} 
            onChange={v =>{
              symbologySlice.type = v.target.value
              //console.log('change type', symbologySlice, v.target.value)
              updateSlice(symbologySlice)
            }}>
            <option value='simple'>Single Color</option>
            <option value='scale-ordinal'>Category</option>
            <option value='scale-threshold'>Threshold</option>
          </select>
        </div>
        <Component
          symbologySlice={symbologySlice}
          activeColumn={activeColumn}
          activeViewId={activeViewId}
          updateSlice={updateSlice}
        />
      </div>
    )
}


export default ColorControl