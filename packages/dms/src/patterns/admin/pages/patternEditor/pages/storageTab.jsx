import React, { useContext } from 'react';
import { Link } from 'react-router';
import { AdminContext } from '../../../context';
import { ThemeContext, getComponentTheme } from '../../../../../ui/useTheme';
import { getInstance } from '../../../../../utils/type-utils';
import { siteCan, MANAGE_STORAGE } from '../../../../../utils/adminPermissions';
import { storageTheme } from '../../../components/storage.theme';
import { StorageHeader, StorageUsage, CleanupRow, CleanupDialog } from '../../../components/storage';
import { useStoragePlan, expectFor, childKindsOf, ownerKindsOf, kindLabel, capitalize, fmtBytes, fmtNum, sum } from '../../../components/storageUtils';

const TONES = ['cobalt', 'ink', 'graphite', 'amber', 'pencil'];
const ONLY = ['unlisted_children'];
// what each declared child kind is left behind by (the page pattern's; any other kind gets none)
const LEFT_BY = { component: 'Left by publishing, discarding and removing sections.', 'page-edit': 'History no page points to.' };

// The pattern's Storage tab (design_system_v6/pages/admin-pattern-storage.html): what this pattern's rows
// take up, and cleaning up its unused ones (rows of a declared child kind no page lists). The site's
// Storage page has the rest. Shown to holders of the site's manage-storage (patternEditor/index.jsx).
export function StorageTab({ value }) {
    const ctx = useContext(AdminContext) || {};
    const { app, parentBaseUrl, user, authPermissions } = ctx;
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...storageTheme, ...getComponentTheme(themeFromContext, 'admin.storage') };
    const instance = getInstance(value?.type || '');
    const parents = React.useMemo(() => (instance ? [instance] : []), [instance]);
    // only what this tab cleans up: no page or pattern row is in it, so the plan needs no database-wide search
    const { plan, error, loading, checkedAt, reload } = useStoragePlan({ ...ctx, parents, only: ONLY, enabled: siteCan(user, app, authPermissions, MANAGE_STORAGE) });
    const [job, setJob] = React.useState(null);

    const header = (stats = []) => (
        <StorageHeader tag={value?.name || instance} checkedAt={checkedAt} loading={loading} onReload={reload} stats={stats} />
    );
    if (!plan) {
        return <div className={t.page}>{header()}<div className={t.body}>{error ? <p className={t.error}>{error}</p> : <div className={t.loading}>Checking this pattern's storage…</div>}</div></div>;
    }

    const usage = (plan.usage || []).filter(u => u.parent === instance);
    const unused = (plan.groups || []).filter(g => g.category === 'unlisted_children' && g.parent === instance);
    const ownerKinds = ownerKindsOf(plan.childRefs);
    const childKinds = childKindsOf(plan.childRefs);
    const totalBytes = sum(usage, 'bytes');
    const kinds = [...new Set(usage.map(u => u.kind))]
        .sort((a, b) => (childKinds.indexOf(a) + 1 || 99) - (childKinds.indexOf(b) + 1 || 99) || (ownerKinds.includes(a) ? -1 : 1));
    // every declared child kind gets a clean-up row, with or without rows to clean
    const cleanKinds = [...new Set([...childKinds, ...unused.map(g => g.kind)])];
    const unusedOf = (k) => unused.filter(g => g.kind === k);
    const pages = sum(usage.filter(u => ownerKinds.includes(u.kind)), 'rows');

    const rows = [
        ...kinds.map((k, i) => {
            const all = usage.filter(u => u.kind === k);
            const un = unusedOf(k);
            return { label: capitalize(kindLabel(k)), count: sum(all, 'rows') - sum(un, 'rows'), bytes: sum(all, 'bytes') - sum(un, 'bytes'), tone: TONES[i % TONES.length] };
        }),
        ...cleanKinds.filter(k => unusedOf(k).length).map(k => ({
            label: `Unused ${kindLabel(k)}`, note: 'no page lists them', count: sum(unusedOf(k), 'rows'), bytes: sum(unusedOf(k), 'bytes'), tone: 'brick',
        })),
    ];

    const clean = (k) => {
        const gs = unusedOf(k);
        setJob({
            title: `Clean up unused ${kindLabel(k)}`, facts: `${fmtNum(sum(gs, 'rows'))} ${kindLabel(k, sum(gs, 'rows'))} · ${fmtBytes(sum(gs, 'bytes'))}`,
            parents, kinds: [k], only: ['unlisted_children'], expect: expectFor(app, gs, ['unlisted_children']),
        });
    };

    return (
        <div className={t.page}>
            {header([
                { value: fmtBytes(totalBytes), label: 'in this pattern' },
                { value: fmtBytes(sum(unused, 'bytes')), label: 'unused', warn: unused.length > 0 },
                { value: fmtNum(pages), label: kindLabel(ownerKinds[0] || 'page', pages) },
            ])}
            <div className={t.body}>
                {error ? <p className={t.error}>{error}</p> : null}
                <StorageUsage rows={rows} />
                <div className={t.section}>
                    <h2 className={t.sectionTitlePad}>Clean up</h2>
                    <div className={t.card}>
                        {cleanKinds.map(k => {
                            const gs = unusedOf(k);
                            const n = sum(gs, 'rows');
                            return (
                                <CleanupRow key={k} title={`Unused ${kindLabel(k)}`} facts={n ? `${fmtNum(n)} · ${fmtBytes(sum(gs, 'bytes'))}` : '0'}
                                    note={LEFT_BY[k]} onClean={n ? () => clean(k) : null} />
                            );
                        })}
                        <div className={t.cleanFooter}>
                            <span className={t.cleanFooterText}>Kept: {fmtNum(plan.recentKept || 0)} changed in the last {plan.minAgeHours ?? 24} h</span>
                            <span className={t.spacer} />
                            <Link to={`${parentBaseUrl}/storage`} className={t.cleanFooterLink}>site storage</Link>
                        </div>
                    </div>
                </div>
            </div>
            <CleanupDialog job={job} onClose={() => setJob(null)} onDone={reload} />
        </div>
    );
}
