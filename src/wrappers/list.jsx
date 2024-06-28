import React, {useEffect} from 'react'
import { useLoaderData, /*useActionData,*/ useParams, useSubmit, useLocation} from "react-router-dom";
import { dmsDataEditor, dmsDataLoader } from '../index'
import { useFalcor } from "@availabs/avl-falcor"
import { getAttributes } from './_utils'

export default function ListWrapper({ Component, format, options, user, ...props}) {
	const { falcor } = useFalcor()
	const attributes = getAttributes(format,options)
	const { pathname } = useLocation()
	const { data=[] } = useLoaderData() || {}
	const submit = useSubmit()
	// console.log('list wrapper', data)

	const apiUpdate = async ({data, config={format}, requestType=''}) => {  
			// update the data
			// submit(null, {action: pathname})
			await dmsDataEditor(falcor, config, data, requestType)
			submit(null, {action: pathname})
	}

	const apiLoad = async (config, path) => {
		// console.log('<apiLoad> from list wrapper', config, path)
		return await dmsDataLoader(falcor, config, path)
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