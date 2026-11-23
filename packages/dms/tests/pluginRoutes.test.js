/**
 * The route builder honours a site's plugin activations (dms-plugin-system.md, P1 step 5): a pattern of a plugin
 * the site turned off gets no routes; an opt-in plugin's pattern gets routes only once turned on; and its data-type
 * pages are offered only while active.
 *
 * Run: npx vitest run src/dms/packages/dms/tests/pluginRoutes.test.js
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Window } from "happy-dom";

let P, pattern2routes;
const seen = [];

beforeAll(async () => {
    const window = new Window({ url: "http://localhost/" });
    globalThis.window = window;
    globalThis.document = window.document;
    for (const k of ["Element", "HTMLElement", "Node", "Event", "CustomEvent", "MutationObserver", "getComputedStyle", "localStorage", "sessionStorage"]) {
        if (!(k in globalThis) && window[k] !== undefined) globalThis[k] = typeof window[k] === "function" && k === "getComputedStyle" ? window[k].bind(window) : window[k];
    }
    P = await import("../src/plugins/index.js");
    ({ pattern2routes } = await import("../src/render/spa/utils/index.js"));
    // a pattern type whose config records what it was given
    const typeOf = (name) => ({
        label: name,
        siteConfig: [(props) => { seen.push({ type: name, damaDataTypes: Object.keys(props.damaDataTypes || {}) }); return { baseUrl: props.baseUrl || "/", children: [] }; }],
    });
    P.registerPlugin({ name: "r_on", version: "1.0.0", api: "^1", activation: "default-on", register(host) {
        host.registerPatternTypes({ r_on_type: typeOf("r_on_type") });
        host.registerDataTypes({ r_on_dt: { a: 1 } });
    } });
    P.registerPlugin({ name: "r_optin", version: "1.0.0", api: "^1", activation: "opt-in", register(host) {
        host.registerPatternTypes({ r_optin_type: typeOf("r_optin_type") });
        host.registerDataTypes({ r_optin_dt: { b: 1 } });
    } });
});

const site = (activations) => [{
    id: 1, app: "t", type: "s:site",
    patterns: [
        { id: 11, pattern_type: "r_on_type", base_url: "/on", subdomain: "*", name: "On" },
        { id: 12, pattern_type: "r_optin_type", base_url: "/optin", subdomain: "*", name: "Opt in" },
    ],
    plugin_activations: activations,
}];

const build = (activations) => {
    seen.length = 0;
    pattern2routes(site(activations), { dmsConfig: { app: "t", type: "s", format: {} }, host: "localhost", themes: { default: {} } });
    return seen.map(s => s.type);
};

describe("pattern2routes and plugin activations", () => {
    it("no activation rows: default-on routes, opt-in not", () => {
        expect(build([])).toEqual(["r_on_type"]);
    });
    it("a default-on plugin turned off gets no routes", () => {
        expect(build([{ plugin: "r_on", enabled: "false" }])).toEqual([]);
    });
    it("an opt-in plugin turned on gets routes", () => {
        expect(build([{ plugin: "r_optin", enabled: "true" }]).sort()).toEqual(["r_on_type", "r_optin_type"]);
    });
    it("data-type pages follow the same activations", () => {
        build([{ plugin: "r_optin", enabled: true }]);
        const dts = seen[0].damaDataTypes;
        expect(dts).toEqual(expect.arrayContaining(["r_on_dt", "r_optin_dt"]));
        build([]);
        expect(seen[0].damaDataTypes).toContain("r_on_dt");
        expect(seen[0].damaDataTypes).not.toContain("r_optin_dt");
    });
});
