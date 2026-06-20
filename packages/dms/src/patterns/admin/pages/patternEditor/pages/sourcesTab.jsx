import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getInstance } from '../../../../../utils/type-utils';
import { AdminContext } from '../../../context';
import { enrichSection } from './pagesEditor.utils';
import { pagesEditorTheme } from './pagesEditor.theme';
import { sourcesTabTheme } from './sourcesTab.theme';

function formatDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function SourcesTab({ value, apiLoad }) {
    const { dmsEnvById } = useContext(AdminContext) || {};

    const patternInstance = useMemo(() => getInstance(value.type), [value.type]);
    const dmsEnv = useMemo(() => dmsEnvById?.[value.dmsEnvId], [dmsEnvById, value.dmsEnvId]);

    const [sections, setSections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');

    const loadSections = useCallback(async () => {
        if (!apiLoad || !value.app || !patternInstance) return;
        setLoading(true);
        try {
            const items = await apiLoad({
                format: { app: value.app, type: `${patternInstance}|component`, attributes: [] },
                children: [{ action: 'list', path: '/*' }]
            }, '/').catch(() => []);
            setSections((items || []).map(enrichSection));
        } finally {
            setLoading(false);
        }
    }, [apiLoad, value.app, patternInstance]);

    useEffect(() => { loadSections(); }, [loadSections]);

    const envSourceIds = useMemo(() => {
        return new Set((dmsEnv?.sources || []).map(s => s.id != null ? String(s.id) : null).filter(Boolean));
    }, [dmsEnv]);

    const { sourceRows, orphanedCount } = useMemo(() => {
        const byName = {};

        sections.forEach(s => {
            const name = s._sourceName;
            if (!name) return;
            if (!byName[name]) {
                byName[name] = {
                    name,
                    sectionCount: 0,
                    viewIds: new Set(),
                    sourceId: s._sourceId || null,
                    updatedAt: s.updated_at || null,
                };
            }
            byName[name].sectionCount++;
            if (s._viewId != null) byName[name].viewIds.add(s._viewId);
            if (!byName[name].sourceId && s._sourceId) byName[name].sourceId = s._sourceId;
            if (s.updated_at && (!byName[name].updatedAt || s.updated_at > byName[name].updatedAt)) {
                byName[name].updatedAt = s.updated_at;
            }
        });

        const activeSourceIds = new Set(
            Object.values(byName).map(r => r.sourceId).filter(Boolean).map(String)
        );
        const orphanCount = [...envSourceIds].filter(id => !activeSourceIds.has(String(id))).length;

        const rows = Object.values(byName).map(r => ({
            name: r.name,
            sectionCount: r.sectionCount,
            viewCount: r.viewIds.size,
            viewIds: [...r.viewIds].sort((a, b) => b - a),
            sourceId: r.sourceId,
            updatedAt: formatDate(r.updatedAt),
        })).sort((a, b) => b.sectionCount - a.sectionCount);

        return { sourceRows: rows, orphanedCount: orphanCount };
    }, [sections, envSourceIds]);

    const filteredRows = useMemo(() => {
        return sourceRows.filter(row => {
            if (statusFilter === 'orphaned') return false;
            if (search && !row.name.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });
    }, [sourceRows, statusFilter, search]);

    const p = pagesEditorTheme;
    const s = sourcesTabTheme;

    if (loading) {
        return <div className={p.loadingWrap}>Loading sources…</div>;
    }

    const totalSections = sourceRows.reduce((a, r) => a + r.sectionCount, 0);
    const showOrphanNote = orphanedCount > 0 && !statusFilter;

    return (
        <div className={p.wrapper}>
            <div className={p.toolbar}>
                <div className={p.filterWrap}>
                    <select
                        className={statusFilter ? p.filterSelectActive : p.filterSelect}
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                    >
                        <option value="">All status</option>
                        <option value="active">Active ({sourceRows.length})</option>
                        {orphanedCount > 0 && (
                            <option value="orphaned" disabled>Orphaned ({orphanedCount}) — load in Datasets</option>
                        )}
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

                <button className={p.ghostBtn} onClick={loadSections}>Refresh</button>
            </div>

            {showOrphanNote && (
                <div className={s.orphanBanner}>
                    <span className={s.orphanBannerStrong}>
                        ⚠ {orphanedCount} source{orphanedCount !== 1 ? 's' : ''} registered in this pattern's dmsEnv but not referenced by any section.
                    </span>
                    <span className={s.orphanBannerNote}>Open the Datasets admin to review or delete orphaned sources.</span>
                </div>
            )}

            <div className={p.tableWrap} style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                        <col style={{ width: '220px' }} />
                        <col style={{ width: '110px' }} />
                        <col style={{ width: '60px' }} />
                        <col style={{ width: '130px' }} />
                        <col style={{ width: '110px' }} />
                    </colgroup>
                    <thead>
                        <tr className={s.theadRow}>
                            <th className={s.th}>Name</th>
                            <th className={s.th}>Used By</th>
                            <th className={s.th}>Views</th>
                            <th className={s.th}>Last Updated</th>
                            <th className={s.th}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.length === 0 ? (
                            <tr>
                                <td colSpan={5} className={s.emptyCell}>
                                    {search ? `No sources matching "${search}"` : 'No data sources found'}
                                </td>
                            </tr>
                        ) : filteredRows.map(row => (
                            <tr key={row.name} className={s.tbodyRow}>
                                <td className={s.tdBase}>
                                    <span className={s.nameText}>{row.name}</span>
                                </td>
                                <td className={s.tdBase}>
                                    <span className={s.usedByText}>
                                        {row.sectionCount} section{row.sectionCount !== 1 ? 's' : ''}
                                    </span>
                                </td>
                                <td className={s.tdBase}>
                                    {row.viewCount > 0
                                        ? <span className={s.viewCountText}>{row.viewCount}</span>
                                        : <span className={s.nullDash}>—</span>
                                    }
                                </td>
                                <td className={s.tdBase}>
                                    {row.updatedAt
                                        ? <span className={s.updatedAtText}>{row.updatedAt}</span>
                                        : <span className={s.nullDash}>—</span>
                                    }
                                </td>
                                <td className={s.tdBase}>
                                    <span className={s.statusActive}>Active</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className={p.footer}>
                {sourceRows.length} source{sourceRows.length !== 1 ? 's' : ''} · {totalSections} section bindings
                {orphanedCount > 0 && ` · ${orphanedCount} orphaned in dmsEnv`}
                {search && ` · ${filteredRows.length} matching`}
            </div>
        </div>
    );
}
