import React, {useContext, useRef, useState} from 'react'
import {Link} from 'react-router'
import {v4 as uuidv4} from "uuid";
import { useFalcor } from "@availabs/avl-falcor";
import {AdminContext} from "../context";
import { ThemeContext } from '../../../ui/useTheme';
import { nameToSlug, getInstance } from '../../../utils/type-utils';
import { patternListTheme } from './patternList.theme'

const parseIfJSON = strValue => {
    if (typeof strValue !== 'string' && Array.isArray(strValue)) return strValue;

    try {
        return JSON.parse(strValue)
    }catch (e){
        return []
    }
}

const RenderFilters = ({value=[], onChange, ...rest}) => {
    const {UI, theme} = useContext(ThemeContext);
    const [tmpValue, setTmpValue] = useState(parseIfJSON(value));
    const [newFilter, setNewFilter] = useState({});
    const {FieldSet, Button} = UI;
    const t = { ...patternListTheme, ...(theme?.admin?.patternList || {}) }
    const customTheme = {
        field: 'pb-2 flex flex-col'
    }
    const customThemeButton = {
        field: 'pb-2 place-content-end'
    }

    const updateFilters = (idx, key, valueToUpdate) => {
        setTmpValue(value.map((v, i) => i === idx ? {...v, [key]: valueToUpdate} : v))
        onChange(value.map((v, i) => i === idx ? {...v, [key]: valueToUpdate} : v));
    }

    return (
        <div className={t.filtersWrapper}>
            <label className={t.filtersLabel}>Filters</label>
            {
                tmpValue.map((filter, i) => (
                    <FieldSet
                        className={t.filterRow}
                        components={[
                            {label: 'Search Key', type: 'Input', placeholder: 'search key', value: filter.searchKey,
                                onChange: e => updateFilters(i, 'searchKey', e.target.value),
                                customTheme
                            },
                            {label: 'Search Value', type: 'Input', placeholder: 'search value', value: filter.values,
                                onChange: e => updateFilters(i, 'values', e.target.value),
                                customTheme
                            },
                            {type: 'Button', children: 'remove', customTheme: customThemeButton,
                                onClick: () => {
                                    onChange(value.filter((_, idx) => i !== idx));
                                    setTmpValue(value.filter((_, idx) => i !== idx))
                                }
                            }
                        ]}
                    />
                ))
            }
            <FieldSet
                className={t.filterRow}
                components={[
                    {label: 'Search Key', type: 'Input', placeholder: 'search key', value: newFilter.searchKey,
                        onChange: e => setNewFilter({...newFilter, searchKey: e.target.value}),
                        customTheme
                    },
                    {label: 'Search Value', type: 'Input', placeholder: 'search value', value: newFilter.values,
                        onChange: e => setNewFilter({...newFilter, values: e.target.value}),
                        customTheme
                    },
                    {type: 'Button', children: 'add', customTheme: customThemeButton,
                        onClick: () => {
                            const id = uuidv4();
                            onChange([...value, {id, ...newFilter}]);
                            setTmpValue([...value, {id, ...newFilter}])
                            setNewFilter({});
                        }
                    }
                ]}
            />
            <Button onClick={() => {
                onChange([]);
                setTmpValue([])
                setNewFilter({});
            }} > clear all filters </Button>
        </div>
    )
}
function PatternList (props) {
	const {UI, theme} = useContext(ThemeContext);
	const t = { ...patternListTheme, ...(theme?.admin?.patternList || {}) }
	const data = props?.dataItems[0] || {};
	const siteId = data?.id;

	return (
		<div className={t.listWrapper}>
			<div className={t.listHeader}>
				<div className={t.listTitle}>Patterns Hola</div>
				<Link to={`edit/${siteId}`}>Edit Site</Link>
			</div>
			<div key={data?.site_name} className={t.listSiteRow}>
				Site Name: {data?.site_name || 'No Site Name'}
			</div>

		<div className={t.listSection}>
			<div className={t.listSectionTitle}>Current Patterns</div>
			<div className={t.listGrid}>
				<div className={t.listGridHeader}>
					<div>Pattern Type</div>
					<div>Doc Type</div>
					<div>Base Url</div>
					<div></div>
				</div>
				{
					(data?.patterns || []).map(pattern => (
						<div key={pattern.id} className={t.listGridRow}>
							<div>{pattern.pattern_type}</div>
							<div>{pattern.name}</div>
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
	const {app, type: siteType, API_HOST, baseUrl, isMultiTenant} = useContext(AdminContext);
	const {UI, theme} = useContext(ThemeContext)
	const t = { ...patternListTheme, ...(theme?.admin?.patternList || {}) }
	const { falcor } = useFalcor();
	const {Table, Input, Button, Modal} = UI;
	const gridRef = useRef(null);
	const [search, setSearch] = useState('');
	const [newItem, setNewItem] = useState({app: format?.app});
	const [addingNew, setAddingNew] = useState(false);
	const [editingItem, setEditingItem] = useState(undefined);
	const [isDuplicating, setIsDuplicating] = useState(false);
	const siteInstance = getInstance(siteType) || siteType;
	const tenantSub = (() => {
		if (!isMultiTenant) return '';
		const hostname = window.location.hostname;
		const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
		const minParts = isLocalhost ? 2 : 3;
		const parts = hostname.split('.');
		return parts.length >= minParts ? parts[0] : '';
	})();
	const attrToAddNew = ['pattern_type', 'name', ...(tenantSub ? [] : ['subdomain']), 'base_url', 'filters', 'authPermissions'];
	const columns = [
		{name: 'name', display_name: 'Name', show: true, type: 'text'},
		{name: 'subdomain', display_name: 'Subdomain', show: true, type: 'text'},
		{name: 'base_url', display_name: 'Base URL', show: true, type: 'text'},
		{name: 'updated_at', display_name: 'Updated', show: true, type: 'text', formatFn: 'date'},
		{name: 'manage_url', display_name: 'Manage', show: true, type: 'text', isLink: true, linkText: 'manage'},
		{name: 'edit_url', display_name: 'Edit', show: true, type: 'text', isLink: true, linkText: 'edit'},
    {name: 'edit', display_name: 'Edit', show: true, type: 'ui', Comp: (d) => {
			return <Button onClick={() => setEditingItem(d.row)}>Edit</Button>
		}},
	]

	const dmsServerPath = `${API_HOST}/dama-admin`;

	const addNewValue = async (patternData) => {
		const data = patternData || newItem;
		const slug = nameToSlug(data.name);
		if (!slug) return;

		// Collision check
		const existingSlugs = value.map(v =>
			getInstance(v.type) || v?.base_url?.replace(/\//g, '')
		).filter(Boolean);
		if (existingSlugs.includes(slug)) {
			alert(`A pattern with identifier "${slug}" already exists`);
			return;
		}

		if (isMultiTenant) {
			const hostname = window.location.hostname;
			const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
			const minParts = isLocalhost ? 2 : 3;
			const parts = hostname.split('.');
			const tenantSub = parts.length >= minParts ? parts[0] : '';
			if (tenantSub && !data.subdomain) data.subdomain = tenantSub;
		}

		const patternType = `${siteInstance}|${slug}:pattern`;
		const res = await falcor.call(
			['dms', 'data', 'create'],
			[app, patternType, data]
		);
		const newId = Object.keys(res?.json?.dms?.data?.byId || {})
			.filter(d => d !== '$__path')?.[0];

		if (newId) {
			const newData = [...value, { ref: `${app}+${siteInstance}|pattern`, id: +newId }];
			onChange(newData);
			onSubmit(newData);
		}
		setNewItem({app: format?.app});
	}

	const duplicate = async({oldInstance, newInstance}, item) => {
		setIsDuplicating(true);
		try {
			// Queue the duplicate task — returns immediately with { task_id }.
			const res = await fetch(`${dmsServerPath}/dms/${app}+${oldInstance}/duplicate`, {
				method: "POST",
				body: JSON.stringify({newApp: app, newType: newInstance}),
				headers: { "Content-Type": "application/json" },
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok || body?.err) {
				console.error('[duplicate] failed to queue task:', body?.err || res.status);
				window.alert(`Pattern duplicate failed: ${body?.err || `HTTP ${res.status}`}. Pattern not created.`);
				return;
			}

			// Poll until the task finishes.
			const { task_id } = body;
			for (;;) {
				await new Promise(r => setTimeout(r, 3000));
				const statusRes = await fetch(`${dmsServerPath}/dms/tasks/${task_id}`);
				const task = await statusRes.json().catch(() => ({}));
				if (task.status === 'done') break;
				if (task.status === 'error') {
					console.error('[duplicate] task failed:', task.error);
					window.alert(`Pattern duplicate failed: ${task.error}. Pattern not created.`);
					return;
				}
			}

			// Pages/sections cloned server-side; now create the pattern row for the new instance.
			await addNewValue(item);
		} catch (err) {
			console.error('[duplicate] error:', err);
			window.alert(`Pattern duplicate failed: ${err.message}`);
		} finally {
			setIsDuplicating(false);
		}
	}

	const data = value
		.map(v => ({
            ...v,
            name: v.name,
            manage_url: `${v.base_url === '/' ? '' : v.base_url}/manage`,
            edit_url: `${baseUrl}/manage_pattern/${v.id}`,
        }))
		.filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()));
	const authExists = data.some(d => d.pattern_type === 'auth')

	return (
			<div className={t.editWrapper}>
				<div className={t.editHeader}>
					<div className={t.editTitle}>Sites</div>
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
					<div className={t.modalForm}>
						{
							attrToAddNew
								.map((attrKey, i) => {
									let {EditComp, ViewComp, ...props} = attributes[attrKey]
                                    if(attrKey === 'filters'){
                                        EditComp = RenderFilters
                                    }
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
						<div className={t.modalActions}>
							<Button
                                type={'plain'}
                                title={'Add Site'}
								className={t.btnSave}
								onClick={() => addNewValue({...newItem})}
							>
								add
							</Button>
						</div>
					</div>
				</Modal>

				<Modal open={Boolean(editingItem)} setOpen={setEditingItem}>
					<div className={t.modalForm}>
						{
							attrToAddNew
								.map((attrKey, i) => {
									let {EditComp, ViewComp, ...props} = attributes[attrKey]
                                    if(attrKey === 'filters'){
                                        EditComp = RenderFilters
                                    }
                                    const options =
                                        attrKey === 'pattern_type' && authExists && props.options?.length ?
                                            props.options.filter(o => o.value !== 'auth') :
                                            props.options;
									return (

										<EditComp
											value={editingItem?.[attrKey]}
											onChange={(v) => setEditingItem({...editingItem, [attrKey]: v})}
											placeHolder={attrKey}
											{...props}
                                            options={options}
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
									const newValue = value.map(v => v.id === editingItem.id ? editingItem : v);
									onChange(newValue)
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

							<Button
								className={t.btnDuplicate}
								type={'plain'}
								title={'duplicate item'}
								onClick={async () => {
									const newName = `${editingItem.name}_copy`;
									const oldInstance = getInstance(editingItem.type) || editingItem.base_url?.replace(/\//g, '');
									const dataToCopy = {
										app: editingItem.app,
										base_url: `${editingItem.base_url}_copy`,
										subdomain: editingItem.subdomain,
										config: editingItem.config,
										name: newName,
										pattern_type: editingItem.pattern_type,
										auth_level: editingItem.auth_level,
										filters: editingItem.filters,
										theme: editingItem.theme,
									};
									await duplicate({oldInstance, newInstance: nameToSlug(newName)}, dataToCopy)
									setEditingItem(undefined)
								}}
							> {isDuplicating ? 'duplicating...' : 'duplicate'}
							</Button>
							<Button
								className={t.btnRemove}
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
