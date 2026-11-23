import React from 'react'
import { AdminContext } from "../context";
import { ThemeContext, getComponentTheme } from '../../../ui/useTheme';
import { authedFetch } from '../../../utils/authedFetch';
import { listPlugins } from '../../../plugins';
import { pluginsCardTheme } from './pluginsCard.theme'

// A site's plugins, on its settings page in the hub (dms-plugin-system.md, P2 step 5). One row per plugin this
// server has installed, per plugin compiled into the app, and per activation row the site already has. A row
// turns the plugin on or off for the site and, for an installed one, picks the version it runs (empty: the
// server's current one, written as that version). Writes go through dms-server's /tenants/:tenant/plugins routes
// (/hub/plugins for the hub's own site), which judge the caller (hub staff, or activate-plugins on the site) and
// refuse a version not installed; nothing here writes through Falcor. The site picks a change up on its next load.
// A version that asks for permissions the site hasn't accepted is refused (409, `newPermissions`): the card lists
// them and resends with `acceptPermissions` only when the admin says so (a fresh activation, not a silent upgrade).
// `tenant` is the tenant's subdomain, or empty for the hub's own site.
export function PluginsCard({ tenant, onChange }) {
	const { API_HOST, user } = React.useContext(AdminContext) || {};
	const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
	const { Button, Pill, Select, Switch } = UI;
	const t = { ...pluginsCardTheme, ...getComponentTheme(themeFromContext, 'admin.pluginsCard') };

	const [info, setInfo] = React.useState(null);
	const [error, setError] = React.useState('');
	const [busy, setBusy] = React.useState('');
	const [confirm, setConfirm] = React.useState(null);   // { plugin, values, newPermissions }: waiting for the admin

	const base = tenant ? `/tenants/${encodeURIComponent(tenant)}/plugins` : '/hub/plugins';

	const call = React.useCallback(async (path = '', body) => {
		const res = await authedFetch(`${API_HOST}${base}${path}`, body
			? { user, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
			: { user });
		const json = await res.json().catch(() => ({}));
		if (!res.ok) throw Object.assign(new Error(json.error || `request failed (${res.status})`), { newPermissions: json.newPermissions });
		setInfo(json);
		onChange?.(json);
		return json;
	}, [API_HOST, tenant, user?.token]);

	React.useEffect(() => {
		call().catch(e => setError(e.message));
	}, [tenant, call]);

	const set = async (plugin, values) => {
		setBusy(plugin);
		setError('');
		setConfirm(null);
		try { await call('/set', { plugin, ...values }); }
		catch (e) {
			if (e.newPermissions?.length && !values.acceptPermissions) setConfirm({ plugin, values, newPermissions: e.newPermissions });
			else setError(e.message);
		}
		finally { setBusy(''); }
	};

	if (!info) {
		return (
			<div className={t.card}>
				<div className={t.loading}>{error || 'Loading…'}</div>
			</div>
		);
	}

	const { installed = [], activations = [] } = info;
	const installedBy = new Map(installed.map(p => [p.name, p]));
	const activationBy = new Map(activations.map(a => [a.plugin, a]));
	const compiled = new Map(listPlugins().map(p => [p.name, p]));
	const names = [...new Set([...installedBy.keys(), ...compiled.keys(), ...activationBy.keys()])].filter(Boolean).sort();
	const onCount = names.filter(n => {
		const a = activationBy.get(n);
		return a ? a.enabled : compiled.get(n)?.activation === 'default-on';
	}).length;

	return (
		<div className={t.card}>
			<div className={t.cardHeader}>
				<span className={t.cardTitle}>plugins</span>
				<span className={t.cardSubtitle}>{onCount} of {names.length} on</span>
			</div>

			<div className={t.headRow}>
				<span>plugin</span><span>version</span><span>status</span><span />
			</div>

			{names.length === 0 && <div className={t.loading}>No plugins on this server</div>}

			{names.map(name => {
				const inst = installedBy.get(name);
				const comp = compiled.get(name);
				const act = activationBy.get(name);
				// with no activation row, a compiled-in plugin follows its default; an installed one is off (opt-in)
				const on = act ? act.enabled : comp?.activation === 'default-on';
				const source = comp ? 'built into the app' : inst ? `installed: ${inst.versions.join(', ')}` : 'not on this server';
				const uses = inst && !comp ? (inst.permissions?.[act?.version || inst.current] || []) : [];
				return (
					<div key={name} className={t.row}>
						<div className={t.nameCell}>
							<span className={t.name}>{name}</span>
							<p className={t.note}>{source}</p>
							{uses.length > 0 && <p className={t.note}>uses {uses.join(', ')}</p>}
						</div>
						<div className={t.versionCell}>
							{inst && !comp ? (
								<Select
									value={act?.version || inst.current || ''}
									options={inst.versions}
									disabled={!!busy}
									onChange={(v) => v && v !== act?.version && set(name, { version: v })}
								/>
							) : <span className={t.versionText}>{comp ? comp.version : '–'}</span>}
						</div>
						<span>
							<Pill activeStyle={on ? 'status_good' : 'status_na'} text={busy === name ? 'saving…' : on ? 'on' : 'off'} />
						</span>
						<div className={t.actions}>
							{(inst || comp) && (
								<Switch size="small" enabled={on} disabled={!!busy}
									setEnabled={(v) => set(name, inst && !comp && !act?.version ? { enabled: !!v, version: inst.current || '' } : { enabled: !!v })} />
							)}
						</div>
					</div>
				);
			})}

			{confirm && (
				<div className={t.footer}>
					<p className={t.confirmText}>
						{confirm.plugin} {confirm.values.version || ''} asks for permissions this site hasn't accepted: {confirm.newPermissions.join(', ')}
					</p>
					<div className={t.confirmActions}>
						<Button activeStyle='primary' disabled={!!busy} onClick={() => set(confirm.plugin, { ...confirm.values, acceptPermissions: true })}>
							Accept and switch
						</Button>
						<Button activeStyle='small' disabled={!!busy} onClick={() => setConfirm(null)}>Cancel</Button>
					</div>
				</div>
			)}

			{error && <div className={t.footer}><p className={t.errorText}>{error}</p></div>}
		</div>
	);
}
