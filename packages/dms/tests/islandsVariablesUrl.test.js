/**
 * A page with URL-bound page variables, opened with no search string, moves to itself with the variables
 * written out (`?state=&hazard=`). Under the islands path that navigation fetched the whole page again:
 * every query ran twice and every live section remounted (FUSION national-overview, 2026-11-25: 4.5 s of
 * an 11.5 s load). The server now names that URL with the page, and the browser entry answers it itself.
 */
import { describe, it, expect } from "vitest";
import { pageVariablesUrl } from "../src/patterns/page/pages/_utils";
import { isShownPage } from "../src/render/islands/islandData.js";

const item = { url_slug: "national-overview" };
const pageState = { filters: [
    // an empty string is written as `state=`; an empty array is left out
    { searchKey: "state", values: "", useSearchParams: true },
    { searchKey: "hazard", values: [], useSearchParams: true },
    { searchKey: "year", values: "2024", useSearchParams: true },
    { searchKey: "local", values: ["x"], useSearchParams: false },
] };
const at = (path) => new URL(path, "http://fusion.localhost");

describe("pageVariablesUrl", () => {
    it("writes the URL-bound variables and no others", () => {
        expect(pageVariablesUrl({ pageState, baseUrl: "/fusion", item, isView: true })).toBe("/fusion/national-overview?state=&year=2024");
    });
    it("is null for a page with no URL-bound variables or an unresolved item", () => {
        expect(pageVariablesUrl({ pageState: { filters: [pageState.filters[3]] }, baseUrl: "/fusion", item, isView: true })).toBe(null);
        expect(pageVariablesUrl({ pageState, baseUrl: "/fusion", item: {}, isView: true })).toBe(null);
    });
});

describe("isShownPage", () => {
    const island = { variablesUrl: "/fusion/national-overview?state=&year=2024" };
    it("answers the move from the bare URL to the written-out one", () => {
        expect(isShownPage(island, true, at("/fusion/national-overview?state=&year=2024"))).toBe(true);
    });
    it("fetches anything else", () => {
        expect(isShownPage(island, true, at("/fusion/national-overview?state=36&year=2024"))).toBe(false);
        expect(isShownPage(island, true, at("/fusion/explore?state=&year=2024"))).toBe(false);
        // the page shown was not rendered for a bare URL
        expect(isShownPage(island, false, at("/fusion/national-overview?state=&year=2024"))).toBe(false);
        expect(isShownPage({}, true, at("/fusion/national-overview"))).toBe(false);
    });
});
