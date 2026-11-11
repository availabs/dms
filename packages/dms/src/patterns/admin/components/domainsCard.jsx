import React from 'react'
import { AdminContext } from "../context";
import { ThemeContext } from '../../../ui/useTheme';
import { authedFetch } from '../../../utils/authedFetch';
import { normalizeAliasDomain, aliasDomainProblem } from '../../../utils/hostResolver';
import { domainsCardTheme } from './domainsCard.theme'

// A tenant's domains on the tenant hub (tenant-external-domains.md, Phase B; mockups
// design_system_v6/pages/admin-tenant-overview.html and admin-site-domains.html, "domains" card).
// The default domain (<tenant>.<root>, from the hub) first, then each alias: its DNS check, and
// while it isn't verified, the records to add. Add / remove / make primary / check now all go
// through dms-server's /domains/:tenant routes, which judge the caller (hub manage-tenants, or
// manage-domains on the tenant's own site) and write the hub's tenant row; nothing here writes
// through Falcor. `tenant` is the tenant's subdomain; `onChange` gets the server's description
// after every change (the page header shows the primary).

const dateOf = (iso) => (iso ? `${iso}`.slice(0, 10) : '');
function ago(iso) {
	if (!iso) return '';
	const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.round(s / 60)} min ago`;
	if (s < 86400) return `${Math.round(s / 3600)} h ago`;
	return dateOf(iso);
}

export function DomainsCard({ tenant, onChange }) {
	const { API_HOST, user } = React.useContext(AdminContext) || {};
	const { UI, theme } = React.useContext(ThemeContext) || {};
	const { Button, Input, Icon, Pill } = UI;
	const t = { ...domainsCardTheme, ...(theme?.admin?.domainsCard || {}) };

	const [info, setInfo] = React.useState(null);
	const [error, setError] = React.useState('');
	const [busy, setBusy] = React.useState('');
	const [newDomain, setNewDomain] = React.useState('');

	// Links open on this page's protocol and port (a local rig serves on a port; production doesn't).
	const { protocol, port } = typeof window !== 'undefined' ? window.location : { protocol: 'https:', port: '' };
	const hrefOf = (domain) => `${protocol}//${domain}${port ? `:${port}` : ''}/`;

	const call = React.useCallback(async (path = '', body) => {
		const res = await authedFetch(`${API_HOST}/domains/${encodeURIComponent(tenant)}${path}`, body
			? { user, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
			: { user });
		const json = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(json.error || `request failed (${res.status})`);
		setInfo(json);
		onChange?.(json);
		return json;
	}, [API_HOST, tenant, user?.token]);

	React.useEffect(() => {
		if (!tenant) return;
		call().catch(e => setError(e.message));
	}, [tenant, call]);

	const act = async (key, path, body) => {
		setBusy(key);
		setError('');
		try { await call(path, body); return true; }
		catch (e) { setError(e.message); return false; }
		finally { setBusy(''); }
	};

	const add = async () => {
		const domain = normalizeAliasDomain(newDomain);
		const problem = aliasDomainProblem(domain);
		if (problem) { setError(problem); return; }
		if (await act('add', '/add', { domain })) setNewDomain('');
	};

	if (!info) {
		return (
			<div className={t.card}>
				<div className={t.loading}>{error || 'loading domains…'}</div>
			</div>
		);
	}

	const { defaultDomain, primary, aliases = [] } = info;

	const dnsPill = (a) => {
		if (a.status !== 'verified') return <Pill activeStyle='status_warn' text='not verified' />;
		if (a.checks && !a.checks.a) return <Pill activeStyle='status_warn' text='check dns' />;
		return <Pill activeStyle='status_good' text='points here' />;
	};

	return (
		<div className={t.card}>
			<div className={t.cardHeader}>
				<span className={t.cardTitle}>domains</span>
				<span className={t.cardSubtitle}>where this site is served · each also serves its pattern subdomains</span>
			</div>

			<div className={t.headRow}>
				<span>domain</span><span>pattern subdomains</span><span>dns</span><span />
			</div>

			{/* the default domain: from the hub, always on */}
			<div className={t.rowDefault}>
				<div className={t.domainCell}>
					<a href={hrefOf(defaultDomain)} className={t.domainLink}>{defaultDomain}<Icon icon='ArrowUpRight' className={t.iconXs} /></a>
					<span className={t.tag}>default</span>
					{!primary && <span className={t.tagPrimary}>primary</span>}
					<p className={t.domainNote}>from the hub · always on{primary ? ` · redirects to ${primary} (the admin at /list stays here)` : ''}</p>
				</div>
				<span className={t.wildcard}>*.{defaultDomain}</span>
				<span><Pill activeStyle='status_good' text='managed' /></span>
				<div className={t.actions}>
					{primary && (
						<Button activeStyle='small' disabled={!!busy} onClick={() => act('primary:', '/primary', { domain: '' })}>
							make primary
						</Button>
					)}
				</div>
			</div>

			{aliases.map(a => {
				const verified = a.status === 'verified';
				const isPrimary = primary === a.domain;
				const note = verified
					? `verified ${dateOf(a.verified_at)}${a.checked_at ? ` · checked ${ago(a.checked_at)}` : ''}`
					: `added ${dateOf(a.added_at)}${a.checked_at ? ` · checked ${ago(a.checked_at)}` : ''}`;
				return (
					<React.Fragment key={a.domain}>
						<div className={t.row}>
							<div className={t.domainCell}>
								{verified
									? <a href={hrefOf(a.domain)} className={t.domainLink}>{a.domain}<Icon icon='ArrowUpRight' className={t.iconXs} /></a>
									: <span className={t.domainText}>{a.domain}</span>}
								<span className={t.tag}>alias</span>
								{isPrimary && <span className={t.tagPrimary}>primary</span>}
								<p className={t.domainNote}>{note}</p>
							</div>
							<span className={verified ? t.wildcard : t.wildcardOff}>*.{a.domain}</span>
							<span>{dnsPill(a)}</span>
							<div className={t.actions}>
								{verified && !isPrimary && (
									<Button activeStyle='small' disabled={!!busy} onClick={() => act(`primary:${a.domain}`, '/primary', { domain: a.domain })}>
										make primary
									</Button>
								)}
								<Button activeStyle='iconRowDanger' aria-label='Remove alias' title='Remove alias' disabled={!!busy}
									onClick={() => {
										if (window.confirm(`Remove ${a.domain}? It stops serving this site${isPrimary ? `, and ${defaultDomain} becomes the primary` : ''}.`)) {
											act(`remove:${a.domain}`, '/remove', { domain: a.domain });
										}
									}}>
									<Icon icon='Trash' className={t.iconSm} />
								</Button>
							</div>
						</div>
						{(!verified || (a.checks && !a.checks.a)) && (
							<div className={t.records}>
								<div className={t.recordsBox}>
									<p className={t.recordsIntro}>
										Add these records at the DNS provider for {a.domain}. The TXT record proves you control the domain;
										the others send its traffic to the hub. The wildcard serves the pattern subdomains
										(albany.{a.domain}, …).
									</p>
									<div className={t.recordsGrid}>
										<span className={t.recordsHead}>type</span><span className={t.recordsHead}>name</span><span className={t.recordsHead}>value</span>
										{(a.records || []).map(r => (
											<React.Fragment key={`${r.type}|${r.name}|${r.value}`}>
												<span>{r.type}</span><span>{r.name}</span><span className={t.recordValue}>{r.value}</span>
											</React.Fragment>
										))}
									</div>
									{a.problem && <p className={t.recordsProblem}>{a.problem}</p>}
									<div className={t.recordsFooter}>
										<Button activeStyle='small' disabled={!!busy} onClick={() => act(`check:${a.domain}`, '/check', { domain: a.domain })}>
											{busy === `check:${a.domain}` ? 'checking…' : 'check now'}
										</Button>
										<span className={t.recordsNote}>
											HTTPS for this domain is yours to provide; the hub serves it once verified.
											{!verified && ' Unverified after 7 days, it is removed.'}
										</span>
									</div>
								</div>
							</div>
						)}
					</React.Fragment>
				);
			})}

			<div className={t.addRow}>
				<div className={t.addForm}>
					<label className={t.addField}>
						<span className={t.addPrefix}>https://</span>
						<Input
							type='text'
							activeStyle='bare'
							value={newDomain}
							onChange={e => setNewDomain(e.target.value)}
							onKeyDown={e => { if (e.key === 'Enter') add(); }}
							placeholder='a domain you own, e.g. mitigateny.org'
						/>
					</label>
					<Button activeStyle='primary' disabled={!!busy || !newDomain.trim()} onClick={add}>
						<Icon icon='Plus' className={t.iconSm} />
						{busy === 'add' ? 'adding…' : 'add alias'}
					</Button>
				</div>
				<p className={t.addHelp}>
					Served once verified. This site answers at the domain, and each pattern subdomain at
					&lt;subdomain&gt;.&lt;domain&gt;.
				</p>
				{error && <p className={t.errorText}>{error}</p>}
			</div>
		</div>
	);
}
