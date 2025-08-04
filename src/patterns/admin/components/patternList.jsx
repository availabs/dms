import React, {useContext, useRef, useState} from 'react'
import {Link} from 'react-router'
import {v4 as uuidv4} from "uuid";
import {AdminContext} from "../siteConfig";

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
					<div>Base Url</div>
					<div></div>
				</div>
				{
					(data?.patterns || []).map(pattern => (
						<div key={pattern.id} className={'grid grid-cols-4 '}>
							<div>{pattern.pattern_type}</div>
							<div>{pattern.name || pattern.doc_type}</div>
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
	const {app, API_HOST, UI} = useContext(AdminContext);
	const {Table, Input, Button, Modal, Drawer} = UI;
	const gridRef = useRef(null);
	const [search, setSearch] = useState('');
	const [newItem, setNewItem] = useState({app: format?.app});
	const [addingNew, setAddingNew] = useState(false);
	const [editingItem, setEditingItem] = useState(undefined);
	const [isDuplicating, setIsDuplicating] = useState(false);
	const attrToAddNew = ['pattern_type', 'name', 'subdomain', 'base_url', 'filters', 'authPermissions'];
	const columns = [
		{name: 'name', display_name: 'Name', show: true, type: 'text'},
		{name: 'subdomain', display_name: 'Subdomain', show: true, type: 'text'},
		{name: 'base_url', display_name: 'Base URL', show: true, type: 'text'},
		{name: 'updated_at', display_name: 'Updated', show: true, type: 'text', formatFn: 'date'},
		{name: 'manage_url', display_name: 'Manage', show: true, type: 'text', isLink: true, linkText: 'manage'},
		{name: 'edit', display_name: 'Edit', show: true, type: 'ui', Comp: (d) => {
			return <Button onClick={() => setEditingItem(d.row)}>Edit</Button>
			}},
	]

	const dmsServerPath = `${API_HOST}/dama-admin`;

	const addNewValue = (item) => {
		const newData = [...value, item || newItem];
		onChange(newData)
		onSubmit(newData)
		setNewItem({app: format?.app})
	}

	const duplicate = async({oldType, newType}, item) => {
		setIsDuplicating(true);
		// call server to copy over pages and sections
		const res = await fetch(`${dmsServerPath}/dms/${app}+${oldType}/duplicate`,
			{
				method: "POST",
				body: JSON.stringify({newApp: app, newType}), // doc_type becomes type for pages.
				headers: {
					"Content-Type": "application/json",
				},
			});

		// const publishFinalEvent = await res.json();
		await addNewValue(item);
		setIsDuplicating(false);
	}

	const data = value
		.map(v => ({...v, name: v.name || v.doc_type, manage_url: `${v.base_url === '/' ? '' : v.base_url}/manage/design`}))
		.filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()));
	const authExists = data.some(d => d.pattern_type === 'auth')

	return (
			<div className={'flex flex-col p-10 w-full divide-y-2'}>
				<div className={'w-full flex justify-between border-b-2 border-blue-400'}>
					<div className={'text-2xl font-semibold text-gray-700'}>Sites</div>
					<button onClick={() => navigate(-1)}>back</button>
				</div>
				<div className={'w-full flex'}>
					<Input type={'text'} value={search} onChange={e => setSearch(e.target.value)} placeholder={'Filter sites'} />
					<Button className={'shrink-0'} onClick={() => setAddingNew(true)}> Add site </Button>
				</div>
				<Table columns={columns}
					   data={data}
					   isEdit={false}
					   gridRef={gridRef}
				/>

				<Modal open={addingNew} setOpen={setAddingNew}>
					<div className={`flex flex-col`}>
						{
							attrToAddNew
								.map((attrKey, i) => {
									let {EditComp, ViewComp, ...props} = attributes[attrKey];
									const options =
										attrKey === 'pattern_type' && authExists && props.options?.length ?
											props.options.filter(o => o.value !== 'auth') :
											props.options;
									return (
										<EditComp
											value={newItem?.[attrKey]}
											onChange={(v) => setNewItem({...newItem, [attrKey]: v})}
											{...props}
											options={options}
											placeHolder={attrKey}
											key={`${attrKey}-${i}`}
										/>

									)
								})
						}
						<div className={'w-full flex items-center justify-start'}>
							<button
								className={'bg-blue-100 hover:bg-blue-300 text-sm text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
								onClick={() => addNewValue({...newItem, doc_type: uuidv4()})}
							>
								Add
							</button>
						</div>
					</div>
				</Modal>

				<Modal open={Boolean(editingItem)} setOpen={setEditingItem}>
					<div className={`flex flex-col`}>
						{
							attrToAddNew
								.map((attrKey, i) => {
									let {EditComp, ViewComp, ...props} = attributes[attrKey]
									return (

										<EditComp
											value={editingItem?.[attrKey]}
											onChange={(v) => setEditingItem({...editingItem, [attrKey]: v})}
											placeHolder={attrKey}
											{...props}
											key={`${attrKey}-${i}`}
										/>

									)
								})
						}
						<div className={'w-full flex items-center justify-start gap-0.5'}>
							<Button
								className={'bg-blue-100 hover:bg-blue-300 text-sm text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
								type={'plain'}
								title={'save item'}
								onClick={() => {
									const newValue = value.map(v => v.id === editingItem.id ? editingItem : v);
									onChange(newValue)
									onSubmit(newValue)
									setEditingItem(undefined)
								}}
							>
								Save
							</Button>

							<Button
								className={'bg-red-100 hover:bg-red-300 text-sm text-red-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
								type={'plain'}
								title={'cancel item'}
								onClick={() => {
									setEditingItem(undefined)
								}}
							>
								Cancel
							</Button>

							<Button
								className={'bg-green-100 hover:bg-green-300 text-green-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
								type={'plain'}
								title={'duplicate item'}
								onClick={async () => {
									const newDocType = uuidv4();
									const dataToCopy = {
										app: editingItem.app,
										base_url: `${editingItem.base_url}_copy`,
										subdomain: editingItem.subdomain,
										config: editingItem.config,
										doc_type: newDocType,
										name: `${editingItem.name}_copy`,
										pattern_type: editingItem.pattern_type,
										auth_level: editingItem.auth_level,
										filters: editingItem.filters,
										theme: editingItem.theme,
									};
									await duplicate({oldType: editingItem.doc_type, newType: newDocType}, dataToCopy)
									setEditingItem(undefined)
								}}
							> {isDuplicating ? 'duplicating...' : 'duplicate'}
							</Button>
							<Button
								className={'bg-red-100 hover:bg-red-300 text-red-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
								type={'plain'}
								title={'remove item'}
								onClick={() => {
									const newData = value.filter((v, i) => v.id !== editingItem.id);
									onChange(newData)
									onSubmit(newData)
									setEditingItem(undefined)
								}}
							> remove
							</Button>
						</div>
					</div>
				</Modal>
			</div>
	)
}

export default {
	EditComp: PatternEdit,
	ViewComp: PatternList
}