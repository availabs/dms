/**
 * dataWrapper's View loads only the sources a section binds, not the whole source catalogue
 * (useDataSource `loadCatalogue: false`), and refreshes the section's externalSource exactly as the
 * catalogue path does.
 *
 * Task: src/dms/planning/tasks/current/datawrapper-view-bound-source-only.md
 *
 * Built like datasetsLifecycleVisibility.test.js (happy-dom window made in-test).
 * Run: npx vitest run src/dms/packages/dms/tests/dataWrapperViewBoundSource.test.js
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Window } from "happy-dom";

const ENV = "hazmit_dama";
const FRESH_COLS = [{ name: "geoid", type: "text" }, { name: "total", type: "number" }];
const SOURCES = [
    { id: 1480, name: "BILD 2024", metadata: { columns: [{ name: "old" }] }, categories: [["Archive"]] },
    { id: 1649, name: "AVAIL BILD 2026 V1", metadata: { columns: FRESH_COLS, isEditable: true }, categories: [["BILD"]] },
    { id: 2001, name: "Launch map v2", metadata: { columns: [{ name: "x" }] }, categories: [["Plans"]] },
];
const byId = Object.fromEntries(SOURCES.map(s => [s.id, s]));

// A Falcor stand-in that records each request's shape ("sources.byIndex", "sources.byId.metadata", …)
const fakeFalcor = () => {
    const calls = [];
    return {
        calls,
        get: async (path) => {
            const [, envs, a, b, c, d] = path;
            const env = Array.isArray(envs) ? envs[0] : envs;
            const json = { uda: { [env]: {} } };
            const node = json.uda[env];
            if (a === "sources" && b === "length") {
                calls.push("sources.length");
                node.sources = { length: SOURCES.length };
            } else if (a === "sources" && b === "byIndex") {
                calls.push("sources.byIndex");
                node.sources = { byIndex: Object.fromEntries(SOURCES.map((s, i) => [i, {
                    ...Object.fromEntries(d.map(attr => [attr, s[attr]])),
                    $__path: ["uda", env, "sources", "byId", s.id],
                }])) };
            } else if (a === "settings") {
                calls.push("settings");
                node.settings = "{}";
            } else if (a === "sources" && b === "byId" && d === "views") {
                calls.push("views");
                node.sources = { byId: { [c]: { views: { length: 0 } } } };
            } else if (a === "sources" && b === "byId" && d === "authority") {
                calls.push("authority");
                node.sources = { byId: {} };
            } else if (a === "sources" && b === "byId") {
                calls.push(`sources.byId:${c.join(",")}:${d.join(",")}`);
                // like the server: an unknown id comes back with null attributes
                node.sources = { byId: Object.fromEntries(c.map(id => [id,
                    Object.fromEntries(d.map(attr => [attr, byId[id]?.[attr] ?? null]))])) };
            }
            return { json };
        },
    };
};

let window, React, act, createRoot, useDataSource, CMSContext, PageContext;

beforeAll(async () => {
    window = new Window({ url: "http://localhost/" });
    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    React = (await import("react")).default;
    ({ act } = await import("react"));
    ({ createRoot } = await import("react-dom/client"));
    ({ useDataSource } = await import("../src/patterns/page/components/sections/components/dataWrapper/useDataSource.js"));
    ({ CMSContext, PageContext } = await import("../src/patterns/page/context.js"));
});

afterAll(async () => {
    await window.happyDOM.abort();
    window.close();
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const mount = async ({ state, loadCatalogue }) => {
    let latest, latestState;
    const falcor = fakeFalcor();
    const Probe = () => {
        const [s, setS] = React.useState(state);
        const setState = React.useCallback((recipe) => setS(prev => {
            const draft = structuredClone(prev);
            recipe(draft);
            return draft;
        }), []);
        latest = useDataSource({ state: s, setState, loadCatalogue });
        latestState = s;
        return null;
    };
    const cms = {
        app: "mny", type: "county_template", falcor,
        datasources: [{ type: "external", env: ENV, label: "external", baseUrl: "/cenrep",
            srcAttributes: ["name", "metadata"], viewAttributes: ["version"] }],
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
        root.render(React.createElement(CMSContext.Provider, { value: cms },
            React.createElement(PageContext.Provider, { value: { format: {} } },
                React.createElement(Probe))));
    });
    // the loaders run behind a 300 ms debounce, the version list behind another
    await act(async () => { await sleep(800); });
    return {
        get: () => latest,
        state: () => latestState,
        calls: falcor.calls,
        unmount: async () => { await act(async () => root.unmount()); host.remove(); },
    };
};

const bound = (extra = {}) => ({
    externalSource: { source_id: 1649, srcEnv: ENV, name: "AVAIL BILD 2026 V1", columns: [{ name: "geoid" }], view_id: 7, ...extra },
    columns: [],
});

describe("dataWrapper View: only the bound source", () => {
    it("fetches the bound source by id, and nothing from the catalogue", async () => {
        const p = await mount({ state: bound(), loadCatalogue: false });
        expect(p.calls).toEqual([`sources.byId:1649:name,metadata`]);
        await p.unmount();
    });

    it("refreshes externalSource exactly as the catalogue path does", async () => {
        const view = await mount({ state: bound(), loadCatalogue: false });
        const edit = await mount({ state: bound(), loadCatalogue: true });
        expect(edit.calls).toContain("sources.byIndex"); // the edit path still loads the catalogue
        expect(view.state().externalSource.columns).toEqual(FRESH_COLS);
        expect(view.state().externalSource.isEditable).toBe(true);
        expect(view.state().externalSource).toEqual(edit.state().externalSource);
        await view.unmount();
        await edit.unmount();
    });

    it("lists the bound source, so the view-mode menu can name it", async () => {
        const p = await mount({ state: bound(), loadCatalogue: false });
        const opt = p.get().sources.find(o => o.key === 1649);
        expect(opt?.label).toBe("AVAIL BILD 2026 V1 [external]");
        await p.unmount();
    });

    it("names join sources too, one request per env", async () => {
        const state = bound();
        state.join = { sources: { table1: { source: 2001, sourceInfo: { srcEnv: ENV, columns: [] } } } };
        const p = await mount({ state, loadCatalogue: false });
        expect(p.calls).toEqual([`sources.byId:1649,2001:name,metadata`]);
        expect(p.get().sources.map(o => o.label)).toContain("Launch map v2 [external]");
        await p.unmount();
    });

    it("looks a source saved under an env the page doesn't list up by id in its envs of the same kind", async () => {
        const p = await mount({ state: bound({ srcEnv: "old_pg_env", isDms: false }), loadCatalogue: false });
        expect(p.calls).toEqual([`sources.byId:1649:name,metadata`]);
        expect(p.state().externalSource.columns).toEqual(FRESH_COLS);
        expect(p.state().externalSource.srcEnv).toBe(ENV);
        await p.unmount();
    });

    it("loads the catalogue when the page has no env of that kind", async () => {
        const p = await mount({ state: bound({ srcEnv: "mny+old_site_type", isDms: true }), loadCatalogue: false });
        expect(p.calls).toContain("sources.byIndex");
        await p.unmount();
    });

    it("leaves the state alone when the source is gone", async () => {
        const state = bound({ source_id: 9999 });
        const p = await mount({ state, loadCatalogue: false });
        expect(p.calls).toEqual([`sources.byId:9999:name,metadata`]);
        expect(p.state()).toEqual(state);
        await p.unmount();
    });

    it("makes no request for a section with no source, or bound to the pattern's own pages", async () => {
        for (const externalSource of [{}, { source_id: "mny+county_template|page", isDms: true }]) {
            const p = await mount({ state: { externalSource, columns: [] }, loadCatalogue: false });
            expect(p.calls).toEqual([]);
            await p.unmount();
        }
    });
});
