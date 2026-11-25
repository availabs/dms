/**
 * An app's Settings sub pages (src/patterns/admin/settingsRegistry.js).
 * Task: src/dms/planning/tasks/current/app-settings-pages.md (phase 1)
 *
 * Run: npx vitest run src/dms/packages/dms/tests/settingsRegistry.test.js
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { Window } from "happy-dom";

let S, P, registry;

beforeAll(async () => {
    const window = new Window({ url: "http://localhost/" });
    globalThis.window = window;
    globalThis.document = window.document;
    S = await import("../src/patterns/admin/settingsRegistry.js");
    P = await import("../src/plugins/index.js");
    registry = await import("../src/patterns/registry.js");
});

const APP = "settings_app";
const admin = { authed: true, id: 1, groups: [`${APP} Admin`] };
const storageOnly = { authed: true, id: 2, groups: ["storers"] };
const nobody = { authed: true, id: 3, groups: ["public"] };
const grants = { groups: { storers: ["manage-storage"], themers: ["manage-themes"] } };
const Comp = () => null;
const page = (path, over = {}) => ({ name: path, path, component: Comp, can: () => true, ...over });
const paths = (list) => list.map(p => p.path);

describe("built-in pages", () => {
    it("an app admin on a single-site app: Overview, Plugins, Storage, in order; Server plugins only on the server's hub", () => {
        const { allowed } = S.settingsPagesFor({ user: admin, app: APP, authPermissions: grants });
        expect(paths(allowed).slice(0, 3)).toEqual(["overview", "plugins", "storage"]);
        expect(paths(allowed)).not.toContain("server_plugins");
        const hub = S.settingsPagesFor({ user: admin, app: APP, authPermissions: grants, pluginHub: true });
        expect(paths(hub.allowed)).toContain("server_plugins");
    });

    it("a user with only manage-storage gets Storage and nothing else", () => {
        const { all, allowed } = S.settingsPagesFor({ user: storageOnly, app: APP, authPermissions: grants });
        expect(paths(allowed)).toEqual(["storage"]);
        expect(paths(all)).toContain("overview");   // still offered, shown as denied
    });

    it("nobody with no site verb gets no page", () => {
        expect(S.settingsPagesFor({ user: nobody, app: APP, authPermissions: grants }).allowed).toEqual([]);
    });

    it("a tenant host never gets Server plugins, even said to be the hub", () => {
        const { allowed } = S.settingsPagesFor({ user: admin, app: APP, authPermissions: grants, pluginHub: true, isMultiTenant: true, tenantSubdomain: "acme" });
        expect(paths(allowed)).not.toContain("server_plugins");
    });

    it("the hub's tenant page offers only forTenant pages", () => {
        const { all } = S.settingsPagesFor({ user: admin, app: APP, authPermissions: grants, own: false, pluginHub: true });
        expect(paths(all).slice(0, 2)).toEqual(["overview", "plugins"]);
        expect(paths(all)).not.toContain("storage");
        expect(paths(all)).not.toContain("server_plugins");
    });
});

describe("the three doors", () => {
    it("the app: added in order, a duplicate or a built-in path refused with a warning, can() required", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(S.registerSettingsPages([page("app_about", { order: 15 }), page("app_about"), page("storage")])).toEqual(["app_about"]);
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
        expect(() => S.registerSettingsPages([{ name: "x", path: "x_page", component: Comp }])).toThrow(/can\(ctx\)/);
        expect(() => S.registerSettingsPages([page("Bad-Path")])).toThrow(/lowercase/);
        const { allowed } = S.settingsPagesFor({ user: admin, app: APP, authPermissions: grants });
        expect(paths(allowed).slice(0, 4)).toEqual(["overview", "plugins", "app_about", "storage"]);
    });

    it("a page's can() decides; one that throws is left out", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        S.registerSettingsPages([
            page("themers_only", { can: ({ user }) => user.groups.includes("themers") }),
            page("broken", { can: () => { throw new Error("no") } }),
        ]);
        const { all, allowed } = S.settingsPagesFor({ user: admin, app: APP, authPermissions: grants });
        expect(paths(all)).toContain("themers_only");
        expect(paths(allowed)).not.toContain("themers_only");
        expect(paths(allowed)).not.toContain("broken");
        expect(paths(S.settingsPagesFor({ user: { authed: true, groups: ["themers"] }, app: APP }).allowed)).toContain("themers_only");
        warn.mockRestore();
    });

    it("a plugin: shown only where it is active; a path another plugin has throws and rolls back", () => {
        P.registerPlugin({
            name: "settings_optin", version: "1.0.0", api: "^1.0", activation: "opt-in",
            register(host) { host.registerSettingsPages([page("optin_page", { forTenant: true })]) },
        });
        expect(P.getPlugin("settings_optin").contributes.settingsPages).toEqual(["optin_page"]);
        expect(P.pluginOf("settingsPages", "optin_page")).toBe("settings_optin");
        const off = S.settingsPagesFor({ user: admin, app: APP });
        expect(paths(off.all)).not.toContain("optin_page");
        const on = S.settingsPagesFor({ user: admin, app: APP, activations: { settings_optin: { enabled: true } } });
        expect(paths(on.allowed)).toContain("optin_page");

        expect(() => P.registerPlugin({
            name: "settings_clash", version: "1.0.0", api: "^1.0", activation: "default-on",
            register(host) { host.registerSettingsPages([page("clash_page"), page("optin_page")]) },
        })).toThrow(/already registered/);
        expect(P.getPlugin("settings_clash")).toBe(null);
        expect(paths(S.settingsPagesFor({ user: admin, app: APP }).all)).not.toContain("clash_page");
    });

    it("a pattern type: offered when the site has a pattern of that type", () => {
        registry.registerPatternTypes({
            settings_type: { label: "S", siteConfig: [], admin: { settingsPages: [page("type_page")] } },
        });
        expect(paths(S.settingsPagesFor({ user: admin, app: APP }).all)).not.toContain("type_page");
        const withIt = S.settingsPagesFor({ user: admin, app: APP, sitePatterns: [{ pattern_type: "settings_type" }] });
        expect(paths(withIt.allowed)).toContain("type_page");
    });
});
