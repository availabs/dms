import React from 'react'
import { Link, useNavigate, useNavigation } from 'react-router'
import { AdminContext } from "../context";
import { ThemeContext, getComponentTheme } from '../../../ui/useTheme';
import { siteCan, MANAGE_STORAGE } from '../../../utils/adminPermissions';
import { getInstance } from '../../../utils/type-utils';
import { storageTheme } from '../components/storage.theme';
import { StorageHeader, StorageUsage, CleanupRow, CleanupDialog } from '../components/storage';
import { useStoragePlan, expectFor, ownerKindsOf, kindLabel, fmtBytes, fmtNum, sum } from '../components/storageUtils';

const DEFAULT_ONLY = ['unlisted_children', 'dead_containers', 'unlisted_patterns'];
const BY_PATTERN_ROWS = 7;
const CHECKING = 'checking links…';

// /list/storage (design_system_v6/pages/admin-site-storage.html): what the whole site's rows take up, and
// cleaning up the rows nothing can reach. Pages whose pattern is gone and pattern rows no site lists have no
// pattern tab to show on, so they are cleaned up here; each pattern's own tab cleans up its own sections.
// Needs the site's manage-storage (dms-server routes/dms/storageHttp.js judges it again).
export default function SiteStorage({ item = {}, dataItems }) {
	const { baseUrl, authPath, app, user, authPermissions } = React.useContext(AdminContext) || {}
	const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {}
	const t = { ...storageTheme, ...getComponentTheme(themeFromContext, 'admin.storage') }
	const navigate = useNavigate()
	const { state: navState } = useNavigation()
	const hasAccess = siteCan(user, app, authPermissions, MANAGE_STORAGE)
	const { plan, error, loading, checkedAt, reload } = useStoragePlan({ ...React.useContext(AdminContext), parents: [], enabled: hasAccess, twoStep: true })
	const [job, setJob] = React.useState(null)
	const [allPatterns, setAllPatterns] = React.useState(false)

	if (!item.id && dataItems?.length > 0) item = dataItems[0]

	React.useEffect(() => {
		if (navState === 'loading') return
		if (!user?.authed) { navigate(`${authPath}/login`, { state: { from: `${baseUrl}/storage` } }); return }
		if (user?.isAuthenticating) return
		if (!hasAccess) navigate(baseUrl || '/')
	}, [navState, user?.authed, user?.isAuthenticating, JSON.stringify(user?.groups), hasAccess])

	if (!user?.authed || user?.isAuthenticating || !hasAccess) return null

	const header = (stats = []) => (
		<StorageHeader tag={app} checkedAt={checkedAt} loading={loading} onReload={reload} stats={stats} />
	)
	if (!plan) {
		return <div className={t.page}>{header()}<div className={t.body}>{error ? <p className={t.error}>{error}</p> : <div className={t.loading}>Checking this site's storage…</div>}</div></div>
	}

	// the quick plan (seconds) until the full one lands: pages and pattern rows are still being checked
	// for links from other rows, so what depends on that waits
	const pending = Boolean(plan.quick)
	const usage = plan.usage || []
	const groups = plan.groups || []
	const ownerKinds = ownerKindsOf(plan.childRefs)
	// the kind an owner's first list holds (the page pattern: page.sections → component)
	const sectionKind = Object.values(Object.values(plan.childRefs || {})[0] || {})[0]
	// Rows under a container no pattern row is any more are "pages with no pattern", whatever the plan's
	// category (a gone page's sections are planned as unlisted children once the page is planned).
	const liveInstances = new Set(usage.filter(u => u.kind === 'pattern' && u.instance).map(u => u.instance))
	const deadGroups = groups.filter(g => g.category === 'dead_containers' || (g.category === 'unlisted_children' && !liveInstances.has(g.parent)))
	const unusedGroups = groups.filter(g => g.category === 'unlisted_children' && liveInstances.has(g.parent))
	const patternGroups = groups.filter(g => g.category === 'unlisted_patterns')
	const deadParents = [...new Set(deadGroups.map(g => g.parent))]
	const unusedParents = [...new Set(unusedGroups.map(g => g.parent))]
	const totalBytes = sum(usage, 'bytes'), totalRows = sum(usage, 'rows')

	// the site's patterns, by instance name (the `parent` of their pages and sections)
	const patterns = (item.patterns || []).filter(p => p && p.id).map(p => ({ id: p.id, name: p.name || p.base_url || `#${p.id}`, instance: getInstance(p.type || '') }))
	const listedInstances = new Set(patterns.map(p => p.instance).filter(Boolean))

	const unusedKinds = [...new Set(unusedGroups.map(g => g.kind))]
	const unusedLabel = `Unused ${unusedKinds.length ? unusedKinds.map(k => kindLabel(k)).join(' and ') : 'sections'}`
	const deadOwners = deadGroups.filter(g => ownerKinds.includes(g.kind))
	const deadOthers = deadGroups.filter(g => !ownerKinds.includes(g.kind))
	const deadBytes = sum(deadGroups, 'bytes'), deadRows = sum(deadGroups, 'rows')
	const unusedBytes = sum(unusedGroups, 'bytes'), unusedRows = sum(unusedGroups, 'rows')
	const formerPatterns = Object.values(deadGroups.reduce((acc, g) => {
		const x = acc[g.parent] || (acc[g.parent] = { name: g.parent, pages: 0, rows: 0, bytes: 0 })
		if (ownerKinds.includes(g.kind)) x.pages += g.rows; else x.rows += g.rows
		x.bytes += g.bytes
		return acc
	}, {})).sort((a, b) => b.bytes - a.bytes)

	const cleanAll = () => setJob({
		title: 'Clean up site storage', facts: `${fmtNum(plan.total)} ${plan.total === 1 ? 'row' : 'rows'} · ${fmtBytes(plan.bytes)}`,
		parents: [], kinds: [], only: DEFAULT_ONLY, expect: expectFor(app, groups, DEFAULT_ONLY),
	})
	const cleanOne = (title, gs, only, facts, parents = []) => setJob({ title, facts, parents, kinds: [], only, expect: expectFor(app, gs, only) })
	const deadFacts = [
		deadOwners.length ? `${fmtNum(sum(deadOwners, 'rows'))} ${kindLabel(deadOwners[0].kind, sum(deadOwners, 'rows'))}` : '',
		deadOthers.length ? `${fmtNum(sum(deadOthers, 'rows'))} ${deadOthers.length === 1 ? kindLabel(deadOthers[0].kind, deadOthers[0].rows) : 'other rows'}` : '',
		fmtBytes(deadBytes),
	].filter(Boolean).join(' · ')
	const duplicates = patternGroups.filter(g => g.reason === 'duplicate')
	const copiesNote = [
		duplicates.length ? `${duplicates.map(g => g.instance).join(', ')} ${duplicates.length === 1 ? 'is' : 'are'} saved more than once. The site uses the other copy.` : '',
		patternGroups.length > duplicates.length ? 'No site lists the others.' : '',
	].filter(Boolean).join(' ')

	// held: other kinds, kept until someone chooses (orphanSweep.js `other_kinds`)
	const held = plan.held || []
	const heldPatterns = held.filter(h => h.holds > 0)
	const heldRows = held.filter(h => !(h.holds > 0))
	const heldPatternFacts = heldPatterns.length
		? `${fmtNum(sum(heldPatterns, 'holds'))} ${heldPatterns[0].reason.replace(/^holds \d+ /, '').replace(/ row\(s\)$/, '')} rows · ${fmtNum(sum(heldPatterns, 'rows'))} ${kindLabel('pattern', sum(heldPatterns, 'rows'))}`
		: ''
	const heldRowFacts = `${fmtNum(sum(heldRows, 'rows'))} ${heldRows.length === 1 ? kindLabel(heldRows[0]?.kind, heldRows[0]?.rows) : 'rows'}`

	// by pattern: the listed patterns' rows, and their unused ones
	const byPattern = patterns.map(p => {
		const u = usage.filter(x => x.parent === p.instance)
		const un = unusedGroups.filter(g => g.parent === p.instance)
		return {
			...p,
			pages: sum(u.filter(x => ownerKinds.includes(x.kind)), 'rows'),
			sections: sum(u.filter(x => x.kind === sectionKind), 'rows'),
			bytes: sum(u, 'bytes'), unusedRows: sum(un, 'rows'), unusedBytes: sum(un, 'bytes'),
		}
	}).filter(p => p.bytes > 0).sort((a, b) => b.unusedBytes - a.unusedBytes || b.bytes - a.bytes)
	const shownPatterns = allPatterns ? byPattern : byPattern.slice(0, BY_PATTERN_ROWS)

	return (
		<div className={t.page}>
			{header([
				{ value: fmtBytes(totalBytes), label: 'all rows' },
				{ value: pending ? '…' : fmtBytes(plan.bytes), label: 'unused', warn: !pending && plan.bytes > 0 },
				{ value: pending ? '…' : fmtNum(plan.total), label: 'rows to clean up' },
			])}
			<div className={t.body}>
				{error ? <p className={t.error}>{error}</p> : null}
				<StorageUsage countLabel="rows" rows={[
					{ label: 'In use', note: `${patterns.length} ${kindLabel('pattern', patterns.length)}`, count: totalRows - unusedRows - deadRows - sum(patternGroups, 'rows'), bytes: totalBytes - plan.bytes, tone: 'cobalt' },
					{ label: unusedLabel, note: 'no page lists them', count: unusedRows, bytes: unusedBytes, tone: 'brick' },
					{ label: 'Pages with no pattern', note: pending ? CHECKING : 'pages and their sections', count: deadRows, bytes: deadBytes, tone: 'amber' },
				]} />

				<div className={t.section}>
					<div className={t.sectionTitleRow}>
						<h2 className={t.sectionTitle}>Clean up</h2>
						<span className={t.spacer} />
						{plan.total && !pending ? <CleanAllButton onClick={cleanAll} /> : null}
					</div>
					<div className={t.card}>
						<CleanupRow title="Pages with no pattern" facts={pending ? '' : deadRows ? deadFacts : '0'} pending={pending ? CHECKING : null}
							note="Their pattern was deleted or renamed. Nothing links to them."
							onClean={deadRows ? () => cleanOne('Clean up pages with no pattern', deadGroups, ['dead_containers', 'unlisted_children'], deadFacts, deadParents) : null}>
							{formerPatterns.length && !pending ? (
								<details className={t.details}>
									<summary className={t.detailsSummary}>{formerPatterns.length} former {kindLabel('pattern', formerPatterns.length)}</summary>
									<div className={t.detailsTable}>
										<table className={t.table}>
											<thead className={t.thead}><tr><th className={t.th}>name</th><th className={t.thRight}>pages</th><th className={t.thRight}>other rows</th><th className={t.thRight}>size</th></tr></thead>
											<tbody>
												{formerPatterns.map(p => (
													<tr key={p.name} className={t.tr}><td className={t.td}>{p.name}</td><td className={t.tdRight}>{fmtNum(p.pages)}</td><td className={t.tdRight}>{fmtNum(p.rows)}</td><td className={t.tdRight}>{fmtBytes(p.bytes)}</td></tr>
												))}
											</tbody>
										</table>
									</div>
								</details>
							) : null}
						</CleanupRow>
						<CleanupRow title={unusedLabel} facts={unusedRows ? `${fmtNum(unusedRows)} · ${fmtBytes(unusedBytes)}` : '0'}
							note={unusedRows ? `In ${unusedParents.length} ${kindLabel('pattern', unusedParents.length)}. Each pattern can also clean up its own.` : 'Sections no page lists.'}
							onClean={unusedRows ? () => cleanOne(`Clean up ${unusedLabel.toLowerCase()}`, unusedGroups, ['unlisted_children'], `${fmtNum(unusedRows)} rows · ${fmtBytes(unusedBytes)}`, unusedParents) : null} />
						<CleanupRow title="Extra pattern copies" facts={pending ? '' : fmtNum(sum(patternGroups, 'rows'))} pending={pending ? CHECKING : null}
							note={copiesNote || 'Pattern rows no site lists.'}
							onClean={patternGroups.length ? () => cleanOne('Clean up extra pattern copies', patternGroups, ['unlisted_patterns'], `${fmtNum(sum(patternGroups, 'rows'))} ${kindLabel('pattern', sum(patternGroups, 'rows'))}`) : null} />
						<div className={t.cleanFooter}>
							<span className={t.cleanFooterText}>Kept: {pending ? CHECKING : `${fmtNum(plan.blockedCount || 0)} still linked from another row`} · {fmtNum(plan.recentKept || 0)} changed in the last {plan.minAgeHours ?? 24} h</span>
						</div>
					</div>
				</div>

				{held.length && !pending ? (
					<div className={t.section}>
						<h2 className={t.sectionTitlePad}>Kept until you choose</h2>
						<p className={t.sectionNote}>Not in Clean up all. Like sources, these can be worth keeping when nothing uses them.</p>
						<div className={t.card}>
							{heldPatterns.length ? (
								<CleanupRow title="Rows in unused patterns" facts={heldPatternFacts} quiet buttonLabel="Delete them"
									note={`No site lists their patterns: ${[...new Set(heldPatterns.map(h => h.instance))].join(', ')}. Open a pattern to look at its rows first.`}
									onClean={() => setJob({ title: 'Delete rows in unused patterns', facts: `${heldPatternFacts.split(' · ')[0]} and the ${sum(heldPatterns, 'rows') === 1 ? 'pattern that holds' : `${fmtNum(sum(heldPatterns, 'rows'))} patterns that hold`} them.`,
										verb: 'Delete them', confirmVerb: 'Confirm delete', parents: [...new Set(heldPatterns.map(h => h.instance))], kinds: [], only: ['other_kinds'],
										expect: { [app]: { other_kinds: sum(heldPatterns, 'rows') + sum(heldPatterns, 'holds') } } })} />
							) : null}
							{heldRows.length ? (
								<CleanupRow title="Other rows with no pattern" facts={heldRowFacts} quiet buttonLabel="Delete rows"
									note="Not page content, under a pattern that is gone."
									onClean={() => setJob({ title: 'Delete other rows', facts: `${heldRowFacts} with no pattern`, verb: 'Delete rows', confirmVerb: 'Confirm delete',
										parents: [...new Set(heldRows.map(h => h.parent))], kinds: [...new Set(heldRows.map(h => h.kind))], only: ['other_kinds'],
										expect: { [app]: { other_kinds: sum(heldRows, 'rows') } } })} />
							) : null}
						</div>
					</div>
				) : null}

				{byPattern.length ? (
					<div className={t.section}>
						<h2 className={t.sectionTitlePad}>By pattern</h2>
						<div className={t.cardScroll}>
							<table className={t.tableWide}>
								<thead className={t.thead}><tr>
									<th className={t.th}>pattern</th><th className={t.thRight}>pages</th><th className={t.thRight}>sections</th>
									<th className={t.thRight}>size</th><th className={t.thRight}>unused</th>
								</tr></thead>
								<tbody>
									{shownPatterns.map(p => (
										<tr key={p.id} className={t.trHover}>
											<td className={t.tdName}><Link to={`${baseUrl}/manage_pattern/${p.id}/storage`} className={t.patternLink}>{p.name}</Link></td>
											<td className={t.tdRight}>{fmtNum(p.pages)}</td><td className={t.tdRight}>{fmtNum(p.sections)}</td>
											<td className={t.tdRight}>{fmtBytes(p.bytes)}</td>
											<td className={p.unusedRows ? t.tdWarn : t.tdRight}>{p.unusedRows ? `${fmtNum(p.unusedRows)} · ${fmtBytes(p.unusedBytes)}` : '0'}</td>
										</tr>
									))}
									{byPattern.length > BY_PATTERN_ROWS ? (
										<tr className={t.tr}><td colSpan={5} className={t.tdMore}>
											<MoreToggle open={allPatterns} onClick={() => setAllPatterns(v => !v)} more={byPattern.length - BY_PATTERN_ROWS} />
										</td></tr>
									) : null}
								</tbody>
							</table>
						</div>
					</div>
				) : null}
			</div>
			<CleanupDialog job={job} onClose={() => setJob(null)} onDone={reload} />
		</div>
	)
}

function CleanAllButton({ onClick }) {
	const { UI } = React.useContext(ThemeContext) || {}
	return <UI.Button activeStyle="dangerSolid" onClick={onClick}>Clean up all</UI.Button>
}

function MoreToggle({ open, onClick, more }) {
	const { UI } = React.useContext(ThemeContext) || {}
	return <UI.Button activeStyle="linkMeta" onClick={onClick}>{open ? 'Show fewer' : `${more} more · sorted by unused size`}</UI.Button>
}
