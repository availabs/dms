import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { get } from 'lodash-es';
import { getInstance } from '../../../../../utils/type-utils';
import { AdminContext } from '../../../context';
import { ThemeContext } from '../../../../../ui/useTheme';
import { tableTheme } from '../../../../../ui/components/table/table.theme';
import Table from '../../../../../ui/components/table';
import { enrichSection, loadSectionsByRefs } from './pagesEditor.utils';
import { pagesEditorTheme } from './pagesEditor.theme';
import { sourcesTabTheme } from './sourcesTab.theme';

function OriginCell({ value }) {
    const s = sourcesTabTheme;
    return <span className={value === 'Internal' ? s.originDms : s.originExt}>{value}</span>;
}

function UsedByCell({ value }) {
    const s = sourcesTabTheme;
    if (!value?.count) return <span className={s.usedByEmpty}>—</span>;
    if (!value.href) return <span>{value.count} section{value.count !== 1 ? 's' : ''}</span>;
    return (
        <Link to={value.href} className={s.usedByLink} onClick={e => e.stopPropagation()}>
            {value.count} section{value.count !== 1 ? 's' : ''}
        </Link>
    );
}

function StatusCell({ value }) {
    const s = sourcesTabTheme;
    return value === 'Orphaned'
        ? <span className={s.statusOrphaned}>Orphaned</span>
        : <span className={s.statusActive}>Active</span>;
}

const range = (start, end) => Array.from({ length: end + 1 - start }, (_, k) => k + start);

async function getSources(falcor, envs) {
    if (!Object.keys(envs).length) return [];
    const lenRes = await falcor.get(['uda', Object.keys(envs), 'sources', 'length']);

    const results = await Promise.all(
        Object.keys(envs).map(async e => {
            const len = get(lenRes, ['json', 'uda', e, 'sources', 'length']);
            if (!len) return [];
            const r = await falcor.get(['uda', e, 'sources', 'byIndex', { from: 0, to: len - 1 }, envs[e].srcAttributes]);
            return range(0, len - 1).map(i => {
                const source_id = get(r, ['json', 'uda', e, 'sources', 'byIndex', i, '$__path', 4]);
                return {
                    ...envs[e].srcAttributes.reduce((acc, a) => ({
                        ...acc,
                        [a]: get(r, ['json', 'uda', e, 'sources', 'byIndex', i, a]),
                    }), {}),
                    source_id,
                    srcEnv: e,
                    isDms: envs[e].isDms,
                };
            });
        })
    );
    return results.flat();
}

