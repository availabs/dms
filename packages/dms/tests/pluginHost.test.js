/**
 * The plugin contract, client side (src/plugins/index.js).
 * Task: src/dms/planning/tasks/current/dms-plugin-system.md (P1)
 *
 * Run: npx vitest run src/dms/packages/dms/tests/pluginHost.test.js
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Window } from "happy-dom";

let P, registry, sections, columnTypes;

beforeAll(async () => {
    const window = new Window({ url: "http://localhost/" });
    globalThis.window = window;
    globalThis.document = window.document;
    P = await import("../src/plugins/index.js");
    registry = await import("../src/patterns/registry.js");
    sections = await import("../src/patterns/page/components/sections/componentRegistry.js");
    columnTypes = (await import("../src/ui/columnTypes/index.jsx")).getColumnTypes;
});

const plugin = (over = {}) => ({
    name: "t_plugin", version: "1.0.0", api: "^1.0", activation: "default-on",
    register(host) {
        host.registerPatternTypes({ t_pattern: { label: "T pattern", siteConfig: [], pageComponents: { t_section: { name: "T section", EditComp: () => null, ViewComp: () => null } } } });
        host.registerSectionTypes({ t_section2: { name: "T section 2", EditComp: () => null, ViewComp: () => null } });
        host.registerColumnTypes({ t_column: { EditComp: () => null, ViewComp: () => null } });
        host.registerThemes({ t_theme: async () => ({ layout: { wrapper: "t-wrapper" } }) });
        host.registerDataTypes({ t_datatype: { sourceCreate: { name: "T" } } });
    },
    ...over,
});

describe("satisfies", () => {
    it("handles the ranges manifests use", () => {
        expect(P.satisfies("1.4.2", "^1.0")).toBe(true);
        expect(P.satisfies("2.0.0", "^1.0")).toBe(false);
        expect(P.satisfies("0.3.1", "^0.3")).toBe(true);
        expect(P.satisfies("0.4.0", "^0.3")).toBe(false);
        expect(P.satisfies("1.2.9", "~1.2.3")).toBe(true);
        expect(P.satisfies("1.3.0", "~1.2.3")).toBe(false);
        expect(P.satisfies("1.7.0", "1.x")).toBe(true);
        expect(P.satisfies("1.7.0", ">=1.0 <2")).toBe(true);
        expect(P.satisfies("2.0.0", ">=1.0 <2")).toBe(false);
        expect(P.satisfies("1.0.0", "*")).toBe(true);
    });
});

describe("registerPlugin", () => {
    it("registers through the host into today's registries, and records contributions", () => {
        const rec = P.registerPlugin(plugin());
        expect(registry.getPatternType("t_pattern")).toBeTruthy();
        expect(sections.getRegisteredComponents().t_section).toBeTruthy();
        expect(sections.getRegisteredComponents().t_section2).toBeTruthy();
        expect(columnTypes().t_column).toBeTruthy();
        expect(rec.contributes.patternTypes).toEqual(["t_pattern"]);
        expect(rec.contributes.sectionTypes.sort()).toEqual(["t_section", "t_section2"]);
        expect(P.pluginOf("patternTypes", "t_pattern")).toBe("t_plugin");
        expect(P.pluginOf("sectionTypes", "t_section")).toBe("t_plugin");
        expect(P.pluginOf("patternTypes", "page")).toBe(null);
        expect(P.listPlugins().map(p => p.name)).toContain("t_plugin");
    });

    it("is a no-op for the same plugin object, and refuses another of that name", () => {
        const def = plugin({ name: "t_twice", register: () => {} });
        P.registerPlugin(def);
        expect(() => P.registerPlugin(def)).not.toThrow();
        expect(() => P.registerPlugin({ ...def })).toThrow(/already registered/);
    });

    it("refuses a plugin built for another API, a bad name or version, or no register", () => {
        expect(() => P.registerPlugin(plugin({ name: "t_api", api: "^2.0" }))).toThrow(/needs plugin API/);
        expect(() => P.registerPlugin(plugin({ name: "T-Bad" }))).toThrow(/lowercase/);
        expect(() => P.registerPlugin(plugin({ name: "t_ver", version: "one" }))).toThrow(/version/);
        expect(() => P.registerPlugin({ name: "t_noreg", version: "1.0.0", api: "^1" })).toThrow(/register/);
    });

    it("refuses a name another plugin registered, and leaves nothing behind", () => {
        const def = { name: "t_clash", version: "1.0.0", api: "^1", register(host) { host.registerSectionTypes({ t_mine: {} }); host.registerThemes({ t_theme: async () => ({}) }); } };
        expect(() => P.registerPlugin(def)).toThrow(/already registered|t_theme/);
        expect(P.getPlugin("t_clash")).toBe(null);
        expect(P.pluginOf("sectionTypes", "t_mine")).toBe(null);
    });
});

describe("themes and data types", () => {
    it("loads a plugin theme only through the loader, behind the app's own themes", async () => {
        const app = Object.assign(async (names) => (names.includes("app_theme") ? { app_theme: { a: 1 } } : {}), { ALL_NAMES: ["app_theme"] });
        const load = P.withPluginThemes(app);
        expect(await load(["app_theme", "t_theme", "nope"])).toEqual({ app_theme: { a: 1 }, t_theme: { layout: { wrapper: "t-wrapper" } } });
        expect(load.ALL_NAMES).toEqual(expect.arrayContaining(["app_theme", "t_theme"]));
        expect(P.withPluginThemes(load)).toBe(load);
    });

    it("lists the data-type pages of active plugins only", () => {
        expect(P.pluginDataTypes().t_datatype).toEqual({ sourceCreate: { name: "T" } });
        expect(P.pluginDataTypes({ t_plugin: { enabled: false } }).t_datatype).toBe(undefined);
        P.registerPlugin({ name: "t_dt_optin", version: "1.0.0", api: "^1", activation: "opt-in", register(host) { host.registerDataTypes({ t_dt2: { a: 1 } }); } });
        expect(P.pluginDataTypes().t_dt2).toBe(undefined);
        expect(P.pluginDataTypes({ t_dt_optin: { enabled: true } }).t_dt2).toEqual({ a: 1 });
    });
});

describe("activation", () => {
    it("default-on unless turned off; opt-in only when turned on; core always", () => {
        P.registerPlugin({ name: "t_optin", version: "1.0.0", api: "^1", activation: "opt-in", register: () => {} });
        expect(P.isPluginActive("t_plugin")).toBe(true);
        expect(P.isPluginActive("t_plugin", { t_plugin: { enabled: false } })).toBe(false);
        expect(P.isPluginActive("t_optin")).toBe(false);
        expect(P.isPluginActive("t_optin", { t_optin: { enabled: true } })).toBe(true);
        expect(P.isPluginActive(null)).toBe(true);
        expect(P.isPluginActive("unknown_plugin")).toBe(false);
    });
});

describe("site activations", () => {
    it("reads the site row's plugin_activations refs, enabled as text or boolean", () => {
        expect(P.activationsOf({ plugin_activations: [
            { plugin: "a", enabled: "false" }, { plugin: "b", enabled: true }, { plugin: "c" }, { enabled: "true" },
        ] })).toEqual({ a: { enabled: false }, b: { enabled: true }, c: { enabled: true } });
        expect(P.activationsOf({})).toEqual({});
        expect(P.activationsOf(null)).toEqual({});
    });

    it("a plugin's pattern type follows its activation; core and app types are always active", () => {
        expect(P.isPatternTypeActive("t_pattern")).toBe(true);                                  // default-on
        expect(P.isPatternTypeActive("t_pattern", { t_plugin: { enabled: false } })).toBe(false);
        expect(P.isPatternTypeActive("page", { t_plugin: { enabled: false } })).toBe(true);     // core
        P.registerPlugin({ name: "t_pt_optin", version: "1.0.0", api: "^1", activation: "opt-in", register(host) {
            host.registerPatternTypes({ t_optin_pattern: { label: "x", siteConfig: [] } });
        } });
        expect(P.isPatternTypeActive("t_optin_pattern")).toBe(false);
        expect(P.isPatternTypeActive("t_optin_pattern", { t_pt_optin: { enabled: true } })).toBe(true);
    });
});

describe("section types follow their plugin", () => {
    it("a pattern type's pageComponents and a plugin's own section types", () => {
        expect(P.isSectionTypeActive("t_section")).toBe(true);                                  // via t_pattern's pageComponents
        expect(P.isSectionTypeActive("t_section2")).toBe(true);                                 // registerSectionTypes
        expect(P.isSectionTypeActive("t_section", { t_plugin: { enabled: false } })).toBe(false);
        expect(P.isSectionTypeActive("t_section2", { t_plugin: { enabled: false } })).toBe(false);
        expect(P.isSectionTypeActive("lexical", { t_plugin: { enabled: false } })).toBe(true);  // core
    });
});

