import React from 'react'
import { InputComp , ButtonPrimary} from '../ui'
import Layout from '../ui/avail-layout'
import {AdminContext} from "../siteConfig";
import { Link } from 'react-router-dom'


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
				<InputComp 
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
	
	const { baseUrl, theme, user } = React.useContext(AdminContext) || {}
	const updateData = (data, attrKey) => {
		apiUpdate({data: {...item, ...{[attrKey]: data}}, config: {format}})
	}
	
	if(!item.id && dataItems?.length > 0) {
		item = dataItems[0]
	}

	if(!item.id) return <NewSite apiUpdate={apiUpdate} />// (<Layout></Layout>)()


	const menuItems = [
		{
			name: <div className=''>Dashboard</div>,
			className:''
		}, 
		{
			name:'manage sites',
			className: 'px-6 pb-1 pt-4 uppercase text-xs text-blue-400'
		},
	]

	item.patterns.forEach(p =>{
		menuItems.push({
			name: (
				<div className='w-full flex-1 flex items-center'>
					<Link to={`${p.base_url === '/' ? '' : p.base_url}/manage`} className='flex-1'>{p.doc_type}</Link>
					{/*<div className='px-2'>x</div>
					<div className='px-2'>y</div>*/}
				</div>
			)
		})
	})


	return (
		<>
			{Object.keys(attributes)
				.map((attrKey, i) => {
					let EditComp = attributes[attrKey].EditComp
					//console.log('what', attributes[attrKey])
					return (
						<div key={`${attrKey}-${i}`}>
							<EditComp
								key={`${attrKey}-${i}`}
								value={item?.[attrKey]}
								onChange={(v) => updateAttribute(attrKey, v)}
								onSubmit={data => {
									//console.log('updateData', data,attrKey)
									updateData(data, attrKey)
								}}
								format={format}
								attributes={attributes[attrKey].attributes}
							/>
						</div>
					)
				})
			}
		</>
	)
}

export default SiteEdit