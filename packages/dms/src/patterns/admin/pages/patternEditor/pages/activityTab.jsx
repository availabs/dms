import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ThemeContext } from '../../../../../ui/useTheme';
import { getInstance } from '../../../../../utils/type-utils';
import { loadPageHistory } from './pagesEditor.utils';
import { pagesEditorTheme } from './pagesEditor.theme';
import { activityTabTheme } from './activityTab.theme';
import { timeAgo } from '../../../utils';

// Maps a raw history action string to a short display label + a category used by the
// quick-filter chips ('publish' | 'edit' | 'delete') + a badge style key. Everything that
// isn't a publish reads as an 'edit' — no history entry is ever written for a page delete
// today (checked: no `appendHistoryEntry` call anywhere writes one), so 'delete' stays a
// real, always-available-but-currently-empty category, same convention as Pages tab's
// zero-count lenses.
function classifyAction(action) {
    if (!action) return { label: 'edited', category: 'edit', badge: 'badgeEdit' };
    if (action === 'published changes.') return { label: 'published', category: 'publish', badge: 'badgePublish' };
    if (action === 'discarded changes.') return { label: 'discarded', category: 'edit', badge: 'badgeDiscard' };
    if (action.startsWith('commented:')) return { label: 'commented', category: 'edit', badge: 'badgeEdit' };
    if (action.startsWith(' created') || action.startsWith('created')) return { label: 'created', category: 'edit', badge: 'badgeNeutral' };
    if (action.startsWith('changed page title')) return { label: 'renamed', category: 'edit', badge: 'badgeNeutral' };
    if (action.startsWith('edited section')) return { label: 'edited section', category: 'edit', badge: 'badgeEdit' };
    if (action.toLowerCase().startsWith('created duplicate')) return { label: 'duplicated', category: 'edit', badge: 'badgeNeutral' };
    if (action.toLowerCase().includes('delete')) return { label: 'deleted', category: 'delete', badge: 'badgeDelete' };
    const label = action.length > 40 ? action.slice(0, 40) + '…' : action;
    return { label, category: 'edit', badge: 'badgeEdit' };
}

function dayLabel(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function clockLabel(iso) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function FeedRow({ row, t }) {
    const navigate = useNavigate();
    return (
        <div className={t.feedRow}>
            <span className={t.feedAvatar}>{(row.user || '?').charAt(0)}</span>
            <span className={t[row.badge]}>{row.label}</span>
            {row._editUrl ? (
                <button className={t.activityPageLink} onClick={() => navigate(row._editUrl)}>
                    {row.pageTitle}
                </button>
            ) : (
                <span className={t.activityPageName}>{row.pageTitle}</span>
            )}
            <span className="flex-1" />
            <span className={t.feedActor}>{row.user || '—'}</span>
            <span className={t.feedTime}>{row.time ? clockLabel(row.time) : '—'}</span>
        </div>
    );
}

export function ActivityTab({ value, apiLoad, falcor }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState('all');
    const [actorFilter, setActorFilter] = useState('');
    const { UI } = useContext(ThemeContext) || {};

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
                    const { label, category, badge } = classifyAction(entry.action);
                    allRows.push({
                        pageTitle: page.title || '(untitled)',
                        label,
                        category,
                        badge,
                        user: entry.user || null,
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

    // header stats
    const stats = useMemo(() => ({
        total: rows.length,
        publishes: rows.filter(r => r.category === 'publish').length,
        editors: new Set(rows.map(r => r.user).filter(Boolean)).size,
    }), [rows]);

    const actorOptions = useMemo(() => {
        const actors = new Set(rows.map(r => r.user).filter(Boolean));
        return [...actors].sort().map(u => ({ label: u, value: u }));
    }, [rows]);

    const counts = useMemo(() => ({
        all: rows.length,
        publish: rows.filter(r => r.category === 'publish').length,
        edit: rows.filter(r => r.category === 'edit').length,
        delete: rows.filter(r => r.category === 'delete').length,
    }), [rows]);

    const filteredRows = useMemo(() => rows
        .filter(r => category === 'all' || r.category === category)
        .filter(r => !actorFilter || r.user === actorFilter),
    [rows, category, actorFilter]);

    // group consecutive rows (already time-sorted) by calendar day
    const groups = useMemo(() => {
        const out = [];
        filteredRows.forEach(row => {
            const key = row.time ? new Date(row.time).toDateString() : 'undated';
            const last = out[out.length - 1];
            if (last && last.key === key) {
                last.rows.push(row);
            } else {
                out.push({ key, label: row.time ? dayLabel(row.time) : 'undated', rows: [row] });
            }
        });
        return out;
    }, [filteredRows]);

    const p = pagesEditorTheme;
    const t = activityTabTheme;

    const chips = [
        { id: 'all',     label: 'All' },
        { id: 'publish', label: 'Publishes', count: counts.publish },
        { id: 'edit',    label: 'Edits',      count: counts.edit },
        { id: 'delete',  label: 'Deletes',    count: counts.delete },
    ];

    return (
        <div className={p.wrapper}>
            {/* header: pattern identity + change/publish/editor stats */}
            <div className={p.header}>
                <div className={p.headerTitleWrap}>
                    <div className={p.headerTitleRow}>
                        <h1 className={p.headerTitle}>Activity</h1>
                    </div>
                    <p className={p.headerSubtitle}>
                        {rows.length > 0 ? `last change ${timeAgo(rows[0].time)}` : ' '}
                    </p>
                </div>
                <div className={p.statsBar}>
                    <div className={p.statCell}>
                        <p className={p.statValue}>{stats.total}</p>
                        <p className={p.statLabel}>changes</p>
                    </div>
                    <div className={p.statCell}>
                        <p className={p.statValue}>{stats.publishes}</p>
                        <p className={p.statLabel}>publishes</p>
                    </div>
                    <div className={p.statCell}>
                        <p className={p.statValue}>{stats.editors}</p>
                        <p className={p.statLabel}>editors</p>
                    </div>
                </div>
            </div>

            {/* toolbar: action-category chips + actor filter */}
            <div className={t.toolbar}>
                <div className={t.chipBar}>
                    {chips.map(c => (
                        <button
                            key={c.id}
                            className={category === c.id ? p.lensChipActive : p.lensChip}
                            onClick={() => setCategory(c.id)}
                        >
                            {c.label}
                            {c.count != null && (
                                <span className={category === c.id ? p.lensCountActive : p.lensCount}>{c.count}</span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="flex-1" />
                {UI?.Select && (
                    <div className="w-52">
                        <UI.Select
                            value={actorFilter}
                            onChange={val => setActorFilter(val ?? '')}
                            placeholder="Actor: anyone"
                            options={actorOptions}
                            allowDeselect
                        />
                    </div>
                )}
            </div>

            {/* feed */}
            <div className={t.feedWrap}>
                {loading ? (
                    <div className={p.loadingWrap}>Loading activity…</div>
                ) : filteredRows.length === 0 ? (
                    <div className={t.activityEmpty}>No activity recorded yet.</div>
                ) : (
                    <div className={t.feedCard}>
                        {groups.map(group => (
                            <React.Fragment key={group.key}>
                                <div className={t.feedDayHeader}>{group.label}</div>
                                {group.rows.map((row, i) => (
                                    <FeedRow key={i} row={row} t={t} />
                                ))}
                            </React.Fragment>
                        ))}
                    </div>
                )}
            </div>

            {/* footer */}
            <div className={p.footer}>
                {filteredRows.length} of {rows.length} events
            </div>
        </div>
    );
}
