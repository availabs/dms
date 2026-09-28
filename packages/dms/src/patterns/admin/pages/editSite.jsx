import React from 'react'
import {v4 as uuidv4} from "uuid";
import { useFalcor } from "@availabs/avl-falcor";
import {AdminContext} from "../context";
import { AuthContext } from '../../auth/context';
import { ThemeContext } from '../../../ui/useTheme';
import { Link, useLocation, useNavigate, useNavigation } from 'react-router'
import { nameToSlug, getInstance, nextAvailableCopyName } from '../../../utils/type-utils';
import { provisionTemplatePatterns } from '../../../utils/tenantProvisioning';
import { isUserAuthed, parseIfJSON, hasPatternManageAccess } from '../utils';
import { editSiteTheme } from './editSite.theme'
import { AddPatternPicker } from '../components/AddPatternPicker'
import SiteTemplatePicker from './SiteTemplatePicker'

function getSubdomainFromHost(host) {
  const hostname = (host || window.location.host).split(':')[0];
  const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
  const minParts = isLocalhost ? 2 : 3;
  const parts = hostname.split('.');
  // Bare IPv4 host (e.g. 1.2.3.4) would otherwise misread its last octet as
  // a subdomain; real TLDs are never all-digits.
  if (/^\d+$/.test(parts[parts.length - 1])) return '';
  return parts.length >= minParts ? parts[0] : '';
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

		// user is optimistically seeded from localStorage on refresh with a
		// placeholder groups:['public'] while the real groups load async
		// (see auth/providers.jsx) — don't judge access on that stale state.
		if (user?.isAuthenticating) return

		if (!hasAccess) {
			navigate('/')
		}
	}, [resolvedId, user?.authed, user?.isAuthenticating, JSON.stringify(user?.groups), dataItems, isLoading])

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
				<PatternList
					value={item?.['patterns']}
					format={format}
					apiLoad={apiLoad}
					attributes={attributes['patterns'].attributes}
					onChange={(v) => updateAttribute('patterns', v)}
					onSubmit={data => updateData(data, 'patterns')}
					siteName={item?.site_name || item?.name}
				/>
				<TenantList
					value={item?.['tenants'] || []}
					format={format}
					attributes={attributes['tenants']?.attributes || {}}
					onChange={(v) => updateAttribute('tenants', v)}
					onSubmit={data => updateData(data, 'tenants')}
				/>
			</>
		)
	}

	return (
	  <PatternList
      value={item?.['patterns']}
			format={format}
			apiLoad={apiLoad}
			attributes={attributes['patterns'].attributes}
	    onChange={(v) => updateAttribute('patterns', v)}
			  onSubmit={data => {
		  updateData(data, 'patterns')
	  }}
			siteName={item?.site_name || item?.name}
		/>
	)
}

export default SiteEdit


