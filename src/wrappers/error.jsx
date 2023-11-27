import React, {useEffect} from 'react'
import {/* useFetcher, useLocation,*/ useLoaderData } from "react-router-dom";
import { getAttributes } from './_utils'

export default function ErrorWrapper({ Component, format, options,user, ...props}) {
	let attributes = getAttributes(format,options)
	// const { data, user } = useLoaderData()
	// console.log('DMS Error Wrapper ', props)
	
	return (

		<Component 
			{...props} 
			format={format}
			attributes={attributes}
			dataItems={[]}
			options={options}
			user={user}
		/>
	
	)	
}
