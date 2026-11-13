import React from 'react'
import {v4 as uuidv4} from "uuid";
import { useFalcor } from "@availabs/avl-falcor";
import {AdminContext} from "../context";
import { ThemeContext } from '../../../ui/useTheme';
import { Link, useLocation, useNavigate, useNavigation, useRevalidator } from 'react-router'
import { nameToSlug, getInstance, nextAvailableCopyName } from '../../../utils/type-utils';
import { backfillAdminPattern } from '../../../utils/tenantProvisioning';
import { parseIfJSON, saveSiteRefList } from '../utils';
import { siteCan, patternActions, VIEW_PATTERN_LIST, CREATE_PATTERN, MANAGE_DOMAINS, MANAGE_TENANTS } from '../../../utils/adminPermissions';
import { editSiteTheme } from './editSite.theme'
import { AddPatternPicker } from '../components/AddPatternPicker'
import { getPatternType, listPatternTypes, stampPatternRow } from '../../registry'
import { authedFetch } from '../../../utils/authedFetch'
import { newPatternSubdomain, resolveHost } from '../../../utils/hostResolver';
import { getBaseHost } from '../../../utils/subdomainPath';

// The subdomain new rows on this host are stamped with: the tenant's label on a
// legacy multi-tenant host, '' on the tenant hub (utils/hostResolver.js).
function getSubdomainFromHost(host) {
  return newPatternSubdomain(host || window.location.host);
}


function SiteEdit ({
   item={},
   dataItems,
   attributes,
   updateAttribute,
   status,
   apiUpdate,
   apiLoad,
   format,
}) {

	const { baseUrl, authPath, app, type: siteType, user, authPermissions, isMultiTenant } = React.useContext(AdminContext) || {}
	const navigate = useNavigate()
	const { state: navState } = useNavigation()

	if (!item.id && dataItems?.length > 0) {
		item = dataItems[0]
	}

	const resolvedId = item?.id
	// The list page is the admin panel's entry point: view-pattern-list (or
	// site `*` / `${app} Admin`). See utils/adminPermissions.js.
	const hasAccess = siteCan(user, app, authPermissions, VIEW_PATTERN_LIST)
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

		// user is optimistically seeded from localStorage on refresh with a
		// placeholder groups:['public'] while the real groups load async
		// (see auth/providers.jsx) — don't judge access on that stale state.
		if (user?.isAuthenticating) return

		if (!hasAccess) {
			navigate('/')
		}
	}, [resolvedId, user?.authed, user?.isAuthenticating, JSON.stringify(user?.groups), dataItems, isLoading])

	// First-load backfill of the saved admin pattern row, for sites created
	// before every site got one (see utils/tenantProvisioning.js
	// backfillAdminPattern and planning/tasks/current/admin-pattern-data-row.md).
	// Only here — the admin list page — and only once the site gate above has
	// passed, so it's always a user with list access doing the write, never an
	// anonymous page view. The loaded `item.patterns` is only a cheap first
	// check; backfillAdminPattern re-reads the site from the server itself.
	const { falcor } = useFalcor()
	const { revalidate } = useRevalidator()
	const backfillStartedRef = React.useRef(false)
	const siteHasAdminPattern = (item?.patterns || []).some(p => p?.pattern_type === 'admin')
	React.useEffect(() => {
		if (backfillStartedRef.current) return
		if (isLoading || !resolvedId || !user?.authed || user?.isAuthenticating || !hasAccess) return
		if (siteHasAdminPattern) return
		backfillStartedRef.current = true
		backfillAdminPattern(falcor, {
			app,
			siteInstance: getInstance(siteType) || siteType,
			siteId: resolvedId,
			adminPath: baseUrl || '/',
			// On a tenant subdomain this is the tenant's own site (and app), so the
			// tenant gets its own admin row, naming its subdomain like its auth row.
			// Single-tenant sites and the platform root keep '*'.
			subdomain: isMultiTenant ? getSubdomainFromHost() : '',
		})
			.then(ref => { if (ref) revalidate() })
			.catch(err => console.error('Admin pattern backfill failed:', err))
	}, [isLoading, resolvedId, user?.authed, user?.isAuthenticating, hasAccess, siteHasAdminPattern])

	const updateData = async (data, attrKey) => {
		// Ref lists are merged with the server's copy before saving (see saveSiteRefList).
		// Returned so a caller can wait for the save itself: a type's admin.afterCreate
		// may write the site row after it (addNewValue).
		if (attrKey === 'patterns') return saveSiteRefList({ falcor, apiUpdate, format, app, item, attrKey, data })
		return apiUpdate({data: {...item, ...{[attrKey]: data}}, config: {format}})
	}

	if (isLoading || dataItems === undefined || !resolvedId || !user?.authed || !hasAccess) {
		return null
	}

	// On a multi-tenant root, tenants have their own page (pages/tenants.jsx, /list/tenants).
	return (
	  <PatternList
      value={item?.['patterns']}
			siteId={item?.id}
			format={format}
			apiLoad={apiLoad}
			attributes={attributes['patterns'].attributes}
	    onChange={(v) => updateAttribute('patterns', v)}
			  onSubmit={data => updateData(data, 'patterns')}
			siteName={item?.site_name || item?.name}
		/>
	)
}