export function SourcesTab({ value, apiLoad, falcor }) {
    const { pgEnv, datasources = [], baseUrl } = useContext(AdminContext) || {};
    const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || {};

    const patternInstance = useMemo(() => getInstance(value.type), [value.type]);

    const [allSources, setAllSources] = useState([]);
    const [sections, setSections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sectionsLoading, setSectionsLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('');
    const [originFilter, setOriginFilter] = useState('');
    const [search, setSearch] = useState('');

    const gridRef = useRef(null);
    const loadIdRef = useRef(0);

    const tableCtxValue = useMemo(() => ({
        UI,
        theme: { ...themeFromContext, table: tableTheme },
    }), [UI, themeFromContext]);

    // Build the envs map from datasources (same pattern as DatasetsList/buildEnvsForListing).
    // Falls back to the pattern's own env + pgEnv when no datasources have been configured.
    const envs = useMemo(() => {
        if (datasources.length) {
            return Object.fromEntries(
                datasources
                    .filter(ds => ds.env)
                    .map(ds => [ds.env, { isDms: ds.type === 'internal', srcAttributes: ['name', 'type'] }])
            );
        }
        const fallback = { [`${value.app}+${patternInstance}`]: { isDms: true, srcAttributes: ['name', 'type'] } };
        if (pgEnv) fallback[pgEnv] = { isDms: false, srcAttributes: ['name', 'type'] };
        return fallback;
    }, [datasources, value.app, patternInstance, pgEnv]);

    const loadAll = useCallback(async () => {
        if (!falcor || !apiLoad || !value.app || !patternInstance) return;
        const myId = ++loadIdRef.current;
        setLoading(true);
        setSectionsLoading(true);
        setSections([]);

        // Fetch sources and pages in parallel; sources can render immediately.
        const [sources, pageItems] = await Promise.all([
            getSources(falcor, envs),
            apiLoad({
                format: { app: value.app, type: `${patternInstance}|page`, attributes: [] },
                children: [{ action: 'list', path: '/*' }],
            }, '/').catch(() => []),
        ]);
        if (loadIdRef.current !== myId) return;
        setAllSources(sources);
        setLoading(false);

        // Mirror pagesEditor: collect unique active section refs (draft_sections if
        // present, else published sections) so orphaned component rows are excluded.
        const allRefs = [];
        const seenIds = new Set();
        (pageItems || []).forEach(page => {
            const activeRefs = page.draft_sections?.length ? page.draft_sections : (page.sections || []);
            activeRefs.forEach(ref => {
                if (ref == null) return;
                const id = typeof ref === 'object' ? String(ref.id) : String(ref);
                if (!seenIds.has(id)) { seenIds.add(id); allRefs.push(ref); }
            });
        });

        const compById = await loadSectionsByRefs(allRefs, value.app, falcor);
        if (loadIdRef.current !== myId) return;
        setSections(Object.values(compById).map(enrichSection));
        setSectionsLoading(false);
    }, [falcor, apiLoad, value.app, patternInstance, envs]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const sectionCountById = useMemo(() => {
        const map = {};
        sections.forEach(s => {
            if (s._sourceId == null) return;
            map[s._sourceId] = (map[s._sourceId] || 0) + 1;
        });
        return map;
    }, [sections]);

    const viewIdsBySourceId = useMemo(() => {
        const map = {};
        sections.forEach(s => {
            if (s._sourceId == null || s._viewId == null) return;
            if (!map[s._sourceId]) map[s._sourceId] = new Set();
            map[s._sourceId].add(s._viewId);
        });
        return map;
    }, [sections]);

    const sourceRows = useMemo(() => {
        return allSources
            .filter(s => s.name && s.type !== 'file_upload')
            .map(s => {
                const id = s.source_id != null ? +s.source_id : null;
                const sectionCount = id != null ? (sectionCountById[id] || 0) : 0;
                const viewCount = id != null ? (viewIdsBySourceId[id]?.size || 0) : 0;
                return {
                    name: s.name,
                    isDms: s.isDms,
                    sectionCount,
                    viewCount,
                    status: sectionCount > 0 ? 'Active' : 'Orphaned',
                    origin: s.isDms ? 'Internal' : 'External',
                };
            })
            .sort((a, b) => b.sectionCount - a.sectionCount || (a.name || '').localeCompare(b.name || ''));
    }, [allSources, sectionCountById, viewIdsBySourceId]);

    const filteredRows = useMemo(() => {
        return sourceRows.filter(row => {
            if (statusFilter && row.status !== statusFilter) return false;
            if (originFilter === 'Internal' && !row.isDms) return false;
            if (originFilter === 'External' && row.isDms) return false;
            if (search && !row.name.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });
    }, [sourceRows, statusFilter, originFilter, search]);

    const activeCount = sourceRows.filter(r => r.status === 'Active').length;
    const orphanedCount = sourceRows.filter(r => r.status === 'Orphaned').length;
    const internalCount = sourceRows.filter(r => r.isDms).length;
    const externalCount = sourceRows.filter(r => !r.isDms).length;

    const pagesHref = baseUrl && value.id ? `${baseUrl}/${value.id}/pages` : null;

    const columns = useMemo(() => [
        { name: 'name',    display_name: 'Name',    show: true, type: 'text' },
        { name: 'origin',  display_name: 'Origin',  show: true, type: 'ui',   size: 90,  Comp: OriginCell },
        { name: 'usedBy',  display_name: 'Used By', show: true, type: 'ui',   size: 120, Comp: UsedByCell },
        { name: 'views',   display_name: 'Views',   show: true, type: 'text', size: 80 },
        { name: 'status',  display_name: 'Status',  show: true, type: 'ui',   size: 100, Comp: StatusCell },
    ], []);

    const tableData = useMemo(() => filteredRows.map(row => ({
        name: row.name,
        origin: row.origin,
        usedBy: {
            count: row.sectionCount,
            href: row.sectionCount > 0 && pagesHref
                ? `${pagesHref}?src=${encodeURIComponent(row.name)}&scope=sections`
                : null,
        },
        views: row.viewCount > 0 ? String(row.viewCount) : '—',
        status: row.status,
    })), [filteredRows, pagesHref]);

    const p = pagesEditorTheme;
    const s = sourcesTabTheme;

    return (
        <div className={p.wrapper}>
            <div className={p.toolbar}>
                <div className={p.filterWrap}>
                    <select
                        className={statusFilter ? p.filterSelectActive : p.filterSelect}
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                    >
                        <option value="">All status ({sourceRows.length})</option>
                        <option value="Active">Active ({activeCount})</option>
                        <option value="Orphaned">Orphaned ({orphanedCount})</option>
                    </select>
                    <span className={p.filterCaret}>▾</span>
                </div>

                <div className={p.filterWrap}>
                    <select
                        className={originFilter ? p.filterSelectActive : p.filterSelect}
                        value={originFilter}
                        onChange={e => setOriginFilter(e.target.value)}
                    >
                        <option value="">All origins ({sourceRows.length})</option>
                        <option value="Internal">Internal ({internalCount})</option>
                        <option value="External">External ({externalCount})</option>
                    </select>
                    <span className={p.filterCaret}>▾</span>
                </div>

                <div className={p.searchWrap}>
                    <svg className={p.searchIcon} width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input
                        type="text"
                        className={p.searchInput}
                        placeholder="Search sources…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                <div style={{ flex: 1 }} />

                <span className={p.footerInline}>
                    {sourceRows.length} source{sourceRows.length !== 1 ? 's' : ''}
                    {internalCount > 0 && ` · ${internalCount} internal`}
                    {externalCount > 0 && ` · ${externalCount} external`}
                    {orphanedCount > 0 && ` · ${orphanedCount} orphaned`}
                    {(search || statusFilter || originFilter) && ` · ${filteredRows.length} matching`}
                    {sectionsLoading && (
                        <span className={s.sectionsLoadingBadge}>
                            <span className={s.sectionsLoadingDot} />
                            loading section counts…
                        </span>
                    )}
                </span>

                <button className={p.ghostBtn} onClick={loadAll}>Refresh</button>
            </div>

            {orphanedCount > 0 && !statusFilter && (
                <div className={s.orphanBanner}>
                    <span className={s.orphanBannerStrong}>
                        ⚠ {orphanedCount} source{orphanedCount !== 1 ? 's' : ''} registered but not used by any section.
                    </span>
                    <span className={s.orphanBannerNote}>Open the Datasets admin to review or delete them.</span>
                </div>
            )}

            <div className={p.tableWrap} ref={gridRef}>
                {loading ? (
                    <div className={p.loadingWrap}>Loading sources…</div>
                ) : (
                    <ThemeContext.Provider value={tableCtxValue}>
                        <Table
                            gridRef={gridRef}
                            columns={columns}
                            data={tableData}
                            display={{ showGutters: false, virtualizeColumns: false }}
                            allowEdit={false}
                            isActive={true}
                        />
                    </ThemeContext.Provider>
                )}
            </div>

        </div>
    );
}
