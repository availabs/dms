import React, {useEffect} from 'react'
import {/* useFetcher, useLocation,*/ useLoaderData } from "react-router-dom";
import { filterParams } from '../dms-manager/_utils'
import { getAttributes } from './_utils'


export default function ViewWrapper({ Component, format, options, params, ...props}) {
	let attributes = getAttributes(format,options)
	const { data, user } = useLoaderData()
	const {defaultSort = (d) => d } = format

	const item = defaultSort(data).filter(d => filterParams(d,params,format))[0] || data[0]

	//console.log('ViewWrapper', attributes, data)
	return (
		<Component 
			{...props} 
			format={format}
			attributes={attributes}
			item={item}
			dataItems={data}
			options={options}
			user={user}
		/>
		
	)	
}