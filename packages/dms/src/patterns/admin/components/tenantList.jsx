import React from 'react'
import { useFalcor } from "@availabs/avl-falcor";
import { Link } from 'react-router'
import { AdminContext } from "../context";
import { AuthContext } from '../../auth/context';
import { ThemeContext } from '../../../ui/useTheme';
import { nameToSlug, getInstance } from '../../../utils/type-utils';
import { provisionTemplatePatterns, createCorePatterns } from '../../../utils/tenantProvisioning';
import { getRootDomain } from '../../../utils/hostResolver';
import { editSiteTheme } from '../pages/editSite.theme'
import SiteTemplatePicker from '../pages/SiteTemplatePicker'
import { stampSiteRow } from '../../registry'
import { authedFetch } from '../../../utils/authedFetch'

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
						{d.row.isRoot
							? <span className={t.tenantName}>{d.row.name || d.row.subdomain}</span>
							// the tenant's settings (pages/tenantOverview.jsx)
							: <Link to={`${baseUrl}/tenants/${d.row.id}`} className={t.tenantNameLink}>{d.row.name || d.row.subdomain}</Link>}
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
					{/* the tenant's settings (pages/tenantOverview.jsx), as the pattern list's pencil (pages/editSite.jsx) */}
					<Link to={`${baseUrl}/tenants/${d.row.id}`} className={t.editLink} title='Edit tenant' aria-label='Edit tenant'>
						<Icon icon='PencilEditSquare' className={t.iconSm} />
					</Link>
					<Button
						activeStyle='iconRowDanger'
						title='Delete tenant'
						aria-label='Delete tenant'
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

			// 3. Append tenant ref to master site. Carry the row's fields with the ref:
			// this page keeps its own edited copy of the list, and the tenant row was
			// written straight to the server, so a bare {ref, id} stays a blank row
			// until a reload. The save still writes {ref, id} only (no _dirty).
			const newData = [...value, { ref: `${app}+${tenantType}`, id: +newId, name: tenantName, subdomain: slug, app: slug }];
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
				// With a root domain (nested <sub>.<tenant>.<root> hosts) a tenant's auth and admin answer on
				// every host of the tenant, as the copied tenants' do; legacy multi-tenant: the tenant's label.
				subdomain: getRootDomain() ? '*' : slug,
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
				// With a root domain the tenant's root is '' (no key), like any site's; legacy: the tenant's label.
				subdomain: getRootDomain() ? undefined : slug,
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
			<p className={t.tenantNote}>Deleting a tenant erases its site, its data and its login project, after saving a backup on the server.</p>

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

			<DeleteTenantModal
				tenant={deletingItem}
				onClose={() => setDeletingItem(undefined)}
				onDeleted={(tenant) => {
					// the server already took the ref off the site row: only the page's copy changes
					onChange(value.filter(v => v.id !== tenant.id));
					setDeletingItem(undefined);
				}}
			/>
		</div>
	);
}

// Delete a tenant for good (dms-server routes/tenants): what goes comes from the read-only
// `…/delete/plan` route; the delete itself needs the subdomain typed back. The server backs the tenant
// up first and refuses to delete when the backup fails.
export function DeleteTenantModal({ tenant, onClose, onDeleted }) {
	const { API_HOST, user } = React.useContext(AdminContext) || {};
	const { UI, theme } = React.useContext(ThemeContext);
	const t = { ...editSiteTheme, ...(theme?.admin?.editSite || {}) }
	const { Button, Modal, Input, FieldLabel } = UI;
	const sub = tenant?.subdomain || '';
	const [plan, setPlan] = React.useState(null);
	const [confirm, setConfirm] = React.useState('');
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState('');

	React.useEffect(() => {
		setPlan(null); setConfirm(''); setError('');
		if (!sub) return;
		let live = true;
		authedFetch(`${API_HOST}/tenants/${encodeURIComponent(sub)}/delete/plan`, { user, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
			.then(async (res) => {
				const body = await res.json().catch(() => ({}));
				if (!live) return;
				if (res.ok) setPlan(body);
				else setError(body.error || `Can't preview this delete (${res.status})`);
			})
			.catch((e) => { if (live) setError(`Can't preview this delete: ${e.message}`); });
		return () => { live = false; };
	}, [API_HOST, sub, user?.token]);

	const remove = async () => {
		setBusy(true); setError('');
		try {
			const res = await authedFetch(`${API_HOST}/tenants/${encodeURIComponent(sub)}/delete`,
				{ user, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm }) });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) { setError(body.error || `Delete failed (${res.status})`); return; }
			onDeleted(tenant, body);
		} catch (e) {
			setError(`Delete failed: ${e.message}`);
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal open={Boolean(tenant)} setOpen={(open) => { if (!open && !busy) onClose(); }}>
			<div className={t.deleteModal}>
				<div className={t.deleteModalTitle}>Delete Tenant</div>
				<div className={t.deleteModalDesc}>
					Delete <span className={t.deleteModalHighlight}>{tenant?.name}</span> ({sub}) for good? A backup is
					saved on the server first; nothing here can undo it.
				</div>
				{plan && (
					<ul className={t.deletePlanList}>
						<li className={t.deletePlanItem}>its site and data{plan.schema ? `: schema ${plan.schema}, ${plan.tables} tables` : ' (no schema found)'}</li>
						<li className={t.deletePlanItem}>its domain aliases and its row on this hub</li>
						<li className={t.deletePlanItem}>
							login project {plan.tenant.app}{plan.auth.groups.length ? `, groups ${plan.auth.groups.join(', ')}` : ''}
							{plan.auth.memberships ? ` (${plan.auth.memberships} memberships; the user accounts stay)` : ''}
						</li>
						{plan.auth.keptGroups.length > 0 && (
							<li className={t.deletePlanItem}>kept, used by other sites: {plan.auth.keptGroups.join(', ')}</li>
						)}
					</ul>
				)}
				<div className={t.fieldGroup}>
					<FieldLabel activeStyle="inline" htmlFor="tenant-delete-confirm" text={`Type ${sub} to confirm`} />
					<Input id="tenant-delete-confirm" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={sub} />
				</div>
				{error && <div className={t.errorText}>{error}</div>}
				<div className={t.deleteModalFooter}>
					<Button type='plain' activeStyle='action' disabled={busy} onClick={onClose}>Cancel</Button>
					<Button type='plain' activeStyle='dangerSolid' disabled={busy || confirm.trim().toLowerCase() !== sub} onClick={remove}>
						{busy ? 'Deleting…' : 'Delete'}
					</Button>
				</div>
			</div>
		</Modal>
	);
}
