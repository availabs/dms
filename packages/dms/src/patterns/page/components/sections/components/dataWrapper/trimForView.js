/**
 * A data section's settings trimmed for a view page's loader data (page-hydration-payload.md).
 *
 * A section saves a copy of its source's whole column list (`externalSource.columns`; `sourceInfo.columns`
 * in the v1 shape), so the editor's column picker has it: 348 columns, ~148 KB, for MitigateNY's
 * buildings source, in every Spreadsheet and Card over it. In view, the first render needs only the
 * columns the section refers to, to build the same request (buildUdaConfig looks columns up by
 * name). A column is kept when its name appears anywhere else in the section's settings (its
 * columns, filters, join, pivot, display, calculated SQL), so the trim keeps a superset of what
 * the request reads. After mount `useDataSource` reads the source list and puts the full column
 * list back, as it does whenever the saved copy is out of date ("Download → All Columns" uses it).
 *
 * Never used on the edit route. Returns the input unchanged when there is nothing to trim or the
 * settings can't be read, and a string when given a string.
 */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function trimColumns(list, referenced) {
    if (!Array.isArray(list)) return list;
    // a name that isn't a plain identifier can't be matched as a token: keep it
    return list.filter(col => !col || typeof col.name !== 'string' || !IDENTIFIER.test(col.name) || referenced.has(col.name));
}

export function trimDataWrapperForView(elementData) {
    const isString = typeof elementData === 'string';
    let state;
    try {
        state = isString ? JSON.parse(elementData) : elementData;
    } catch {
        return elementData;
    }
    if (!state || typeof state !== 'object') return elementData;

    const sourceKey = state.externalSource?.columns ? 'externalSource' : state.sourceInfo?.columns ? 'sourceInfo' : null;
    // nothing chosen: the section may show every source column, so it needs them all
    if (!sourceKey || !Array.isArray(state.columns) || !state.columns.length) return elementData;

    // everything else the section saved, without the column list itself and without its rows
    const source = state[sourceKey];
    const sourceColumns = source.columns;
    const rest = { ...state, [sourceKey]: { ...source, columns: undefined }, data: undefined };
    const referenced = new Set(JSON.stringify(rest).match(/[A-Za-z_][A-Za-z0-9_]*/g) || []);

    const kept = trimColumns(sourceColumns, referenced);
    if (kept.length === sourceColumns.length) return elementData;

    const trimmed = { ...state, [sourceKey]: { ...source, columns: kept } };
    return isString ? JSON.stringify(trimmed) : trimmed;
}
