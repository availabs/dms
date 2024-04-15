import React from 'react'
import { useTheme } from '../theme'
import get from 'lodash/get'

export default function Card({
								 item,
								 attributes,
								 next, nextDisabled,
								 prev, prevDisabled,
								 sectionId,
								 preferredTheme
							 }) {
	const theme = preferredTheme || useTheme();
	if(!item) return <div />
	return (
		<div key={item.id} className={get(theme,'card.wrapper', '')}>
			{Object.keys(attributes)
				.filter(attrKey => !sectionId || attributes[attrKey].section === sectionId)
				.map((attrKey,i) => {
					let ViewComp = attributes[attrKey].ViewComp
					return(
						<div key={i} className={get(theme,'card.row', '')}>  
							<div className={get(theme,'card.rowLabel', '')}>{attributes[attrKey]?.display_name || attributes[attrKey]?.label || attrKey}</div>
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

			{
				(prev || next) && sectionId &&
				<div className={theme?.card?.btnWrapper}>
					{prev && sectionId && <button className={theme?.card?.backBtn} disabled={prevDisabled}
											  onClick={() => prev()}> Back </button>}
					{next && sectionId && <button className={theme?.card?.continueBtn} disabled={nextDisabled}
											  onClick={() => next()}> Continue </button>}
				</div>
			}
		</div>
	)	
}