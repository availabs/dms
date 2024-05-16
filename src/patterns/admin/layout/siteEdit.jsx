import React from 'react'
import {useTheme} from "../../../theme";
export default function SiteEdit ({
					   item={},
					   attributes,
					   updateAttribute,
					   status,
					   submit,
				   }) {
	const theme = useTheme()

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
								{...attributes[attrKey]}
							/>
					</div>
				)
			})
		}

		<div className={theme?.card?.btnWrapper}>
			<button className={theme?.card?.submitBtn} onClick={() => submit()}> Save</button>
		</div>
	</div>
}
