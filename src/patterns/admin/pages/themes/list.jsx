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
	const {Modal, Input, Button, Table, Icon} = UI;


	const attrToAddNew = ['name', 'theme'];
	const columns = [
		{name: 'name', display_name: 'Theme name', show: true, type: 'text'},

    {
      name: 'edit', display_name: 'Edit', show: true, type: 'ui',
      Comp: (d) => (
        <div className='flex items-center justify-center w-full h-full py-1'>
          <Link to={d?.row?.manage_url || ''} className='flex items-center px-2 py-1 text-sm text-slate-700 bg-slate-200 rounded-full'>
            <Icon icon='PencilEditSquare' className='size-5' /><span className='pl-1'>Edit</span>
          </Link>
          <div
            onClick={async () => {
              setEditingItem(d.row)
              // const theme_id = uuidv4();
								// const newValue = [...item.theme_refs, {...editingItem, theme_id}]
								// onSubmit(newValue);
								// setEditingItem(undefined)
						}}
            className='flex mx-1 items-center px-2 py-1 text-sm text-slate-700 bg-slate-200 rounded-full cursor-pointer'>
            <Icon icon='' className='size-5' /><span className='pl-1'>Settings</span>
          </div>
          {/* <div
            onClick={async () => {
								const theme_id = uuidv4();
								const newValue = [...item.theme_refs, {...editingItem, theme_id}]
								onSubmit(newValue);
								setEditingItem(undefined)
						}}
            className='flex mx-1 items-center px-2 py-1 text-sm text-slate-700 bg-red-200 rounded-full cursor-pointer'>
            <Icon icon='' className='size-5' /><span className='pl-1'>Delete</span>
          </div>*/}
        </div>
      ),
    }
	]
	const data = (item.theme_refs || [])
		.map(v => ({...v, manage_url: `${baseUrl}/theme/${v.theme_id}`}))
		.filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()));

	const onSubmit = (value) => {
		apiUpdate({data: {...item, ...{theme_refs: value}} })
		updateAttribute('themes_ref', value)
	}

	const addNewValue = (valueToAdd) => {
		const value = item.theme_refs || [];
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
			<div className={'w-full items-center flex justify-between border-b-2 border-blue-400 pb-2'}>
				<div className={'text-2xl font-semibold text-gray-700'}>Themes</div>
				<Button className={'shrink-0'} onClick={() => setAddingNew(true)}> Add theme </Button>
			</div>
			<div className={'w-full flex'}>
				<Input type={'text'} value={search} onChange={e => setSearch(e.target.value)} placeHolder={'Filter themes'} />

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
							onClick={() => addNewValue({...newItem, theme_id: uuidv4()})}
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
								const newValue = item.theme_refs.map(v => v.theme_id === editingItem.theme_id ? editingItem : v);
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
								const theme_id = uuidv4();
								const newValue = [...item.theme_refs, {...editingItem, theme_id}]
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
								const newData = item.theme_refs.filter((v, i) => v.theme_id !== editingItem.theme_id);
								onSubmit(newData)
								setEditingItem(undefined)
							}}
						> remove
						</Button>
					</div>
				</div>
			</Modal>
			{/* Themes
      <pre>{JSON.stringify(item.themes, null,3)}</pre>
      Themes_ref
      <pre>{JSON.stringify(item.theme_refs, null,3)}</pre>*/}
		</div>
	)
}

export default ThemeList
