/**
 * Mount-aware resolution of site-absolute authored links.
 *
 * The cases below are the REAL values swept out of the npmrdsv5/dev2 database
 * (Phase 0 of planning/transportny/tasks/current/subdomain-to-path-consolidation.md):
 * 13 distinct site-absolute values in tsmo2, 16 in npmrds_sub, 26 in
 * freightatlas2_copy, 6 in landing — the ones that must move with the mount and
 * the ones that must not.
 */
import { describe, it, expect } from "vitest";
import { resolveMountPath, collectSiteRootPaths, firstSegment } from "../src/utils/mountPath";

// Every pattern mount in the npmrdsv5 site, as pattern2routes builds it.
const ROOTS = collectSiteRootPaths([
    "/", "/docs", "/auth", "/datasources", "/sitemgmt", "/status", "/list",
    "/mapeditor", "/datasets_test", "/page_test", "freight_data",
    "/freightatlas", "/freightatlas/freight_data", "/tsmo", "/npmrds",
]);

describe("collectSiteRootPaths", () => {
    it("keeps first segments, drops the root mount, dedupes, and tolerates a missing leading slash", () => {
        expect(ROOTS).toContain("/docs");
        expect(ROOTS).toContain("/freight_data");   // authored without a leading slash on the pattern row
        expect(ROOTS).not.toContain("/");           // a `/` mount claims no segment
        expect(ROOTS.filter(r => r === "/freightatlas")).toHaveLength(1); // /freightatlas + /freightatlas/freight_data
    });
});

describe("firstSegment", () => {
    it("stops at /, ? and #", () => {
        expect(firstSegment("/freight_data?cat=Freight%20Atlas")).toBe("/freight_data");
        expect(firstSegment("/map_21/level_of_travel_time_reliability")).toBe("/map_21");
        expect(firstSegment("/docs#top")).toBe("/docs");
        expect(firstSegment("/")).toBe("");
    });
});

describe("resolveMountPath — BC: a root mount never rewrites anything", () => {
    // Every mount that exists today except the Freight Atlas www:/fa pair.
    it.each(["/", "", undefined, null])("baseUrl %s is a no-op", (base) => {
        for (const p of ["/congestion_v2", "/docs/npmrds/overview", "/", "home", "sub://tsmo2/",
                         "https://www.dot.ny.gov/freight-plan/reports", ""]) {
            expect(resolveMountPath(p, base, ROOTS)).toBe(p);
        }
    });
});

describe("resolveMountPath — in-pattern links follow the mount", () => {
    it("prefixes tsmo2's authored page links on /tsmo", () => {
        const on = (p) => resolveMountPath(p, "/tsmo", ROOTS);
        expect(on("/congestion_v2")).toBe("/tsmo/congestion_v2");
        expect(on("/reliability_v2")).toBe("/tsmo/reliability_v2");
        expect(on("/incident_search")).toBe("/tsmo/incident_search");
        expect(on("/corridor_view")).toBe("/tsmo/corridor_view");
        expect(on("/methodology")).toBe("/tsmo/methodology");
        expect(on("/workzones_v2")).toBe("/tsmo/workzones_v2");
        expect(on("/about")).toBe("/tsmo/about");
    });

    it("maps the pattern's own home ('/') to the mount root", () => {
        expect(resolveMountPath("/", "/tsmo", ROOTS)).toBe("/tsmo");
    });

    it("prefixes npmrds links, including nested slugs", () => {
        const on = (p) => resolveMountPath(p, "/npmrds", ROOTS);
        expect(on("/macro")).toBe("/npmrds/macro");
        expect(on("/map_21")).toBe("/npmrds/map_21");
        expect(on("/map_21/level_of_travel_time_reliability"))
            .toBe("/npmrds/map_21/level_of_travel_time_reliability");
        expect(on("/reports/snapshot")).toBe("/npmrds/reports/snapshot");
        expect(on("/route_comparison")).toBe("/npmrds/route_comparison");
        expect(on("/home")).toBe("/npmrds/home");
    });

    it("keeps the query string on the Freight Atlas gallery's data-carried links", () => {
        expect(resolveMountPath("/freight_atlas?layers=2100239,9001049", "/freightatlas", ROOTS))
            .toBe("/freightatlas/freight_atlas?layers=2100239,9001049");
        expect(resolveMountPath("/maps_gallery", "/freightatlas", ROOTS))
            .toBe("/freightatlas/maps_gallery");
        expect(resolveMountPath("/about_the_plan", "/freightatlas", ROOTS))
            .toBe("/freightatlas/about_the_plan");
    });
});

