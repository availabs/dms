import React from 'react'
import { useNavigate, useNavigation } from 'react-router'
import { AdminContext } from "../context";
import { settingsPagesFor, mayInstallPlugins } from '../settingsRegistry'
import SettingsPages from './settingsPages'

// /list/settings/:sub?: this app's Settings, on every app, multi-tenant or not (app-settings-pages.md). The sub
// pages come from settingsRegistry.js (built in: Overview, Plugins, Storage, Server plugins; and the ones the app,
// its plugins and its pattern types add); the sidenav's Settings group lists the same ones (siteConfig.jsx). They
// call dms-server's routes for this app by name, /_dms/apps/<app>/…, which every server mounts and which judge the
// caller again. The hub's page for one of its tenants shows the same sub pages (pages/tenantOverview.jsx).
// Loads the site row ("edit"): Storage reads its `patterns`.
// `params` comes from the DMS manager's own path match (dms-manager), not react-router's useParams.
export default function SiteSettingsPage({ item = {}, dataItems, params = {} }) {
	const ctx = React.useContext(AdminContext) || {}
	const { baseUrl, authPath, app, user, authPermissions, isMultiTenant, tenantSubdomain, pluginHub, sitePatterns, pluginActivations } = ctx
	const navigate = useNavigate()
	const { state: navState } = useNavigation()

	if (!item.id && dataItems?.length > 0) item = dataItems[0]

	const { all, allowed } = settingsPagesFor({ user, app, authPermissions, isMultiTenant, tenantSubdomain, pluginHub, own: true, sitePatterns, activations: pluginActivations })
	// Server plugins waits for the server to say whether this site is its hub (usePluginHub)
	const waiting = navState === 'loading' || (pluginHub === null && mayInstallPlugins(user, ctx))

	React.useEffect(() => {
		if (!user?.authed) {
			navigate(`${authPath}/login`, { state: { from: `${baseUrl}/settings${params.sub ? `/${params.sub}` : ''}` } })
			return
		}
		if (user?.isAuthenticating || waiting) return
		if (!allowed.length) navigate(baseUrl || '/')
	}, [user?.authed, user?.isAuthenticating, JSON.stringify(user?.groups), allowed.length, waiting])

	if (!user?.authed || user?.isAuthenticating || waiting || !allowed.length) return null

	return (
		<SettingsPages
			pages={all}
			allowed={allowed}
			sub={params.sub}
			linkBase={`${baseUrl}/settings`}
			title='Settings'
			subtitle={(s) => <>
				{s.tenantName || tenantSubdomain || app}
				{s.primary && <> · primary domain {s.primary}</>}
			</>}
			target={{ app, tenant: tenantSubdomain || '', apiBase: `/_dms/apps/${encodeURIComponent(app)}`, own: true }}
			item={item}
		/>
	)
}
