import React, {useEffect} from 'react'
import { useLoaderData, useActionData, useParams, Form, useSubmit, useLocation } from "react-router-dom";
import { filterParams } from '../dms-manager/_utils'
import { getAttributes } from './_utils'
import { dmsDataEditor, dmsDataLoader } from '../index'
import { useFalcor } from "@availabs/avl-falcor"
import { isEqual, merge } from "lodash-es"
//import { useImmer } from "use-immer";

import { get } from "lodash-es"

const json2DmsForm = (data,requestType='update') => {
  let out = new FormData()
  out.append('data', JSON.stringify(data))
  out.append('requestType', requestType)
  return out
}

export default function EditWrapper({ Component, format, options, params, user, ...props}) {
	const { falcor } = useFalcor()
	const {app, type} = format;
	const attributes = getAttributes(format, options, 'edit')
	const submit = useSubmit();
	const { pathname, search } = useLocation()
	const { data=[] } = useLoaderData() || []
	const [ busy, setBusy ] = React.useState({updating: 0, loading: 0})
	let status = useActionData()
	const {defaultSort = (d) => d } = format

	//useEffect(() => {console.log('edit wrapper on load')},[])

	//useEffect(()=> console.log('status change', status), [status])


	const [item, setItem] = React.useState(
		defaultSort(data).filter(d => filterParams(d,params,format))[0]
		|| {}
	)
	// console.log('item: edit', item)
	useEffect(() => {
		let filteredItem = data.filter(d => filterParams(d,params,format))[0]
		// update item on data update
		if(!isEqual(item,filteredItem) && filteredItem){
			//console.log('setItem', item, filteredItem)
			setItem( filteredItem || {})
		}
	},[data,params])


	const updateAttribute = (attr, value, multi) => {
		if(multi) {
			setItem({...item, ...multi})
		} else {
			setItem({...item, [attr]: value })
		}
	}

	const submitForm = () => {
		submit(json2DmsForm(item), { method: "post", action: `${pathname}${search}` })
	}

	const apiUpdate = async ({data, config = {format}, requestType='', newPath=`${pathname}${search}`}) => {
		setBusy((prevState) => { return {...prevState, updating: prevState.updating+1 }})
		const res = await dmsDataEditor(falcor, config, data, requestType);
		submit(null, {action: newPath })
		setBusy((prevState) => { return {...prevState, updating: prevState.updating-1 }})
		if(!data.id) return res; // return id if apiUpdate was used to create an entry.
		if(data.app !== app || data.type !== type) return; // if apiUpdate was used to manually update something, don't refresh.
	}

	const apiLoad = async (config, path) => {
		setBusy((prevState) => { return {...prevState, loading: prevState.loading+1 }})
		let data = await dmsDataLoader(falcor, config, path || '/')
		setBusy((prevState) => { return {...prevState, loading: prevState.loading-1 }})
		return data
	}

	const EditComponent = React.useMemo(() => Component, [])

	return (
		<EditComponent 
			{...props}
			format={format}
			attributes={attributes}
			item={item}
			dataItems={data}
			busy={busy}
			params={params}
			apiUpdate={apiUpdate}
			apiLoad={apiLoad}
			options={options}
			user={user}
			// -- I believe these are deprecated to apiLoad / apiUpdate / busy
			submit={submitForm}
			updateAttribute={updateAttribute}
			// setItem={setItem}
			// --status={status}		
			
		/>
	)	
} 