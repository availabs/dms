import React, {useState, useReducer, useMemo, useEffect} from 'react'
import { TabPanel } from "~/modules/avl-components/src"
import get from 'lodash/get'
import merge from 'lodash/merge'
import cloneDeep from 'lodash/cloneDeep'

import attributeControls from './controls'
function reducer(state, action) {
	if (action.type === 'update') {
    return merge(cloneDeep(state), cloneDeep(action.payload));
  }
  return state
}

const SymbologyControls = ({layer, onChange=()=>{}}) => {
  const [symbology, setSymbology] = useReducer(
  	reducer,
  	get(layer, `symbology`, [])
  )
  
  const {
  	columns,
  	layerType,
  	activeViewId
  } = useMemo(() => ({
  		columns: get(layer, 'attributes',[]),
  		layerType: get(layer, 'layers[0].type', null),
  		activeViewId: get(layer, 'activeViewId',[])
  }), [layer])

  const [activeColumn, setActiveColumn] = useState('default')
  
  
  useEffect(() => {
  	//console.log('symbology control change', symbology)
  	onChange(symbology)
  },[symbology, onChange])

  //console.log('render SymbologyControls')

  return React.useMemo(() => (
    <div className='border-t border-gray-300 h-full w-full'> 
      {/*<pre>
      	{JSON.stringify(symbology,null,3)}
    	</pre>*/}
    	
    	<div className='flex flex-1'>
	      <div className='py-3.5 px-2 text-sm text-gray-400'>Column : </div>
	      <div className='flex-1'>
	        <select  
	            className="pl-3 pr-4 py-2.5 border border-blue-100 bg-blue-50 w-full bg-white mr-2 flex items-center justify-between text-sm"
	            value={activeColumn}
	            onChange={(e) => setActiveColumn(e.target.value)}
	          >
	            <option  className="ml-2  truncate" value={null}>
	              Default    
	            </option>
	            {columns
	              .map((v,i) => (
	              <option key={i} className="ml-2  truncate" value={v}>
	                {v}
	              </option>
	            ))}
	        </select>
	      </div>
	    </div>

      <TabPanel 
        tabs={
        	attributeControls
        		.filter(attr => attr.layerType === layerType)
        		.map(attr => {
        			return {
          			name: <div className='text-sm text-left'> {attr.name} </div>,
          			Component: () => {
          				const Component = attr.Component
          				return (
		          			<div className='flex px-2 py-4 h-full'>
											<div className='bg-white flex-1 border border-gray-300 hover:bg-gray-100 h-full'>
												<Component
													symbology={symbology}
													setSymbology={setSymbology}
													activeColumn={activeColumn}
													activeViewId={activeViewId}
													paintAttribute={attr.paintAttribute}
												/>
											</div>
										</div>
		          		)
          			}
    					}
    				})
    		}
        themeOptions={{tabLocation:'left'}}
       />

    </div>
  ), [activeColumn, symbology])
}

export default SymbologyControls



