import React, {useState} from 'react'
import {Link, useNavigate} from 'react-router-dom'
import {VerticalDots} from "../ui/icons";

function PatternList (props) {

	const data = props?.dataItems[0] || {};
	const siteId = data?.id;

	return (
		<div className={'p-10 max-w-5xl h-dvh'}>
			<div className={'w-full flex justify-between border-b-2 border-blue-400'}>
				<div className={'text-2xl font-semibold text-gray-700'}>Patterns Hola</div>
				<Link to={`edit/${siteId}`}>Edit Site</Link>
			</div>
			<div key={data?.site_name} className={'font-semibold'}>
				Site Name: {data?.site_name || 'No Site Name'}
			</div>

		<div className={'py-5'}>
			<div className={'py-2 font-semibold text-l'}>Current Patterns</div>
			<div className={'font-light divide-y-2'}>
				<div className={'font-semibold grid grid-cols-4 '}>
					<div>Pattern Type</div>
					<div>Doc Type</div>
					<div>Auth Level</div>
					<div>Base Url</div>
					<div></div>
				</div>
				{
					(data?.patterns || []).map(pattern => (
						<div key={pattern.id} className={'grid grid-cols-4 '}>
							<div>{pattern.pattern_type}</div>
							<div>{pattern.doc_type}</div>
							<div>{pattern.authLevel}</div>
							<Link to={pattern.base_url}>{pattern.base_url} ok?</Link>
							<Link to={`/manage_pattern/${pattern.id}`}>Manage</Link>
						</div>
					))
				}
			</div>
		</div>
	</div>
	)
}

