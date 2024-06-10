import React, {useEffect} from 'react'
import { useLoaderData, /*useActionData,*/ useParams } from "react-router-dom";
import { dmsDataEditor, dmsDataLoader } from '../index'
import { useFalcor } from "@availabs/avl-falcor"
import { getAttributes } from './_utils'

export default function ListWrapper({ Component, format, options, user, ...props}) {
	const { falcor } = useFalcor()
	const attributes = getAttributes(format,options)
	const { data=[] } = useLoaderData() || {}
	// console.log('list wrapper', data)

	const apiUpdate = async ({data, config={format}, requestType=''}) => {  
			// update the data
			await dmsDataEditor(falcor, config, data, requestType)
			// reload page to refresh page data
			submit(null, {action: pathname})
	}

	const apiLoad = async (config) => {
		return await dmsDataLoader(falcor, config)
	}

	const ListComponent = React.useMemo(() => Component, [])
	return (
		<ListComponent
			key={options?.path}
			{...props} 
			format={format}
			attributes={attributes}
			dataItems={data}
			apiUpdate={apiUpdate}
			apiLoad={apiLoad}
			options={options}
			user={user}
		/>
	)
}