import React, {useEffect} from 'react'
import {useLoaderData, useLocation, useSubmit} from "react-router-dom";
import { filterParams } from '../dms-manager/_utils'
import { getAttributes } from './_utils'

import { dmsDataEditor, dmsDataLoader } from "../api";
import { useFalcor } from "@availabs/avl-falcor";



export default function ViewWrapper({ Component, format, options, params, user, ...props}) {
	const { falcor } = useFalcor()
	const submit = useSubmit();
	const { pathname, search } = useLocation()
	let attributes = getAttributes(format,options)
	const { data=[] } = useLoaderData() || {}
	const {defaultSort = (d) => d } = format
	const [ busy, setBusy ] = React.useState({updating: 0, loading: 0})


	const item = defaultSort(data)
		.filter(d => filterParams(d,params,format))[0] || data[0]
	const ViewComponent = React.useMemo(() => Component, [])

	const apiUpdate = async ({data, config = {format}, requestType='', newPath=`${pathname}${search}`}) => {
		setBusy((prevState) => { return {...prevState, updating: prevState.updating+1 }})
		const res = await dmsDataEditor(falcor, config, data, requestType);
		submit(null, {action: newPath })
		setBusy((prevState) => { return {...prevState, updating: prevState.updating-1 }})
		if(!data.id) return res; // return id if apiUpdate was used to create an entry.
	}

	const apiLoad = async (config, path) => {
		setBusy((prevState) => { return {...prevState, loading: prevState.loading+1 }})
		let data = await dmsDataLoader(falcor, config, path || '/')
		setBusy((prevState) => { return {...prevState, loading: prevState.loading-1 }})
		return data
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
			busy={busy}
		/>
		
	)	
}