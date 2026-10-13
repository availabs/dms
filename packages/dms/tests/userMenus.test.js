/**
 * Site user menus: the admin row's `user_menus` applied to every theme.
 *
 * See planning/tasks/current/user-menu-editor.md.
 *
 * Run: npx vitest run packages/dms/tests/userMenus.test.js
 */
import { describe, it, expect } from "vitest";

import {
  DEFAULT_USER_MENU_ID,
  getDefaultUserMenuItems,
  sanitizeMenuItems,
  withUserMenuThemes,
  themeOwnMenuItems,
  adminNavOptions,
} from "../src/utils/userMenus.js";
import { getPatternTheme, getAdminTheme } from "../src/ui/useTheme.js";

const siteMenu = [
  { name: "Data", icon: "Database", path: "/data" },
  { type: "separator" },
  { name: "Manager", icon: "Settings", path: "/list", groups: ["Admins"] },
];
const adminRow = (items) => ({
  id: 12, pattern_type: "admin",
  user_menus: [{ id: DEFAULT_USER_MENU_ID, name: "Default menu", items }],
});

describe("getDefaultUserMenuItems", () => {
  it("is null when the site has saved no menu", () => {
    expect(getDefaultUserMenuItems(undefined)).toBe(null);
    expect(getDefaultUserMenuItems({ id: 1, pattern_type: "admin" })).toBe(null);
    expect(getDefaultUserMenuItems({ user_menus: [{ id: "staff", items: [] }] })).toBe(null);
  });
  it("an empty saved menu is a real choice, not 'unset'", () => {
    expect(getDefaultUserMenuItems(adminRow([]))).toEqual([]);
  });
  it("reads a JSON-string value too", () => {
    const row = { user_menus: JSON.stringify(adminRow(siteMenu).user_menus) };
    expect(getDefaultUserMenuItems(row)).toEqual(siteMenu);
  });
});

describe("sanitizeMenuItems", () => {
  it("drops incomplete links, trims, and drops empty groups", () => {
    expect(sanitizeMenuItems([
      { name: " Data ", path: " /data ", icon: "Database", groups: [] },
      { name: "", path: "/x" },
      { name: "No path", path: "" },
      { name: "Gated", path: "/g", groups: ["A", "", 3] },
    ])).toEqual([
      { name: "Data", path: "/data", icon: "Database" },
      { name: "Gated", path: "/g", groups: ["A"] },
    ]);
  });
  it("removes leading, doubled and trailing dividers", () => {
    const s = { type: "separator" };
    expect(sanitizeMenuItems([s, { name: "A", path: "/a" }, s, s, { name: "B", path: "/b" }, s]))
      .toEqual([{ name: "A", path: "/a" }, s, { name: "B", path: "/b" }]);
  });
});

describe("withUserMenuThemes", () => {
  const tny = { navOptions: { authMenu: { navItems: [{ name: "Datasets", path: "/datasources" }] } } };
  const registry = { default: {}, transportny: tny };

  it("no saved menu: the registry is returned untouched", () => {
    expect(withUserMenuThemes(registry, null)).toBe(registry);
  });

  it("replaces every theme's authMenu, without writing to the registry", () => {
    const out = withUserMenuThemes(registry, siteMenu);
    expect(out.transportny.navOptions.authMenu.navItems).toEqual(sanitizeMenuItems(siteMenu));
    expect(out.default.navOptions.authMenu.navItems).toEqual(sanitizeMenuItems(siteMenu));
    expect(tny.navOptions.authMenu.navItems).toEqual([{ name: "Datasets", path: "/datasources" }]);
    expect(themeOwnMenuItems(out.transportny)).toEqual([{ name: "Datasets", path: "/datasources" }]);
    expect(themeOwnMenuItems(out.default)).toBe(undefined);
  });

  it("adds a default entry when the registry has none", () => {
    expect(withUserMenuThemes({}, siteMenu).default.navOptions.authMenu.navItems).toHaveLength(3);
  });

  it("reaches a pattern through getPatternTheme, whichever theme it selects", () => {
    const out = withUserMenuThemes(registry, siteMenu);
    // A selection missing from the registry gets the bare library theme
    // (getBaseTheme), so no site menu either; that pattern is already broken.
    for (const selectedTheme of ["transportny", "default"]) {
      const theme = getPatternTheme(out, { theme: { selectedTheme } });
      expect(theme.navOptions.authMenu.navItems).toEqual(sanitizeMenuItems(siteMenu));
    }
  });
});

describe("adminNavOptions (admin and auth-manage chrome)", () => {
  it("carries a saved site menu over the admin navOptions", () => {
    const themes = withUserMenuThemes({ default: {} }, siteMenu);
    const theme = getAdminTheme(themes, undefined);
    const nav = adminNavOptions(theme);
    expect(nav.sideNav).toBeDefined(); // still the admin navOptions
    expect(nav.authMenu.navItems).toHaveLength(3);
  });
  it("a theme's own authMenu still doesn't reach admin chrome (unchanged behaviour)", () => {
    const theme = getAdminTheme({ default: { navOptions: { authMenu: { navItems: [{ name: "X", path: "/x" }] } } } }, undefined);
    expect(adminNavOptions(theme).authMenu).toBeUndefined();
  });
});

