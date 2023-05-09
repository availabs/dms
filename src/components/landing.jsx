import React from 'react'
import Card from './card'
import { useTheme } from '../theme'

export default function Landing({dataItems=[], attributes}) {
	const theme = useTheme()
	return (
		<div className={'border border-pink-300'}> 
			Landing
			{
				dataItems.map((d,i) => 
					<Card 
						key={i} 
						item={d} 
						attributes={attributes} 
					/>
				)
			}
		</div>
	)	
}