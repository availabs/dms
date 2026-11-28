import { get } from "lodash-es";

// a boxed value as Model.getCache() with no arguments returns it: without the size falcor keeps beside it
const unsized = (v) => {
    if (!v || typeof v !== 'object' || !('$size' in v)) return v;
    const { $size, ...rest } = v;
    return rest;
};

/**
 * The rows of one UDA request (`[..., 'dataByIndex', { from, to }, attributes]`), read back from the model's
 * cache after the get: one object per index, `{}` for an index with nothing.
 *
 * Reads only the request's own paths. dmsDataLoader used to take `falcor.getCache()` here, a copy of the
 * WHOLE cache, for every dataset request: on the server, where signed-out renders share one model, that was
 * 115 ms of a 480 ms render of FUSION's national-overview (2026-11-25), and it grew with everything any page
 * had loaded. The rows are the same objects that copy held (tests/udaRowsFromCache.test.js).
 */
export function udaRowsFromCache(falcor, request) {
    const at = request.indexOf('dataByIndex');
    const path = request.slice(0, at + 1);
    const { from, to } = request[at + 1];
    const graph = falcor.getCache(request);
    return Array.from({ length: to + 1 - from }, (v, k) => {
        const row = get(graph, [...path, k + from], {});
        if (!row || typeof row !== 'object') return row;
        if (row.$type) return unsized(row);
        const out = {};
        for (const key of Object.keys(row)) out[key] = unsized(row[key]);
        return out;
    });
}
