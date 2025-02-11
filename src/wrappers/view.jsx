import React, {useEffect} from 'react'
import {useLoaderData, useLocation, useSubmit} from "react-router-dom";
import { filterParams } from '../dms-manager/_utils'
import { getAttributes } from './_utils'
import {dmsDataEditor, dmsDataLoader} from "../api";
import {useFalcor} from "@availabs/avl-falcor";


export default function ViewWrapper({ Component, format, options, params, user, ...props}) {
	const { falcor } = useFalcor()
	const submit = useSubmit();
	const { pathname, search } = useLocation()
	let attributes = getAttributes(format,options)
	const { data=[] } = useLoaderData() || {}
	const {defaultSort = (d) => d } = format


	const item = defaultSort(data)
		.filter(d => filterParams(d,params,format))[0] || data[0]
	//console.log('item: view', item)
	const ViewComponent = React.useMemo(() => Component, [])

	const apiLoad = async (config, path) => {
		//console.log('<apiLoad> edit', config)
		return await dmsDataLoader(falcor, config, path || '/')
	}

	const apiUpdate = async ({data, config = {format}, requestType=''}) => {
		const res = await dmsDataEditor(falcor, config, data, requestType);
		submit(null, {action: `${pathname}${search}`})
		if(!data.id) return res; // return id if apiUpdate was used to create an entry.
	}

	return (
		<ViewComponent 
			{...props} 
			format={format}
			attributes={attributes}
			item={item}
			dataItems={data}
			options={options}
			user={user}
			apiLoad={apiLoad}
			apiUpdate={apiUpdate}
		/>
		
	)	
}