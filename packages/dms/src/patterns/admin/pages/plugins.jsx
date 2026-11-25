import React from 'react'
import { useNavigate } from 'react-router'
import { AdminContext } from "../context";
import { ThemeContext, getComponentTheme } from '../../../ui/useTheme';
import { siteCan, INSTALL_PLUGINS } from '../../../utils/adminPermissions';
import { authedFetch } from '../../../utils/authedFetch';
import { editSiteTheme } from './editSite.theme'
import { pluginsPageTheme } from './plugins.theme'

// Settings → Server plugins, /list/settings/server_plugins (was /list/plugins, which redirects there;
// settingsRegistry.js): the plugin releases installed on this server (dms-plugin-system.md, P2 step 5). Install one from
// its release index.json URL, see each plugin's versions, what they contribute and ask for, and pick the current
// version (what new activations get; its server code after a restart). Turning a plugin on for a site is its
// Settings → Plugins page (components/pluginsCard.jsx), not here.
// The server's hub only (the site the server says is its hub, ../usePluginHub.js: not another site sharing the API
// host, such as a Netlify SPA, and never a tenant host), for a user with install-plugins on it; dms-server's
// /_dms/plugins routes judge the caller again. Server code loads when the
// server starts (D2), so a plugin whose current version's server code isn't running says so: an admin restarts.
export default function PluginsPage() {
	const { API_HOST, baseUrl, authPath, app, user, authPermissions, isMultiTenant, tenantSubdomain, pluginHub } = React.useContext(AdminContext) || {}
	const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {}
	const { Button, Input, Pill, Select } = UI
	const h = { ...editSiteTheme, ...(themeFromContext?.admin?.editSite || {}) }
	const t = { ...pluginsPageTheme, ...getComponentTheme(themeFromContext, 'admin.pluginsPage') }
	const navigate = useNavigate()

	const [info, setInfo] = React.useState(null)
	const [error, setError] = React.useState('')
	const [url, setUrl] = React.useState('')
	const [busy, setBusy] = React.useState('')
	const [installed, setInstalled] = React.useState(null)   // the last install's answer

	// pluginHub: null while the admin layout asks the server, then true or false
	const mayInstall = !(isMultiTenant && tenantSubdomain) && siteCan(user, app, authPermissions, INSTALL_PLUGINS)
	const hasAccess = mayInstall && pluginHub === true

	React.useEffect(() => {
		if (!user?.authed) {
			navigate(`${authPath}/login`, { state: { from: `${baseUrl}/settings/server_plugins` } })
			return
		}
		if (user?.isAuthenticating) return
		if (!mayInstall || pluginHub === false) navigate(baseUrl || '/')
	}, [user?.authed, user?.isAuthenticating, JSON.stringify(user?.groups), mayInstall, pluginHub])

	const call = React.useCallback(async (path, body) => {
		const res = await authedFetch(`${API_HOST}/_dms/plugins${path}`, body
			? { user, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
			: { user })
		const json = await res.json().catch(() => ({}))
		if (!res.ok) throw new Error(json.error || `request failed (${res.status})`)
		return json
	}, [API_HOST, user?.token])

	const load = React.useCallback(() => call('/manage').then(setInfo).catch(e => setError(e.message)), [call])

	React.useEffect(() => {
		if (user?.authed && hasAccess) load()
	}, [hasAccess, load])

	if (!user?.authed || !hasAccess) return null

	const install = async () => {
		setBusy('install')
		setError('')
		setInstalled(null)
		try {
			setInstalled(await call('/install', { url: url.trim() }))
			setUrl('')
			await load()
		}
		catch (e) { setError(e.message) }
		finally { setBusy('') }
	}

	const makeCurrent = async (name, version) => {
		setBusy(name)
		setError('')
		try { setInfo(await call(`/${encodeURIComponent(name)}/current`, { version })) }
		catch (e) { setError(e.message) }
		finally { setBusy('') }
	}

	const plugins = info?.plugins || []
	const waiting = plugins.filter(p => p.restartNeeded)

	return (
		<div className={h.tenantPageWrapper}>
			<div className={h.identityWrapper}>
				<div className={h.identityText}>
					<div className={h.identityTitle}>Plugins</div>
					<p className={h.identitySubtitle}>Installed on this server</p>
				</div>
				<span className={h.identitySpacer} />
				<div className={h.statsStrip}>
					<div className={h.statItem}>
						<p className={h.statValue}>{info ? plugins.length : '–'}</p>
						<p className={h.statLabel}>installed</p>
					</div>
					{waiting.length > 0 && (
						<div className={h.statItem}>
							<p className={h.statValueWarn}>{waiting.length}</p>
							<p className={h.statLabel}>need a restart</p>
						</div>
					)}
				</div>
			</div>

			<div className={t.stack}>
				{waiting.length > 0 && (
					<div className={t.notice}>
						<p className={t.warnText}>Restart needed: {waiting.map(p => `${p.name} ${p.current}`).join(', ')}</p>
						<p className={t.note}>Server code loads when the server starts. Restart it to run the current versions.</p>
					</div>
				)}

				<div className={t.card}>
					<div className={t.cardHeader}>
						<span className={t.cardTitle}>install a plugin</span>
					</div>
					<div className={t.cardBody}>
						<div className={t.installRow}>
							<div className={t.installInput}>
								<Input type='text' activeStyle='mono' value={url} placeholder='Release index.json URL' aria-label='Release URL'
									onChange={e => setUrl(e.target.value)} />
							</div>
							<Button activeStyle='primary' disabled={!url.trim() || !!busy || (info && !info.unsignedAllowed)} onClick={install}>
								{busy === 'install' ? 'Installing…' : 'Install'}
							</Button>
						</div>
						{info && !info.unsignedAllowed && (
							<p className={t.note}>Installs are off: this server has no signature check yet.</p>
						)}
						{installed && (
							<p className={t.okText}>
								{installed.already ? `${installed.name} ${installed.version} was already installed` : `Installed ${installed.name} ${installed.version}`}
								{installed.restartNeeded ? ' · its server code runs after a restart' : ''}
							</p>
						)}
						{error && <p className={t.errorText}>{error}</p>}
					</div>
				</div>

				<div className={t.card}>
					<div className={t.cardHeader}>
						<span className={t.cardTitle}>installed</span>
						{info && <span className={t.cardSubtitle}>{plugins.length} plugin{plugins.length === 1 ? '' : 's'}</span>}
					</div>
					<div className={t.headRow}>
						<span>plugin</span><span>current</span><span>server code</span><span>uses</span>
					</div>
					{!info && !error && <div className={t.empty}>Loading…</div>}
					{info && plugins.length === 0 && <div className={t.empty}>No plugins installed</div>}
					{plugins.map(p => {
						const current = p.versions.find(v => v.version === p.current) || {}
						const contributes = Object.entries(current.contributes || {}).flatMap(([kind, names]) => (names || []).map(n => `${kind.replace(/s$/, '')} ${n}`))
						let source = ''
						try { source = p.sourceUrl ? new URL(p.sourceUrl).host : '' } catch { source = p.sourceUrl }
						return (
							<div key={p.name} className={t.row}>
								<div className={t.nameCell}>
									<span className={t.name}>{p.name}</span>
									<p className={t.rowNote} title={p.sourceUrl}>
										{[source, p.installedAt && `installed ${p.installedAt.slice(0, 10)}`].filter(Boolean).join(' · ') || '–'}
									</p>
								</div>
								<div>
									{p.versions.length > 1 ? (
										<Select value={p.current || ''} options={p.versions.map(v => v.version)} disabled={!!busy}
											onChange={(v) => v && v !== p.current && makeCurrent(p.name, v)} />
									) : <span className={t.versionText}>{p.current || '–'}</span>}
								</div>
								<span>
									{p.restartNeeded
										? <Pill activeStyle='status_warn' text={busy === p.name ? 'saving…' : 'restart needed'} />
										: current.hasServer
											? <Pill activeStyle='status_good' text={`running ${p.running}`} />
											: <span className={t.versionText}>none</span>}
								</span>
								<div className={t.usesCell}>
									{[...contributes, ...(current.permissions || [])].join(', ') || '–'}
								</div>
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}
