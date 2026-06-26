import React from 'react'
import {v4 as uuidv4} from "uuid";
import { useFalcor } from "@availabs/avl-falcor";
import {AdminContext} from "../context";
import { ThemeContext } from '../../../ui/useTheme';
import { Link, useLocation, useNavigate, useNavigation } from 'react-router'
import { nameToSlug, getInstance } from '../../../utils/type-utils';
import { isUserAuthed, parseIfJSON } from '../utils';
import { editSiteTheme } from './editSite.theme'
import { AddPatternPicker } from '../components/AddPatternPicker'

function getSubdomainFromHost(host) {
  const hostname = (host || window.location.host).split(':')[0];
  const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
  const minParts = isLocalhost ? 2 : 3;
  const parts = hostname.split('.');
  return parts.length >= minParts ? parts[0] : '';
}


function SiteEdit ({
   item={},
   dataItems,
   attributes,
   updateAttribute,
   status,
   apiUpdate,
   format,
}) {

	const { baseUrl, authPath, app, user, authPermissions, isMultiTenant } = React.useContext(AdminContext) || {}
	const navigate = useNavigate()
	const { state: navState } = useNavigation()

	if (!item.id && dataItems?.length > 0) {
		item = dataItems[0]
	}

	const resolvedId = item?.id
	const isAdmin = (user?.groups || []).some(g => g === `${app} Admin`)
	const hasAccess = isAdmin || isUserAuthed(user, authPermissions)
	// navState === 'loading' means a loader is in-flight (e.g. router just recreated by
	// dmsSiteFactory). dataItems is [] by default in wrapper.jsx until the loader
	// resolves, so we must not treat [] as "no site" while loading.
	const isLoading = navState === 'loading'

	React.useEffect(() => {
		if (isLoading) return
		if (dataItems === undefined) return

		if (!resolvedId) {
			navigate(`${baseUrl}/create`)
			return
		}

		if (!user?.authed) {
			navigate(`${authPath}/login`, { state: { from: baseUrl } })
			return
		}

		if (!hasAccess) {
			navigate('/')
		}
	}, [resolvedId, user?.authed, JSON.stringify(user?.groups), dataItems, isLoading])

	const updateData = (data, attrKey) => {
		apiUpdate({data: {...item, ...{[attrKey]: data}}, config: {format}})
	}

	if (isLoading || dataItems === undefined || !resolvedId || !user?.authed || !hasAccess) {
		return null
	}

	const isPlatformAdmin = isMultiTenant && !getSubdomainFromHost();

	if (isPlatformAdmin) {
		return (
			<>
				<TenantList
					value={item?.['tenants'] || []}
					format={format}
					attributes={attributes['tenants']?.attributes || {}}
					onChange={(v) => updateAttribute('tenants', v)}
					onSubmit={data => updateData(data, 'tenants')}
				/>
				<PatternList
					value={item?.['patterns']}
					format={format}
					attributes={attributes['patterns'].attributes}
					onChange={(v) => updateAttribute('patterns', v)}
					onSubmit={data => updateData(data, 'patterns')}
				/>
			</>
		)
	}

	return (
	  <PatternList
      value={item?.['patterns']}
			format={format}
			attributes={attributes['patterns'].attributes}
	    onChange={(v) => updateAttribute('patterns', v)}
			  onSubmit={data => {
		  updateData(data, 'patterns')
	  }}
		/>
	)
}

export default SiteEdit


