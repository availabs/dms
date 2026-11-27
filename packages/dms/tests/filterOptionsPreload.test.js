/**
 * A section's filter controls loaded their option lists after mount: two requests per control once the page
 * was up. The page loader now reads them with the section's rows (api/preloadSectionData.js), keyed by the
 * filters they were read for; the filter UI uses them while that key still stands.
 * See planning/tasks/current/first-fetch-and-preload-gaps.md.
 */
import { describe, it, expect } from "vitest";
import { filterOptionsKey, withPageFilterValues, loadFilterOptions } from "../src/patterns/page/components/sections/components/dataWrapper/components/filters/loadFilterOptions.js";

const col = (name, filter) => ({ name, type: 'text', filters: filter ? [filter] : [] });
const external = (extra = {}) => ({ type: 'external', operation: 'filter', values: [], ...extra });
const state = (columns) => ({ externalSource: { source_id: 870, view_id: 2401 }, columns });

describe("withPageFilterValues", () => {
    const columns = [col('state', external({ usePageFilters: true, searchParamKey: 'st' })), col('hazard', external({ values: ['wind'] })), col('plain')];

    it("writes a page variable's values into the filter bound to it, and nothing else", () => {
        const next = withPageFilterValues(columns, { st: ['36'], hazard: ['flood'] });
        expect(next[0].filters[0].values).toEqual(['36']);
        expect(next[1]).toBe(columns[1]);
        expect(next[2]).toBe(columns[2]);
        expect(columns[0].filters[0].values).toEqual([]);
    });
    it("wraps a single value, and clears a bound filter whose variable is not set", () => {
        expect(withPageFilterValues(columns, { st: '36' })[0].filters[0].values).toEqual(['36']);
        const set = [col('state', external({ usePageFilters: true, searchParamKey: 'st', values: ['36'] }))];
        expect(withPageFilterValues(set, { other: ['x'] })[0].filters[0].values).toEqual([]);
    });
    it("returns the same array when nothing changes or the page has no values", () => {
        expect(withPageFilterValues(columns, {})).toBe(columns);
        expect(withPageFilterValues(columns, null)).toBe(columns);
        expect(withPageFilterValues(columns, { hazard: ['flood'] })).toBe(columns);
    });
});

describe("filterOptionsKey", () => {
    const base = state([col('state', external()), col('plain')]);

    it("is the same for the same filters, whatever else the settings hold", () => {
        expect(filterOptionsKey({ ...base, display: { pageSize: 5 }, data: [{}] })).toBe(filterOptionsKey(base));
    });
    it("changes with a filter's values, the source, or the mode", () => {
        const k = filterOptionsKey(base);
        expect(filterOptionsKey(state([col('state', external({ values: ['36'] })), col('plain')]))).not.toBe(k);
        expect(filterOptionsKey({ ...base, externalSource: { source_id: 870, view_id: 15819 } })).not.toBe(k);
        expect(filterOptionsKey(base, true)).not.toBe(k);
    });
});

describe("loadFilterOptions", () => {
    it("uses a column's own option list without asking, and skips internal filters in view", async () => {
        const calls = [];
        const apiLoad = async (...a) => { calls.push(a); return []; };
        const s = state([
            { ...col('month', external()), options: [{ value: 1, label: 'Jan' }, { value: 2 }] },
            col('hidden', { type: 'internal', operation: 'filter', values: ['x'] }),
            col('amount', external({ operation: 'gt', values: [5] })),
        ]);
        const options = await loadFilterOptions({ state: s, apiLoad });
        expect(options).toEqual([{ column: 'month', uniqValues: [{ label: 'Jan', value: 1 }, { label: 2, value: 2 }] }]);
        expect(calls.length).toBe(0);
    });
});
