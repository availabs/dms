import React from 'react'
import { AdminContext } from "../context";
import { ThemeContext } from '../../../ui/useTheme';
import { authedFetch } from '../../../utils/authedFetch';
import { pgEnvsCardTheme } from './pgEnvsCard.theme'

// The pgEnvs a tenant is attached to, on its settings page (pgenv-config-on-the-site-row.md).
// One row per pgEnv the server has a database for, plus any the tenant is attached to that this
// server has none for. Attaching goes through dms-server's /tenants/:tenant/pgenvs routes, which
// judge the caller and create the tenant's env row; nothing here writes through Falcor. Hub staff
// (manage-tenants) attach and remove; a tenant's own admins (manage-domains) see what is attached.
// Remove asks the server for its plan first (…/detach/plan, read-only), then confirms in place. Until a tenant is attached, the server refuses that pgEnv's sources for it.
// `tenant` is the tenant's subdomain, or empty for the hub's own site; `onChange` gets the server's description after every load.
export function PgEnvsCard({ tenant, onChange }) {
	const { API_HOST, user } = React.useContext(AdminContext) || {};
	const { UI, theme } = React.useContext(ThemeContext) || {};
	const { Button, Icon, Pill } = UI;
	const t = { ...pgEnvsCardTheme, ...(theme?.admin?.pgEnvsCard || {}) };

	const [info, setInfo] = React.useState(null);
	const [error, setError] = React.useState('');
	const [busy, setBusy] = React.useState('');
	// the pgEnv being removed, with the server's plan for it once loaded: { pgEnv, plan }
	const [removing, setRemoving] = React.useState(null);

	// a tenant's routes, or the hub's own site's when no tenant is named
	const base = tenant ? `/tenants/${encodeURIComponent(tenant)}/pgenvs` : '/hub/pgenvs';

	const call = React.useCallback(async (path = '', body) => {
		const res = await authedFetch(`${API_HOST}${base}${path}`, body
			? { user, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
			: { user });
		const json = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(json.error || `request failed (${res.status})`);
		setInfo(json);
		onChange?.(json);
		return json;
	}, [API_HOST, tenant, user?.token]);

	React.useEffect(() => {
		call().catch(e => setError(e.message));
	}, [tenant, call]);

	const attach = async (pgEnv) => {
		setBusy(pgEnv);
		setError('');
		try { await call('/attach', { pgEnv }); }
		catch (e) { setError(e.message); }
		finally { setBusy(''); }
	};

	// Removing is two steps: the plan (read-only: what goes, what blocks it), then the confirm.
	const planRemove = async (pgEnv) => {
		setError('');
		setRemoving({ pgEnv, plan: null });
		try {
			const res = await authedFetch(`${API_HOST}${base}/detach/plan`,
				{ user, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pgEnv }) });
			const plan = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(plan.error || `request failed (${res.status})`);
			setRemoving({ pgEnv, plan });
		} catch (e) { setError(e.message); setRemoving(null); }
	};

	const remove = async (pgEnv) => {
		setBusy(pgEnv);
		setError('');
		try { await call('/detach', { pgEnv }); setRemoving(null); }
		catch (e) { setError(e.message); }
		finally { setBusy(''); }
	};

	if (!info) {
		return (
			<div className={t.card}>
				<div className={t.loading}>{error || 'Loading…'}</div>
			</div>
		);
	}

	const { attached = [], available = [], canAttach = false } = info;
	const attachedByName = new Map(attached.map(a => [a.pgEnv, a]));
	const names = [...new Set([...attached.map(a => a.pgEnv), ...available])].sort();

	return (
		<div className={t.card}>
			<div className={t.cardHeader}>
				<span className={t.cardTitle}>data environments</span>
				<span className={t.cardSubtitle}>{canAttach ? `${attached.length} of ${names.length} attached` : `${attached.length} attached`}</span>
			</div>

			<div className={t.headRow}>
				<span>pgEnv</span><span>status</span><span />
			</div>

			{names.length === 0 && <div className={t.loading}>{canAttach ? 'No pgEnvs on this server' : 'None attached'}</div>}

			{names.map(name => {
				const row = attachedByName.get(name);
				const known = !canAttach || available.includes(name);   // only hub staff are told what the server has
				return (
					<React.Fragment key={name}>
					<div className={t.row}>
						<div className={t.nameCell}>
							<span className={t.name}>{name}</span>
							{row && <p className={t.note}>id {row.id}</p>}
						</div>
						<span>
							{row
								? <Pill activeStyle={known ? 'status_good' : 'status_warn'} text={known ? 'attached' : 'no database here'} />
								: <Pill activeStyle='status_na' text='not attached' />}
						</span>
						<div className={t.actions}>
							{!row && canAttach && (
								<Button activeStyle='small' disabled={!!busy} onClick={() => attach(name)}>
									<Icon icon='Plus' className={t.iconSm} />
									{busy === name ? 'Attaching…' : 'Attach'}
								</Button>
							)}
							{row && canAttach && (
								<Button activeStyle='iconRowDanger' title='Remove pgEnv' aria-label='Remove pgEnv'
									disabled={!!busy || removing?.pgEnv === name} onClick={() => planRemove(name)}>
									<Icon icon='TrashCan' className={t.iconSm} />
								</Button>
							)}
						</div>
					</div>
					{removing?.pgEnv === name && (
						<div className={t.confirm}>
							<div className={t.confirmBox}>
								{!removing.plan ? <p className={t.confirmText}>Loading…</p> : (
									<>
										<p className={t.confirmText}>
											{removing.plan.blocked
												? `Can't remove: ${removing.plan.blocked}`
												: `This site loses access to ${name}'s sources. The data stays in ${name}.`}
										</p>
										{!removing.plan.blocked && (removing.plan.grants.groups.length > 0 || removing.plan.grants.users > 0) && (
											<p className={t.confirmNote}>
												Grants removed: {[...removing.plan.grants.groups, removing.plan.grants.users ? `${removing.plan.grants.users} user${removing.plan.grants.users === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ')}
											</p>
										)}
										<div className={t.confirmActions}>
											{!removing.plan.blocked && (
												<Button activeStyle='smallDanger' disabled={!!busy} onClick={() => remove(name)}>
													{busy === name ? 'Removing…' : 'Confirm remove'}
												</Button>
											)}
											<Button activeStyle='small' disabled={!!busy} onClick={() => setRemoving(null)}>Cancel</Button>
										</div>
									</>
								)}
							</div>
						</div>
					)}
					</React.Fragment>
				);
			})}

			{error && <div className={t.footer}><p className={t.errorText}>{error}</p></div>}
		</div>
	);
}
