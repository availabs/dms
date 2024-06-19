import React from 'react'
import { Input, ButtonPrimary} from '../ui'


function NewSite ({apiUpdate}) {
	const [newSite, setNewSite] = React.useState({
		site_name: '',
		patterns: []
	})

	function createSite () {
		if(newSite?.site_name?.length > 3) {
			apiUpdate({data: newSite})
		}
	}

	return (
		<div className={'h-screen w-screen bg-slate-100 flex items-center justify-center'}>
			<div className='w-[316px] h-[250px] -mt-[200px] bg-white shadow rounded p-4 flex flex-col justify-between'>
				<Input 
					label='Create Your Site'
					placeholder='Site Name'
					value={newSite.site_name}
					onChange={(e) => setNewSite({...newSite, ['site_name']: e.target.value })}
				/>
				<div>
			 	<ButtonPrimary onClick={createSite}>
			 		Create
			 	</ButtonPrimary>
	 		</div>
			</div>
			
	 	</div>
	)
}


function SiteEdit ({
   item={},
   dataItems,
   attributes,
   updateAttribute,
   status,
   apiUpdate, 
   format
}) {
	

	const updateData = (data, attrKey) => {
		console.log('update data', {...item, ...{[attrKey]: data}})
		apiUpdate({data: {...item, ...{[attrKey]: data}}, config: {format}})
	}
	
	if(!item.id && dataItems?.length > 0) {
		item = dataItems[0]
	}

	if(!item.id) return <NewSite apiUpdate={apiUpdate} />


	//console.log('site edit', status, dataItems)

	return <div key={item?.id || 'new'} className={'w-full'}>	
		{Object.keys(attributes)
			.map((attrKey, i) => {
				let EditComp = attributes[attrKey].EditComp
				// console.log('what', attributes[attrKey])
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

export default SiteEdit