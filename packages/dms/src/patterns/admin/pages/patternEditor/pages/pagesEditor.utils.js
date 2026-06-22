import { get } from 'lodash-es';

// ─── History loading ──────────────────────────────────────────────────────────

// Both old entries (type field) and new entries (action field) are in use.
// Normalize to a consistent shape for callers.
function normalizeEntry(e) {
    return { action: e.action || e.type || '', user: e.user, time: e.time };
}

function isPublishEntry(e) {
    return (e.action || e.type || '') === 'published changes.';
}

/**
 * Batch-load history rows for an array of pages.
 * Returns a map of String(pageId) → { entries, lastPublished }
 * where lastPublished = ISO string of the most recent "published changes." entry, or null.
 */
export async function loadPageHistory(pages, falcor) {
    if (!falcor || !pages?.length) return {};

    // Collect pages that have a history ref
    const refPages = pages.filter(p => p.history?.id && p.history?.ref);
    if (!refPages.length) return {};

    // Falcor byId path uses just app (the part before '+' in the ref), not the full app+type ref
    // Group by app so all history rows for the same app can be batch-fetched in one call
    const byApp = {};
    refPages.forEach(p => {
        const app = p.history.ref.split('+')[0];
        if (!byApp[app]) byApp[app] = [];
        byApp[app].push({ pageId: String(p.id), historyId: String(p.history.id) });
    });

    // Batch fetch per app
    const result = {};
    await Promise.all(Object.entries(byApp).map(async ([app, items]) => {
        const ids = items.map(i => i.historyId);
        try {
            const res = await falcor.get(['dms', 'data', app, 'byId', ids, ['data']]);
            items.forEach(({ pageId, historyId }) => {
                const raw = get(res, ['json', 'dms', 'data', app, 'byId', historyId, 'data'], null);
                const entries = (raw?.entries || []).map(normalizeEntry);
                const publishEntries = entries.filter(isPublishEntry);
                publishEntries.sort((a, b) => new Date(b.time) - new Date(a.time));
                const lastPublishedEntry = publishEntries[0] || null;
                result[pageId] = {
                    entries,
                    lastPublished: lastPublishedEntry ? new Date(lastPublishedEntry.time).toISOString() : null,
                    lastPublishedBy: lastPublishedEntry?.user || null,
                };
            });
        } catch (_) {}
    }));

    return result;
}

// ─── Section enrichment: add _sourceName, _sourceId, _viewId, _viewChip, _summary

function extractLexicalText(root) {
    if (!root?.children) return null;
    const lines = [];
    for (const node of root.children) {
        const text = (node.children || [])
            .filter(n => n.type === 'text')
            .map(n => n.text || '')
            .join('');
        if (text.trim()) lines.push(text.trim());
    }
    if (!lines.length) return { kind: 'empty' };
    return { kind: 'text', text: lines.join('\n\n') };
}

export function enrichSection(comp) {
    const raw = comp.element?.['element-data'];
    let elementData = {};
    if (raw) {
        if (typeof raw === 'string') { try { elementData = JSON.parse(raw); } catch (_) {} }
        else elementData = raw;
    }
    // sourceInfo is canonical in live data; externalSource is the v1/legacy field
    const sourceInfo = elementData.sourceInfo || {};
    const externalSource = elementData.externalSource || {};
    const _sourceName = sourceInfo.name || externalSource.name || null;
    const _sourceId = sourceInfo.source_id != null ? +sourceInfo.source_id : (externalSource.source_id != null ? +externalSource.source_id : null);
    const _viewId = sourceInfo.view_id != null ? +sourceInfo.view_id : (externalSource.view_id != null ? +externalSource.view_id : null);
    // srcEnv: the UDA env key used to list sources for this source's pattern
    const _srcEnv = sourceInfo.srcEnv || externalSource.srcEnv || null;
    const _viewChip = _viewId != null
        ? { view: _viewId, stale: false, fresh: false }
        : null;

    const elementType = comp.element?.['element-type'] || '';
    let _summary = null;

    if (elementType === 'lexical' || elementType === 'Lexical' || elementType === 'Rich Text') {
        const lexContent = elementData.text;
        if (lexContent) {
            try {
                const parsed = typeof lexContent === 'string' ? JSON.parse(lexContent) : lexContent;
                _summary = extractLexicalText(parsed?.root);
            } catch (_) {}
        }
        if (!_summary) _summary = { kind: 'empty' };
    } else {
        const cols = elementData.columns?.filter(c => c.show !== false && (c.display_name || c.name));
        if (cols?.length) {
            _summary = { kind: 'text', text: cols.map(c => c.display_name || c.name).join(', ') };
        } else if (_sourceName) {
            _summary = { kind: 'text', text: _sourceName };
        }
    }

    return { ...comp, _sourceName, _sourceId, _viewId, _srcEnv, _viewChip, _summary };
}