function PatternList({
	 Component,
	 attributes={},
	 status,
	 onSubmit,
	 onChange,
	 value = [],
	 format,
	 ...rest
}) {
	const {app, type: siteType, API_HOST, baseUrl, isMultiTenant} = React.useContext(AdminContext);
	const {UI, theme} = React.useContext(ThemeContext)
	const t = { ...editSiteTheme, ...(theme?.admin?.editSite || {}) }
	const { falcor } = useFalcor();
	const location = useLocation()
	const {Table, Input, Button, Modal, Icon} = UI;
	const siteInstance = getInstance(siteType) || siteType;
	const gridRef = React.useRef(null);
	const [search, setSearch] = React.useState('');
	const [addingNew, setAddingNew] = React.useState(false);
	const [editingItem, setEditingItem] = React.useState(undefined);
	const [isDuplicating, setIsDuplicating] = React.useState(false);
	const [deletingItem, setDeletingItem] = React.useState(undefined);
	const tenantSub = isMultiTenant ? getSubdomainFromHost() : '';
	const attrToAddNew = ['pattern_type', 'name', ...(tenantSub ? [] : ['subdomain']), 'base_url', 'filters', 'authPermissions'];
	//console.log('test 123', location)
	const columns = [
		{name: 'name', display_name: 'Name', show: true, type: 'text'},
		{name: 'base_url', display_name: 'Base URL', show: true, type: 'ui',
      Comp: (d) => {
        const host = window.location.host
        const protocol = host.includes('localhost') ? 'http' : 'https'
        const sub = d.row.subdomain
        const needsSub = sub && sub !== '*'
        // Strip existing subdomain (first segment) to get the base domain,
        // but only if the current host actually has a subdomain.
        const parts = host.split('.')
        const isLocalhost = host.includes('localhost')
        const hasSubdomain = isLocalhost ? parts.length >= 2 : parts.length > 2
        const baseDomain = hasSubdomain ? parts.slice(1).join('.') : host
        const targetHost = needsSub ? `${sub}.${baseDomain}` : host
        const baseUrl = d.row.base_url
        if (!baseUrl) return <span className={t.emptyValue}>—</span>
        const normalizedUrl = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`
        return (
          <Link
            to={`${protocol}://${targetHost}${normalizedUrl}`}
            className={t.baseUrlLink}
          >
            {baseUrl}
          </Link>
        )
      }
		},
		{name: 'subdomain', display_name: 'Subdomain', show: true, type: 'text'},
		// {name: 'updated_at', display_name: 'Updated', show: true, type: 'text', formatFn: 'date'},
		// {name: 'edit', display_name: 'Edit', show: true, type: 'ui', Comp: (d) => {
		// 		return <Button onClick={() => setEditingItem(d.row)}>Edit</Button>
		// 	}},
		{name: 'edit', display_name: 'Edit', show: true, type: 'ui',
      Comp: (d) => {
        return (
          <div className={t.cellActions}>
            <Link to={d?.row?.edit_url || ''} className={t.editLink}>
              <Icon icon='PencilEditSquare' className={t.iconSm}/><span className={t.iconLabel}>Edit</span>
            </Link>
            <button
              className={t.duplicateBtn}
              title='Duplicate'
              disabled={isDuplicating}
              onClick={async () => {
                const newName = `${d.row.name}_copy`;
                const oldInstance = getInstance(d.row.type) || d.row?.base_url?.replace(/\//g, '');
                const dataToCopy = {
                  app: d.row.app,
                  base_url: `${d.row.base_url}_copy`,
                  subdomain: d.row.subdomain,
                  config: d.row.config,
                  name: newName,
                  pattern_type: d.row.pattern_type,
                  auth_level: d.row.auth_level,
                  filters: d.row.filters,
                  theme: d.row.theme,
                };
                await duplicate({oldInstance, newInstance: nameToSlug(newName)}, dataToCopy);
              }}
            >
              <Icon icon='Copy' className={t.iconSm}/>
            </button>
            <button
              className={t.deleteBtn}
              title='Delete'
              onClick={() => setDeletingItem(d.row)}
            >
              <Icon icon='TrashCan' className={t.iconSm}/>
            </button>
          </div>
        )
      }
		}
	]

	const dmsServerPath = `${API_HOST}/dama-admin`;

	const addNewValue = async (patternData, templateId = null) => {
		const data = patternData;
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

		const tenantSub = isMultiTenant ? getSubdomainFromHost() : '';
		if (tenantSub && !data.subdomain) data.subdomain = tenantSub;

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

		if (newId && templateId) {
			const pageTemplates = theme?.page_templates ?? [];
			const tmpl = pageTemplates.find(pt => pt.id === templateId);
			const pageType = `${slug}|page`;
			await falcor.call(['dms', 'data', 'create'], [app, pageType, {
				title: tmpl?.name ?? data.name,
				index: 0,
				published: 'draft',
				...(tmpl?.draft_sections !== undefined          ? { draft_sections: tmpl.draft_sections }             : {}),
				...(tmpl?.draft_section_groups !== undefined    ? { draft_section_groups: tmpl.draft_section_groups } : {}),
			}]);
		}
	}

	const duplicate = async({oldInstance, newInstance}, item) => {
		setIsDuplicating(true);
		try {
			// call server to copy over pages and sections
			const res = await fetch(`${dmsServerPath}/dms/${app}+${oldInstance}/duplicate`,
				{
					method: "POST",
					body: JSON.stringify({newApp: app, newType: newInstance}),
					headers: {
						"Content-Type": "application/json",
					},
				});
			const body = await res.json().catch(() => ({}));
			if (!res.ok || body?.err) {
				console.error('[duplicate] page/section copy failed:', body?.err || res.status);
				window.alert(`Pattern duplicate failed: ${body?.err || `HTTP ${res.status}`}. Pattern not created.`);
				return;
			}
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
            name: v.name || 'undefined',
            edit_url: `${baseUrl}/manage_pattern/${v.id}`,
        }))
		.filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()));
	const authExists = data.some(d => d.pattern_type === 'auth')

	return (
			<div className={t.wrapper}>
				<div className={t.header}>
					<div className={t.headerTitle}>Sites</div>
					<Button className={'shrink-0'} onClick={() => setAddingNew(true)}> Add site </Button>
				</div>
				<div className={t.searchBar}>
					<Input type={'text'} value={search} onChange={e => setSearch(e.target.value)} placeholder={'Filter sites'} />
				</div>
				<Table
				  columns={columns}
					data={data}
					isEdit={false}
					gridRef={gridRef}
				/>

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
									const newName = `${editingItem?.name}_copy`;
									const oldInstance = getInstance(editingItem?.type) || editingItem?.base_url?.replace(/\//g, '');
									const dataToCopy = {
										app: editingItem?.app,
										base_url: `${editingItem?.base_url}_copy`,
										subdomain: editingItem?.subdomain,
										config: editingItem?.config,
										name: newName,
										pattern_type: editingItem?.pattern_type,
										auth_level: editingItem?.auth_level,
										filters: editingItem?.filters,
										theme: editingItem?.theme,
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

				<Modal open={addingNew} setOpen={setAddingNew}>
					<AddPatternPicker
						authExists={authExists}
						onAdd={async ({ pattern_type, name, base_url, templateId }) => {
							await addNewValue({ pattern_type, name, base_url }, templateId)
							setAddingNew(false)
						}}
					/>
				</Modal>

				<Modal open={Boolean(deletingItem)} setOpen={setDeletingItem}>
					<div className={t.deleteModal}>
						<div className={t.deleteModalTitle}>Delete Pattern</div>
						<div className={t.deleteModalDesc}>
							Are you sure you want to delete <span className={t.deleteModalHighlight}>{deletingItem?.name}</span>?
							This will remove the pattern from the site. This action cannot be undone.
						</div>
						<div className={t.deleteModalFooter}>
							<Button
								type='plain'
								className={t.btnSecondary}
								onClick={() => setDeletingItem(undefined)}
							>
								Cancel
							</Button>
							<Button
								type='plain'
								className={t.btnDanger}
								onClick={() => {
									const newData = value.filter(v => v.id !== deletingItem.id);
									onChange(newData);
									onSubmit(newData);
									setDeletingItem(undefined);
								}}
							>
								Delete
							</Button>
						</div>
					</div>
				</Modal>
			</div>
	)
}

function TenantList({
	value = [],
	format,
	attributes = {},
	onSubmit,
	onChange,
}) {
	const { app, type: siteType, baseUrl } = React.useContext(AdminContext);
	const { UI, theme } = React.useContext(ThemeContext);
	const t = { ...editSiteTheme, ...(theme?.admin?.editSite || {}) }
	const { falcor } = useFalcor();
	const { Table, Input, Button, Modal, Icon } = UI;
	const siteInstance = getInstance(siteType) || siteType;

	const [addingNew, setAddingNew] = React.useState(false);
	const [newItem, setNewItem] = React.useState({ name: '', subdomain: '' });
	const [deletingItem, setDeletingItem] = React.useState(undefined);
	const [error, setError] = React.useState('');

	// Build base domain from current host (we are on the root domain here)
	const host = window.location.host;
	const protocol = host.includes('localhost') ? 'http' : 'https';
	const baseDomain = host; // no subdomain on platform admin

	const columns = [
		{ name: 'name', display_name: 'Name', show: true, type: 'text' },
		{ name: 'subdomain', display_name: 'Subdomain', show: true, type: 'text' },
		{
			name: 'link', display_name: 'Site', show: true, type: 'ui',
			Comp: (d) => {
				const url = `${protocol}://${d.row.subdomain}.${baseDomain}${baseUrl}`;
				return (
					<a
						href={url}
						className={t.tenantLink}
					>
						{d.row.subdomain}.{baseDomain}
					</a>
				);
			}
		},
		{
			name: 'actions', display_name: '', show: true, type: 'ui',
			Comp: (d) => (
				<div className={t.cellActions}>
					<button
						className={t.deleteBtn}
						title='Remove tenant'
						onClick={() => setDeletingItem(d.row)}
					>
						<Icon icon='TrashCan' className={t.iconSm} />
					</button>
				</div>
			)
		}
	];

	const addTenant = async () => {
		setError('');
		const slug = nameToSlug(newItem.subdomain || newItem.name);
		if (!slug) { setError('Subdomain is required'); return; }

		const existingSlugs = value.map(v => v.subdomain).filter(Boolean);
		if (existingSlugs.includes(slug)) {
			setError(`A tenant with subdomain "${slug}" already exists`);
			return;
		}

		const tenantType = `${siteInstance}|${slug}:tenant`;
		const res = await falcor.call(
			['dms', 'data', 'create'],
			[app, tenantType, { name: newItem.name || slug, subdomain: slug, app: slug }]
		);
		const newId = Object.keys(res?.json?.dms?.data?.byId || {})
			.filter(d => d !== '$__path')?.[0];

		if (newId) {
			const newData = [...value, { ref: `${app}+${siteInstance}|tenant`, id: +newId }];
			onChange(newData);
			onSubmit(newData);
		}
		setNewItem({ name: '', subdomain: '' });
		setAddingNew(false);
	};

	return (
		<div className={t.wrapper}>
			<div className={t.header}>
				<div className={t.headerTitle}>Tenants</div>
				<Button className={t.btnNoShrink} onClick={() => { setAddingNew(true); setError(''); }}>
					Add tenant
				</Button>
			</div>
			<Table columns={columns} data={value} isEdit={false} />

			<Modal open={addingNew} setOpen={setAddingNew}>
				<div className={t.tenantModalForm}>
					<div className={t.tenantModalTitle}>New Tenant</div>
					<div className={t.fieldGroup}>
						<label className={t.fieldLabel}>Name</label>
						<Input
							value={newItem.name}
							onChange={e => setNewItem({ ...newItem, name: e.target.value })}
							placeholder='Acme Corp'
						/>
					</div>
					<div className={t.fieldGroup}>
						<label className={t.fieldLabel}>Subdomain</label>
						<Input
							value={newItem.subdomain}
							onChange={e => setNewItem({ ...newItem, subdomain: e.target.value })}
							placeholder='acme'
						/>
					</div>
					{error && <div className={t.errorText}>{error}</div>}
					<div className={t.tenantModalActions}>
						<Button type='plain' onClick={addTenant}>Add</Button>
						<Button type='plain' onClick={() => setAddingNew(false)}>Cancel</Button>
					</div>
				</div>
			</Modal>

			<Modal open={Boolean(deletingItem)} setOpen={setDeletingItem}>
				<div className={t.deleteModal}>
					<div className={t.deleteModalTitle}>Remove Tenant</div>
					<div className={t.deleteModalDesc}>
						Remove <span className={t.deleteModalHighlight}>{deletingItem?.name}</span> from this
						site? The tenant's data is not deleted.
					</div>
					<div className={t.deleteModalFooter}>
						<Button
							type='plain'
							className={t.btnSecondary}
							onClick={() => setDeletingItem(undefined)}
						>
							Cancel
						</Button>
						<Button
							type='plain'
							className={t.btnDanger}
							onClick={() => {
								const newData = value.filter(v => v.id !== deletingItem.id);
								onChange(newData);
								onSubmit(newData);
								setDeletingItem(undefined);
							}}
						>
							Remove
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}

const RenderFilters = ({value=[], onChange, ...rest}) => {
    const {UI, theme} = React.useContext(ThemeContext);
    const t = { ...editSiteTheme, ...(theme?.admin?.editSite || {}) }
    const [tmpValue, setTmpValue] = React.useState(parseIfJSON(value));
    const [newFilter, setNewFilter] = React.useState({});
    const {FieldSet, Button} = UI;
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
