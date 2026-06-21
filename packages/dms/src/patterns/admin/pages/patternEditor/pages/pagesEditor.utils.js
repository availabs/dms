// Section enrichment: add _sourceName, _sourceId, _viewId, _viewChip, _summary

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
