import React, {useEffect} from 'react'
import { useLoaderData, useActionData, useParams, Form, useSubmit, useLocation } from "react-router-dom";
import { filterParams } from '../dms-manager/_utils'
import { getAttributes } from './_utils'
import { dmsDataEditor, dmsDataLoader } from '../index'
import { useFalcor } from "@availabs/avl-falcor"
import { isEqual } from "lodash-es"
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
	const attributes = getAttributes(format, options, 'edit')
	const submit = useSubmit();
	const { pathname, search } = useLocation()
	const { data=[] } = useLoaderData() || []
	let status = useActionData()
	const {defaultSort = (d) => d } = format


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


	const apiUpdate = async ({data, config={format}, requestType=''}) => {  
			// update the data
		console.log('apiUpdate', data, config)
			await dmsDataEditor(falcor, config, data, requestType)
			submit(null, {action: `${pathname}${search}`})
	}

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

	const apiLoad = async (config, path) => {
		//console.log('<apiLoad> edit', config)
		return await dmsDataLoader(falcor, config, path || '/')
	}

	const EditComponent = React.useMemo(() => Component, [])

	return (
		<EditComponent 
			{...props} 
			format={format}
			attributes={attributes}
			item={item}
			dataItems={data}
			params={params}
			apiUpdate={apiUpdate}
			apiLoad={apiLoad}
			updateAttribute={updateAttribute}
			setItem={setItem}
			options={options}
			status={status}
			user={user}
			submit={submitForm}
		/>
	)	
} 