import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ThemeContext } from '../../../../../ui/useTheme';
import { tableTheme } from '../../../../../ui/components/table/table.theme';
import Table from '../../../../../ui/components/table';
import { getInstance } from '../../../../../utils/type-utils';
import { loadPageHistory } from './pagesEditor.utils';
import { pagesEditorTheme } from './pagesEditor.theme';
import { activityTabTheme } from './activityTab.theme';

function timeAgo(input) { const date = input instanceof Date ? input : new Date(input); const fmt = new Intl.RelativeTimeFormat('en'); const ranges = { years: 3600*24*365, months: 3600*24*30, weeks: 3600*24*7, days: 3600*24, hours: 3600, minutes: 60, seconds: 1 }; const s = (date.getTime() - Date.now()) / 1000; for (const k in ranges) { if (ranges[k] < Math.abs(s)) return fmt.format(Math.round(s / ranges[k]), k); } }

function actionLabel(action) {
    if (!action) return 'edited';
    if (action === 'published changes.') return 'published';
    if (action === 'discarded changes.') return 'discarded';
    if (action.startsWith('commented:')) return 'commented';
    if (action.startsWith(' created')) return 'created';
    if (action.startsWith('changed page title')) return 'renamed';
    if (action.startsWith('edited section')) return 'edited section';
    if (action.startsWith('Created Duplicate')) return 'duplicated';
    return action.length > 40 ? action.slice(0, 40) + '…' : action;
}

function PageCell({ value, row }) {
    const navigate = useNavigate();
    const t = activityTabTheme;
    if (row._editUrl) {
        return (
            <button className={t.activityPageLink} onClick={() => navigate(row._editUrl)}>
                {value}
            </button>
        );
    }
    return <span className={t.activityPageName}>{value}</span>;
}

function TimeCell({ value }) {
    const t = activityTabTheme;
    return <span className={t.activityTime}>{value ? timeAgo(value) : '—'}</span>;
}

export function ActivityTab({ value, apiLoad, falcor }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || {};

    const gridRef = useRef(null);

    const tableCtxValue = useMemo(() => ({
        UI,
        theme: { ...themeFromContext, table: tableTheme },
    }), [UI, themeFromContext]);

    const patternInstance = useMemo(() => getInstance(value.type), [value.type]);

    const loadAll = useCallback(async () => {
        if (!apiLoad || !value.app || !patternInstance) return;
        setLoading(true);
        try {
            const pageItems = await apiLoad({
                format: { app: value.app, type: `${patternInstance}|page`, attributes: [] },
                children: [{ action: 'list', path: '/*' }],
            }, '/').catch(() => []);

            const historyByPageId = await loadPageHistory(pageItems, falcor);

            const pageById = {};
            (pageItems || []).forEach(p => { pageById[String(p.id)] = p; });

            const allRows = [];
            Object.entries(historyByPageId).forEach(([pageId, hist]) => {
                const page = pageById[pageId];
                if (!page) return;
                const pageSlug = page.url_slug || '';
                const _editUrl = value.base_url && pageSlug ? `${value.base_url}/edit/${pageSlug}` : null;
                hist.entries.forEach(entry => {
                    allRows.push({
                        pageTitle: page.title || '(untitled)',
                        action: actionLabel(entry.action),
                        user: entry.user ? entry.user.split('@')[0] : '—',
                        time: entry.time || null,
                        _editUrl,
                    });
                });
            });

            allRows.sort((a, b) => new Date(b.time) - new Date(a.time));
            setRows(allRows);
        } finally {
            setLoading(false);
        }
    }, [apiLoad, falcor, value.app, value.base_url, patternInstance]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const columns = useMemo(() => [
        { name: 'pageTitle', display_name: 'Page',   show: true, type: 'ui',   Comp: PageCell },
        { name: 'action',    display_name: 'Action', show: true, type: 'text', size: 160 },
        { name: 'user',      display_name: 'Who',    show: true, type: 'text', size: 140 },
        { name: 'time',      display_name: 'When',   show: true, type: 'ui',   size: 100, Comp: TimeCell },
    ], []);

    const p = pagesEditorTheme;
    const t = activityTabTheme;

    return (
        <div className={p.wrapper}>
            <div className={p.toolbar}>
                <span className={t.activityToolbarTitle}>Activity Log</span>
                {!loading && (
                    <span className={p.lensCount} style={{ marginLeft: 6 }}>{rows.length} events</span>
                )}
            </div>

            <div className={p.tableWrap} ref={gridRef}>
                {loading ? (
                    <div className={p.loadingWrap}>Loading activity…</div>
                ) : rows.length === 0 ? (
                    <div className={t.activityEmpty}>No activity recorded yet.</div>
                ) : (
                    <ThemeContext.Provider value={tableCtxValue}>
                        <Table
                            gridRef={gridRef}
                            columns={columns}
                            data={rows}
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
