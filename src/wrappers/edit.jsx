import React, {useEffect} from 'react'
import { useLoaderData, useActionData, useParams, Form, useSubmit } from "react-router-dom";
import { filterParams } from '../dms-manager/_utils'
import { getAttributes } from './_utils'
import get from 'lodash/get'

export default function EditWrapper({ Component, format, options, params, ...props}) {
	const attributes = getAttributes(format, options, 'edit')
	const submit = useSubmit();
	const { data, user } = useLoaderData()
	let status = useActionData()
	const {defaultSort = (d) => d } = format

	const [item, setItem] = React.useState(
		defaultSort(data).filter(d => filterParams(d,params,format))[0] 
		|| {}
	)
	
	//console.log('EditWrapper', params)
	useEffect(() => {
		setItem(data.filter(d => filterParams(d,params,format))[0] || {})
	},[params])

	const updateAttribute = (attr, value) => {
		setItem({...item, [attr]: value })
	}

	return (
		<Component 
			{...props} 
			format={format}
			attributes={attributes}
			item={item}
			dataItems={data}
			updateAttribute={updateAttribute}
			setItem={setItem}
			options={options}
			status={status}
			user={user}
			submit={submit}
		/>
	)	
} 