describe("resolveMountPath — another pattern's path is left alone", () => {
    it("does not prefix the wildcard-mounted patterns", () => {
        const on = (p) => resolveMountPath(p, "/tsmo", ROOTS);
        expect(on("/datasources/source/2039")).toBe("/datasources/source/2039");
        expect(on("/docs/ap_is")).toBe("/docs/ap_is");
        expect(on("/auth/login")).toBe("/auth/login");
        expect(on("/list")).toBe("/list");
    });

    it("does not prefix npmrds_sub's links into the docs pattern", () => {
        for (const p of ["/docs/npmrds/overview", "/docs/npmrds/quick_start",
                         "/docs/ap_is/batch_reports_api"]) {
            expect(resolveMountPath(p, "/npmrds", ROOTS)).toBe(p);
        }
    });

    it("leaves /freight_data alone — the datasets pattern owns that segment", () => {
        // Its own mirrored mount (/freightatlas/freight_data) is what serves the
        // nav item; a data/lexical link written as /freight_data must not become
        // /freightatlas/freight_data by accident, since the segment is claimed.
        expect(resolveMountPath("/freight_data?cat=Freight%20Atlas", "/freightatlas", ROOTS))
            .toBe("/freight_data?cat=Freight%20Atlas");
    });
});

describe("resolveMountPath — non-navigable and already-resolved values", () => {
    it("passes through relative slugs, empty values and non-strings", () => {
        expect(resolveMountPath("home", "/tsmo", ROOTS)).toBe("home");
        expect(resolveMountPath("", "/tsmo", ROOTS)).toBe("");
        expect(resolveMountPath(undefined, "/tsmo", ROOTS)).toBe(undefined);
        expect(resolveMountPath(42, "/tsmo", ROOTS)).toBe(42);
    });

    it("passes through absolute and cross-subdomain URLs", () => {
        expect(resolveMountPath("https://www.dot.ny.gov/freight-plan/reports", "/freightatlas", ROOTS))
            .toBe("https://www.dot.ny.gov/freight-plan/reports");
        expect(resolveMountPath("//www.devtny.org/tsmo", "/tsmo", ROOTS)).toBe("//www.devtny.org/tsmo");
        expect(resolveMountPath("sub://npmrds/map_21", "/tsmo", ROOTS)).toBe("sub://npmrds/map_21");
    });

    it("is idempotent — a path already on the mount is not prefixed twice", () => {
        expect(resolveMountPath("/tsmo/congestion_v2", "/tsmo", ROOTS)).toBe("/tsmo/congestion_v2");
        expect(resolveMountPath("/tsmo", "/tsmo", ROOTS)).toBe("/tsmo");
        expect(resolveMountPath("/freightatlas?x=1", "/freightatlas", ROOTS)).toBe("/freightatlas?x=1");
        // and it survives the Phase 4 primary flip, where the mount base and the
        // pattern's own root path are the same value
        expect(resolveMountPath(resolveMountPath("/congestion_v2", "/tsmo", ROOTS), "/tsmo", ROOTS))
            .toBe("/tsmo/congestion_v2");
    });

    it("normalizes a mount base given with a trailing slash", () => {
        expect(resolveMountPath("/congestion_v2", "/tsmo/", ROOTS)).toBe("/tsmo/congestion_v2");
        expect(resolveMountPath("/congestion_v2", "tsmo", ROOTS)).toBe("/tsmo/congestion_v2");
    });

    it("prefixes when no root list is supplied (nothing is claimed)", () => {
        expect(resolveMountPath("/docs/x", "/tsmo")).toBe("/tsmo/docs/x");
    });
});
