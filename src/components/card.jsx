import React from 'react'
import { useTheme } from '../theme'
import get from 'lodash/get'

export default function Card({item, attributes}) {
	const theme = useTheme()
	if(!item) return <div />
	return (
		<div key={item.id} className={get(theme,'card.wrapper', '')}>
			{Object.keys(attributes)
				.map((attrKey,i) => {
					let ViewComp = attributes[attrKey].ViewComp
					return(
						<div key={i} className={get(theme,'card.row', '')}>  
							<div className={get(theme,'card.rowLabel', '')}>{attrKey}</div>
							<div className={get(theme,'card.rowContent', '')}> 
								<ViewComp 
									value={item[attrKey]} 
									{...attributes[attrKey]}
								/>
							</div>
						</div>
					)
				})
			}
		</div>
	)	
}