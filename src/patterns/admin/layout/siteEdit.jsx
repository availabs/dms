import React from 'react'
import {useTheme} from "../../../theme";
export default function SiteEdit ({
					   item={},
					   attributes,
					   updateAttribute,
					   status,
					   submit, apiUpdate, format,
				   }) {
	const theme = useTheme()
	const updateData = (data, attrKey) => apiUpdate({data: {...item, ...{[attrKey]: data}}, config: {format}})
	return <div key={item.id} className={'w-full'}>
		{status ? <div>{JSON.stringify(status)}</div> : ''}

		{Object.keys(attributes)
			.map((attrKey, i) => {
				let EditComp = attributes[attrKey].EditComp
				return (
					<div key={`${attrKey}-${i}`}>
							<EditComp
								key={`${attrKey}-${i}`}
								value={item?.[attrKey]}
								onChange={(v) => updateAttribute(attrKey, v)}
								submit={data => updateData(data, attrKey)}
								format={format}
								{...attributes[attrKey]}
							/>
					</div>
				)
			})
		}
	</div>
}
