import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { cloneDeep } from 'lodash-es';
import { ThemeContext, getComponentTheme } from '../../../../../ui/useTheme';
import { getInstance } from '../../../../../utils/type-utils';
import Table from '../../../../../ui/components/table';
import { tableTheme } from '../../../../../ui/components/table/table.theme';
import { pagesEditorTheme } from './pagesEditor.theme';
import { enrichSection } from './pagesEditor.utils';
import { AdminContext } from '../../../context';
import { appendHistoryEntry } from '../../../../page/pages/edit/editFunctions';

// ─── helpers ──────────────────────────────────────────────────────────────────

function slugify(s) {
    return (s || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function slugOf(page, byId) {
    if (page.url_slug) return page.url_slug;
    if (!page.title) return '(no data)';
    const parts = [];
    let cur = page;
    while (cur) {
        parts.unshift(slugify(cur.title));
        cur = cur.parent != null ? byId[String(cur.parent)] : null;
    }
    return '/' + parts.join('/');
}

function childrenOf(page, byId, pages) {
    return pages.filter(p => String(p.parent) === String(page.id)).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

function descendants(page, byId, pages) {
    return childrenOf(page, byId, pages).flatMap(c => [c, ...descendants(c, byId, pages)]);
}

function needsPublish(page) {
    return page.published === 'draft' || !!page.has_changes;
}

function isOrphan(page, byId) {
    return page.parent != null && page.parent !== '' && !byId[String(page.parent)];
}

// Resolves a section ref (id, JSON string, or object) to the full component from compById
function resolveCompRef(ref, compById) {
    if (ref == null) return null;
    let id = ref;
    if (typeof ref === 'string' && ref.startsWith('{')) {
        try { id = JSON.parse(ref).id; } catch (_) {}
    } else if (typeof ref === 'object') {
        id = ref.id;
    }
    return compById[String(id)] || null;
}

// Strips identity fields from a component so updateDMSAttrs creates new rows
function stripCompIdentity(comp) {
    const s = cloneDeep(comp);
    delete s.id; delete s.ref; delete s.is_draft;
    delete s.created_at; delete s.updated_at;
    delete s.created_by; delete s.updated_by;
    return s;
}

function computeUrlSlug(title, existingPages, index, parent) {
    const parentPage = parent != null && parent !== ''
        ? existingPages.find(p => String(p.id) === String(parent))
        : null;
    const parentSlug = parentPage?.url_slug ? `${parentPage.url_slug}/` : '';
    const base = `${parentSlug}${slugify(title)}`;
    const taken = new Set(existingPages.map(p => p.url_slug).filter(Boolean));
    if (!taken.has(base)) return base;
    return `${base}_${index}`;
}

// ─── section enrichment ───────────────────────────────────────────────────────
// enrichSection is imported from pagesEditor.utils.js

function sectionMatch(s, { typeFilter = '', srcFilter = '', search = '' } = {}) {
    if (typeFilter) {
        const et = s.element?.['element-type'] || '';
        if (et !== typeFilter) return false;
    }
    if (srcFilter === '__any__') {
        if (!s._sourceName) return false;
    } else if (srcFilter) {
        if (s._sourceName !== srcFilter) return false;
    }
    if (search) {
        const q = search.toLowerCase();
        const title = (s.title || '').toLowerCase();
        const src = (s._sourceName || '').toLowerCase();
        const sum = (s._summary?.text || '').toLowerCase();
        if (!title.includes(q) && !src.includes(q) && !sum.includes(q)) return false;
    }
    return true;
}

function formatUpdatedAt(isoString) {
    if (!isoString) return null;
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── sections panel ───────────────────────────────────────────────────────────

const TYPE_BADGE_CLASS = {
    Card: 'badgeCard',
    Spreadsheet: 'badgeSpreadsheet',
    Lexical: 'badgeLexical',
    Map: 'badgeMap',
    Header: 'badgeHeader',
    Footer: 'badgeFooter',
    Graph: 'badgeGraph',
};

function SectionLabel({ section, t }) {
    const title = section.title;

    if (title && title !== '(untitled)' && title !== 'Untitled Section') {
        return <span className={t.sectionTitle}>{title}</span>;
    }

    const elementType = section.element?.['element-type'] || '';
    const isLexical = elementType === 'lexical' || elementType === 'Lexical' || elementType === 'Rich Text';

    if (isLexical) {
        const summary = section._summary;
        if (!summary || summary.kind === 'empty') {
            return <span className={t.sectionEmpty}>(empty section)</span>;
        }
        const firstLine = summary.text?.split('\n\n')[0] || summary.text;
        return <span className={t.sectionDerived}>¶ {firstLine}</span>;
    }

    return <span className={t.sectionEmpty}>(untitled)</span>;
}

function SectionsPanel({ value: sections = [], page = {}, baseUrl = '', navigate, setPreviewSection, t }) {
    const [mode, setMode] = useState('all'); // 'outline' | 'all'

    const hasMeaningfulTitle = s => s.title && s.title !== 'Untitled Section' && s.title !== '(untitled)';
    const shown = mode === 'outline' ? sections.filter(hasMeaningfulTitle) : sections;
    const titledCount = sections.filter(hasMeaningfulTitle).length;
    const emptyCount = sections.filter(s => s._summary?.kind === 'empty').length;

    const pageSlug = page.url_slug || '';
    const editUrl = baseUrl && pageSlug ? `${baseUrl}/edit/${pageSlug}` : null;
    const viewUrl = baseUrl && pageSlug ? `${baseUrl}/${pageSlug}` : null;

    return (
        <div className={t.sectionsPanel}>
            <div className={t.sectionsPanelInner}>
                <div className={t.sectionsMeta}>
                    <span>Sections</span>
                    <span className={t.sectionsMetaCount}>
                        {sections.length}
                        {titledCount > 0 && ` · ${titledCount} titled`}
                        {emptyCount > 0 && <strong className="text-amber-600 ml-1"> · {emptyCount} empty</strong>}
                    </span>
                    <div className="inline-flex bg-white border border-gray-200 rounded-full p-0.5">
                        <button
                            className={`border-none rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wide cursor-pointer ${mode === 'outline' ? 'bg-gray-100 text-gray-800' : 'bg-transparent text-gray-400'}`}
                            onClick={() => setMode('outline')}
                        >Outline</button>
                        <button
                            className={`border-none rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wide cursor-pointer ${mode === 'all' ? 'bg-gray-100 text-gray-800' : 'bg-transparent text-gray-400'}`}
                            onClick={() => setMode('all')}
                        >All</button>
                    </div>
                    <div className="flex-1" />
                    <button
                        className={t.ghostBtn || 'text-[10px] border border-gray-200 rounded px-2 py-0.5 bg-white text-gray-500 cursor-pointer'}
                        onClick={editUrl && navigate ? () => navigate(editUrl) : undefined}
                        title={editUrl ? `Edit page: ${editUrl}` : 'No URL available'}
                    >
                        + New Section
                    </button>
                </div>
                <div className={t.sectionsScroll}>
                    {shown.map((s, i) => {
                        const elementType = s.element?.['element-type'] || s['element-type'] || '';
                        const typeKey = TYPE_BADGE_CLASS[elementType] || 'badgeLexical';
                        const levelNum = s.level != null ? +s.level : null;
                        const indent = levelNum >= 3 ? 'pl-8' : levelNum >= 2 ? 'pl-4' : '';
                        return (
                            <div
                                key={i}
                                className={t.sectionRow}
                                style={{ gridTemplateColumns: t.sectionRowCols || '1fr 90px 200px 80px 60px 60px' }}
                            >
                                <span className={`${indent} min-w-0`}>
                                    <SectionLabel section={s} t={t} />
                                </span>
                                <span>
                                    <span className={`${t.badgeBase} ${t[typeKey]}`}>
                                        {elementType || 'Lexical'}
                                    </span>
                                </span>
                                <span className="truncate">
                                    {s._sourceName
                                        ? <span className={t.srcLabel}>{s._sourceName}</span>
                                        : <span className="text-gray-300 text-xs">—</span>}
                                </span>
                                <span>
                                    {s._viewChip
                                        ? <span className={s._viewChip.stale ? t.viewChipStale : s._viewChip.fresh ? t.viewChipFresh : t.viewChipOk}>
                                            v{s._viewChip.view}{s._viewChip.fresh ? ' ✓' : ''}
                                          </span>
                                        : <span className="text-gray-300 text-xs">—</span>}
                                </span>
                                <span>
                                    {levelNum != null
                                        ? <span className={`${t.levelPill} ${levelNum === 0 ? t.levelHidden : t.levelHeading}`}>
                                            {levelNum === 0 ? 'hidden' : `H${levelNum}`}
                                          </span>
                                        : <span className="text-gray-300 text-xs">—</span>}
                                </span>
                                {/*<span className="flex justify-end">*/}
                                {/*    <button*/}
                                {/*        className={t.ghostBtn || 'text-[10px] border border-gray-200 rounded px-2 py-0.5 bg-white text-gray-500 cursor-pointer'}*/}
                                {/*        onClick={setPreviewSection ? () => setPreviewSection({ ...s, _pageViewUrl: viewUrl }) : undefined}*/}
                                {/*    >*/}
                                {/*        Preview*/}
                                {/*    </button>*/}
                                {/*</span>*/}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ─── tree flattening ──────────────────────────────────────────────────────────

function buildFlatTree({ pages, byId, expandedIds, sectionsByPageId, lens, search, scope, toggleExpandRef, typeFilter = '', srcFilter = '', slugFreq = {} }) {
    const roots = pages.filter(p => !p.parent || p.parent === '' || !byId[String(p.parent)]).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const orphans = pages.filter(p => isOrphan(p, byId)).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    const isFiltering = scope === 'sections' && (search || typeFilter || srcFilter);

    function lensMatch(p) {
        if (lens === 'queue') return needsPublish(p);
        if (lens === 'hidden') return !!p.hide_in_nav;
        if (lens === 'empty') return (sectionsByPageId[String(p.id)] || []).length === 0;
        if (lens === 'orphans') return isOrphan(p, byId);
        if (lens === 'dupes') return !!(p.url_slug && (slugFreq[p.url_slug] || 0) > 1);
        if (lens === 'stale') return p.published === 'draft' && !!(p.updated_at) && (Date.now() - new Date(p.updated_at)) / 86400000 > 90;
        return true;
    }

    function matchSection(s) {
        return sectionMatch(s, { typeFilter, srcFilter, search });
    }

    function pageMatch(p) {
        if (!lensMatch(p)) return false;
        if (scope === 'sections') {
            const pageSections = sectionsByPageId[String(p.id)] || [];
            return pageSections.some(matchSection);
        }
        if (search) {
            return (p.title || '').toLowerCase().includes(search.toLowerCase());
        }
        return true;
    }

    function showsBranch(p) {
        if (pageMatch(p)) return true;
        return pages.filter(c => String(c.parent) === String(p.id)).some(showsBranch);
    }

    const rows = [];

    function walk(p, depth) {
        if (!showsBranch(p)) return;
        const isMatch = pageMatch(p);
        const kids = childrenOf(p, byId, pages);
        const isExpanded = expandedIds.has(String(p.id));
        const isGhost = !p.title;
        const allDescendants = descendants(p, byId, pages);
        const pendingBelow = allDescendants.filter(needsPublish).length;
        const allSections = sectionsByPageId[String(p.id)] || [];
        const sections = isFiltering ? allSections.filter(matchSection) : allSections;
        const sectionCount = allSections.length;

        rows.push({
            ...p,
            _depth: depth,
            _hasChildren: kids.length > 0,
            _isExpanded: isExpanded,
            _isOrphan: false,
            _isGhost: isGhost,
            _childCount: kids.length,
            _slug: slugOf(p, byId),
            _pendingBelow: pendingBelow,
            _sectionCount: { count: sectionCount },
            _sections: sections,
            _publishState: { published: p.published || '', hasChanges: !!p.has_changes },
            _dimmed: !isMatch,
            _onToggleExpand: toggleExpandRef.current
                ? () => toggleExpandRef.current(String(p.id))
                : undefined,
        });

        const filtered = lens !== 'all' || search;
        if (isExpanded || (filtered && kids.some(showsBranch))) {
            kids.forEach(c => walk(c, depth + 1));
        }
    }

    roots.forEach(p => walk(p, 0));

    if (orphans.length) {
        rows.push({ _isGroupBand: true, _bandLabel: '⚠ Orphaned — parent id not found', id: '__orphan_band__' });
        orphans.forEach(p => walk(p, 0));
    }

    return rows;
}

// ─── PatternPagesEditor ───────────────────────────────────────────────────────

export function PatternPagesEditor({ value = {}, apiLoad, apiUpdate }) {
    const navigate = useNavigate();
    const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const { user } = useContext(AdminContext) || {};
    const t = { ...pagesEditorTheme, ...(getComponentTheme(themeFromContext, 'admin.pagesEditor')) };

    // Ensure the Table inside this editor uses the default table theme (which has
    // `openOutHideTitle: true` for the below-row style), since the admin ThemeContext
    // doesn't configure a table theme and would otherwise give the Table an empty {}.
    const tableCtxValue = useMemo(() => ({
        UI,
        theme: { ...themeFromContext, table: tableTheme },
    }), [UI, themeFromContext]);

    const [pages, setPages] = useState([]);
    const [sectionsByPageId, setSectionsByPageId] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [search, setSearch] = useState('');
    const [lens, setLens] = useState('all');
    const [scope, setScope] = useState('pages');
    const [typeFilter, setTypeFilter] = useState('');
    const [srcFilter, setSrcFilter] = useState('');
    const [dragId, setDragId] = useState(null);
    const [dropTargetId, setDropTargetId] = useState(null);
    const [previewSection, setPreviewSection] = useState(null);
    const [compById, setCompById] = useState({});
    const [deletingPage, setDeletingPage] = useState(null);

    const patternInstance = useMemo(() => getInstance(value.type), [value.type]);

    // stable ref so tree rows can call toggleExpand without re-creating every row
    const toggleExpandRef = useRef(null);

    const toggleExpand = useCallback((id) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    useEffect(() => {
        toggleExpandRef.current = toggleExpand;
    }, [toggleExpand]);

    const loadAll = useCallback(async () => {
        if (!apiLoad || !value.app || !patternInstance) return;
        setLoading(true);
        try {
            const [pageItems, componentItems] = await Promise.all([
                apiLoad({
                    format: { app: value.app, type: `${patternInstance}|page`, attributes: [] },
                    children: [{ action: 'list', path: '/*' }]
                }, '/').catch(() => []),
                apiLoad({
                    format: { app: value.app, type: `${patternInstance}|component`, attributes: [] },
                    children: [{ action: 'list', path: '/*' }]
                }, '/').catch(() => []),
            ]);

            // Build a lookup of component ID → component
            const compByIdMap = {};
            (componentItems || []).forEach(comp => { compByIdMap[String(comp.id)] = comp; });
            setCompById(compByIdMap);

            const enrichedPages = (pageItems || []).map(p => ({
                ...p,
                _updatedAt: formatUpdatedAt(p.updated_at),
            }));
            setPages(enrichedPages);

            // Use draft_sections if available, fall back to published sections.
            // Pages that have never been published only have draft_sections.
            const grouped = {};
            enrichedPages.forEach(page => {
                const sectionRefs = (page.draft_sections?.length ? page.draft_sections : page.sections) || [];
                const sections = sectionRefs
                    .map(ref => resolveCompRef(ref, compByIdMap))
                    .filter(Boolean)
                    .map(enrichSection);
                if (sections.length > 0) grouped[String(page.id)] = sections;
            });
            setSectionsByPageId(grouped);
        } finally {
            setLoading(false);
        }
    }, [apiLoad, value.app, patternInstance]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const byId = useMemo(() => {
        const map = {};
        pages.forEach(p => { map[String(p.id)] = p; });
        return map;
    }, [pages]);

    const slugFreq = useMemo(() => {
        const map = {};
        pages.forEach(p => { if (p.url_slug) map[p.url_slug] = (map[p.url_slug] || 0) + 1; });
        return map;
    }, [pages]);

    const tableData = useMemo(() => buildFlatTree({
        pages, byId, expandedIds, sectionsByPageId, lens, search, scope, toggleExpandRef, typeFilter, srcFilter, slugFreq
    }), [pages, byId, expandedIds, sectionsByPageId, lens, search, scope, typeFilter, srcFilter, slugFreq]);

    // Available types and sources for section-scope filter dropdowns
    const sectionFilterOptions = useMemo(() => {
        const types = new Set();
        const sources = {};
        let anySourceCount = 0;
        Object.values(sectionsByPageId).forEach(sections => {
            sections.forEach(s => {
                const et = s.element?.['element-type'];
                if (et) types.add(et);
                if (s._sourceName) {
                    sources[s._sourceName] = (sources[s._sourceName] || 0) + 1;
                    anySourceCount++;
                }
            });
        });
        return {
            types: [...types].sort(),
            sources: Object.entries(sources).sort((a, b) => b[1] - a[1]),
            anySourceCount,
        };
    }, [sectionsByPageId]);

    // ── hide_in_nav toggle ────────────────────────────────────────────────────
    const handleUpdateItem = useCallback(async (unused1, unused2, itemOrItems) => {
        const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
        for (const item of items) {
            if (!item?.id) continue;
            // data ->> 'hide_in_nav' returns the string 'false' (truthy!) for JSON false.
            // Store null instead so the field is absent/null and the nav filter (!hide_in_nav) works correctly.
            const hide_in_nav = item.hide_in_nav || null;
            await apiUpdate({
                data: { id: item.id, hide_in_nav },
                config: { format: { app: value.app, type: `${patternInstance}|page`, attributes: [] } },
            });
            setPages(prev => prev.map(p => String(p.id) === String(item.id) ? { ...p, hide_in_nav } : p));
        }
    }, [apiUpdate, value.app, patternInstance]);

    // ── publish page ──────────────────────────────────────────────────────────
    const publishPage = useCallback(async (page) => {
        if (!page?.id) return;

        const draftRefs = page.draft_sections || [];
        const newSections = draftRefs
            .map(ref => resolveCompRef(ref, compById))
            .filter(Boolean)
            .map(stripCompIdentity);

        const publishData = {
            id: page.id,
            has_changes: false,
            published: '',
            section_groups: cloneDeep(page.draft_section_groups) ?? page.section_groups,
            dataSources: cloneDeep(page.draft_dataSources) ?? page.dataSources,
            history: appendHistoryEntry(page.history, 'published changes.', user),
        };

        const formatAttributes = [];
        if (newSections.length > 0) {
            publishData.sections = newSections;
            formatAttributes.push({
                key: 'sections',
                type: 'dms-format',
                isArray: true,
                format: `${value.app}+${patternInstance}|component`,
            });
        }

        await apiUpdate({
            data: publishData,
            config: { format: { app: value.app, type: `${patternInstance}|page`, attributes: formatAttributes } },
        });
        await loadAll();
    }, [apiUpdate, value.app, patternInstance, loadAll, compById, user]);

    // ── discard changes ───────────────────────────────────────────────────────
    const discardPage = useCallback(async (page) => {
        if (!page?.id) return;

        // Revert draft sections to the published sections
        const publishedRefs = page.sections || [];
        const revertedSections = publishedRefs
            .map(ref => resolveCompRef(ref, compById))
            .filter(Boolean)
            .map(stripCompIdentity);

        const formatAttributes = revertedSections.length > 0 ? [{
            key: 'draft_sections',
            type: 'dms-format',
            isArray: true,
            format: `${value.app}+${patternInstance}|component`,
        }] : [];

        await apiUpdate({
            data: {
                id: page.id,
                has_changes: false,
                published: '',
                draft_sections: revertedSections,
                draft_section_groups: page.section_groups,
                history: appendHistoryEntry(page.history, 'discarded changes.', user),
            },
            config: { format: { app: value.app, type: `${patternInstance}|page`, attributes: formatAttributes } },
        });
        await loadAll();
    }, [apiUpdate, value.app, patternInstance, loadAll, compById, user]);

    // ── duplicate page ────────────────────────────────────────────────────────
    const duplicatePage = useCallback(async (page) => {
        if (!page?.id) return;

        // Prefer draft sections; fall back to published sections
        const sourceRefs = (page.draft_sections?.length ? page.draft_sections : page.sections) || [];
        const clonedSections = sourceRefs
            .map(ref => resolveCompRef(ref, compById))
            .filter(Boolean)
            .map(stripCompIdentity);

        const siblings = pages.filter(p => String(p.parent ?? '') === String(page.parent ?? ''));
        const maxIndex = siblings.reduce((max, p) => Math.max(max, p.index ?? 0), 0);
        const newIndex = maxIndex + 1;
        const newTitle = (page.title || 'Page') + ' Copy';
        const url_slug = computeUrlSlug(newTitle, pages, newIndex, page.parent);

        const formatAttributes = clonedSections.length > 0 ? [
            {
                key: 'draft_sections',
                type: 'dms-format',
                isArray: true,
                format: `${value.app}+${patternInstance}|component`,
            },
        ] : [];

        await apiUpdate({
            data: {
                title: newTitle,
                parent: page.parent || null,
                index: newIndex,
                published: 'draft',
                url_slug,
                draft_sections: clonedSections,
                sections: [],
                section_groups: page.section_groups,
                draft_section_groups: page.draft_section_groups ?? page.section_groups,
                dataSources: page.dataSources,
                draft_dataSources: page.draft_dataSources ?? page.dataSources,
                history: appendHistoryEntry(null, 'created duplicate page.', user),
            },
            config: { format: { app: value.app, type: `${patternInstance}|page`, attributes: formatAttributes } },
        });
        await loadAll();
    }, [apiUpdate, value.app, patternInstance, pages, loadAll, compById, user]);

    // ── delete page ───────────────────────────────────────────────────────────
    const deletePage = useCallback(async (page) => {
        if (!page?.id) return;
        await apiUpdate({
            data: { id: page.id },
            config: {
                format: { app: value.app, type: `${patternInstance}|page`, attributes: [] },
            },
            requestType: 'delete'
        });
        setPages(prev => prev.filter(p => String(p.id) !== String(page.id)));
        setSectionsByPageId(prev => {
            const next = { ...prev };
            delete next[String(page.id)];
            return next;
        });
        setDeletingPage(null);
    }, [apiUpdate, value.app, patternInstance]);

    // ── add page ──────────────────────────────────────────────────────────────
    const handleAddPage = useCallback(async () => {
        if (!patternInstance || saving) return;
        setSaving(true);
        try {
            const maxIndex = pages
                .filter(p => !p.parent || p.parent === '')
                .reduce((max, p) => Math.max(max, p.index ?? 0), 0);
            const newIndex = maxIndex + 1;
            const title = 'New Page';
            const url_slug = computeUrlSlug(title, pages, newIndex, null);

            await apiUpdate({
                data: { title, parent: null, index: newIndex, published: 'draft', url_slug },
                config: { format: { app: value.app, type: `${patternInstance}|page`, attributes: [] } },
            });
            if (value.base_url) {
                // navigate(`${value.base_url}/edit/${url_slug}`);
            } else {
                await loadAll();
            }
        } finally {
            setSaving(false);
        }
    }, [pages, value.app, value.base_url, patternInstance, apiUpdate, loadAll, saving, navigate]);

    // ── drag to reorder ───────────────────────────────────────────────────────
    const handleRowDragStart = useCallback((e, rowData) => {
        if (!rowData?.id || rowData._isGroupBand) return;
        setDragId(String(rowData.id));
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(rowData.id));
    }, []);

    const handleRowDragOver = useCallback((e, rowData) => {
        if (!rowData?.id || rowData._isGroupBand) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTargetId(String(rowData.id));
    }, []);

    const handleRowDrop = useCallback(async (e, dropRow) => {
        e.preventDefault();
        const sourceIdStr = e.dataTransfer.getData('text/plain') || dragId;
        const dropIdStr = dropRow?.id ? String(dropRow.id) : null;
        setDragId(null);
        setDropTargetId(null);

        if (!sourceIdStr || !dropIdStr || sourceIdStr === dropIdStr) return;

        const sourcePage = byId[sourceIdStr];
        const dropPage = byId[dropIdStr];
        if (!sourcePage || !dropPage) return;

        // Only allow same-parent reordering
        const sourceParent = String(sourcePage.parent ?? '');
        const dropParent = String(dropPage.parent ?? '');
        if (sourceParent !== dropParent) return;

        // Siblings (same parent), sorted by current index, excluding the dragged page
        const siblings = pages
            .filter(p => String(p.parent ?? '') === sourceParent && String(p.id) !== sourceIdStr)
            .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

        // Insert before the drop target
        const dropIdx = siblings.findIndex(p => String(p.id) === dropIdStr);
        const prevSibling = siblings[dropIdx - 1];
        const nextSibling = siblings[dropIdx]; // this is the drop target itself

        let newIndex;
        if (!prevSibling) {
            newIndex = (nextSibling?.index ?? 0) - 1;
        } else if (!nextSibling) {
            newIndex = (prevSibling?.index ?? 0) + 1;
        } else {
            newIndex = ((prevSibling.index ?? 0) + (nextSibling.index ?? 0)) / 2;
        }

        // Update local state immediately for snappy UX
        setPages(prev => prev.map(p =>
            String(p.id) === sourceIdStr ? { ...p, index: newIndex } : p
        ));

        // Persist to server
        await apiUpdate({
            data: { id: sourceIdStr, index: newIndex },
            config: { format: { app: value.app, type: `${patternInstance}|page`, attributes: [] } },
        });
    }, [dragId, byId, pages, value.app, patternInstance, apiUpdate]);

    const handleRowDragEnd = useCallback(() => {
        setDragId(null);
        setDropTargetId(null);
    }, []);

    // counts for lens chips
    const counts = useMemo(() => ({
        queue: pages.filter(needsPublish).length,
        empty: pages.filter(p => (sectionsByPageId[String(p.id)] || []).length === 0).length,
        orphans: pages.filter(p => isOrphan(p, byId)).length,
        hidden: pages.filter(p => p.hide_in_nav).length,
        dupes: pages.filter(p => p.url_slug && (slugFreq[p.url_slug] || 0) > 1).length,
        stale: pages.filter(p =>
            p.published === 'draft' &&
            p.updated_at &&
            (Date.now() - new Date(p.updated_at)) / 86400000 > 90
        ).length,
    }), [pages, sectionsByPageId, byId, slugFreq]);

    const expandAll = useCallback(() => {
        setExpandedIds(new Set(pages.filter(p => pages.some(c => String(c.parent) === String(p.id))).map(p => String(p.id))));
    }, [pages]);

    const collapseAll = useCallback(() => setExpandedIds(new Set()), []);

    const gridRef = useRef(null);

    // SectionsPanel bound to theme, page context, navigate, and preview
    const SectionsPanelComp = useCallback(({ value: sections, row: page }) => (
        <SectionsPanel value={sections} page={page} baseUrl={value.base_url} navigate={navigate} setPreviewSection={setPreviewSection} t={t} />
    ), [t, value.base_url, navigate, setPreviewSection]);

    // Page-level action buttons (Publish / Discard / Duplicate / Edit / Delete) in each row
    const PageActionsComp = useCallback(({ row: page }) => {
        if (!page || page._isGroupBand) return null;
        const hasChanges = needsPublish(page);
        const pageSlug = page.url_slug || '';
        const editUrl = value.base_url && pageSlug ? `${value.base_url}/edit/${pageSlug}` : null;

        return (
            <div className={t.rowActions}>
                {editUrl && (
                    <button className={t.ghostBtn} onClick={() => navigate(editUrl)}>Edit</button>
                )}
                {hasChanges && (
                    <>
                        <button className={t.publishBtn} onClick={() => publishPage(page)}>Publish</button>
                        <button className={t.discardBtn} onClick={() => discardPage(page)}>Discard</button>
                    </>
                )}
                <button className={t.ghostBtn} onClick={() => duplicatePage(page)}>Duplicate</button>
                <button className={t.deleteBtn} onClick={() => setDeletingPage(page)}>Delete</button>
            </div>
        );
    }, [t, value.base_url, navigate, publishPage, discardPage, duplicatePage, setDeletingPage]);

    const columns = useMemo(() => [
        { name: 'title',           display_name: 'Page',      show: true, type: 'tree_node',     size: 360 },
        { name: '_publishState',   display_name: 'State',     show: true, type: 'publish_state', size: 110 },
        { name: '_updatedAt',      display_name: 'Updated At', show: true, type: 'text',           size: 110 },
        { name: 'hide_in_nav',     display_name: 'In Nav',    show: true, type: 'switch',         size: 72,
          allowEditInView: true, trueValue: false },
        { name: '_actions',        display_name: '',          show: true, type: 'ui',             size: 270,
          Comp: PageActionsComp },
        { name: '_sectionCount',   display_name: 'Sections',  show: true, type: 'sections_chip',  size: 90,
          openOutTrigger: true },
        { name: '_sections',       display_name: 'Sections',  show: true, type: 'ui',
          Comp: SectionsPanelComp, openOut: true },
    ], [SectionsPanelComp, PageActionsComp]);

    const lenses = [
        { id: 'all',     label: 'All Pages' },
        { id: 'queue',   label: 'To Publish',  count: counts.queue },
        { id: 'empty',   label: 'Empty',        count: counts.empty },
        { id: 'orphans', label: 'Orphans',      count: counts.orphans, warn: true },
        { id: 'hidden',  label: 'Off Nav',      count: counts.hidden },
        { id: 'dupes',   label: 'Dupe Slugs',   count: counts.dupes,  warn: counts.dupes > 0 },
        { id: 'stale',   label: 'Stale Drafts', count: counts.stale },
    ];

    return (
        <div className={t.wrapper}>
            {/* toolbar */}
            <div className={t.toolbar}>
                <div className={t.lensBar}>
                    {lenses.map(l => {
                        const isActive = lens === l.id;
                        return (
                            <button
                                key={l.id}
                                className={isActive ? t.lensChipActive : t.lensChip}
                                onClick={() => setLens(l.id)}
                            >
                                {l.label}
                                {l.count != null && (
                                    <span className={isActive ? t.lensCountActive : t.lensCount}>
                                        {l.count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className={t.divider} />

                <div className={t.scopeSeg}>
                    {['pages', 'sections'].map(s => (
                        <button
                            key={s}
                            className={scope === s ? t.scopeBtnActive : t.scopeBtn}
                            onClick={() => {
                                setScope(s);
                                setSearch('');
                                setTypeFilter('');
                                setSrcFilter('');
                            }}
                        >
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>

                <div className={`${t.searchWrap} relative`}>
                    <svg className={t.searchIcon} width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input
                        type="text"
                        className={t.searchInput}
                        placeholder={scope === 'sections' ? 'Search sections & sources…' : 'Search page titles…'}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {scope === 'sections' && (
                    <>
                        <div className={t.filterWrap}>
                            <select
                                className={typeFilter ? t.filterSelectActive : t.filterSelect}
                                value={typeFilter}
                                onChange={e => setTypeFilter(e.target.value)}
                            >
                                <option value="">All types</option>
                                {sectionFilterOptions.types.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                            <span className={t.filterCaret}>▾</span>
                        </div>
                        <div className={t.filterWrap}>
                            <select
                                className={srcFilter ? t.filterSelectActive : t.filterSelect}
                                value={srcFilter}
                                onChange={e => setSrcFilter(e.target.value)}
                            >
                                <option value="">All sections</option>
                                <option value="__any__">Any data source ({sectionFilterOptions.anySourceCount})</option>
                                {sectionFilterOptions.sources.map(([name, count]) => (
                                    <option key={name} value={name}>{name} ({count})</option>
                                ))}
                            </select>
                            <span className={t.filterCaret}>▾</span>
                        </div>
                    </>
                )}

                <div className="flex-1" />

                <button className={t.ghostBtn} onClick={expandAll}>Expand All</button>
                <button className={t.ghostBtn} onClick={collapseAll}>Collapse All</button>
                <button
                    className={t.addBtn}
                    onClick={handleAddPage}
                    disabled={saving}
                >
                    {saving ? 'Adding…' : '+ New Page'}
                </button>
            </div>

            {/* table */}
            <div className={t.tableWrap} ref={gridRef}>
                {loading ? (
                    <div className={t.loadingWrap}>Loading pages…</div>
                ) : (
                    <ThemeContext.Provider value={tableCtxValue}>
                        <Table
                            gridRef={gridRef}
                            columns={columns}
                            data={tableData}
                            activeStyle="below-row"
                            display={{ showGutters: false, virtualizeColumns: false }}
                            allowEdit={false}
                            isActive={true}
                            updateItem={handleUpdateItem}
                            onRowDragStart={handleRowDragStart}
                            onRowDragOver={handleRowDragOver}
                            onRowDrop={handleRowDrop}
                            onRowDragEnd={handleRowDragEnd}
                        />
                    </ThemeContext.Provider>
                )}
            </div>

            {/* footer */}
            <div className={t.footer}>
                {scope === 'sections' && (typeFilter || srcFilter || search)
                    ? (() => {
                        const matchPages = tableData.filter(r => !r._isGroupBand);
                        const matchSections = matchPages.reduce((a, r) => a + (r._sections?.length || 0), 0);
                        return `${matchSections} sections across ${matchPages.length} pages`;
                    })()
                    : `${pages.length} pages · ${Object.values(sectionsByPageId).reduce((a, b) => a + b.length, 0)} sections`
                }
            </div>

            {/* element preview modal */}
            {UI?.Modal && previewSection && (() => {
                const elementType = previewSection.element?.['element-type'] || previewSection['element-type'] || 'Lexical';
                const typeKey = TYPE_BADGE_CLASS[elementType] || 'badgeLexical';
                const levelNum = previewSection.level != null ? +previewSection.level : null;
                return (
                    <UI.Modal
                        open={true}
                        setOpen={(open) => { if (!open) setPreviewSection(null); }}
                        className={t.previewPanel}
                    >
                        <div className={t.previewHeader}>
                            <div>
                                <div className={t.previewTitle}>
                                    {previewSection.title || '(untitled section)'}
                                </div>
                                <div className={t.previewMeta}>
                                    <span className={`${t.badgeBase} ${t[typeKey]}`}>{elementType}</span>
                                    {previewSection.is_draft && (
                                        <span className="text-[10px] text-amber-600 font-semibold uppercase tracking-wide">Draft</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className={t.previewBody}>
                            {previewSection._sourceName && (
                                <div className={t.previewRow}>
                                    <span className={t.previewLabel}>Source</span>
                                    <span className={`${t.previewValue} ${t.srcLabel}`}>{previewSection._sourceName}</span>
                                </div>
                            )}
                            {previewSection._viewChip && (
                                <div className={t.previewRow}>
                                    <span className={t.previewLabel}>View</span>
                                    <span className={`${t.previewValue} font-mono text-[11px]`}>
                                        v{previewSection._viewChip.view}{previewSection._viewChip.fresh ? ' ✓' : ''}
                                    </span>
                                </div>
                            )}
                            {previewSection._summary && previewSection._summary.kind !== 'empty' && (
                                <div className={`${t.previewRow} items-start`}>
                                    <span className={`${t.previewLabel} mt-0.5`}>Content</span>
                                    <span className={`${t.previewValue} whitespace-pre-wrap italic text-gray-500 max-h-48 overflow-y-auto`}>
                                        {previewSection._summary.text}
                                    </span>
                                </div>
                            )}
                            {levelNum != null && (
                                <div className={t.previewRow}>
                                    <span className={t.previewLabel}>Level</span>
                                    <span className={t.previewValue}>
                                        {levelNum === 0 ? 'Hidden' : `H${levelNum}`}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className={t.previewFooter}>
                            {previewSection._pageViewUrl && (
                                <a
                                    href={previewSection._pageViewUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={t.previewLink}
                                >
                                    View page ↗
                                </a>
                            )}
                            <button className={t.ghostBtn} onClick={() => setPreviewSection(null)}>
                                Close
                            </button>
                        </div>
                    </UI.Modal>
                );
            })()}

            {/* delete confirmation modal */}
            {UI?.Modal && deletingPage && (() => {
                const childCount = pages.filter(p => String(p.parent) === String(deletingPage.id)).length;
                return (
                    <UI.Modal
                        open={true}
                        setOpen={(open) => { if (!open) setDeletingPage(null); }}
                    >
                        <div className={t.deleteModal}>
                            <div className={t.deleteModalTitle}>Delete Page</div>
                            <div className={t.deleteModalDesc}>
                                Delete <span className={t.deleteModalHighlight}>{deletingPage.title || '(untitled)'}</span>?
                            </div>
                            {childCount > 0 ? (
                                <>
                                    <div className={t.deleteModalWarn}>
                                        This page has {childCount} child page{childCount > 1 ? 's' : ''}. Remove or reparent them before deleting.
                                    </div>
                                    <div className={t.deleteModalFooter}>
                                        <button className={t.deleteModalCancelBtn} onClick={() => setDeletingPage(null)}>Cancel</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className={t.deleteModalInfo}>
                                        This cannot be undone. The page and its sections will be permanently removed.
                                    </div>
                                    <div className={t.deleteModalFooter}>
                                        <button className={t.deleteModalCancelBtn} onClick={() => setDeletingPage(null)}>Cancel</button>
                                        <button className={t.deleteModalConfirmBtn} onClick={() => deletePage(deletingPage)}>Delete</button>
                                    </div>
                                </>
                            )}
                        </div>
                    </UI.Modal>
                );
            })()}
        </div>
    );
}
