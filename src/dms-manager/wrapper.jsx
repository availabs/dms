import React, {useEffect} from 'react'
import { useLoaderData, useActionData,useSubmit, useLocation, useNavigate } from "react-router";
import { getAttributes,filterParams } from './_utils'
import { dmsDataEditor, dmsDataLoader } from '../index'
import { isEqual } from "lodash-es"
//import { useImmer } from "use-immer";

import { get } from "lodash-es"

const json2DmsForm = (data,requestType='update',config, path) => {
  let out = new FormData()
  out.append('data', JSON.stringify(data))
  out.append('requestType', requestType)
  if(config) {
  	out.append('dmsConfig', JSON.stringify(config))
  }
  if(path) {
  	out.append('path', path)
  }
  return out
}

export default function EditWrapper({ Component, format, options, params, user, falcor, mode, ...props}) {

	const {app, type} = format;
	const attributes = getAttributes(format, options, 'edit')
	const submit = useSubmit();
	const { pathname, search } = useLocation();
	const navigate = useNavigate();
	const { data=[] } = useLoaderData()
	const [ busy, setBusy ] = React.useState({updating: 0, loading: 0})
	let status = useActionData()
	const {defaultSort = (d) => d } = format


	// console.log('EditWrapper - data length', data.length)
	// useEffect(() => {console.log('edit wrapper on load')},[])
	// useEffect(()=> console.log('status change', status), [status])


	const [item, setItem] = React.useState(
		defaultSort(data).filter(d => filterParams(d,params,format))[0]
		|| (data[0] || {})
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

	// const submitForm = () => {
	// 	submit(json2DmsForm(item), { method: "post", action: `${pathname}${search}` })
	// }

	const apiUpdate = async ({data, config = {format}, requestType='', newPath=`${pathname}${search}`}) => {
		setBusy((prevState) => { return {...prevState, updating: prevState.updating+1 }})
		console.log('apiUpdate - arguements', data, config,requestType, newPath)
		let resData = null
		if(mode === 'ssr'){
			let res =  await fetch(`/dms_api`, { method:"POST", body: json2DmsForm(data,requestType,config,newPath) })
  		resData = await res.json()
  	} else {
			resData = await dmsDataEditor(falcor, config, data, requestType);
		}
		console.log('apiUpdate - response', resData)
		navigate(newPath || `${pathname}${search}`) //submit with null target doesn't carry search
		//submit(null, {action: newPath })
		setBusy((prevState) => { return {...prevState, updating: prevState.updating-1 }})
		if(!data.id) return resData; // return id if apiUpdate was used to create an entry.
		if(data.app !== app || data.type !== type) return; // if apiUpdate was used to manually update something, don't refresh.
	}

	const apiLoad = async (config, path) => {
		setBusy((prevState) => { return {...prevState, loading: prevState.loading+1 }})
		let data = null
		if(mode === 'ssr'){
			let res =  await fetch(`/dms_api`, { method:"POST", body: json2DmsForm(data,'data',config, path||'/') })
			let resData = await res.json()
			data = resData?.data || []
		} else {
			data = await dmsDataLoader(falcor, config, path || '/')
		}
		setBusy((prevState) => { return {...prevState, loading: prevState.loading-1 }})
		return data
	}

	const EditComponent = React.useMemo(() => Component, [])
	//console.log('edit wrapper render', data, item)

	return React.useMemo(() => (
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
			// -- submit={submitForm}
			updateAttribute={updateAttribute}
			falcor={falcor}
			// setItem={setItem}
			// --status={status}		
			
		/>
	),[data,item])
} 