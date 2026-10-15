/**
 * The pattern-type registry: built-ins and app-registered types share one path —
 * routing, section components, and the pattern's default theme.
 *
 * See planning/tasks/current/pluggable-patterns-mapeditor-extraction.md.
 *
 * Run: npx vitest run src/dms/packages/dms/tests/patternRegistry.test.js
 */
import { describe, it, expect, vi } from "vitest";

import "../src/patterns";
import { registerPatternTypes, getPatternType, listPatternTypes } from "../src/patterns/registry";
import { getRegisteredComponents } from "../src/patterns/page/components/sections/componentRegistry";
import defaultTheme from "../src/ui/defaultTheme";
import { getPatternTheme } from "../src/ui/useTheme";
import { pattern2routes } from "../src/render/spa/utils/index.js";
import adminConfigs from "../src/patterns/admin/siteConfig.jsx";
import { pattern as adminPatternFormat } from "../src/patterns/admin/admin.format.js";

// A minimal app pattern: one config function, one route.
const appPatternConfig = ({ baseUrl }) => ({
    baseUrl,
    format: { app: "x", type: "thing", attributes: [] },
    children: [{ type: () => null, action: "list", path: "/*", filter: {} }],
});

describe("built-in types", () => {
    it("registers the platform types, in admin order", () => {
        const names = listPatternTypes().map(d => d.name);
        expect(names.slice(0, 4)).toEqual(["page", "datasets", "auth", "admin"]);
        expect(getPatternType("page").siteConfig.length).toBeGreaterThan(0);
    });

    it("mounts each built-in's defaultTheme under its theme key", () => {
        expect(defaultTheme.pages.sectionGroup).toBeTruthy();   // page → `pages`
        expect(defaultTheme.datasets).toBeTruthy();
        expect(defaultTheme.auth).toBeTruthy();
        expect(defaultTheme.admin.navOptions.sideNav.size).toBe("compact");
        expect(defaultTheme.admin.editSite).toBeTruthy();
    });

    it("only datasets provides datasources", () => {
        expect(listPatternTypes().filter(d => d.providesDatasources).map(d => d.name)).toContain("datasets");
    });

    it("ships no app pattern type — the map editor and qa (Tickets) live in the host app", () => {
        expect(getPatternType("mapeditor")).toBeUndefined();
        expect(getRegisteredComponents().Map).toBeUndefined();
        expect(defaultTheme.pages.damaMap).toBeUndefined();
        expect(getPatternType("qa")).toBeUndefined();
        expect(defaultTheme.qa).toBeUndefined();
        expect(defaultTheme.admin.qaConfigure).toBeUndefined();
    });
});

