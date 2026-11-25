import React from 'react'
import { Link, useNavigate, useNavigation } from 'react-router'
import { AdminContext } from "../context";
import { ThemeContext } from '../../../ui/useTheme';
import { siteCan, MANAGE_TENANTS } from '../../../utils/adminPermissions';
import { settingsPagesFor } from '../settingsRegistry'
import { editSiteTheme } from './editSite.theme'
import SettingsPages from './settingsPages'

// /list/tenants/:tenantId/:sub? on the platform root of the tenant hub
// (design_system_v6/pages/admin-tenant-overview.html): one tenant, opened from its name on the Tenants page, for hub
// staff (manage-tenants). Loads the site row ("edit", as TenantsPage) for its `tenants` list. It shows the tenant's
// Settings: the same sub pages as the tenant's own /list/settings (settingsRegistry.js; app-settings-pages.md),
// less those only an app's own Settings has (`forTenant` false: Storage, Server plugins), with a strip to move
// between them. They call the hub's routes for the tenant, /tenants/<subdomain>/…, which judge the caller again.
// Pattern-type pages aren't offered here (this page doesn't load the tenant's patterns), and a plugin's are offered
// as its default activation says, not the tenant's own rows.
// Still to port from the mockup: name editing, the pattern-subdomains card, the danger zone
// (tenant-external-domains.md, Phase B).
// `params` comes from the DMS manager's own path match (dms-manager), not react-router's useParams.
export default function TenantOverviewPage({ item = {}, dataItems, params = {} }) {
	const { baseUrl, authPath, app, user, authPermissions, isMultiTenant, subdomain, tenantSubdomain = subdomain, pluginHub } = React.useContext(AdminContext) || {}
	const { theme } = React.useContext(ThemeContext) || {}
	const t = { ...editSiteTheme, ...(theme?.admin?.editSite || {}) }
	const navigate = useNavigate()
	const { state: navState } = useNavigation()
	const { tenantId, sub } = params

	if (!item.id && dataItems?.length > 0) item = dataItems[0]

	const isLoading = navState === 'loading'
	const isPlatformRoot = Boolean(isMultiTenant) && !tenantSubdomain
	const hasAccess = isPlatformRoot && siteCan(user, app, authPermissions, MANAGE_TENANTS)
	const tenant = (item?.tenants || []).find(x => `${x.id}` === `${tenantId}`)

	React.useEffect(() => {
		if (isLoading || dataItems === undefined) return
		if (!user?.authed) {
			navigate(`${authPath}/login`, { state: { from: `${baseUrl}/tenants/${tenantId}` } })
			return
		}
		if (user?.isAuthenticating) return
		if (!hasAccess) navigate(baseUrl || '/')
	}, [isLoading, dataItems, user?.authed, user?.isAuthenticating, JSON.stringify(user?.groups), hasAccess])

	if (isLoading || dataItems === undefined || !item?.id || !user?.authed || !hasAccess) return null

	if (!tenant) {
		return (
			<div className={t.tenantPageWrapper}>
				<div className={t.identityTitle}>Tenant not found</div>
				<p className={t.identitySubtitle}><Link to={`${baseUrl}/tenants`}>back to tenants</Link></p>
			</div>
		)
	}

	const { all, allowed } = settingsPagesFor({ user, app, authPermissions, isMultiTenant, tenantSubdomain, pluginHub, own: false })

	return (
		<SettingsPages
			pages={all}
			allowed={allowed}
			sub={sub}
			linkBase={`${baseUrl}/tenants/${tenantId}`}
			showNav
			title={tenant.name || tenant.subdomain}
			subtitle={(s) => <>{tenant.subdomain} · primary domain {s.primary || '…'} · id {tenant.id}</>}
			target={{ app: tenant.app || '', tenant: tenant.subdomain, apiBase: `/tenants/${encodeURIComponent(tenant.subdomain)}`, own: false }}
		/>
	)
}
