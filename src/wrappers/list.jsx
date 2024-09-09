import React, {useEffect} from 'react'
import { useLoaderData, /*useActionData,*/ useParams, useSubmit, useLocation} from "react-router-dom";
import { dmsDataEditor, dmsDataLoader } from '../index'
import { useFalcor } from "@availabs/avl-falcor"
import { getAttributes } from './_utils'

export default function ListWrapper({ Component, format, options, user, ...props}) {
	const { falcor } = useFalcor()
	const attributes = getAttributes(format,options)
	const {app, type} = format;
	const { pathname, search } = useLocation()
	const { data=[] } = useLoaderData() || {}
	const submit = useSubmit()
	// console.log('list wrapper', data)

	const apiUpdate = async ({data, config = {format}, requestType=''}) => {
		const res = await dmsDataEditor(falcor, config, data, requestType);
		if(!data.id) return res; // return id if apiUpdate was used to create an entry.
		if(data.app !== app || data.type !== type) return; // if apiUpdate was used to manually update something, don't refresh.
		submit(null, {action: `${pathname}${search}`})
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