describe("registering an app pattern type", () => {
    it("rejects a definition without a siteConfig array", () => {
        expect(() => registerPatternTypes({ broken: { label: "Broken" } })).toThrow(/siteConfig/);
    });

    it("routes rows of the new type through its siteConfig", () => {
        registerPatternTypes({
            test_app_pattern: {
                siteConfig: [appPatternConfig],
                label: "Test App Pattern",
                admin: { addable: true, order: 99 },
            },
        });
        const dmsConfig = adminConfigs[0]({ app: "test-app", type: "prod", baseUrl: "/list" });
        const routes = pattern2routes([{ id: 1, patterns: [
            { id: 10, pattern_type: "auth", base_url: "auth", subdomain: "*" },
            { id: 11, pattern_type: "test_app_pattern", base_url: "/things", subdomain: "*", type: "prod|things:pattern" },
        ] }], { dmsConfig, adminPath: "/list", themes: { default: {} }, host: "localhost" });
        expect(routes.some(r => r.path?.startsWith("/things"))).toBe(true);
        expect(listPatternTypes().at(-1).name).toBe("test_app_pattern");
    });

    it("skips rows of an unregistered type, warning once", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const dmsConfig = adminConfigs[0]({ app: "test-app", type: "prod", baseUrl: "/list" });
        const run = () => pattern2routes([{ id: 1, patterns: [
            { id: 11, pattern_type: "never_registered", base_url: "/nope", subdomain: "*" },
        ] }], { dmsConfig, adminPath: "/list", themes: { default: {} }, host: "localhost" });
        const routes = run();
        run();
        expect(routes.some(r => r.path?.startsWith("/nope"))).toBe(false);
        expect(warn.mock.calls.filter(c => String(c[0]).includes("never_registered"))).toHaveLength(1);
        warn.mockRestore();
    });

    it("registers its page components with the page pattern", () => {
        const Section = { name: "Test Section", EditComp: () => null, ViewComp: () => null };
        registerPatternTypes({ test_components: { siteConfig: [appPatternConfig], pageComponents: { "Test Section": Section } } });
        expect(getRegisteredComponents()["Test Section"]).toBe(Section);
    });

    it("mounts its defaultTheme under its name, and a site theme overrides it there", () => {
        // build (and cache) a base theme first — registration must not be hidden by that cache
        const themes = { default: {}, site: { test_themed: { panel: { wrapper: "site-wrapper" } } } };
        getPatternTheme(themes, { theme: { selectedTheme: "site" } });

        registerPatternTypes({
            test_themed: {
                siteConfig: [appPatternConfig],
                defaultTheme: { panel: { wrapper: "default-wrapper", title: "default-title" } },
            },
        });
        expect(defaultTheme.test_themed.panel.title).toBe("default-title");

        const merged = getPatternTheme(themes, { theme: { selectedTheme: "site" } });
        expect(merged.test_themed.panel).toEqual({ wrapper: "site-wrapper", title: "default-title" });
    });

    it("hands every loaded site theme to registerFromTheme at route build", () => {
        const seen = [];
        registerPatternTypes({ test_theme_hook: { siteConfig: [appPatternConfig], registerFromTheme: (theme) => seen.push(theme?.marker) } });
        const dmsConfig = adminConfigs[0]({ app: "test-app", type: "prod", baseUrl: "/list" });
        pattern2routes([{ id: 1, patterns: [{ id: 10, pattern_type: "auth", base_url: "auth", subdomain: "*" }] }],
            { dmsConfig, adminPath: "/list", themes: { default: { marker: "default" }, site_a: { marker: "a" }, site_b: { marker: "b" } }, host: "localhost" });
        expect(seen).toEqual(expect.arrayContaining(["default", "a", "b"]));
    });

    it("re-registering a name replaces it and warns", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        registerPatternTypes({ test_twice: { siteConfig: [appPatternConfig], label: "One" } });
        registerPatternTypes({ test_twice: { siteConfig: [appPatternConfig], label: "Two" } });
        expect(getPatternType("test_twice").label).toBe("Two");
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});

describe("admin lists read the registry", () => {
    const patternTypeOptions = () => adminPatternFormat.attributes.find(a => a.key === "pattern_type").options;

    it("offers every addable registered type in the pattern-type select, and never admin", () => {
        const values = patternTypeOptions().map(o => o.value);
        expect(values).toEqual(expect.arrayContaining(["page", "datasets", "auth"]));
        expect(values).not.toContain("admin");
        expect(values).not.toContain("forms");
    });

    it("picks up a type registered after the format module loaded", () => {
        registerPatternTypes({ test_late: { siteConfig: [appPatternConfig], label: "Late", admin: { addable: true, order: 70 } } });
        expect(patternTypeOptions()).toContainEqual({ value: "test_late", label: "Late" });
    });
});

describe("onPagePublish (a type's hook on a page pattern's Publish)", () => {
    it("runs every type's hook with the page and the publish context, and a failing hook blocks nothing", async () => {
        const { publish } = await import("../src/patterns/page/pages/edit/editFunctions.jsx");
        const seen = [];
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        registerPatternTypes({
            publish_throws: { siteConfig: [appPatternConfig], onPagePublish: () => { throw new Error("boom"); } },
            publish_records: { siteConfig: [appPatternConfig], onPagePublish: (args) => { seen.push(args); } },
        });
        const writes = [];
        const apiUpdate = (arg) => { writes.push(arg); };
        const page = { id: 7, url_slug: "about", draft_sections: [], draft_section_groups: [] };
        const context = { pattern: { id: 3, name: "Docs" }, sitePatterns: [], type: "docs", app: "x", baseUrl: "/docs", apiLoad: () => {} };
        await publish({ id: 1 }, page, apiUpdate, context);
        await new Promise(r => setTimeout(r, 0));
        expect(writes).toHaveLength(1);
        expect(writes[0].data).toMatchObject({ id: 7, published: "" });
        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ ...context, page, apiUpdate });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("publish_throws"), expect.any(Error));
        warn.mockRestore();
    });
});
