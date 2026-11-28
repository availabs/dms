/**
 * dmsDataLoader read a dataset request's rows out of `falcor.getCache()`, a copy of the whole cache, for
 * every request. udaRowsFromCache reads the request's own paths; the rows must be what the whole copy held.
 * See planning/tasks/current/first-fetch-and-preload-gaps.md.
 */
import { describe, it, expect } from "vitest";
import falcor from "falcor";
import { get } from "lodash-es";
import { udaRowsFromCache } from "../src/api/udaRows.js";

const options = JSON.stringify({ groupBy: ["geoid"], filter: {} });
const attrs = ["geoid", "sum(x) as total", "to_char(1,'FM9') as label"];
const base = ["uda", "hazmit_dama", "viewsById", 7, "options", options, "dataByIndex"];

function model() {
    const rows = {};
    for (let i = 0; i < 5; i++) rows[i] = {
        geoid: "3600" + i,
        "sum(x) as total": i * 1.5,
        "to_char(1,'FM9') as label": { $type: "atom", value: { originalValue: i, value: "L" + i } },
    };
    rows[3]["sum(x) as total"] = { $type: "atom", value: null };
    rows[4].geoid = { $type: "atom", value: ["a", "b"] };
    rows[6] = { $type: "error", value: { message: "no" } };
    const m = new falcor.Model();
    m.setCache({ uda: { hazmit_dama: { viewsById: {
        7: { options: { [options]: { length: 5, dataByIndex: rows } } },
        8: { options: { other: { length: 2, dataByIndex: { 0: { geoid: "x" } } } } },
    } } } });
    return m;
}
// what dmsDataLoader did before
const fromWholeCopy = (m, request) => {
    const cache = m.getCache();
    const { from, to } = request[request.indexOf("dataByIndex") + 1];
    return Array.from({ length: to + 1 - from }, (v, k) => get(cache, [...base, k + from], {}));
};

describe("udaRowsFromCache", () => {
    it("returns the rows the whole-cache copy held, value for value", () => {
        const m = model();
        const request = [...base, { from: 0, to: 7 }, attrs];
        expect(udaRowsFromCache(m, request)).toEqual(fromWholeCopy(m, request));
    });
    it("honours the request's window and attributes", () => {
        const m = model();
        const rows = udaRowsFromCache(m, [...base, { from: 2, to: 3 }, ["geoid"]]);
        expect(rows).toEqual([{ geoid: "36002" }, { geoid: "36003" }]);
    });
    it("gives an empty object for an index with nothing, and leaves the model's cache as it was", () => {
        const m = model();
        const before = JSON.stringify(m.getCache());
        expect(udaRowsFromCache(m, [...base, { from: 5, to: 5 }, attrs])).toEqual([{}]);
        udaRowsFromCache(m, [...base, { from: 0, to: 4 }, attrs]);
        expect(JSON.stringify(m.getCache())).toBe(before);
    });
});
