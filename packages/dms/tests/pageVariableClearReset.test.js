/**
 * Clearing a URL-bound page variable that has a registered default resets it to the default.
 *
 * Ticket 2214477 (TSMO home): the page registers `year` (default "2025", URL-bound). The first ×
 * on the year control changed the URL (?year=2025 → bare) and the URL→pageState pass restored
 * the default; the second × changed nothing in the URL, so the [] stuck and every reacting
 * section widened (most cards showed 2026, the full-year PM3 cards 2025). updatePageStateFilters
 * (pages/view.jsx, pages/edit/index.jsx) now routes every clear through this resolver.
 */
import { describe, it, expect } from "vitest";
import { resolveClearedPageVariables } from "../src/patterns/page/pages/_utils";

// The TSMO home registry row, exactly as stored on page 1431215.
const YEAR = { id: "tsmo-year", values: "2025", searchKey: "year", useSearchParams: true };

describe("resolveClearedPageVariables", () => {
    it("resets a cleared URL-bound variable to its registered default (ticket 2214477)", () => {
        // pageState after the URL→state pass that followed the first × — the registry's bare string
        const pageFilters = [{ ...YEAR }];
        expect(resolveClearedPageVariables({ year: true }, pageFilters, [YEAR])).toEqual({ year: ["2025"] });
    });

    it("resets whatever the current value is — a non-default pick cleared goes back to the default", () => {
        const pageFilters = [{ ...YEAR, values: ["2026"] }];
        expect(resolveClearedPageVariables({ year: true }, pageFilters, [YEAR])).toEqual({ year: ["2025"] });
    });

    it("keeps clear-to-empty for a URL-bound variable with no registered default", () => {
        const empty = [
            { searchKey: "a", values: "", useSearchParams: true },
            { searchKey: "b", values: [], useSearchParams: true },
            { searchKey: "c", values: [""], useSearchParams: true },
            { searchKey: "d", useSearchParams: true },
        ];
        expect(resolveClearedPageVariables({ a: true, b: true, c: true, d: true }, empty, empty)).toEqual({});
    });

    it("leaves non-URL page variables alone (their clear keeps its long-standing meaning)", () => {
        const local = { searchKey: "region", values: "1", useSearchParams: false };
        expect(resolveClearedPageVariables({ region: true }, [local], [local])).toEqual({});
    });

    it("ignores removeFilter entries that are false (a control that SET a value, not cleared it)", () => {
        expect(resolveClearedPageVariables({ year: false }, [{ ...YEAR }], [YEAR])).toEqual({});
    });

    it("ignores keys that are not registered on the page (e.g. action params)", () => {
        const action = { searchKey: "pick", values: ["x"], useSearchParams: false, type: "action" };
        expect(resolveClearedPageVariables({ pick: true, nope: true }, [action], [])).toEqual({});
    });

    it("keeps an array default as an array and drops its empty members", () => {
        const multi = { searchKey: "hazard", values: ["riverine", "", null, "coastal"], useSearchParams: true };
        expect(resolveClearedPageVariables({ hazard: true }, [multi], [multi])).toEqual({ hazard: ["riverine", "coastal"] });
    });

    it("reads the default from the registry, not the current pageState value", () => {
        // pageState holds a URL-supplied value; only the registry knows the default
        const pageFilters = [{ ...YEAR, values: ["2024"] }];
        const registry = [{ ...YEAR, values: "2025" }];
        expect(resolveClearedPageVariables({ year: true }, pageFilters, registry)).toEqual({ year: ["2025"] });
    });

    it("tolerates missing arguments", () => {
        expect(resolveClearedPageVariables()).toEqual({});
        expect(resolveClearedPageVariables({ year: true }, undefined, undefined)).toEqual({});
    });
});
