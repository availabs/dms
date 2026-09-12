/**
 * Retired-subdomain redirects — the backstop that keeps old bookmarks working
 * after a pattern moves off its own subdomain onto a path on the root domain.
 *
 * The cases mirror the TransportNY cutover: tsmo2/tsmo → /tsmo,
 * freightatlas2/freightatlas → /freightatlas, npmrds → /npmrds, with the
 * wildcard-mounted patterns (/auth, /datasources, /docs, /list) staying put.
 * See planning/transportny/tasks/current/subdomain-to-path-consolidation.md.
 */
import { describe, it, expect } from "vitest";
import { buildRetiredSubdomainMap, resolveRetiredSubdomainRedirect } from "../src/utils/retiredSubdomain";
import { collectSiteRootPaths } from "../src/utils/mountPath";

const ROOTS = collectSiteRootPaths([
    "/", "/docs", "/auth", "/datasources", "/sitemgmt", "/status", "/list",
    "freight_data", "/freightatlas", "/tsmo", "/npmrds",
]);

const PATTERNS = [
    { name: "tsmo2", base_url: "/tsmo", retired_subdomains: ["tsmo2", "tsmo"] },
    { name: "npmrds_sub", base_url: "/npmrds", retired_subdomains: ["npmrds"] },
    { name: "Freight Atlas", base_url: "/freightatlas", retired_subdomains: '["freightatlas2","freightatlas"]' },
    { name: "landing", base_url: "/" },
];

const MAP = buildRetiredSubdomainMap(PATTERNS);

const go = (host, pathname, extra = {}) => resolveRetiredSubdomainRedirect({
    host, subdomain: host.split(".")[0], pathname,
    protocol: "https:", retiredMap: MAP, siteRootPaths: ROOTS, ...extra,
});

describe("buildRetiredSubdomainMap", () => {
    it("maps each retired subdomain to its pattern's primary base_url", () => {
        expect(MAP).toEqual({
            tsmo2: "/tsmo", tsmo: "/tsmo", npmrds: "/npmrds",
            freightatlas2: "/freightatlas", freightatlas: "/freightatlas",
        });
    });

    it("parses a JSON-string value, the shape a DMS json attribute round-trips", () => {
        expect(MAP.freightatlas2).toBe("/freightatlas");
    });

    it("is empty for patterns that never opted in", () => {
        expect(buildRetiredSubdomainMap([{ name: "landing", base_url: "/" }])).toEqual({});
        expect(buildRetiredSubdomainMap([])).toEqual({});
    });

    it("refuses to retire a subdomain that is still mounted — the live route wins", () => {
        const live = buildRetiredSubdomainMap(PATTERNS, (sub) => sub === "tsmo2");
        expect(live.tsmo2).toBeUndefined();
        expect(live.tsmo).toBe("/tsmo");   // the sibling alias still redirects
    });

    it("normalizes case and whitespace, and skips blanks", () => {
        const m = buildRetiredSubdomainMap([{ base_url: "/x", retired_subdomains: [" TSMO2 ", "", null] }]);
        expect(m).toEqual({ tsmo2: "/x" });
    });
});

describe("resolveRetiredSubdomainRedirect", () => {
    it("sends the old product host to its new path on www", () => {
        expect(go("tsmo2.devtny.org", "/congestion_v2"))
            .toBe("https://www.devtny.org/tsmo/congestion_v2");
        expect(go("npmrds.transportny.org", "/macro"))
            .toBe("https://www.transportny.org/npmrds/macro");
        expect(go("freightatlas2.devtny.org", "/maps_gallery"))
            .toBe("https://www.devtny.org/freightatlas/maps_gallery");
    });

    it("maps the old product root to the new mount root", () => {
        expect(go("tsmo2.devtny.org", "/")).toBe("https://www.devtny.org/tsmo");
    });

    it("preserves query and hash", () => {
        expect(go("tsmo2.devtny.org", "/congestion_v2", { search: "?foo=1&bar=2", hash: "#top" }))
            .toBe("https://www.devtny.org/tsmo/congestion_v2?foo=1&bar=2#top");
    });

    it("does NOT prefix the shared patterns — /auth/login must stay reachable", () => {
        expect(go("tsmo2.devtny.org", "/auth/login")).toBe("https://www.devtny.org/auth/login");
        expect(go("tsmo2.devtny.org", "/datasources/source/2039"))
            .toBe("https://www.devtny.org/datasources/source/2039");
        expect(go("npmrds.devtny.org", "/docs/npmrds/overview"))
            .toBe("https://www.devtny.org/docs/npmrds/overview");
        expect(go("tsmo2.devtny.org", "/list")).toBe("https://www.devtny.org/list");
    });

    it("works in local development, where the base host carries a port", () => {
        expect(resolveRetiredSubdomainRedirect({
            host: "tsmo2.localhost:5173", subdomain: "tsmo2", pathname: "/home",
            protocol: "http:", retiredMap: MAP, siteRootPaths: ROOTS,
        })).toBe("http://www.localhost:5173/tsmo/home");
    });

    it("leaves everything else alone", () => {
        expect(go("sandbox.devtny.org", "/home")).toBeNull();          // not retired
        expect(go("www.devtny.org", "/tsmo/home")).toBeNull();         // already on the target
        expect(resolveRetiredSubdomainRedirect({
            host: "devtny.org", subdomain: "", pathname: "/tsmo",
            retiredMap: MAP, siteRootPaths: ROOTS,
        })).toBeNull();                                                 // apex, no subdomain
    });

    it("cannot loop: a root host with nothing to strip is never redirected", () => {
        // A misconfigured map naming the root itself still resolves to null,
        // because getBaseHost returns the host unchanged when there is no label.
        expect(resolveRetiredSubdomainRedirect({
            host: "devtny.org", subdomain: "devtny", pathname: "/",
            retiredMap: { devtny: "/tsmo" }, siteRootPaths: ROOTS,
        })).toBeNull();
    });

    it("redirecting twice is a fixed point — the target never matches the map again", () => {
        const first = go("tsmo2.devtny.org", "/congestion_v2");
        const { host, pathname } = new URL(first);
        expect(go(host, pathname)).toBeNull();
    });
});
