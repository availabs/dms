import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get } from 'lodash-es';
import { getInstance } from '../../../../../utils/type-utils';
import { AdminContext } from '../../../context';
import { enrichSection } from './pagesEditor.utils';
import { pagesEditorTheme } from './pagesEditor.theme';
import { sourcesTabTheme } from './sourcesTab.theme';

const range = (start, end) => Array.from({ length: end + 1 - start }, (_, k) => k + start);

function formatDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Mirror of getSources in DatasetsList/useDataSource — loads all sources for
// each env key via ['uda', env, 'sources', 'byIndex', ...].
// For DMS envs the server resolves sources through the pattern's dmsEnvId.
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
    const { dmsEnvById, pgEnv } = useContext(AdminContext) || {};

    const patternInstance = useMemo(() => getInstance(value.type), [value.type]);

    const [allSources, setAllSources] = useState([]);
    const [sections, setSections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [originFilter, setOriginFilter] = useState('');
    const [search, setSearch] = useState('');

    const loadAll = useCallback(async () => {
        if (!falcor || !apiLoad || !value.app || !patternInstance) return;
        setLoading(true);
        try {
            // Load sections first — their sourceInfo.srcEnv carries the exact
            // datasets-pattern env key the UDA server expects for internal sources.
            // This is the same key DatasetsList derives from format.type.
            const rawSections = await apiLoad({
                format: { app: value.app, type: `${patternInstance}|component`, attributes: [] },
                children: [{ action: 'list', path: '/*' }]
            }, '/').catch(() => []);

            const enrichedSections = (rawSections || []).map(enrichSection);
            setSections(enrichedSections);

            // Collect unique internal env keys from sections (contains '+').
            // Fall back to page pattern instance if no sections have _srcEnv yet.
            const internalEnvKeys = new Set(
                enrichedSections.map(s => s._srcEnv).filter(e => e && e.includes('+'))
            );
            if (!internalEnvKeys.size) internalEnvKeys.add(`${value.app}+${patternInstance}`);

            const envs = {};
            for (const e of internalEnvKeys) {
                envs[e] = { isDms: true, srcAttributes: ['name', 'type'] };
            }
            if (pgEnv) {
                envs[pgEnv] = { isDms: false, srcAttributes: ['name', 'type'] };
            }

            const sources = await getSources(falcor, envs);
            setAllSources(sources);
        } finally {
            setLoading(false);
        }
    }, [falcor, apiLoad, value.app, patternInstance, pgEnv]);

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
            .filter(s => s.name)
            .map(s => {
                const id = s.source_id != null ? +s.source_id : null;
                const sectionCount = id != null ? (sectionCountById[id] || 0) : 0;
                const viewCount = id != null ? (viewIdsBySourceId[id]?.size || 0) : 0;
                return {
                    name: s.name,
                    sourceType: s.type || null,
                    sourceId: id,
                    isDms: s.isDms,
                    sectionCount,
                    viewCount,
                    status: sectionCount > 0 ? 'active' : 'orphaned',
                };
            })
            .sort((a, b) => b.sectionCount - a.sectionCount || (a.name || '').localeCompare(b.name || ''));
    }, [allSources, sectionCountById, viewIdsBySourceId]);

    const filteredRows = useMemo(() => {
        return sourceRows.filter(row => {
            if (statusFilter && row.status !== statusFilter) return false;
            if (originFilter === 'internal' && !row.isDms) return false;
            if (originFilter === 'external' && row.isDms) return false;
            if (search && !row.name.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });
    }, [sourceRows, statusFilter, originFilter, search]);

    const p = pagesEditorTheme;
    const s = sourcesTabTheme;

    if (loading) {
        return <div className={p.loadingWrap}>Loading sources…</div>;
    }

    const activeCount = sourceRows.filter(r => r.status === 'active').length;
    const orphanedCount = sourceRows.filter(r => r.status === 'orphaned').length;
    const internalCount = sourceRows.filter(r => r.isDms).length;
    const externalCount = sourceRows.filter(r => !r.isDms).length;

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
                        <option value="active">Active ({activeCount})</option>
                        <option value="orphaned">Orphaned ({orphanedCount})</option>
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
                        <option value="internal">Internal ({internalCount})</option>
                        <option value="external">External ({externalCount})</option>
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

            <div className={p.tableWrap} style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                        <col style={{ width: '200px' }} />
                        <col style={{ width: '90px' }} />
                        <col style={{ width: '110px' }} />
                        <col style={{ width: '55px' }} />
                        <col style={{ width: '100px' }} />
                    </colgroup>
                    <thead>
                        <tr className={s.theadRow}>
                            <th className={s.th}>Name</th>
                            <th className={s.th}>Origin</th>
                            <th className={s.th}>Used By</th>
                            <th className={s.th}>Views</th>
                            <th className={s.th}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.length === 0 ? (
                            <tr>
                                <td colSpan={5} className={s.emptyCell}>
                                    {search ? `No sources matching "${search}"` : 'No sources found'}
                                </td>
                            </tr>
                        ) : filteredRows.map(row => (
                            <tr key={`${row.isDms ? 'dms' : 'ext'}-${row.sourceId}`} className={row.status === 'orphaned' ? s.tbodyRowOrphaned : s.tbodyRow}>
                                <td className={s.tdBase}>
                                    <span className={s.nameText}>{row.name}</span>
                                </td>
                                <td className={s.tdBase}>
                                    <span className={row.isDms ? s.originDms : s.originExt}>
                                        {row.isDms ? 'Internal' : 'External'}
                                    </span>
                                </td>
                                <td className={s.tdBase}>
                                    {row.sectionCount > 0
                                        ? <span className={s.usedByText}>{row.sectionCount} section{row.sectionCount !== 1 ? 's' : ''}</span>
                                        : <span className={s.nullDash}>—</span>
                                    }
                                </td>
                                <td className={s.tdBase}>
                                    {row.viewCount > 0
                                        ? <span className={s.viewCountText}>{row.viewCount}</span>
                                        : <span className={s.nullDash}>—</span>
                                    }
                                </td>
                                <td className={s.tdBase}>
                                    {row.status === 'orphaned'
                                        ? <span className={s.statusOrphaned}>Orphaned</span>
                                        : <span className={s.statusActive}>Active</span>
                                    }
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className={p.footer}>
                {sourceRows.length} source{sourceRows.length !== 1 ? 's' : ''}
                {internalCount > 0 && ` · ${internalCount} internal`}
                {externalCount > 0 && ` · ${externalCount} external`}
                {orphanedCount > 0 && ` · ${orphanedCount} orphaned`}
                {(search || statusFilter || originFilter) && ` · ${filteredRows.length} matching`}
            </div>
        </div>
    );
}
