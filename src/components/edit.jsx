import React from 'react'
import { useTheme } from '../theme'
import get from 'lodash/get'

export default function EditCard({item, updateAttribute, attributes, status, submit, ...props}) {
	const theme = useTheme()
	
	return (
		<div key={item.id} className={get(theme,'card.wrapper', '')}>
			{status ? <div>{JSON.stringify(status)}</div> : ''}
			
				{Object.keys(attributes)
					.map((attrKey,i) => {
						let EditComp = attributes[attrKey].EditComp
						return(
							<div key={`${attrKey}-${i}`} className={get(theme,'card.row', '')}>

								<div className={get(theme,'card.rowHeader', '')}>
									<div className={get(theme,'card.rowLabel', '')}>{attributes[attrKey]?.label || attrKey}</div>
									{attributes[attrKey]?.prompt &&
										<i title={attributes[attrKey]?.prompt} className={get(theme, 'card.infoIcon', 'fad fa-info')} />
									}
								</div>

								<div className={get(theme,'card.rowContent', '')}>
									<EditComp 
										key={`${attrKey}-${i}`} 
										value={item[attrKey]} 
										onChange={(v) => updateAttribute(attrKey, v)}
										{...attributes[attrKey]}
									/>
								</div>
							</div>
						)
					})
				}
				<button onClick={() => submit()}> Save </button>
		</div>
	)	
}