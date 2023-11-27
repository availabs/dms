import React, {useEffect} from 'react'
import { useLoaderData, /*useActionData,*/ useParams } from "react-router-dom";
import { getAttributes } from './_utils'

export default function ListWrapper({ Component, format, options, user, ...props}) {
	const attributes = getAttributes(format,options)
	const { data } = useLoaderData()
	// console.log('list wrapper', data)
	return (
		<Component
			key={options?.path}
			{...props} 
			format={format}
			attributes={attributes}
			dataItems={data}
			options={options}
			user={user}
		/>
	)
}