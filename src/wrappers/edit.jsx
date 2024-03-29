import React, {useEffect} from 'react'
import { useLoaderData, useActionData, useParams, Form, useSubmit, useLocation } from "react-router-dom";
import { filterParams } from '../dms-manager/_utils'
import { getAttributes } from './_utils'
import get from 'lodash/get'

const json2DmsForm = (data,requestType='update') => {
  let out = new FormData()
  out.append('data', JSON.stringify(data))
  out.append('requestType', requestType)
  //console.log(out)
  return out
}

export default function EditWrapper({ Component, format, options, params, user, ...props}) {
	const attributes = getAttributes(format, options, 'edit')
	const submit = useSubmit();
	const { pathname } = useLocation()
	const { data } = useLoaderData()
	let status = useActionData()
	const {defaultSort = (d) => d } = format

	const [item, setItem] = React.useState(
		defaultSort(data).filter(d => filterParams(d,params,format))[0] 
		|| {}
	)
	
	// console.log('EditWrapper', params, item, data)
	useEffect(() => {
		setItem(data.filter(d => filterParams(d,params,format))[0] || {})
	},[params])

	const updateAttribute = (attr, value, multi) => {
		if(multi) {
			setItem({...item, ...multi})
		} else {
			setItem({...item, [attr]: value })
		}
	}

	const submitForm = () => {
		submit(json2DmsForm(item), { method: "post", action: pathname })
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
			updateAttribute={updateAttribute}
			setItem={setItem}
			options={options}
			status={status}
			user={user}
			submit={submitForm}
		/>
	)	
} 