export default SiteEdit


// Pill color per pattern_type: the theme's `typePill<Type>` key, else
// `typePillDefault` for any other registered type (e.g. an app pattern). A type
// nothing registered — or a missing/blank pattern_type — gets the unknown pill.
const typePillClass = (t, type) => !type ? t.typePillUnknown : (
	t[`typePill${type.charAt(0).toUpperCase()}${type.slice(1)}`]
	|| (getPatternType(type) ? t.typePillDefault : t.typePillUnknown)
);

function PatternList({
	 Component,
	 attributes={},
	 status,
	 onSubmit,
	 onChange,
	 value = [],
	 format,
	 apiLoad,
	 siteName,
	 siteId,
	 ...rest
}) {
	const {app, type: siteType, API_HOST, baseUrl, isMultiTenant, user, authPermissions, subdomain, tenantSubdomain = subdomain} = React.useContext(AdminContext);
	const {UI, theme} = React.useContext(ThemeContext)
	const t = { ...editSiteTheme, ...(theme?.admin?.editSite || {}) }
	const { falcor } = useFalcor();
	const location = useLocation()
	const {Table, Input, Button, Modal, Icon} = UI;
	const siteInstance = getInstance(siteType) || siteType;
	const gridRef = React.useRef(null);
	const [search, setSearch] = React.useState('');
	const [typeFilter, setTypeFilter] = React.useState(null);
	const [sortBy, setSortBy] = React.useState('name');
	const [addingNew, setAddingNew] = React.useState(false);
	const [editingItem, setEditingItem] = React.useState(undefined);
	const [isDuplicating, setIsDuplicating] = React.useState(false);
	const [deletingItem, setDeletingItem] = React.useState(undefined);
	const tenantSub = isMultiTenant ? getSubdomainFromHost() : '';
	const attrToAddNew = ['pattern_type', 'name', ...(tenantSub ? [] : ['subdomain']), 'base_url', 'filters', 'authPermissions'];
	//console.log('test 123', location)

	// What this user may do to each row: site-level grants (AdminContext) plus
	// the row's own authPermissions. See utils/adminPermissions.js.
	const rowActions = (row) => patternActions(user, app, authPermissions, row, getPatternType(row?.pattern_type)?.admin);
	const canCreatePattern = siteCan(user, app, authPermissions, CREATE_PATTERN);

	// SEARCH_SHORTCUT_ID: Input isn't a forwardRef component, so a `/`
	// keyboard shortcut (matches the mockup's kbd hint) focuses it by id
	// instead of a ref.
	const SEARCH_INPUT_ID = 'site-pattern-search';
	React.useEffect(() => {
		const onKeyDown = (e) => {
			if (e.key !== '/') return;
			const active = document.activeElement;
			const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
			if (isTyping) return;
			e.preventDefault();
			document.getElementById(SEARCH_INPUT_ID)?.focus();
		};
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, []);

	const columns = [
		{name: 'name', display_name: 'Pattern', show: true, type: 'ui',
			// `d.className` is TableCell's own cellInner class (padding, background,
			// selection state) — a custom `type: 'ui'` Comp has to apply it itself
			// (unlike `text`/`multiselect` columns, which get it automatically), so
			// it's put on a wrapping div and the link/span carries its own
			// typography instead of fighting over the same className.
			Comp: (d) => (
				<div className={d.className}>
					{d.row.edit_url && rowActions(d.row).open ? (
						<Link to={d.row.edit_url} className={t.patternName}>{d.row.name}</Link>
					) : (
						<span className={t.patternNamePlain}>{d.row.name}</span>
					)}
				</div>
			)
		},
		{name: 'pattern_type', display_name: 'Type', show: true, type: 'ui',
			Comp: (d) => {
				const type = d.row.pattern_type;
				const pillClass = typePillClass(t, type);
				return (
					<div className={d.className}>
						<span className={`${t.typePill} ${pillClass}`}>{type || '?'}</span>
					</div>
				);
			}
		},
		{name: 'subdomain', display_name: 'Subdomain', show: true, type: 'text'},
		{name: 'base_url', display_name: 'Base URL', show: true, type: 'ui',
			Comp: (d) => {
				const host = window.location.host;
				const protocol = host.includes('localhost') ? 'http' : 'https';
				const sub = d.row.subdomain;
				const needsSub = sub && sub !== '*';
				// The base domain: the tenant's host on the tenant hub, else the host minus its
				// subdomain label when it has one (utils/subdomainPath.js getBaseHost).
				const resolved = resolveHost(host);
				const baseDomain = getBaseHost(host);
				const targetHost = needsSub ? `${sub}.${baseDomain}` : (resolved ? resolved.tenantHost : host);
				const rawUrl = d.row.base_url;
				if (!rawUrl) return <span className={t.emptyValue}>—</span>;
				const normalizedUrl = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
				return (
					<Link to={`${protocol}://${targetHost}${normalizedUrl}`} className={t.baseUrlLink}>
						{rawUrl}
					</Link>
				);
			}
		},
		{name: 'actions', display_name: '', show: true, type: 'ui',
      Comp: (d) => {
        const can = rowActions(d.row);
        if (can.locked) {
          return (
            <div className={t.noAccessBadge}>
              <Icon icon='Lock' className={t.iconSm} />
              no access
            </div>
          );
        }
        // A site needs exactly one auth pattern and one admin pattern —
        // patternActions never offers Duplicate or Delete for either (nor
        // Duplicate for a type registered with admin.duplicable: false).
        return (
          <div className={t.cellActions}>
            {can.edit && (
              <Link to={d?.row?.edit_url || ''} className={t.editLink} title='Edit pattern' aria-label='Edit pattern'>
                <Icon icon='PencilEditSquare' className={t.iconSm}/>
              </Link>
            )}
            {can.duplicate && (
              <Button
                activeStyle='iconRow'
                title='Duplicate pattern'
                aria-label='Duplicate pattern'
                disabled={isDuplicating}
                onClick={async () => {
                  setIsDuplicating(true);
                  const { name: newName, slug: newSlug, suffix } = nextAvailableCopyName(d.row.name, await getFreshSiblingSlugs());
                  const oldInstance = getInstance(d.row.type) || d.row?.base_url?.replace(/\//g, '');
                  const dataToCopy = {
                    app: d.row.app,
                    base_url: d.row.base_url ? `${d.row.base_url}${suffix}` : `/${newSlug}`,
                    subdomain: d.row.subdomain,
                    config: d.row.config,
                    name: newName,
                    pattern_type: d.row.pattern_type,
                    filters: d.row.filters,
                    theme: d.row.theme,
                  };
                  await duplicate({oldInstance, newInstance: newSlug}, dataToCopy);
                }}
              >
                <Icon icon='Copy' className={t.iconSm}/>
              </Button>
            )}
            {can.delete && (
              <Button
                activeStyle='iconRowDanger'
                title='Delete pattern'
                aria-label='Delete pattern'
                onClick={() => setDeletingItem(d.row)}
              >
                <Icon icon='TrashCan' className={t.iconSm}/>
              </Button>
            )}
          </div>
        );
      }
		}
	]

	const dmsServerPath = `${API_HOST}/dama-admin`;

	const getSiblingSlugs = () => value.map(v =>
		getInstance(v.type) || v?.base_url?.replace(/\//g, '')
	).filter(Boolean);

	// Local `value` can lag a moment behind the server after a just-completed
	// duplicate (optimistic merge races the revalidated loader), so duplicate
	// naming re-fetches the live sibling list instead of trusting `value`.
	const getFreshSiblingSlugs = async () => {
		const siteConfig = { format, children: [{ action: 'list', path: '/*' }] };
		const items = await apiLoad(siteConfig, '/');
		const patterns = items?.[0]?.patterns || [];
		return patterns.map(v =>
			getInstance(v.type) || v?.base_url?.replace(/\//g, '')
		).filter(Boolean);
	};

	const addNewValue = async (patternData, templateId = null) => {
		const data = patternData;
		const slug = nameToSlug(data.name);
		if (!slug) return;

		// Collision check
		const existingSlugs = getSiblingSlugs();
		if (existingSlugs.includes(slug)) {
			alert(`A pattern with identifier "${slug}" already exists`);
			return;
		}

		const tenantSub = isMultiTenant ? getSubdomainFromHost() : '';
		if (tenantSub && !data.subdomain) data.subdomain = tenantSub;

		// The type may refuse the new pattern or set its initial settings
		// (patterns/registry.js admin.beforeCreate).
		const { admin: typeAdmin } = getPatternType(data.pattern_type) || {};
		let row = data;
		if (typeAdmin?.beforeCreate) {
			const { problem, row: prepared } = await typeAdmin.beforeCreate({ falcor, app, instance: slug, row: data, siblings: value }) || {};
			if (problem) {
				alert(problem);
				return;
			}
			if (prepared) row = prepared;
		}

		// Stamp the type's auth vocabulary, childRefs and auth rules onto the row. dms-server cannot
		// read the pattern-type registry (it has no dependency on this package), so the pattern row is
		// how a type's verbs and rules reach the server — row-auth-vocabulary.md. Read from the
		// registry rather than left to each type's beforeCreate, so a type cannot forget.
		row = stampPatternRow(row);

		const patternType = `${siteInstance}|${slug}:pattern`;
		const res = await falcor.call(
			['dms', 'data', 'create'],
			[app, patternType, row]
		);
		const newId = Object.keys(res?.json?.dms?.data?.byId || {})
			.filter(d => d !== '$__path')?.[0];

		if (newId) {
			const newData = [...value, { ref: `${app}+${patternType}`, id: +newId }];
			onChange(newData);
			const saved = onSubmit(newData);
			// The type's own set-up (admin.afterCreate) may write the site row too, and this save
			// sends the page's whole copy of the site, so it must land first.
			if (typeAdmin?.afterCreate) {
				await saved;
				try {
					await typeAdmin.afterCreate({
						falcor, app, siteId, siteInstance, patternId: +newId,
						instance: slug, row, siblings: value,
					});
				} catch (err) {
					alert(`The "${data.name}" pattern was added, but setting it up failed: ${err.message}`);
				}
			}
		}

		if (newId && templateId) {
			const pageTemplates = theme?.page_templates ?? [];
			const tmpl = pageTemplates.find(pt => pt.id === templateId);
			const pageType = `${slug}|page`;
			await falcor.call(['dms', 'data', 'create'], [app, pageType, {
				title: tmpl?.name ?? data.name,
				url_slug: nameToSlug(tmpl?.name ?? data.name),
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
			const res = await authedFetch(`${dmsServerPath}/dms/${app}+${oldInstance}/duplicate`,
				{
					method: "POST",
					body: JSON.stringify({newApp: app, newType: newInstance}),
					headers: {
						"Content-Type": "application/json",
					},
					user,
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

	const allData = value.map(v => ({
		...v,
		name: v.name || 'undefined',
		edit_url: `${baseUrl}/manage_pattern/${v.id}`,
	}));

	// Stats + type chips describe the WHOLE site, so they're computed from
	// allData — search/type-filter only narrow what the table itself shows.
	const totalPatterns = allData.length;
	const typeCounts = allData.reduce((acc, d) => {
		const k = d.pattern_type || '?';
		acc[k] = (acc[k] || 0) + 1;
		return acc;
	}, {});
	const uniqueTypes = Object.keys(typeCounts).length;
	const noAccessCount = allData.filter(d => rowActions(d).locked).length;
	// Chip order: registered types in admin order, then any unregistered types
	// the site still has rows of, '?' last.
	const registeredTypes = listPatternTypes().map(d => d.name);
	const chipTypes = [
		...registeredTypes.filter(k => typeCounts[k]),
		...Object.keys(typeCounts).filter(k => k !== '?' && !registeredTypes.includes(k)).sort(),
		...(typeCounts['?'] ? ['?'] : []),
	];
	const authExists = allData.some(d => d.pattern_type === 'auth')

	const q = search.trim().toLowerCase();
	let data = !q ? allData : allData.filter(v =>
		v.name.toLowerCase().includes(q) ||
		(v.base_url || '').toLowerCase().includes(q) ||
		(v.subdomain || '').toLowerCase().includes(q)
	);
	if (typeFilter) data = data.filter(v => (v.pattern_type || '?') === typeFilter);
	const SORT_COMPARATORS = {
		name: (a, b) => a.name.localeCompare(b.name),
		type: (a, b) => (a.pattern_type || '?').localeCompare(b.pattern_type || '?'),
		subdomain: (a, b) => (a.subdomain || '').localeCompare(b.subdomain || ''),
		base_url: (a, b) => (a.base_url || '').localeCompare(b.base_url || ''),
	};
	data = [...data].sort(SORT_COMPARATORS[sortBy] || SORT_COMPARATORS.name);
	const SORT_CYCLE = { name: 'type', type: 'subdomain', subdomain: 'base_url', base_url: 'name' };
	const SORT_LABEL = { name: 'name', type: 'type', subdomain: 'subdomain', base_url: 'base url' };

	// On a hub: this site's settings page (pages/siteSettings.jsx), for who may open it: a tenant's
	// admins on its host, hub staff on the root.
	const hasSettings = Boolean(isMultiTenant) && siteCan(user, app, authPermissions, tenantSubdomain ? MANAGE_DOMAINS : MANAGE_TENANTS);

	return (
			<div className={t.wrapper}>
				<div className={t.identityWrapper}>
					<div className='min-w-0'>
						<div className={t.identityTitleRow}>
							<div className={t.identityTitle}>{siteName || app}</div>
							{hasSettings && (
								<Link to={`${baseUrl}/settings`} className={t.editLink} title='Settings' aria-label='Settings'>
									<Icon icon='Settings' className={t.iconSm} />
								</Link>
							)}
						</div>
						<p className={t.identitySubtitle}>{window.location.host}</p>
					</div>
					<span className='flex-1' />
					<div className={t.statsStrip}>
						<div className={t.statItem}>
							<p className={t.statValue}>{totalPatterns}</p>
							<p className={t.statLabel}>patterns</p>
						</div>
						<div className={t.statItem}>
							<p className={t.statValue}>{uniqueTypes}</p>
							<p className={t.statLabel}>types</p>
						</div>
						{noAccessCount > 0 && (
							<div className={t.statItem}>
								<p className={t.statValueWarn}>{noAccessCount}</p>
								<p className={t.statLabel}>no access</p>
							</div>
						)}
					</div>
				</div>

				<div className={t.toolbarRow}>
					<div className={t.searchWrapper}>
						<Icon icon='Search' className={t.searchIcon} />
						<Input
							id={SEARCH_INPUT_ID}
							type={'text'}
							activeStyle='bare'
							value={search}
							onChange={e => setSearch(e.target.value)}
							placeholder={`filter ${totalPatterns} pattern${totalPatterns === 1 ? '' : 's'} by name, url, or subdomain...`}
						/>
						<span className={t.searchKbdHint}>/</span>
					</div>
					{canCreatePattern && (
						<Button activeStyle='primary' onClick={() => setAddingNew(true)}>
							<Icon icon='Plus' className={t.iconSm} />
							Add pattern
						</Button>
					)}
				</div>

				<div className={t.toolbarFilterRow}>
					<span className={t.filterCount}>patterns · {data.length}</span>
					<Button activeStyle='small' onClick={() => setSortBy(SORT_CYCLE[sortBy])}>
						sort: {SORT_LABEL[sortBy] || sortBy}
						<Icon icon='ChevronDown' className='w-3 h-3' />
					</Button>
					<div className={t.chipsWrapper}>
						<Button activeStyle={!typeFilter ? 'chipOn' : 'chip'} onClick={() => setTypeFilter(null)}>
							all {totalPatterns}
						</Button>
						{chipTypes.map(k => (
							<Button
								key={k}
								activeStyle={typeFilter === k ? 'chipOn' : 'chip'}
								onClick={() => setTypeFilter(typeFilter === k ? null : k)}
							>
								{k} {typeCounts[k]}
							</Button>
						))}
					</div>
				</div>

				<div className={t.tableCard}>
					<Table
					  columns={columns}
						data={data}
						isEdit={false}
						gridRef={gridRef}
						activeStyle='list'
					/>
				</div>

				<Modal open={Boolean(editingItem)} setOpen={setEditingItem}>
					<div className={t.modalForm}>
						{
							attrToAddNew
								.map((attrKey, i) => {
									let {EditComp, ViewComp, ...props} = attributes[attrKey]
									if(attrKey === 'filters'){
										EditComp = RenderFilters
									}
									let options =
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
								activeStyle='small'
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
								activeStyle='small'
								type={'plain'}
								title={'cancel item'}
								onClick={() => {
									setEditingItem(undefined)
								}}
							>
								cancel
							</Button>

							<Button
								activeStyle='small'
								type={'plain'}
								title={'duplicate item'}
								onClick={async () => {
									setIsDuplicating(true);
									const { name: newName, slug: newSlug, suffix } = nextAvailableCopyName(editingItem?.name, await getFreshSiblingSlugs());
									const oldInstance = getInstance(editingItem?.type) || editingItem?.base_url?.replace(/\//g, '');
									const dataToCopy = {
										app: editingItem?.app,
										base_url: editingItem?.base_url ? `${editingItem.base_url}${suffix}` : `/${newSlug}`,
										subdomain: editingItem?.subdomain,
										config: editingItem?.config,
										name: newName,
										pattern_type: editingItem?.pattern_type,
										filters: editingItem?.filters,
										theme: editingItem?.theme,
									};
									await duplicate({oldInstance, newInstance: newSlug}, dataToCopy)
									setEditingItem(undefined)
								}}
							> {isDuplicating ? 'duplicating...' : 'duplicate'}
							</Button>
							<Button
								activeStyle='smallDanger'
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
								activeStyle='action'
								onClick={() => setDeletingItem(undefined)}
							>
								Cancel
							</Button>
							<Button
								type='plain'
								activeStyle='dangerSolid'
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

const RenderFilters = ({value=[], onChange, ...rest}) => {
    const {UI, theme} = React.useContext(ThemeContext);
    const t = { ...editSiteTheme, ...(theme?.admin?.editSite || {}) }
    const [tmpValue, setTmpValue] = React.useState(parseIfJSON(value));
    const [newFilter, setNewFilter] = React.useState({});
    const {FieldSet, Button, FieldLabel} = UI;
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
            <FieldLabel activeStyle="inline" text="Filters" />
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
            <Button activeStyle='linkMetaDanger' onClick={() => {
                onChange([]);
                setTmpValue([])
                setNewFilter({});
            }} > clear all filters </Button>
        </div>
    )
}
