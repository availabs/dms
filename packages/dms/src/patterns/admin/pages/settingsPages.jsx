import React from 'react'
import { Link, Navigate } from 'react-router'
import { ThemeContext, getComponentTheme } from '../../../ui/useTheme';
import { editSiteTheme } from './editSite.theme'
import { settingsPagesTheme } from './settingsPages.theme'

// An app's Settings: its header, then the open sub page (app-settings-pages.md). The same component on an app's own
// Settings (pages/siteSettings.jsx, whose sub pages the sidenav lists) and on the hub's page for one tenant
// (pages/tenantOverview.jsx, `showNav`: a strip of the sub pages under the header). The wrappers work out the pages
// (settingsRegistry.js settingsPagesFor) and what the header says; a sub page can add to the header through
// `onSummary` ({ primary, tenantName, stats: [{ label, value, warn }] }), as Overview does with its counts.
// No sub page in the URL goes to the first one the user can use (so the sidenav and the breadcrumb name it); one they
// can't use says so, as the Pattern Editor's tabs do.
export default function SettingsPages({ pages = [], allowed = [], sub, linkBase, showNav = false, title, subtitle, target, item }) {
	const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {}
	const h = { ...editSiteTheme, ...(themeFromContext?.admin?.editSite || {}) }
	const t = { ...settingsPagesTheme, ...getComponentTheme(themeFromContext, 'admin.settingsPages') }
	const [summary, setSummary] = React.useState({})

	const requested = sub ? pages.find(p => p.path === sub) : allowed[0]
	const denied = Boolean(requested) && !allowed.includes(requested)
	const Page = requested?.component
	// a page's counts show while it is open; the names it reported stay
	const stats = summary.statsOf === requested?.path ? (summary.stats || []) : []

	if (!sub && requested) return <Navigate to={`${linkBase}/${requested.path}`} replace />

	return (
		<div className={h.tenantPageWrapper}>
			{(showNav || !requested?.ownHeader || denied) && (
				<div className={h.identityWrapper}>
					<div className={h.identityText}>
						<div className={h.identityTitle}>{title}</div>
						<p className={h.identitySubtitle}>{typeof subtitle === 'function' ? subtitle(summary) : subtitle}</p>
					</div>
					<span className={h.identitySpacer} />
					{stats.length > 0 && !requested?.ownHeader && (
						<div className={h.statsStrip}>
							{stats.map(s => (
								<div key={s.label} className={h.statItem}>
									<p className={s.warn ? h.statValueWarn : h.statValue}>{s.value ?? '–'}</p>
									<p className={h.statLabel}>{s.label}</p>
								</div>
							))}
						</div>
					)}
				</div>
			)}
			{showNav && allowed.length > 1 && (
				<nav className={t.tabs}>
					{allowed.map(p => (
						<Link key={p.path} to={`${linkBase}/${p.path}`} className={p === requested ? t.tabActive : t.tab}>{p.name}</Link>
					))}
				</nav>
			)}
			{!requested ? (
				<div className={t.noAccess}>{sub ? `There is no settings page "${sub}".` : 'You do not have permission to change any of these settings.'}</div>
			) : denied ? (
				<div className={t.noAccess}>You do not have permission to use this page.</div>
			) : (
				// keyed by the app and the page: a sub page seeds its state from what it loads once
				<Page key={`${target?.apiBase}|${requested.path}`} target={target} item={item} onSummary={(s) => setSummary(prev => ({ ...prev, ...s, statsOf: requested.path }))} />
			)}
		</div>
	)
}
