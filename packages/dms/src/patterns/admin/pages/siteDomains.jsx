import React from 'react'
import { useNavigate } from 'react-router'
import { AdminContext } from "../context";
import { ThemeContext } from '../../../ui/useTheme';
import { siteCan, MANAGE_DOMAINS } from '../../../utils/adminPermissions';
import { editSiteTheme } from './editSite.theme'
import { DomainsCard } from '../components/domainsCard'

// /list/domains on a TENANT host of the tenant hub (design_system_v6/pages/admin-site-domains.html):
// the tenant's own admins manage its domain aliases here. Only on a tenant host of a multi-tenant
// site (`tenantSubdomain` set) and for a user with manage-domains on this site; the server's
// /domains routes judge the same verb again before they write the hub's tenant row.
export default function SiteDomainsPage() {
	const { baseUrl, authPath, app, user, authPermissions, isMultiTenant, tenantSubdomain } = React.useContext(AdminContext) || {}
	const { theme } = React.useContext(ThemeContext) || {}
	const t = { ...editSiteTheme, ...(theme?.admin?.editSite || {}) }
	const navigate = useNavigate()
	const [info, setInfo] = React.useState(null)

	const hasAccess = Boolean(isMultiTenant) && Boolean(tenantSubdomain) && siteCan(user, app, authPermissions, MANAGE_DOMAINS)

	React.useEffect(() => {
		if (!user?.authed) {
			navigate(`${authPath}/login`, { state: { from: `${baseUrl}/domains` } })
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
					<div className={t.identityTitle}>Domains</div>
					<p className={t.identitySubtitle}>
						{info?.tenant?.name || tenantSubdomain} · primary domain {info ? (info.primary || info.defaultDomain) : '…'}
					</p>
				</div>
				<span className={t.identitySpacer} />
				<div className={t.statsStrip}>
					<div className={t.statItem}>
						<p className={t.statValue}>{info ? aliases.length + 1 : '–'}</p>
						<p className={t.statLabel}>domains</p>
					</div>
					{unverified > 0 && (
						<div className={t.statItem}>
							<p className={t.statValueWarn}>{unverified}</p>
							<p className={t.statLabel}>not verified</p>
						</div>
					)}
				</div>
			</div>
			<DomainsCard tenant={tenantSubdomain} onChange={setInfo} />
		</div>
	)
}
