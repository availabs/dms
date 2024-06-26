import React, {useState} from 'react'
import {Link, useNavigate} from 'react-router-dom'

function PatternList (props) {

	const data = props?.dataItems[0] || {};
	const siteId = data?.id;

	return (
		<div className={'p-10 w-full h-dvh'}>
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
							<Link to={pattern.base_url}>{pattern.base_url}</Link>
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
	 submit,
	 onChange,
	 value = [],
	 format,
	 ...rest
}) {
	const [newItem, setNewItem] = useState({});
	const [editingIndex, setEditingIndex] = useState(undefined);
	const [editingItem, setEditingItem] = useState(undefined);
	const attrToShow = Object.keys(attributes).filter(attrKey => ['pattern_type', 'doc_type', 'base_url', 'authLevel'].includes(attrKey));
	const numAttributes = attrToShow.length

	const addNewValue = () => {
		const newData = [...value, newItem];
		onChange(newData)
		submit(newData)
		setNewItem({})
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
					attrToShow.map(attr => <div>{attr}</div>)
				}
				<div>Actions</div>
			</div>
			{
				value.map((pattern, index) => (
					<div key={pattern.id} className={c[numAttributes+1]}>
						{
							attrToShow
								.filter(attrKey => attrKey !== 'config')
								.map(attr => {
								let EditComp = attributes[attr].EditComp;


								return editingIndex === index ?
									<EditComp
										key={`${attr}-${index}`}
										value={editingItem?.[attr]}
										onChange={(v) => setEditingItem({...editingItem, [attr]: v})}
										{...attributes[attr]}
									/>
										: <div>{pattern[attr]}</div>
								}
							)
						}
						<div className={'w-full flex items-center justify-center'}>
							<Link
								className={'bg-blue-100 hover:bg-blue-300 text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
								to={`/manage_pattern/${pattern.id}`}>Manage</Link>

							<button
								className={'bg-blue-100 hover:bg-blue-300 text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
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
									className={'bg-blue-100 hover:bg-blue-300 text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
									title={'done editing'}
									onClick={() => {
										value.splice(index, 1, editingItem);
										onChange(value)
										setEditingIndex(editingIndex === index ? undefined : index);
										setEditingItem(editingIndex === index ? undefined : pattern)
										submit(value)
									}}
								>done
								</button>
							}
							<button
								className={'bg-red-100 hover:bg-red-300 text-red-800 px-2 py-0.5 mx-1 rounded-lg w-fit h-fit'}
								title={'remove item'}
								onClick={() => {
									const newData = value.filter((v, i) => i !== index);
									onChange(newData)
									submit(newData)
								}}
							> remove
							</button>
						</div>
					</div>
				))
			}

			<div className={`mx-4 ${c[numAttributes+1]}`}>
				{
					attrToShow
						.map((attrKey, i) => {
							let EditComp = attributes[attrKey].EditComp
							return (
								<div key={`${attrKey}-${i}`} className={'w-full flex space-between'}>
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
				<button className={'bg-blue-300 hover:bg-blue-500 text-white w-fit px-2 py-0.5'} onClick={addNewValue}>Add
				</button>
			</div>
		</div>
	)
}

function PatternEditUsingComps({
								   Component,
								   attributes,
								   updateAttribute,
								   status,
								   submit,
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
						<div className={'flex flex-1 max-w-[33%] border-2 p-10 m-4'}>
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