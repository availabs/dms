import React from 'react'
import { useNavigate } from 'react-router'
import { AdminContext } from "../context";
import { ThemeContext } from '../../../ui/useTheme';
import { siteCan, MANAGE_DOMAINS, MANAGE_TENANTS } from '../../../utils/adminPermissions';
import { getRootDomain } from '../../../utils/hostResolver';
import { editSiteTheme } from './editSite.theme'
import { DomainsCard } from '../components/domainsCard'
import { PgEnvsCard } from '../components/pgEnvsCard'

// /list/settings on a TENANT host of the tenant hub: the tenant's settings, on its own host (was
// /list/domains, pages/siteDomains.jsx, until 2026-11-13; that path still opens this page). One card
// per setting, stacked: domains (design_system_v6/pages/admin-site-domains.html; only on a hub with a
// root domain) and data environments, the pgEnvs the tenant is attached to
// (pgenv-config-on-the-site-row.md). The same cards as the hub's own page for the tenant
// (pages/tenantOverview.jsx). On a tenant host (`tenantSubdomain` set) for a user with manage-domains on
// this site; on the hub's root, for the hub's own site (it has no domains card: it is not a tenant), for
// hub staff (manage-tenants). Multi-tenant sites only; the server's /domains and /tenants routes judge the
// caller again. One page for now; when the cards outgrow it they become sub pages, as the pattern
// editor's tabs are (patternEditor/index.jsx).
export default function SiteSettingsPage() {
	const { baseUrl, authPath, app, user, authPermissions, isMultiTenant, tenantSubdomain } = React.useContext(AdminContext) || {}
	const { theme } = React.useContext(ThemeContext) || {}
	const t = { ...editSiteTheme, ...(theme?.admin?.editSite || {}) }
	const navigate = useNavigate()
	const [info, setInfo] = React.useState(null)
	const [pgEnvs, setPgEnvs] = React.useState(null)

	// a tenant's own admins on its host; hub staff on the hub's root, for the hub's own site
	const hasAccess = Boolean(isMultiTenant) && siteCan(user, app, authPermissions, tenantSubdomain ? MANAGE_DOMAINS : MANAGE_TENANTS)
	const hasDomains = Boolean(tenantSubdomain) && Boolean(getRootDomain())

	React.useEffect(() => {
		if (!user?.authed) {
			navigate(`${authPath}/login`, { state: { from: `${baseUrl}/settings` } })
			return
		}
		if (user?.isAuthenticating) return
		if (!hasAccess) navigate(baseUrl || '/')
	}, [user?.authed, user?.isAuthenticating, JSON.stringify(user?.groups), hasAccess])

	if (!user?.authed || !hasAccess) return null

	const aliases = info?.aliases || []
	const unverified = aliases.filter(a => a.status !== 'verified').length

	return (
		<div className={t.tenantPageWrapper}>
			<div className={t.identityWrapper}>
				<div className={t.identityText}>
					<div className={t.identityTitle}>Settings</div>
					<p className={t.identitySubtitle}>
						{info?.tenant?.name || tenantSubdomain || window.location.host}
						{hasDomains && <> · primary domain {info ? (info.primary || info.defaultDomain) : '…'}</>}
					</p>
				</div>
				<span className={t.identitySpacer} />
				<div className={t.statsStrip}>
					{hasDomains && (
						<div className={t.statItem}>
							<p className={t.statValue}>{info ? aliases.length + 1 : '–'}</p>
							<p className={t.statLabel}>domains</p>
						</div>
					)}
					{unverified > 0 && (
						<div className={t.statItem}>
							<p className={t.statValueWarn}>{unverified}</p>
							<p className={t.statLabel}>not verified</p>
						</div>
					)}
					<div className={t.statItem}>
						<p className={t.statValue}>{pgEnvs ? (pgEnvs.attached || []).length : '–'}</p>
						<p className={t.statLabel}>pgEnvs</p>
					</div>
				</div>
			</div>
			<div className={t.tenantSettingsStack}>
				{hasDomains && <DomainsCard tenant={tenantSubdomain} onChange={setInfo} />}
				<PgEnvsCard tenant={tenantSubdomain} onChange={setPgEnvs} />
			</div>
		</div>
	)
}
