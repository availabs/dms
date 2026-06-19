import React, {useContext, useRef, useState} from 'react'
import {AdminContext} from "../../context";
import { ThemeContext } from '../../../../ui/useTheme';
import { Link, useLocation } from 'react-router'
import { cloneDeep } from 'lodash-es';
import { nameToSlug } from '../../../../utils/type-utils';
import { themeListTheme } from './list.theme';

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
  const { UI, theme } = React.useContext(ThemeContext) || {};
  const t = { ...themeListTheme, ...(theme?.admin?.themeList || {}) }
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
        <div className={t.cellActions}>
          <Link to={d?.row?.manage_url || ''} className={t.editLink}>
            <Icon icon='PencilEditSquare' className={t.iconMd} /><span className={t.iconLabel}>Edit</span>
          </Link>
          <div
            onClick={async () => { setEditingItem(d.row)}}
            className={t.settingsLink}>
            <Icon icon='' className={t.iconMd} /><span className={t.iconLabel}>Settings</span>
          </div>

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
		<div className={t.wrapper}>
			<div className={t.header}>
				<div className={t.headerTitle}>Themes</div>
				<Button className={'shrink-0'} onClick={() => setAddingNew(true)}> Add theme </Button>
			</div>
			<div className={t.searchBar}>
				<Input type={'text'} value={search} onChange={e => setSearch(e.target.value)} placeHolder={'Filter themes'} />

				{/*<Button className={'shrink-0'} onClick={() => onSubmit([])}> Clear themes </Button>*/}
			</div>
			<Table columns={columns}
				   data={data}
				   isEdit={false}
				   gridRef={gridRef}
			/>

			<Modal open={addingNew} setOpen={setAddingNew}>
				<div className={t.modalForm}>
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
					<div className={t.modalActions}>
						<button
							className={t.btnAdd}
							onClick={() => addNewValue({...newItem, theme_id: nameToSlug(newItem.name || '')})}
						>
							Add
						</button>
					</div>
				</div>
			</Modal>

			<Modal open={Boolean(editingItem)} setOpen={setEditingItem}>
				<div className={t.modalForm}>
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
					<div className={t.modalEditActions}>
						<Button
							className={t.btnSave}
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
							className={t.btnCancel}
							type={'plain'}
							title={'cancel item'}
							onClick={() => {
								setEditingItem(undefined)
							}}
						>
							Cancel
						</Button>

						<Button
							className={t.btnDuplicate}
							type={'plain'}
							title={'duplicate item'}
							onClick={async () => {
								const duplicate_theme = cloneDeep(editingItem)
								delete duplicate_theme.id
								duplicate_theme.name = duplicate_theme.name + ' dup'
								const theme_id = nameToSlug(duplicate_theme.name);
								const newValue = [...item.theme_refs, {...duplicate_theme, theme_id}]
								onSubmit(newValue);
								setEditingItem(undefined)
							}}
						> duplicate
						</Button>
						<Button
							className={t.btnRemove}
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
      <pre>{JSON.stringify(item.theme_refs, null,3)}</pre>
      */}
		</div>
	)
}

export default ThemeList
