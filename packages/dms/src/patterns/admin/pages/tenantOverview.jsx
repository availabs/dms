import React from 'react'
import { Link, useNavigate, useNavigation } from 'react-router'
import { AdminContext } from "../context";
import { ThemeContext } from '../../../ui/useTheme';
import { siteCan, MANAGE_TENANTS } from '../../../utils/adminPermissions';
import { editSiteTheme } from './editSite.theme'
import { DomainsCard } from '../components/domainsCard'

// /list/tenants/:tenantId on the platform root of the tenant hub
// (design_system_v6/pages/admin-tenant-overview.html): one tenant, opened from its name on the
// Tenants page. Loads the site row ("edit", as TenantsPage) for its `tenants` list. So far: the
// header and the domains card (components/domainsCard.jsx). Still to port from the mockup: name
// editing, the pattern-subdomains card, the danger zone (tenant-external-domains.md, Phase B).
// `params` comes from the DMS manager's own path match (dms-manager), not react-router's useParams.
export default function TenantOverviewPage({ item = {}, dataItems, params = {} }) {
	const { baseUrl, authPath, app, user, authPermissions, isMultiTenant, subdomain, tenantSubdomain = subdomain } = React.useContext(AdminContext) || {}
	const { theme } = React.useContext(ThemeContext) || {}
	const t = { ...editSiteTheme, ...(theme?.admin?.editSite || {}) }
	const navigate = useNavigate()
	const { state: navState } = useNavigation()
	const { tenantId } = params
	const [info, setInfo] = React.useState(null)

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

	return (
		<div className={t.tenantPageWrapper}>
			<div className={t.identityWrapper}>
				<div className={t.identityText}>
					<div className={t.identityTitle}>{tenant.name || tenant.subdomain}</div>
					<p className={t.identitySubtitle}>
						{tenant.subdomain} · primary domain {info ? (info.primary || info.defaultDomain) : '…'} · id {tenant.id}
					</p>
				</div>
				<span className={t.identitySpacer} />
				<div className={t.statsStrip}>
					<div className={t.statItem}>
						<p className={t.statValue}>{info ? (info.aliases || []).length + 1 : '–'}</p>
						<p className={t.statLabel}>domains</p>
					</div>
				</div>
			</div>
			<DomainsCard tenant={tenant.subdomain} onChange={setInfo} />
		</div>
	)
}
