import React, {useContext, useRef, useState} from 'react'
import {AdminContext} from "../../context";
import { ThemeContext } from '../../../../ui/useTheme';
import { Link, useLocation } from 'react-router'
import { cloneDeep } from 'lodash-es';
import { nameToSlug } from '../../../../utils/type-utils';
import { themeListTheme } from './list.theme';
import { isUserAuthed } from '../../utils';

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
	const { baseUrl, authPath, app, user, authPermissions } = React.useContext(AdminContext) || {};
  const { UI, theme } = React.useContext(ThemeContext) || {};
  const t = { ...themeListTheme, ...(theme?.admin?.themeList || {}) }

	const [addingNew, setAddingNew] = useState(false);
	const [newItem, setNewItem] = useState({});
	const [editingItem, setEditingItem] = useState();
	const [search, setSearch] = useState('');
	const gridRef = useRef(null);
	const {Modal, Input, Button, Table, Icon} = UI;

  const isAdmin = (user?.groups || []).some(g => g === `${app} Admin`);
  if (!isAdmin && !isUserAuthed(user, authPermissions)) {
    return <div className={t.noAccess || 'flex items-center justify-center h-48 text-sm text-gray-400'}>You do not have permission to manage themes.</div>;
  }


	const attrToAddNew = ['name', 'theme'];
	const columns = [
		{name: 'name', display_name: 'Theme name', show: true, type: 'ui',
			Comp: (d) => (
				<div className={d.className}>
					<Link to={d.row.manage_url} className={t.themeName}>{d.row.name}</Link>
				</div>
			)
		},

    {
      name: 'edit', display_name: 'Actions', show: true, type: 'ui',
		size: 150,
      Comp: (d) => (
        <div className={t.cellActions}>
          <Link to={d?.row?.manage_url || ''} className={t.editLink}>
            <Icon icon='PencilEditSquare' className={t.iconMd} />
          </Link>
          <div
            onClick={async () => { setEditingItem(d.row)}}
            className={t.settingsLink}>
            <Icon icon='Settings' className={t.iconMd} />
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
				<div className={t.toolbar}>
					<div className={t.searchWrapper}>
						<Icon icon='Search' className={t.searchIcon} />
						<Input type={'text'} className={t.searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder={'filter themes…'} />
					</div>
					<Button className={t.addButton} onClick={() => setAddingNew(true)}>
						<Icon icon='Plus' className={t.iconSm} /> add theme
					</Button>
				</div>
			</div>
			<div className={t.tableWrapper}>
				<Table columns={columns}
					   data={data}
					   isEdit={false}
					   gridRef={gridRef}
				/>
			</div>

			<Modal open={addingNew} setOpen={setAddingNew}>
				<div className={t.modalForm}>
					<div className={t.modalTitle}>Add a theme</div>
					{
						attrToAddNew
							.map((attrKey, i) => {
								return (
									<Input
										value={newItem?.[attrKey]}
										placeholder={attrKey}
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
							add
						</button>
					</div>
				</div>
			</Modal>

			<Modal open={Boolean(editingItem)} setOpen={setEditingItem}>
				<div className={t.modalForm}>
					<div className={t.modalTitle}>Theme settings</div>
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
							save
						</Button>

						<Button
							className={t.btnCancel}
							type={'plain'}
							title={'cancel item'}
							onClick={() => {
								setEditingItem(undefined)
							}}
						>
							cancel
						</Button>

						<span className='flex-1' />

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