// Who gets the Pattern Editor's User Menu tab: edit access to the admin row only
// (patternEditor/index.jsx and admin siteConfig.jsx's sidenav run this same check).
describe("User Menu tab gate", async () => {
  const { patternCan, EDIT_PATTERN } = await import("../src/utils/adminPermissions.js");
  const app = "site";
  const siteGrants = { groups: { editors: ["view-pattern-list"] } };
  const editor = { authed: true, id: 7, groups: ["editors"] };
  const appAdmin = { authed: true, id: 1, groups: ["site Admin"] };
  const gate = (user, adminRow) => patternCan(user, app, siteGrants, adminRow || { pattern_type: "admin" }, EDIT_PATTERN);

  it("app admins pass", () => {
    expect(gate(appAdmin, { pattern_type: "admin" })).toBe(true);
  });
  it("list access alone doesn't, even with edit-pattern on the open pattern", () => {
    expect(gate(editor, { pattern_type: "admin" })).toBe(false);
  });
  it("a `*` grant on the admin row does", () => {
    expect(gate(editor, { pattern_type: "admin", authPermissions: { groups: { editors: ["*"] } } })).toBe(true);
  });
  it("no admin row yet: only app admins / site `*`", () => {
    expect(gate(editor, undefined)).toBe(false);
    expect(gate(appAdmin, undefined)).toBe(true);
  });
});

// Precedence (owner, 2026-10-09): a pattern's own menu (its theme override) wins
// over the site's Default menu. MitigateNY has 64 such patterns.
describe("pattern's own menu vs the Default menu", async () => {
  const { withPatternMenuPrecedence, resolveUserMenuItems, patternOwnMenuItems } = await import("../src/utils/userMenus.js");
  const site = [
    { name: "S1", path: "/s1", groups: ["Admins"] }, { name: "S2", path: "/s2" }, { name: "S3", path: "/s3" },
    { name: "S4", path: "/s4" }, { name: "S5", path: "/s5" }, { name: "S6", path: "/s6" },
  ];
  const own = [{ name: "Cenrep", path: "/cenrep" }, { name: "Guide", path: "/guide" }, { name: "Admin", path: "/admin" }];
  const ownPattern = { id: 985070, pattern_type: "page", theme: { selectedTheme: "mny", navOptions: { authMenu: { navItems: own } } } };
  const plainPattern = { id: 11, pattern_type: "page", theme: { selectedTheme: "mny" } };
  const themesWith = (items) => withUserMenuThemes({ default: {}, mny: {} }, items);
  const menuFor = (pattern, items, live) =>
    resolveUserMenuItems(getPatternTheme(themesWith(items), withPatternMenuPrecedence(pattern, items)).navOptions?.authMenu, live);

  it("own menu wins, whole: no Default-menu links appended, no fields inherited", () => {
    expect(menuFor(ownPattern, site)).toEqual(own);
  });
  it("a pattern without its own menu gets the Default menu", () => {
    expect(menuFor(plainPattern, site)).toEqual(sanitizeMenuItems(site));
  });
  it("no Default menu: own menu as before, plain pattern falls through to the fallback", () => {
    expect(menuFor(ownPattern, null)).toEqual(own);
    expect(menuFor(plainPattern, null)).toBeUndefined();
  });
  it("never writes to the pattern row", () => {
    const before = JSON.stringify(ownPattern);
    withPatternMenuPrecedence(ownPattern, site);
    expect(JSON.stringify(ownPattern)).toBe(before);
    expect(patternOwnMenuItems({ theme: JSON.stringify(ownPattern.theme) })).toEqual(own);
  });
  it("live: a new Default menu doesn't touch a pattern with its own", () => {
    const live = { items: [{ name: "New", path: "/new" }], patternMenus: {} };
    expect(menuFor(ownPattern, site, live)).toEqual(own);
    expect(menuFor(plainPattern, site, live)).toEqual(live.items);
  });
  it("live: giving a pattern its own menu, or removing it", () => {
    const mine = [{ name: "Mine", path: "/mine" }];
    expect(menuFor(plainPattern, site, { patternMenus: { "11": mine } })).toEqual(mine);
    // removed live → the Default menu it had at boot
    expect(menuFor(ownPattern, site, { patternMenus: { "985070": null } })).toEqual(sanitizeMenuItems(site));
  });
  it("admin chrome (no pattern): Default menu, live or boot", () => {
    const adminAuthMenu = adminNavOptions(getAdminTheme(themesWith(site), undefined)).authMenu;
    expect(resolveUserMenuItems(adminAuthMenu, {})).toEqual(sanitizeMenuItems(site));
    expect(resolveUserMenuItems(adminAuthMenu, { items: null })).toBeUndefined();
  });
});
