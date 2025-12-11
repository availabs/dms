import React, {useContext, useRef, useState} from 'react'
import {AdminContext} from "../../context";
import { ThemeContext } from '../../../../ui/useTheme';
import { Link, useLocation } from 'react-router'
import {v4 as uuidv4} from "uuid";

function ThemeList ({
   item={},
   dataItems,
   attributes,
   updateAttribute,
   apiUpdate,
   format,
}) {
	// themes is an array of {name, theme, id}
	const location = useLocation()
	const { baseUrl, authPath, user, } = React.useContext(AdminContext) || {};
  const { UI } = React.useContext(ThemeContext) || {};
	const [addingNew, setAddingNew] = useState(false);
	const [newItem, setNewItem] = useState({});
	const [editingItem, setEditingItem] = useState();
	const [search, setSearch] = useState('');
	const gridRef = useRef(null);
	const {Modal, Input, Button, Table} = UI;


	const attrToAddNew = ['name', 'theme'];
	const columns = [
		{name: 'name', display_name: 'Theme name', show: true, type: 'text'},
		{name: 'manage_url', display_name: 'Manage', show: true, type: 'text', isLink: true, linkText: 'manage'},
		{name: 'edit', display_name: 'Edit', show: true, type: 'ui',
			Comp: (d) => {
				return <Button onClick={() => setEditingItem(d.row)}>Edit</Button>
			}},
	]
	const data = (item.themes || [])
		.map(v => ({...v, manage_url: `${baseUrl}/theme/${v.id}`}))
		.filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()));

	const onSubmit = (value) => {
		apiUpdate({data: {...item, ...{themes: value}}, config: {format}})
		updateAttribute('themes', value)
	}

	const addNewValue = (valueToAdd) => {
		const value = item.themes || [];
		const newValue = [...value, valueToAdd];
		onSubmit(newValue);
		setNewItem({});
		setAddingNew(false);
	}

	if(!item.id && dataItems?.length > 0) {
		item = dataItems[0]
	}
  // if(!user?.authed) return <div>To access this page, you need to: <Link to={`${authPath}/login`} state={{ from: location.pathname }}>login</Link></div>
	// render a list of themes. render an add new form
	return (
		<div className={'flex flex-col w-full'}>
			<div className={'w-full flex justify-between border-b-2 border-blue-400'}>
				<div className={'text-2xl font-semibold text-gray-700'}>Themes</div>
			</div>
			<div className={'w-full flex'}>
				<Input type={'text'} value={search} onChange={e => setSearch(e.target.value)} placeHolder={'Filter themes'} />
				<Button className={'shrink-0'} onClick={() => setAddingNew(true)}> Add theme </Button>
				{/*<Button className={'shrink-0'} onClick={() => onSubmit([])}> Clear themes </Button>*/}
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
								return (
									<Input
										value={newItem?.[attrKey]}
										placeHolder={attrKey}
										onChange={(v) => setNewItem({...newItem, [attrKey]: v.target.value})}
										key={`${attrKey}-${i}`}
									/>

								)
							})
					}
					<div className={'w-full flex items-center justify-start'}>
						<button
							className={'bg-blue-100 hover:bg-blue-300 text-sm text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
							onClick={() => addNewValue({...newItem, id: uuidv4()})}
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
								return (
									<Input
										value={editingItem?.[attrKey]}
										onChange={(v) => setEditingItem({...editingItem, [attrKey]: v.target.value})}
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
								const newValue = item.themes.map(v => v.id === editingItem.id ? editingItem : v);
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
								const id = uuidv4();
								const newValue = [...item.themes, {...editingItem, id}]
								onSubmit(newValue);
								setEditingItem(undefined)
							}}
						> duplicate
						</Button>
						<Button
							className={'bg-red-100 hover:bg-red-300 text-red-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
							type={'plain'}
							title={'remove item'}
							onClick={() => {
								const newData = item.themes.filter((v, i) => v.id !== editingItem.id);
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

export default ThemeList
