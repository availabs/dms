import React, {useEffect} from 'react'
import { useLoaderData, /*useActionData,*/ useParams } from "react-router-dom";
import { getAttributes } from './_utils'

export default function ListWrapper({ Component, format, options, ...props}) {
	const attributes = getAttributes(format,options)
	const { data, user } = useLoaderData()

	return (
		
		<Component 
			{...props} 
			format={format}
			attributes={attributes}
			dataItems={data}
			options={options}
			user={user}
		/>
		
	)	
}