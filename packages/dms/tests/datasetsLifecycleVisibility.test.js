/**
 * Hidden lifecycles (Archive, Sandbox, Data Processing, Uploaded File) stay out of the datasets
 * catalog's default list, its search and "Show all", and out of the page editor's source picker.
 * They stay reachable on purpose: the catalog's hidden buckets, and the picker's "show hidden
 * datasets" switch. A section that already binds a hidden source keeps it listed.
 *
 * Task: src/dms/planning/tasks/current/datasets-catalog-authority-and-archive-visibility.md (Part B)
 *
 * vitest's `happy-dom` environment can't be loaded from the workspace root (the package lives under
 * packages/dms/node_modules), so the window for the picker test is built here instead.
 *
 * Run: npx vitest run src/dms/packages/dms/tests/datasetsLifecycleVisibility.test.js
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Window } from "happy-dom";

import {
    LIFECYCLE_DEFAULTS, resolveHiddenForPattern, catalogVisibility, hiddenLifecycleOf, inHiddenLifecycle,
} from "../src/patterns/datasets/utils/lifecycle.js";

const src = (id, name, ...categories) => ({ source_id: id, name, categories });

const BILD_OLD = src(1480, "BILD 2024", ["Built Environment", "BILD"], ["Archive"]);
const BILD_NEW = src(1649, "AVAIL BILD 2026 V1", ["Built Environment", "BILD"]);
const SANDBOX = src(3001, "my upload", ["Sandbox"]);
const UNTAGGED = src(3002, "untagged table");
const LEGACY = src(3003, "old filtered", ["Old Stuff"]);
const UPLOAD = { ...src(3004, "logo.png", ["Uploaded File"]), type: "file_upload" };
const ALL = [BILD_OLD, BILD_NEW, SANDBOX, UNTAGGED, LEGACY, UPLOAD];

const hiddenSet = resolveHiddenForPattern({}, null);
const names = (list) => list.map(s => s.name).sort();
// The catalog's search: a filter over the current mode's pool (DatasetsList shownSources).
const search = (pool, q) => pool.filter(s => `${s.name} ${(s.categories || []).flat().join(" ")}`.toLowerCase().includes(q));

describe("hiddenLifecycleOf / inHiddenLifecycle", () => {
    it("names the first hidden top-level, under the ANY rule", () => {
        expect(hiddenLifecycleOf(BILD_OLD, hiddenSet)).toBe("Archive");
        expect(inHiddenLifecycle(BILD_OLD, hiddenSet)).toBe(true);
        expect(hiddenLifecycleOf(BILD_NEW, hiddenSet)).toBeNull();
        expect(hiddenLifecycleOf(UNTAGGED, hiddenSet)).toBeNull();
    });
    it("accepts bare-string categories", () => {
        expect(hiddenLifecycleOf({ categories: ["Archive"] }, hiddenSet)).toBe("Archive");
    });
});

describe("catalogVisibility", () => {
    it("default: production only; uncategorized and legacy-filtered wait for Show all", () => {
        const { visible, hidden } = catalogVisibility({ sources: ALL, hiddenSet, legacyFiltered: ["Old Stuff"] });
        expect(names(visible)).toEqual(["AVAIL BILD 2026 V1"]);
        expect(names(hidden)).toEqual(["BILD 2024", "logo.png", "my upload"]);
    });

    it("Show all adds uncategorized and legacy-filtered sources, never a hidden lifecycle", () => {
        const { visible, hidden } = catalogVisibility({ sources: ALL, hiddenSet, legacyFiltered: ["Old Stuff"], listAll: true });
        expect(names(visible)).toEqual(["AVAIL BILD 2026 V1", "old filtered", "untagged table"]);
        expect(names(hidden)).toEqual(["BILD 2024", "logo.png", "my upload"]);
    });

    it("search over either pool can't surface an archived source", () => {
        for (const listAll of [false, true]) {
            const { visible, hidden } = catalogVisibility({ sources: ALL, hiddenSet, listAll });
            expect(names(search(visible, "bild"))).toEqual(["AVAIL BILD 2026 V1"]);
            // …while the held-back pool still has it, for the signed-in ways in
            expect(names(search(hidden, "bild"))).toEqual(["BILD 2024"]);
        }
    });

    it("keep() wins: the uploads toggle keeps file uploads visible despite `Uploaded File`", () => {
        const keep = s => s.type === "file_upload";
        const { visible, hidden } = catalogVisibility({ sources: ALL, hiddenSet, legacyFiltered: ["Old Stuff"], keep });
        expect(names(visible)).toEqual(["AVAIL BILD 2026 V1", "logo.png"]);
        expect(names(hidden)).toEqual(["BILD 2024", "my upload"]);
    });

    it("a pattern that shows Archive gets its archived sources back in every mode", () => {
        const settings = { hidden_categories_by_pattern: { 42: { show: ["Archive"] } } };
        const set = resolveHiddenForPattern(settings, 42);
        expect(set.has("Archive")).toBe(false);
        const { visible } = catalogVisibility({ sources: ALL, hiddenSet: set });
        expect(names(search(visible, "bild"))).toEqual(["AVAIL BILD 2026 V1", "BILD 2024"]);
    });

    it("the env floor hides a name the library defaults don't", () => {
        const set = resolveHiddenForPattern({ hidden_categories: { hide: ["Old Stuff"] } }, null);
        const { visible, hidden } = catalogVisibility({ sources: ALL, hiddenSet: set, listAll: true });
        expect(names(visible)).toEqual(["AVAIL BILD 2026 V1", "untagged table"]);
        expect(names(hidden)).toContain("old filtered");
    });

    it("tolerates missing input", () => {
        expect(catalogVisibility({ sources: undefined, hiddenSet })).toEqual({ visible: [], hidden: [] });
    });
});

// ── the page editor's source picker (dataWrapper useDataSource) ──────────────────────────────────

const ENV = "hazmit_dama";
const PICKER_SOURCES = [
    { id: 1480, name: "BILD 2024", categories: [["Built Environment"], ["Archive"]] },
    { id: 1649, name: "AVAIL BILD 2026 V1", categories: [["Built Environment", "BILD"]] },
    { id: 2001, name: "Launch map v2", categories: [["Plans"]] },
    { id: 3001, name: "my upload", categories: [["Sandbox"]] },
];

// Just enough of the Falcor client for useDataSource: the sources list, env settings, authority
// and the bound source's views.
const fakeFalcor = (settings = {}) => ({
    get: async (path) => {
        const [, envs, a, b, c, d] = path;
        const env = Array.isArray(envs) ? envs[0] : envs;
        const json = { uda: { [env]: {} } };
        const node = json.uda[env];
        if (a === "sources" && b === "length") node.sources = { length: PICKER_SOURCES.length };
        else if (a === "sources" && b === "byIndex") {
            const attrs = d;
            node.sources = { byIndex: Object.fromEntries(PICKER_SOURCES.map((s, i) => [i, {
                ...Object.fromEntries(attrs.map(attr => [attr, attr === "metadata" ? { columns: [] } : s[attr]])),
                $__path: ["uda", env, "sources", "byId", s.id],
            }])) };
        } else if (a === "settings") node.settings = JSON.stringify(settings);
        else if (a === "sources" && b === "byId" && c && d === "authority") node.sources = { byId: {} };
        else if (a === "sources" && b === "byId" && d === "views") node.sources = { byId: { [c]: { views: { length: 0 } } } };
        return { json };
    },
});

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

// Mounts a section's useDataSource; returns a getter for its latest result.
const mountPicker = async ({ state, settings } = {}) => {
    let latest, latestState;
    const Probe = () => {
        const [s, setS] = React.useState(state);
        // useDataSource calls setState with an immer-style recipe
        const setState = React.useCallback((recipe) => setS(prev => {
            const draft = structuredClone(prev);
            recipe(draft);
            return draft;
        }), []);
        latest = useDataSource({ state: s, setState });
        latestState = s;
        return null;
    };
    const cms = {
        app: "mny", type: "county_template", falcor: fakeFalcor(settings),
        datasources: [{ type: "external", env: ENV, label: "external", srcAttributes: ["name", "metadata"], viewAttributes: ["version"] }],
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
        root.render(React.createElement(CMSContext.Provider, { value: cms },
            React.createElement(PageContext.Provider, { value: { format: {} } },
                React.createElement(Probe))));
    });
    // the loader runs behind a 300 ms debounce
    await act(async () => { await sleep(450); });
    return {
        get: () => latest,
        state: () => latestState,
        unmount: async () => { await act(async () => root.unmount()); host.remove(); },
    };
};

const labels = (picker) => picker.get().sources.map(o => o.label);

describe("dataWrapper source picker", () => {
    it("leaves hidden-lifecycle sources out by default", async () => {
        const p = await mountPicker({ state: { externalSource: {}, columns: [] } });
        expect(labels(p)).toEqual([
            "county_template (pages)", "county_template (sections)",
            "AVAIL BILD 2026 V1 [external]", "Launch map v2 [external]",
        ]);
        expect(p.get().hiddenSourceCount).toBe(2);
        await p.unmount();
    });

    it("the switch lists them, marked with their lifecycle", async () => {
        const p = await mountPicker({ state: { externalSource: {}, columns: [] } });
        await act(async () => p.get().setIncludeHiddenSources(true));
        expect(labels(p)).toContain("BILD 2024 [external] · Archive");
        expect(labels(p)).toContain("my upload [external] · Sandbox");
        await p.unmount();
    });

    it("a section bound to an archived source still lists it as the current value", async () => {
        const p = await mountPicker({ state: { externalSource: { source_id: 1480, view_id: 2001, columns: [] }, columns: [] } });
        const opts = p.get().sources;
        expect(p.get().activeSource).toBe(1480);
        expect(opts.find(o => o.key === p.get().activeSource)?.label).toBe("BILD 2024 [external] · Archive");
        // the other hidden one stays out
        expect(opts.map(o => o.label)).not.toContain("my upload [external] · Sandbox");
        await p.unmount();
    });

    it("a join's hidden source stays listed too", async () => {
        const p = await mountPicker({ state: {
            externalSource: { source_id: 1649, columns: [] }, columns: [],
            join: { sources: { table1: { source: 3001, view: null, sourceInfo: {} } } },
        } });
        expect(labels(p)).toContain("my upload [external] · Sandbox");
        expect(labels(p)).not.toContain("BILD 2024 [external] · Archive");
        await p.unmount();
    });

    it("the env floor can un-hide a default lifecycle", async () => {
        const p = await mountPicker({ state: { externalSource: {}, columns: [] }, settings: { hidden_categories: { show: ["Archive"] } } });
        expect(labels(p)).toContain("BILD 2024 [external]");
        expect(p.get().hiddenSourceCount).toBe(1);
        await p.unmount();
    });

    it("keeps categories off the source objects (they are merged into the persisted externalSource)", async () => {
        const p = await mountPicker({ state: { externalSource: { source_id: 1649, columns: [{ name: "x" }] }, columns: [] } });
        // the load refreshes the bound source's record from the list (its columns differ)…
        expect(p.state().externalSource.name).toBe("AVAIL BILD 2026 V1");
        // …and that record must not pick up the lifecycle data
        expect(p.state().externalSource).not.toHaveProperty("categories");
        await p.unmount();
    });

    it("LIFECYCLE_DEFAULTS still covers the four lifecycles", () => {
        expect(LIFECYCLE_DEFAULTS).toEqual(["Sandbox", "Archive", "Data Processing", "Uploaded File"]);
    });
});

// ── Part A: the catalog's authority chip ─────────────────────────────────────────────────────────
import { authoritySummary } from "../src/patterns/datasets/utils/authority.js";

describe("authoritySummary (catalog chip)", () => {
    const single = { views: [{ view_id: 2354, note: "last full build" }] };
    const keyed = { views: [{ view_id: 11, key: { year: "2024" } }, { view_id: 12, key: { year: "2025" } }, { view_id: 13, key: { year: "2023" } }] };
    it("single: the authoritative view's label", () => {
        expect(authoritySummary(single, id => (id === 2354 ? "01/29/2026" : null)))
            .toEqual({ state: "single", text: "★ 01/29/2026", title: "authoritative view: 01/29/2026" });
    });
    it("single without a label falls back to the view id", () => {
        expect(authoritySummary(single).text).toBe("★ v2354");
    });
    it("keyed: a count, with the keys in the title", () => {
        const s = authoritySummary(keyed);
        expect(s.state).toBe("keyed");
        expect(s.text).toBe("★ 3 keyed");
        expect(s.title).toBe("authoritative views: year 2024 · year 2025 · year 2023");
    });
    it("undecided: no record, an empty record, or junk", () => {
        for (const a of [null, undefined, { views: [] }, "not json"]) {
            expect(authoritySummary(a).state).toBe("undecided");
        }
        expect(authoritySummary(null).text).toBe("undecided");
    });
    it("reads a source object too (its `authority` attribute)", () => {
        expect(authoritySummary({ source_id: 1649, name: "AVAIL BILD 2026 V1", authority: single }).state).toBe("single");
    });
});
