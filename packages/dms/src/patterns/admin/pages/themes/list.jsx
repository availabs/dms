import React, {useContext, useRef, useState} from 'react'
import {AdminContext} from "../../context";
import { ThemeContext, getComponentTheme } from '../../../../ui/useTheme';
import { Link, useLocation } from 'react-router'
import { cloneDeep } from 'lodash-es';
import { nameToSlug } from '../../../../utils/type-utils';
import { parseIfJSON } from '../../../page/pages/_utils';

function PaletteStrip({ themeJson, className }) {
  const parsed = parseIfJSON(themeJson);
  const colors = Object.values(parsed?.c || {}).slice(0, 6);
  if (!colors.length) return <div className={className} style={{ background: '#E8E2D5' }} />;
  return (
    <div className={`flex ${className || ''}`}>
      {colors.map((color, i) => (
        <div key={i} className="flex-1" style={{ background: color }} />
      ))}
    </div>
  );
}

function ThemeList ({
   item={},
   dataItems,
   attributes,
   updateAttribute,
   apiUpdate,
   format,
}) {
	const location = useLocation()
	const { baseUrl, authPath, user, } = React.useContext(AdminContext) || {};
  const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
	const t = getComponentTheme(themeFromContext, 'admin');
	const [addingNew, setAddingNew] = useState(false);
	const [newItem, setNewItem] = useState({});
	const [editingItem, setEditingItem] = useState();
	const [search, setSearch] = useState('');
	const gridRef = useRef(null);
	const {Modal, Input, Button, Icon} = UI;

	const attrToAddNew = ['name', 'theme'];
	const patterns = item.patterns || [];
	const data = (item.theme_refs || [])
		.map(v => ({
      ...v,
      manage_url: `${baseUrl}/theme/${v.theme_id}`,
      used_by: patterns.filter(p => parseIfJSON(p.theme)?.selectedTheme === v.name).map(p => p.name),
    }))
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
	return (
		<div className={'flex flex-col w-full'}>
			<div className={t.pageHeader || 'w-full items-center flex justify-between border-b-2 border-blue-400 pb-2'}>
				<div className={t.pageTitle || 'text-2xl font-semibold text-gray-700'}>Themes</div>
				<Button className={'shrink-0'} onClick={() => setAddingNew(true)}> Add theme </Button>
			</div>
			<div className={'w-full flex'}>
				<Input type={'text'} value={search} onChange={e => setSearch(e.target.value)} placeHolder={'Filter themes'} />
			</div>
			<div className={t.themeGrid || 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4'}>
				{data.map(row => (
          <div key={row.theme_id} className={t.themeCard || 'border rounded flex flex-col'}>
            <PaletteStrip themeJson={row.theme} className={t.themeCardPalette || 'h-12'} />
            <div className={t.themeCardBody || 'p-4 flex-1'}>
              <div className={t.themeCardName || 'text-lg font-semibold'}>{row.name}</div>
              <div className={t.themeCardMeta || 'text-xs text-slate-400 mt-0.5 uppercase tracking-wide'}>
                {row.theme_id}
              </div>
            </div>
            <div className={t.themeCardFooter || 'px-4 py-3 border-t flex items-center justify-between gap-2'}>
              <div className="flex flex-wrap gap-1">
                {row.used_by.length > 0
                  ? row.used_by.map(n => <span key={n} className={t.themeUsageChip || 'text-xs border px-1.5'}>{n}</span>)
                  : <span className={t.themeCardMeta || 'text-xs text-slate-400'}>Unused</span>
                }
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Link to={row.manage_url} className='flex items-center px-2 py-1 text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 rounded'>
                  <Icon icon='PencilEditSquare' className='size-4' /><span className='pl-1'>Edit</span>
                </Link>
                <button
                  onClick={() => setEditingItem(row)}
                  className='flex items-center px-2 py-1 text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer'
                >
                  Settings
                </button>
              </div>
            </div>
          </div>
        ))}
			</div>

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
							onClick={() => addNewValue({...newItem, theme_id: nameToSlug(newItem.name || '')})}
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
      <pre>{JSON.stringify(item.theme_refs, null,3)}</pre>
      */}
		</div>
	)
}

export default ThemeList