// Pill color per pattern_type — 'forms' is dashed/muted rather than solid
// since patterns/index.js has that registration commented out (creatable via
// AddPatternPicker, but not currently routable). Anything not in this map
// (including missing/blank pattern_type) falls back to the '?' unknown pill.
const TYPE_PILL_KEY = {
	page: 'typePillPage',
	datasets: 'typePillDatasets',
	auth: 'typePillAuth',
	mapeditor: 'typePillMapeditor',
	forms: 'typePillForms',
};
// Chip/sort order for the toolbar's type filter row — real types first (in
// the same order as AddPatternPicker offers them), '?' last.
const TYPE_ORDER = ['page', 'datasets', 'auth', 'forms', 'mapeditor'];

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
	 ...rest
}) {
	const {app, type: siteType, API_HOST, baseUrl, isMultiTenant, user} = React.useContext(AdminContext);
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

	// See patterns/admin/utils.js's `hasPatternManageAccess` for the full
	// rationale (2026-09-20) — an app admin always has access; a pattern
	// with no real grants (never configured, or configured but empty) is
	// unrestricted; otherwise its `authPermissions` (subdomain-keyed —
	// PatternPermissionsEditor's save shape) decides.
	const isAdmin = (user?.groups || []).some(g => g === `${app} Admin`);
	const hasPatternAccess = (row) => hasPatternManageAccess(user, isAdmin, row.authPermissions, row.subdomain);

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
					{d.row.edit_url && hasPatternAccess(d.row) ? (
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
				const pillClass = t[TYPE_PILL_KEY[type]] || t.typePillUnknown;
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
				// Strip existing subdomain (first segment) to get the base domain,
				// but only if the current host actually has a subdomain.
				const parts = host.split('.');
				const isLocalhost = host.includes('localhost');
				// Bare IPv4 host (e.g. 1.2.3.4) would otherwise misread its last octet
				// as a subdomain; real TLDs are never all-digits.
				const isIPv4Host = /^\d+$/.test(parts[parts.length - 1]);
				const hasSubdomain = !isIPv4Host && (isLocalhost ? parts.length >= 2 : parts.length > 2);
				const baseDomain = hasSubdomain ? parts.slice(1).join('.') : host;
				const targetHost = needsSub ? `${sub}.${baseDomain}` : host;
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
        if (!hasPatternAccess(d.row)) {
          return (
            <div className={t.noAccessBadge}>
              <Icon icon='Lock' className={t.iconSm} />
              no access
            </div>
          );
        }
        // A site needs exactly one auth pattern — duplicating or deleting it
        // through this list is never a valid action, so only Edit shows.
        const isAuthType = d.row.pattern_type === 'auth';
        return (
          <div className={t.cellActions}>
            <Link to={d?.row?.edit_url || ''} className={t.editLink} title='Edit pattern' aria-label='Edit pattern'>
              <Icon icon='PencilEditSquare' className={t.iconSm}/>
            </Link>
            {!isAuthType && (
              <button
                className={t.duplicateBtn}
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
                    auth_level: d.row.auth_level,
                    filters: d.row.filters,
                    theme: d.row.theme,
                  };
                  await duplicate({oldInstance, newInstance: newSlug}, dataToCopy);
                }}
              >
                <Icon icon='Copy' className={t.iconSm}/>
              </button>
            )}
            {!isAuthType && (
              <button
                className={t.deleteBtn}
                title='Delete pattern'
                aria-label='Delete pattern'
                onClick={() => setDeletingItem(d.row)}
              >
                <Icon icon='TrashCan' className={t.iconSm}/>
              </button>
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

		const patternType = `${siteInstance}|${slug}:pattern`;
		const res = await falcor.call(
			['dms', 'data', 'create'],
			[app, patternType, data]
		);
		const newId = Object.keys(res?.json?.dms?.data?.byId || {})
			.filter(d => d !== '$__path')?.[0];

		if (newId) {
			const newData = [...value, { ref: `${app}+${patternType}`, id: +newId }];
			onChange(newData);
			onSubmit(newData);
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
	const noAccessCount = allData.filter(d => !hasPatternAccess(d)).length;
	const chipTypes = [...TYPE_ORDER.filter(k => typeCounts[k]), ...(typeCounts['?'] ? ['?'] : [])];
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

	return (
			<div className={t.wrapper}>
				<div className={t.identityWrapper}>
					<div className='min-w-0'>
						<div className={t.identityTitle}>{siteName || app}</div>
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
							className={t.searchInput}
							value={search}
							onChange={e => setSearch(e.target.value)}
							placeholder={`filter ${totalPatterns} pattern${totalPatterns === 1 ? '' : 's'} by name, url, or subdomain...`}
						/>
						<span className={t.searchKbdHint}>/</span>
					</div>
					<Button className={t.addPatternBtn} onClick={() => setAddingNew(true)}>
						<Icon icon='Plus' className={t.iconSm} />
						Add pattern
					</Button>
				</div>

				<div className={t.toolbarFilterRow}>
					<span className={t.filterCount}>patterns · {data.length}</span>
					<button className={t.sortBtn} onClick={() => setSortBy(SORT_CYCLE[sortBy])}>
						sort: {SORT_LABEL[sortBy] || sortBy}
						<Icon icon='ChevronDown' className='w-3 h-3' />
					</button>
					<div className={t.chipsWrapper}>
						<button className={!typeFilter ? t.chipActive : t.chip} onClick={() => setTypeFilter(null)}>
							all {totalPatterns}
						</button>
						{chipTypes.map(k => (
							<button
								key={k}
								className={typeFilter === k ? t.chipActive : (k === 'forms' ? t.chipInactive : t.chip)}
								onClick={() => setTypeFilter(typeFilter === k ? null : k)}
							>
								{k} {typeCounts[k]}
							</button>
						))}
					</div>
				</div>

				<div className={t.tableCard}>
					<Table
					  columns={columns}
						data={data}
						isEdit={false}
						gridRef={gridRef}
						activeStyle='roomy'
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
										auth_level: editingItem?.auth_level,
										filters: editingItem?.filters,
										theme: editingItem?.theme,
									};
									await duplicate({oldInstance, newInstance: newSlug}, dataToCopy)
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
	const { AuthAPI } = React.useContext(AuthContext);
	const { UI, theme } = React.useContext(ThemeContext);
	const t = { ...editSiteTheme, ...(theme?.admin?.editSite || {}) }
	const { falcor } = useFalcor();
	const { Table, Input, Button, Modal, Icon } = UI;
	const siteInstance = getInstance(siteType) || siteType;
	const siteTemplates = theme?.site_templates ?? [];
	const pageTemplates = theme?.page_templates ?? [];

	const [addingNew, setAddingNew] = React.useState(false);
	const [newItem, setNewItem] = React.useState({ name: '', subdomain: '', email: '', password: '' });
	const [selectedTemplateId, setSelectedTemplateId] = React.useState('simple_site');
	const [submitting, setSubmitting] = React.useState(false);
	const [deletingItem, setDeletingItem] = React.useState(undefined);
	const [error, setError] = React.useState('');
	const [search, setSearch] = React.useState('');

	const TENANT_SEARCH_INPUT_ID = 'site-tenant-search';
	React.useEffect(() => {
		const onKeyDown = (e) => {
			if (e.key !== '/') return;
			const active = document.activeElement;
			const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
			if (isTyping) return;
			e.preventDefault();
			document.getElementById(TENANT_SEARCH_INPUT_ID)?.focus();
		};
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, []);

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
		if (!newItem.email) { setError('Admin email is required'); return; }

		const existingSlugs = value.map(v => v.subdomain).filter(Boolean);
		if (existingSlugs.includes(slug)) {
			setError(`A tenant with subdomain "${slug}" already exists`);
			return;
		}

		setSubmitting(true);
		try {
			const tenantName = newItem.name || slug;

			// 1. Create auth project + admin/public groups + first user for tenant
			const setupRes = await AuthAPI.callAuthServer('/init/setup', {
				email: newItem.email,
				password: newItem.password || undefined,
				project: slug,
			});
			if (setupRes.error && setupRes.error !== 'duplicate key value violates unique constraint "groups_pkey"') {
				throw new Error(setupRes.error);
			}

			// 2. Create tenant row in master app
			const tenantType = `${siteInstance}|${slug}:tenant`;
			const res = await falcor.call(
				['dms', 'data', 'create'],
				[app, tenantType, { name: tenantName, subdomain: slug, app: slug }]
			);
			const newId = Object.keys(res?.json?.dms?.data?.byId || {}).filter(d => d !== '$__path')?.[0];
			if (!newId) throw new Error('Failed to create tenant row');

			// 3. Append tenant ref to master site
			const newData = [...value, { ref: `${app}+${tenantType}`, id: +newId }];
			onChange(newData);
			onSubmit(newData);

			// 4. Create tenant site row in tenant app
			const tenantSiteRes = await falcor.call(
				['dms', 'data', 'create'],
				[slug, `${siteInstance}:site`, { site_name: tenantName }]
			);
			const tenantSiteId = Object.keys(tenantSiteRes?.json?.dms?.data?.byId || {}).find(k => k !== '$__path');
			if (!tenantSiteId) throw new Error('Failed to create tenant site');

			// 5. Create tenant's auth pattern
			const authPatternType = `${siteInstance}|auth:pattern`;
			const authPatternRes = await falcor.call(
				['dms', 'data', 'create'],
				[slug, authPatternType, {
					pattern_type: 'auth',
					name: 'Auth',
					base_url: 'auth',
					subdomain: slug,
					authPermissions: JSON.stringify({
						groups: { [`${slug} Admin`]: ['*'], public: [] },
						users: {}
					}),
				}]
			);
			const authPatternId = Object.keys(authPatternRes?.json?.dms?.data?.byId || {}).find(k => k !== '$__path');
			if (!authPatternId) throw new Error('Failed to create auth pattern');

			// 6. Create template patterns then update tenant site with all refs
			const { allPatternRefs: templateRefs, allEnvRefs } = await provisionTemplatePatterns(falcor, {
				app: slug,
				siteInstance,
				selectedTemplateId,
				siteTemplates,
				pageTemplates,
				adminGroupName: slug,
				subdomain: slug,
			});
			const allPatternRefs = [{ ref: `${slug}+${authPatternType}`, id: +authPatternId }, ...templateRefs];
			const siteUpdate = { patterns: allPatternRefs };
			if (allEnvRefs.length) siteUpdate.dms_envs = allEnvRefs;
			await falcor.call(['dms', 'data', 'edit'], [slug, +tenantSiteId, siteUpdate]);

			setNewItem({ name: '', subdomain: '', email: '', password: '' });
			setSelectedTemplateId('simple_site');
			setAddingNew(false);
		} catch (err) {
			setError(err.message || 'Something went wrong. Please try again.');
		} finally {
			setSubmitting(false);
		}
	};

	const q = search.trim().toLowerCase();
	const tenantData = !q ? value : value.filter(v =>
		(v.name || '').toLowerCase().includes(q) ||
		(v.subdomain || '').toLowerCase().includes(q)
	);

	return (
		<div className={t.wrapper}>
			<div className={t.identityWrapper}>
				<div className={t.identityTitle}>Tenants</div>
				<span className='flex-1' />
				<div className={t.statsStrip}>
					<div className={t.statItem}>
						<p className={t.statValue}>{value.length}</p>
						<p className={t.statLabel}>tenants</p>
					</div>
				</div>
			</div>

			<div className={t.toolbarRow}>
				<div className={t.searchWrapper}>
					<Icon icon='Search' className={t.searchIcon} />
					<Input
						id={TENANT_SEARCH_INPUT_ID}
						type='text'
						className={t.searchInput}
						value={search}
						onChange={e => setSearch(e.target.value)}
						placeholder={`filter ${value.length} tenant${value.length === 1 ? '' : 's'} by name or subdomain`}
					/>
					<span className={t.searchKbdHint}>/</span>
				</div>
				<Button className={t.addPatternBtn} onClick={() => { setAddingNew(true); setError(''); setNewItem({ name: '', subdomain: '', email: '', password: '' }); setSelectedTemplateId('simple_site'); }}>
					<Icon icon='Plus' className={t.iconSm} />
					Add tenant
				</Button>
			</div>

			<div className={t.tableCard}>
				<Table columns={columns} data={tenantData} isEdit={false} activeStyle='roomy' />
			</div>

			<Modal open={addingNew} setOpen={setAddingNew}>
				<div className={t.tenantModalForm}>
					<div className={t.tenantModalTitle}>New Tenant</div>
					<div className={t.fieldGroup}>
						<label className={t.fieldLabel}>Organization Name</label>
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
					<div className={t.fieldGroup}>
						<label className={t.fieldLabel}>Admin Email</label>
						<Input
							value={newItem.email}
							onChange={e => setNewItem({ ...newItem, email: e.target.value })}
							placeholder='admin@acme.com'
						/>
					</div>
					<div className={t.fieldGroup}>
						<label className={t.fieldLabel}>Admin Password</label>
						<Input
							type='password'
							value={newItem.password}
							onChange={e => setNewItem({ ...newItem, password: e.target.value })}
							placeholder='password'
						/>
					</div>
					<SiteTemplatePicker
						siteTemplates={siteTemplates}
						selectedTemplateId={selectedTemplateId}
						onSelect={setSelectedTemplateId}
					/>
					{error && <div className={t.errorText}>{error}</div>}
					<div className={t.tenantModalActions}>
						<Button type='plain' disabled={submitting} onClick={addTenant}>
							{submitting ? 'Creating…' : 'Add'}
						</Button>
						<Button type='plain' onClick={() => { setAddingNew(false); setError(''); }}>Cancel</Button>
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
