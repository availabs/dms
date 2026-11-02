import React, { useEffect, useRef } from "react";
import { ThemeContext } from "../../../ui/useTheme";
import { AuthContext } from "../context";
import { authedFetch } from "../../../utils/authedFetch";
import { useManagePageGate } from "./useManagePageGate";

// Access log (task permissions-access-log, mockup design_system_v6/pages/admin-access-log.html, confirmed
// 2026-11-02): the requests the permission guards refused (`refused`, under enforce) or would refuse
// (`would-deny`, under log), one row per distinct refusal with a count. Read from dms-server's
// GET /dms-admin/:app/access-log, which allows `${app} Admin` and AVAIL only; this page shows itself to
// the same people (useManagePageGate with no permission).

const PAGE_SIZE = 100;
const DAY = 24 * 60 * 60 * 1000;
const OUTCOMES = [
    { label: 'all', value: 'all' },
    { label: 'would deny', value: 'would-deny' },
    { label: 'refused', value: 'refused' },
];
const GUARDS = [
    { label: 'all', value: 'all' },
    { label: 'data (rows, pages, patterns)', value: 'data' },
    { label: 'source (datasets writes)', value: 'source' },
    { label: 'read (datasets reads)', value: 'read' },
    { label: 'upload', value: 'upload' },
    { label: 'file', value: 'file' },
    { label: 'auth (users and groups)', value: 'auth' },
];
const SINCE = [
    { label: '90 days', value: '90' },
    { label: '30 days', value: '30' },
    { label: '7 days', value: '7' },
    { label: 'today', value: '0' },
];
const sinceIso = (days) => {
    if (days === '0') { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }
    return new Date(Date.now() - (+days || 90) * DAY).toISOString();
};
const when = (v) => {
    const d = new Date(v);
    return isNaN(d) ? String(v || '') : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const day = (v) => {
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const BLANK_ROW = /blank (auth )?row/;

export default function AuthAccessLog({ app, API_HOST }) {
    const { theme, UI } = React.useContext(ThemeContext);
    const { user } = React.useContext(AuthContext);
    const { Table, Input, Select, Button, Icon, Pill } = UI;
    const canView = useManagePageGate(null);
    const gridRef = useRef(null);
    const [filters, setFilters] = React.useState({ outcome: 'all', guard: 'all', user: '', target: '', since: '90' });
    const [offset, setOffset] = React.useState(0);
    const [result, setResult] = React.useState(null);
    const [error, setError] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [reload, setReload] = React.useState(0);
    const m = {
        headerRow: "w-full flex justify-between",
        headerTitle: "text-2xl font-semibold",
        headerSubtitle: "text-sm",
        headerStats: "flex items-stretch gap-3",
        headerStatsItem: "",
        headerStatsValue: "text-xl font-semibold",
        headerStatsLabel: "text-xs",
        pageWrapper: "flex flex-col gap-3",
        notice: "",
        metaText: "text-sm",
        accessLogFilters: "flex flex-wrap items-end gap-3 mb-3",
        accessLogFilter: "flex flex-col gap-1",
        accessLogFilterLabel: "text-xs",
        accessLogCellStack: "flex flex-col min-w-0",
        accessLogPrimary: "text-sm truncate",
        accessLogLabel: "text-xs",
        accessLogTarget: "text-xs truncate",
        accessLogGroups: "flex flex-wrap gap-1 mt-0.5",
        accessLogReason: "text-sm flex flex-wrap items-center gap-1.5",
        accessLogTimes: "tabular-nums text-right",
        accessLogPager: "flex items-center gap-2 px-3 py-2",
        accessLogNote: "text-xs mt-3",
        accessLogEmpty: "p-6 text-center",
        accessLogError: "",
        ...(theme?.auth?.authPages?.manage || {}),
    };

    // Text filters wait for typing to pause; the selects apply at once.
    const [query, setQuery] = React.useState(filters);
    useEffect(() => {
        const id = setTimeout(() => setQuery(filters), filters.user !== query.user || filters.target !== query.target ? 350 : 0);
        return () => clearTimeout(id);
    }, [filters]);
    useEffect(() => { setOffset(0); }, [query]);

    useEffect(() => {
        if (!canView || !app) return;
        let live = true;
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), since: sinceIso(query.since) });
        // `all` is the selects' no-filter value (an empty one would show the Select's placeholder)
        for (const k of ['outcome', 'guard', 'user', 'target']) if (query[k] && query[k] !== 'all') params.set(k, query[k].trim());
        setLoading(true);
        authedFetch(`${API_HOST}/dms-admin/${encodeURIComponent(app)}/access-log?${params}`, { user })
            .then(async res => {
                if (res.status === 404) throw new Error("This server doesn't keep an access log yet.");
                const body = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(body.error || `The server answered ${res.status}.`);
                return body;
            })
            .then(body => { if (live) { setResult(body); setError(''); } })
            .catch(e => { if (live) setError(e.message || 'Cannot reach the server.'); })
            .finally(() => { if (live) setLoading(false); });
        return () => { live = false; };
    }, [canView, app, API_HOST, query, offset, reload]);

    const set = (key) => (v) => setFilters(f => ({ ...f, [key]: v?.target ? v.target.value : (v ?? '') }));
    const rows = result?.rows || [];
    const total = result?.total || 0;
    const summary = result?.summary || { wouldDeny: 0, refused: 0, users: 0 };

    const columns = [
        { name: 'last_seen', display_name: 'last seen', show: true, type: 'ui',
            Comp: d => <div className={d.className}><div className={m.accessLogCellStack}>
                <p className={m.accessLogPrimary}>{when(d.row.last_seen)}</p>
                <p className={m.accessLogLabel}>first {day(d.row.first_seen)}</p>
            </div></div> },
        { name: 'outcome', display_name: 'outcome', show: true, type: 'ui',
            Comp: d => <div className={d.className}>
                <Pill activeStyle={d.row.outcome === 'refused' ? 'status_brick' : 'status_amber'}
                      text={d.row.outcome === 'refused' ? 'refused' : 'would deny'} />
            </div> },
        { name: 'guard', display_name: 'guard', show: true, type: 'text' },
        { name: 'what', display_name: 'what · permission', show: true, type: 'ui',
            Comp: d => <div className={d.className}><div className={m.accessLogCellStack}>
                <p className={m.accessLogLabel}>{[d.row.kind, d.row.perms].filter(Boolean).join(' · ')}</p>
                <p className={m.accessLogTarget} title={d.row.target}>{d.row.target}</p>
            </div></div> },
        { name: 'who', display_name: 'who', show: true, type: 'ui',
            Comp: d => <div className={d.className}><div className={m.accessLogCellStack}>
                <p className={m.accessLogPrimary}>{d.row.principal === 'anon' ? '(anonymous)' : (d.row.user_email || `user ${d.row.principal}`)}</p>
                <div className={m.accessLogGroups}>
                    {String(d.row.groups || '').split('|').filter(g => g && g !== 'public').map(g =>
                        <Pill key={g} activeStyle='marker' text={g} />)}
                </div>
            </div></div> },
        { name: 'reason', display_name: 'reason', show: true, type: 'ui',
            Comp: d => <div className={d.className}><div className={m.accessLogReason}>
                <span>{String(d.row.reason || '').split(';')[0]}</span>
                {BLANK_ROW.test(d.row.reason || '') &&
                    <span title="refused only by the 2026-10-29 rule: a row with no grants is read-only">
                        <Pill activeStyle='marker' text='blank row' />
                    </span>}
            </div></div> },
        { name: 'count', display_name: 'times', show: true, type: 'ui',
            Comp: d => <div className={d.className}><div className={m.accessLogTimes}>{d.row.count}</div></div> },
    ];

    if (!user?.authed) return <div className={m.notice}>To access this page, you need to login.</div>;
    if (!canView) return null;

    const since = SINCE.find(s => s.value === filters.since)?.label || '90 days';
    return (
        <>
            <div className={m.headerRow}>
                <div className="min-w-0">
                    <div className={m.headerTitle}>Access log</div>
                    <p className={m.headerSubtitle}>requests the permission rules refused, or would refuse once enforced · {since === 'today' ? 'today' : `last ${since}`}</p>
                </div>
                <span className="flex-1" />
                <div className={m.headerStats}>
                    <div className={m.headerStatsItem}>
                        <p className={m.headerStatsValue}>{summary.wouldDeny}</p>
                        <p className={m.headerStatsLabel}>would deny</p>
                    </div>
                    <div className={m.headerStatsItem}>
                        <p className={m.headerStatsValue}>{summary.refused}</p>
                        <p className={m.headerStatsLabel}>refused</p>
                    </div>
                    <div className={m.headerStatsItem}>
                        <p className={m.headerStatsValue}>{summary.users}</p>
                        <p className={m.headerStatsLabel}>users</p>
                    </div>
                </div>
                <Button activeStyle='action' disabled={loading} onClick={() => setReload(n => n + 1)}>
                    <Icon icon='Refresh' /> refresh
                </Button>
            </div>

            <div className={m.accessLogFilters}>
                <label className={m.accessLogFilter}><span className={m.accessLogFilterLabel}>outcome</span>
                    <Select value={filters.outcome} options={OUTCOMES} onChange={set('outcome')} /></label>
                <label className={m.accessLogFilter}><span className={m.accessLogFilterLabel}>guard</span>
                    <Select value={filters.guard} options={GUARDS} onChange={set('guard')} /></label>
                <label className={m.accessLogFilter}><span className={m.accessLogFilterLabel}>user</span>
                    <Input value={filters.user} onChange={set('user')} placeholder='email or id…' /></label>
                <label className={m.accessLogFilter}><span className={m.accessLogFilterLabel}>target</span>
                    <Input value={filters.target} onChange={set('target')} placeholder='row id, source, route…' /></label>
                <label className={m.accessLogFilter}><span className={m.accessLogFilterLabel}>since</span>
                    <Select value={filters.since} options={SINCE} onChange={set('since')} /></label>
            </div>

            {error ? <div className={m.accessLogError}>{error}</div> : (
                <div className={m.pageWrapper}>
                    {result && !rows.length ? (
                        <div className={m.accessLogEmpty}>Nothing refused for these filters.</div>
                    ) : (
                        <Table gridRef={gridRef} data={rows} columns={columns} allowEdit={false} activeStyle="list" />
                    )}
                    {total > 0 && (
                        <div className={m.accessLogPager}>
                            <span className={m.metaText}>{offset + 1}–{Math.min(offset + rows.length, total)} of {total}</span>
                            <span className="flex-1" />
                            <Button activeStyle='small' disabled={offset === 0}
                                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>previous</Button>
                            <Button activeStyle='small' disabled={offset + PAGE_SIZE >= total}
                                    onClick={() => setOffset(offset + PAGE_SIZE)}>next</Button>
                        </div>
                    )}
                </div>
            )}
            <p className={m.accessLogNote}>
                One row per distinct refusal: the same user refused the same thing again adds to “times”. “would deny”
                happened (the server is in log mode) but is refused once the rules are enforced; “blank row” means
                only the rule “a row with no grants is read-only” refuses it.
            </p>
        </>
    );
}
