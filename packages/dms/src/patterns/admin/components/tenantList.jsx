import React from 'react'
import { useFalcor } from "@availabs/avl-falcor";
import { Link } from 'react-router'
import { AdminContext } from "../context";
import { AuthContext } from '../../auth/context';
import { ThemeContext } from '../../../ui/useTheme';
import { nameToSlug, getInstance } from '../../../utils/type-utils';
import { provisionTemplatePatterns, createCorePatterns } from '../../../utils/tenantProvisioning';
import { editSiteTheme } from '../pages/editSite.theme'
import SiteTemplatePicker from '../pages/SiteTemplatePicker'
import { stampSiteRow } from '../../registry'

const TENANT_SEARCH_INPUT_ID = 'site-tenant-search';
const EMPTY_TENANT = { name: '', subdomain: '', email: '', password: '' };

// The platform root's tenants (design_system_v6/pages/admin-tenants.html): the
// root site itself as the first row, then one row per tenant. `value` is the
// site row's `tenants` list; `rootSite` is `{ id, name }` of the site row.
// Rendered by pages/tenants.jsx, only on the root domain of a multi-tenant site.
export function TenantList({
	value = [],
	rootSite = {},
	onSubmit,
	onChange,
}) {
	const { app, type: siteType, baseUrl } = React.useContext(AdminContext);
	const { AuthAPI } = React.useContext(AuthContext);
	const { UI, theme } = React.useContext(ThemeContext);
	const t = { ...editSiteTheme, ...(theme?.admin?.editSite || {}) }
	const { falcor } = useFalcor();
	const { Table, Input, Button, Modal, Icon, FieldLabel } = UI;
	const siteInstance = getInstance(siteType) || siteType;
	const siteTemplates = theme?.site_templates ?? [];
	const pageTemplates = theme?.page_templates ?? [];

	const [addingNew, setAddingNew] = React.useState(false);
	const [newItem, setNewItem] = React.useState(EMPTY_TENANT);
	const [selectedTemplateId, setSelectedTemplateId] = React.useState('simple_site');
	const [submitting, setSubmitting] = React.useState(false);
	const [deletingItem, setDeletingItem] = React.useState(undefined);
	const [error, setError] = React.useState('');
	const [search, setSearch] = React.useState('');
	// The Table sizes its columns from this element's width; without it they take a
	// fixed default width and the actions column overflows the card.
	const gridRef = React.useRef(null);

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

	// We are on the root domain here, so the host is the base domain.
	const host = window.location.host;
	const protocol = host.includes('localhost') ? 'http' : 'https';

	const columns = [
		{
			name: 'name', display_name: 'Name', show: true, type: 'ui',
			Comp: (d) => (
				<div className={t.tenantNameCell}>
					<div>
						<span className={t.tenantName}>{d.row.name || d.row.subdomain}</span>
						{d.row.isRoot && <span className={t.rootPill}>root</span>}
					</div>
					<p className={t.tenantSubline}>app {d.row.app || '—'} · id {d.row.id}</p>
				</div>
			)
		},
		{
			name: 'subdomain', display_name: 'Subdomain', show: true, type: 'ui',
			Comp: (d) => d.row.isRoot
				? <span className={t.tenantSubdomainEmpty}>—</span>
				: <span className={t.tenantSubdomain}>{d.row.subdomain}</span>
		},
		{
			name: 'link', display_name: 'Site', show: true, type: 'ui',
			Comp: (d) => d.row.isRoot
				// The root's own site admin, which is where this page lives: a router link.
				? <Link to={baseUrl || '/'} className={t.rootLink}>{host}</Link>
				: (
					<a href={`${protocol}://${d.row.subdomain}.${host}${baseUrl}`} className={t.tenantHostLink}>
						{d.row.subdomain}.{host}
						<Icon icon='ArrowUpRight' className={t.iconXs} />
					</a>
				)
		},
		{
			name: 'actions', display_name: ' ', show: true, type: 'ui',
			Comp: (d) => d.row.isRoot ? null : (
				<div className={t.cellActions}>
					<Button
						activeStyle='iconRowDanger'
						title='Remove tenant'
						onClick={() => setDeletingItem(d.row)}
					>
						<Icon icon='TrashCan' className={t.iconSm} />
					</Button>
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
				[slug, `${siteInstance}:site`, stampSiteRow({ site_name: tenantName })]
			);
			const tenantSiteId = Object.keys(tenantSiteRes?.json?.dms?.data?.byId || {}).find(k => k !== '$__path');
			if (!tenantSiteId) throw new Error('Failed to create tenant site');

			// 5. Create the tenant's auth + admin patterns and register them on its site
			const corePatternRefs = await createCorePatterns(falcor, {
				app: slug,
				siteInstance,
				siteId: tenantSiteId,
				adminGroupName: slug,
				subdomain: slug,
				adminPath: baseUrl || '/',
			});

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
			const allPatternRefs = [...corePatternRefs, ...templateRefs];
			const siteUpdate = { patterns: allPatternRefs };
			if (allEnvRefs.length) siteUpdate.dms_envs = allEnvRefs;
			await falcor.call(['dms', 'data', 'edit'], [slug, +tenantSiteId, siteUpdate]);

			setNewItem(EMPTY_TENANT);
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
	// The root row is always first and never filtered out.
	const rootRow = { id: rootSite.id, name: rootSite.name || app, app, subdomain: '', isRoot: true };
	const rows = [rootRow, ...tenantData];

	return (
		<div className={t.tenantPageWrapper}>
			<div className={t.identityWrapper}>
				<div className={t.identityText}>
					<div className={t.identityTitle}>Tenants</div>
					<p className={t.identitySubtitle}>{rootSite.name || app} · {host} · app {app}</p>
				</div>
				<span className={t.identitySpacer} />
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
						activeStyle='bare'
						value={search}
						onChange={e => setSearch(e.target.value)}
						placeholder={`filter ${value.length} tenant${value.length === 1 ? '' : 's'} by name or subdomain`}
					/>
					<span className={t.searchKbdHint}>/</span>
				</div>
				<Button activeStyle='primary' onClick={() => { setAddingNew(true); setError(''); setNewItem(EMPTY_TENANT); setSelectedTemplateId('simple_site'); }}>
					<Icon icon='Plus' className={t.iconSm} />
					Add tenant
				</Button>
			</div>

			<div className={t.tableCard}>
				<Table columns={columns} data={rows} isEdit={false} gridRef={gridRef} activeStyle='list' />
			</div>
			<p className={t.tenantNote}>Removing a tenant unlinks it from this site; its data is not deleted.</p>

			<Modal open={addingNew} setOpen={setAddingNew}>
				<div className={t.tenantModalForm}>
					<div className={t.tenantModalTitle}>New Tenant</div>
					<div className={t.fieldGroup}>
						<FieldLabel activeStyle="inline" htmlFor="tenant-name" text="Organization Name" />
						<Input
							id="tenant-name"
							value={newItem.name}
							onChange={e => setNewItem({ ...newItem, name: e.target.value })}
							placeholder='Acme Corp'
						/>
					</div>
					<div className={t.fieldGroup}>
						<FieldLabel activeStyle="inline" htmlFor="tenant-subdomain" text="Subdomain" />
						<Input
							id="tenant-subdomain"
							value={newItem.subdomain}
							onChange={e => setNewItem({ ...newItem, subdomain: e.target.value })}
							placeholder='acme'
						/>
					</div>
					<div className={t.fieldGroup}>
						<FieldLabel activeStyle="inline" htmlFor="tenant-email" text="Admin Email" />
						<Input
							id="tenant-email"
							value={newItem.email}
							onChange={e => setNewItem({ ...newItem, email: e.target.value })}
							placeholder='admin@acme.com'
						/>
					</div>
					<div className={t.fieldGroup}>
						<FieldLabel activeStyle="inline" htmlFor="tenant-password" text="Admin Password" />
						<Input
							id="tenant-password"
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
						<Button type='button' activeStyle='action' onClick={() => { setAddingNew(false); setError(''); }}>Cancel</Button>
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
							Remove
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