function PatternEdit({
	 Component,
	 attributes={},
	 updateAttribute,
	 status,
	 onSubmit,
	 onChange,
	 value = [],
	 format,
	 ...rest
}) {
	const [newItem, setNewItem] = useState({app: format?.app});
	const [editingIndex, setEditingIndex] = useState(undefined);
	const [editingItem, setEditingItem] = useState(undefined);
	const [showActionsIndex, setShowActionsIndex] = useState();
	const attrToShow = Object.keys(attributes).filter(attrKey => ['pattern_type', 'doc_type', 'subdomain', 'base_url', 'authLevel'].includes(attrKey));
	const numAttributes = attrToShow.length
	//console.log('??????????/', format)
	//console.log('??????????/', format)
	const addNewValue = (item) => {

		const newData = [...value, item || newItem];
		// console.log('addNewValue', newData)
		onChange(newData)
		onSubmit(newData)
		setNewItem({app: format?.app})
	}
	const c = {
		1: 'grid grid-cols-1',
		2: 'grid grid-cols-2',
		3: 'grid grid-cols-3',
		4: 'grid grid-cols-4',
		5: 'grid grid-cols-5',
		6: 'grid grid-cols-6',
		7: 'grid grid-cols-7',
		8: 'grid grid-cols-8',
		9: 'grid grid-cols-9',
		10: 'grid grid-cols-10',
		11: 'grid grid-cols-11',
	};
	return (
		<div className={'flex flex-col p-10 w-full divide-y-2'}>
			<div className={'w-full flex justify-between border-b-2 border-blue-400'}>
				<div className={'text-2xl font-semibold text-gray-700'}>Patterns</div>
				<button onClick={() => navigate(-1)}>back</button>
			</div>

			<div className={`font-semibold ${c[numAttributes+1]}`}>
				{
					attrToShow.map(attr => <div key={attr}>{attr}</div>)
				}
				<div>Actions</div>
			</div>
			{
				value.map((pattern, index) => (
					<div key={pattern.id} className={`${c[numAttributes+1]} ${showActionsIndex === index ? `bg-gray-100` : ``} items-center px-2`}>
						{
							attrToShow
								.filter(attrKey => attrKey !== 'config')
								.map(attr => {
								let EditComp = attributes[attr].EditComp;


								return editingIndex === index ?
									<EditComp
										key={`${attr}-${index}`}
										value={editingItem?.[attr]}
										onChange={(v) => setEditingItem({...editingItem, app: format.app, [attr]: v})}
										{...attributes[attr]}
									/>
										: attr === 'base_url' ? <Link to={`${pattern[attr]}`}>{pattern[attr]}</Link> : <div>{pattern[attr]}</div>
									}
								)
						}
						{/* actions */}
						<div className={'w-full flex items-center justify-start'}>
							<Link
								className={'bg-blue-100 hover:bg-blue-300 text-sm text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
								to={`${pattern.base_url === '/' ? '' : pattern.base_url}/manage/metadata`}>manage</Link>

							<button
								className={'bg-blue-100 hover:bg-blue-300 text-sm text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
								title={'edit item'}
								onClick={() => {
									setEditingIndex(editingIndex === index ? undefined : index);
									setEditingItem(editingIndex === index ? undefined : pattern)
								}}
							>{editingIndex === index ? 'cancel' : 'edit'}
							</button>
							{
								editingIndex === index &&
								<button
									className={'bg-blue-100 hover:bg-blue-300 text-sm text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
									title={'done editing'}
									onClick={() => {
										value.splice(index, 1, editingItem);
										onChange(value)
										setEditingIndex(editingIndex === index ? undefined : index);
										setEditingItem(editingIndex === index ? undefined : pattern)
										console.log('test123 ', value)
										value[0].base_url = `/${value[0].base_url?.replace(/^\/|\/$/g, '')}`
										onSubmit(value)
									}}
								>done
								</button>
							}
							<div className={'relative w-fit'}>
								<VerticalDots
									className={`p-1 hover:cursor-pointer hover:bg-gray-100 ${showActionsIndex === index ? `bg-gray-200` : ``} rounded-full`}
									height={24} width={24}
									onClick={() => setShowActionsIndex(showActionsIndex === index ? undefined : index)}/>
								<div className={showActionsIndex === index ? 'z-10 absolute p-1 flex flex-col right-0 top-8 bg-white text-sm border rounded-md shadow-md' : 'hidden'}>

									<button
										className={'bg-green-100 hover:bg-green-300 text-green-800 px-2 py-0.5 my-1 rounded-lg w-full h-fit'}
										title={'duplicate item'}
										onClick={() => {
											const dataToCopy = JSON.stringify({
												app: pattern.app,
												base_url: `${pattern.base_url}_copy`,
												subdomain: pattern.subdomain,
												config: pattern.config,
												doc_type: `${pattern.doc_type}_copy`,
												pattern_type: pattern.pattern_type,
												auth_level: pattern.auth_level
											})
											addNewValue(dataToCopy)
										}}
									> duplicate
									</button>
									<div className={'w-full border-b-2 border-red-300'} />
									<button
										className={'bg-red-100 hover:bg-red-300 text-red-800 px-2 py-0.5 my-1 rounded-lg w-full h-fit'}
										title={'remove item'}
										onClick={() => {
											const newData = value.filter((v, i) => i !== index);
											onChange(newData)
											onSubmit(newData)
										}}
									> remove
									</button>
								</div>
							</div>
						</div>
					</div>
				))
			}

			<div className={`${c[numAttributes + 1]}`}>
				{
					attrToShow
						.map((attrKey, i) => {
							let EditComp = attributes[attrKey].EditComp
							return (

								<EditComp
									key={`${attrKey}-${i}`}
									value={newItem?.[attrKey]}
									onChange={(v) => setNewItem({...newItem, [attrKey]: v})}
											{...attributes[attrKey]}
										/>

							)
						})
				}
				<div className={'w-full flex items-center justify-start'}>
				<button 
					className={'bg-blue-100 hover:bg-blue-300 text-sm text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'} 
					onClick={() => addNewValue(newItem)}
				>
					Add
				</button>
				</div>
			</div>
		</div>
	)
}

function PatternEditUsingComps({
   Component,
   attributes,
   updateAttribute,
   status,
   onChange,
   value = [],
   ...rest
}) {
	console.log('rest', rest, attributes, updateAttribute)
	const [newItem, setNewItem] = useState({});
	const addNewValue = () => {
		onChange([...value, newItem])
		setNewItem({})
	}
	return (
		<div className={'flex flex-col p-10 w-full'}>
			<div className={'w-full flex justify-between border-b-2 border-blue-400'}>
				<div className={'text-2xl font-semibold text-gray-700'}>Patterns</div>
				<Link to={`/list`}>back</Link>
			</div>
			<div className={'flex w-full'}>
				{
					value.map((item, itemIndex) => (
						<div key={itemInedx} className={'flex flex-1 max-w-[33%] border-2 p-10 m-4'}>
							<div className={'flex flex-1 flex-col'}>
								{
									Object.keys(attributes)
										.map((attrKey, i) => {
											let ViewComp = attributes[attrKey].ViewComp
											return (
												<div key={`${attrKey}-${i}`} className={'w-full flex justify-between'}>
													<div className={'w-1/4'}>
														{attributes[attrKey]?.display_name || attributes[attrKey]?.label || attrKey}
													</div>
													<div className={'font-semibold w-3/4'}>
														<ViewComp
															key={`${attrKey}-${i}`}
															value={item?.[attrKey]}
															onChange={(v) => updateAttribute(attrKey, v)}
															{...attributes[attrKey]}
														/>
													</div>
												</div>
											)
										})
								}
							</div>
							<button
								className={'bg-red-100 hover:bg-red-300 text-red-800 p-2 rounded-lg w-fit h-fit'}
								title={'remove item'}
								onClick={() => onChange(value.filter((v,i) => i !== itemIndex))}
							>X</button>
						</div>
					))
				}
			</div>

			<div className={'mx-4'}>
				{
					Object.keys(attributes)
						.map((attrKey, i) => {
							let EditComp = attributes[attrKey].EditComp
							return (
								<div key={`${attrKey}-${i}`} className={'w-full flex space-between'}>
									<div className={'w-1/4'}>
										{attributes[attrKey]?.display_name || attributes[attrKey]?.label || attrKey}
									</div>
									<div className={'font-semibold w-3/4'}>
										<EditComp
											key={`${attrKey}-${i}`}
											value={newItem?.[attrKey]}
											onChange={(v) => setNewItem({...newItem, [attrKey]: v})}
											{...attributes[attrKey]}
										/>
									</div>
								</div>
							)
						})
				}
				<button className={'bg-blue-300 hover:bg-blue-500 text-white float-right'} onClick={addNewValue}>Add
				</button>
			</div>
		</div>
	)
}

export default {
	EditComp: PatternEdit,
	ViewComp: PatternList
}