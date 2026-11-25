import React from 'react'
import { AdminContext } from "../../context";
import { ThemeContext } from '../../../../ui/useTheme';
import { siteCan, MANAGE_DOMAINS, MANAGE_TENANTS, MANAGE_THEMES } from '../../../../utils/adminPermissions';
import { getRootDomain } from '../../../../utils/hostResolver';
import { editSiteTheme } from '../editSite.theme'
import { DomainsCard } from '../../components/domainsCard'
import { PgEnvsCard } from '../../components/pgEnvsCard'
import { AppSettingsCard } from '../../components/appSettingsCard'

// Settings → Overview (settingsRegistry.js): one card per setting, stacked. Domains
// (design_system_v6/pages/admin-site-domains.html; a tenant of a hub with a root domain only), data environments,
// the pgEnvs the app is attached to (pgenv-config-on-the-site-row.md), and the app and its icon
// (site-app-settings-pwa.md). On the app's own Settings each card shows for the verb its routes judge
// (manage-domains, manage-domains, manage-themes; the hub's staff, all three); on the hub's tenant page, for hub
// staff, all of them. Was pages/siteSettings.jsx and pages/tenantOverview.jsx, each assembling the same cards.
export default function SettingsOverview({ target = {}, onSummary }) {
	const { app, user, authPermissions, isMultiTenant, tenantSubdomain } = React.useContext(AdminContext) || {}
	const { theme } = React.useContext(ThemeContext) || {}
	const t = { ...editSiteTheme, ...(theme?.admin?.editSite || {}) }
	const [info, setInfo] = React.useState(null)
	const [pgEnvs, setPgEnvs] = React.useState(null)

	const staff = Boolean(isMultiTenant) && !tenantSubdomain && siteCan(user, app, authPermissions, MANAGE_TENANTS)
	const may = (verb) => !target.own || staff || siteCan(user, app, authPermissions, verb)
	const hasDomains = Boolean(target.tenant) && (!target.own || Boolean(getRootDomain())) && may(MANAGE_DOMAINS)
	const hasPgEnvs = may(MANAGE_DOMAINS)
	const hasAppSettings = may(MANAGE_THEMES)

	// the counts go in the Settings header (pages/settingsPages.jsx), as they did on the two old pages
	const aliases = info?.aliases || []
	const unverified = aliases.filter(a => a.status !== 'verified').length
	React.useEffect(() => {
		onSummary?.({
			primary: info ? (info.primary || info.defaultDomain) : null,
			tenantName: info?.tenant?.name,
			stats: [
				...(hasDomains ? [{ label: 'domains', value: info ? aliases.length + 1 : null }] : []),
				...(hasDomains && unverified > 0 ? [{ label: 'not verified', value: unverified, warn: true }] : []),
				...(hasPgEnvs ? [{ label: 'pgEnvs', value: pgEnvs ? (pgEnvs.attached || []).length : null }] : []),
			],
		})
	}, [info, pgEnvs, hasDomains, hasPgEnvs])

	return (
		<div className={t.tenantSettingsStack}>
			{hasDomains && <DomainsCard tenant={target.tenant} onChange={setInfo} />}
			{hasPgEnvs && <PgEnvsCard apiBase={target.apiBase} onChange={setPgEnvs} />}
			{hasAppSettings && <AppSettingsCard apiBase={target.apiBase} />}
		</div>
	)
}
