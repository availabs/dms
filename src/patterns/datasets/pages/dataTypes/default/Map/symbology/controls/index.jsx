import React from 'react'
import ColorControl from './ColorControls'

const SimpleRangeControl = ({symbology,onChange, min=0, max=1,step=0.01}) => 
	<div className = 'flex justify-between items-center p-1 '>
		<div className='pt-2'>
			<input 
				type='range'
				min={min}
				max={max}
				step={step}
				value={ symbology.value } 
	      onChange={ v => onChange("value", v.target.value) }
	     />
	  </div>
	  <div>{symbology.value}</div>
	</div>

const SimpleNumberControl = ({symbology,onChange, min=1, max=50,step=1}) => 
	<div className = 'flex justify-between items-center p-1 '>
		<div className='flex-1'>
			<input 
				className='p-2 w-full bg-white text-right'
				type='number'
				min={min}
				max={max}
				step={step}
				value={ symbology.value } 
	      onChange={ v => onChange("value", v.target.value) }
	     />
	  </div>
	  <div>px</div>
	</div>

const attributeControls = [
  	{
  		name: 'Fill Color',
  		layerType: 'fill',
  		paintAttribute: 'fill-color',
  		Component: ColorControl
  	},

  	// controls for line-type
  	{
  		name: 'Color',
  		layerType: 'line',
  		paintAttribute: 'line-color',
  		Component: ColorControl
  	},
  	{
  		name: 'Opacity',
  		layerType: 'line',
  		paintAttribute: 'line-opacity',
  		Component: SimpleRangeControl
  	},
  	{
  		name: 'Width',
  		layerType: 'line',
  		paintAttribute: 'line-width',
  		Component: SimpleNumberControl
  	}
]

export default attributeControls