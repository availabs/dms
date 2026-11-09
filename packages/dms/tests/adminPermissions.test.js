/**
 * Admin panel granular permissions — siteCan / patternCan / patternActions
 * against the access matrix in
 * planning/tasks/completed/admin-granular-permissions.md.
 *
 * Run: npx vitest run packages/dms/tests/adminPermissions.test.js
 */
import { describe, it, expect } from "vitest";
import "../src/patterns/index.js";   // registerPatternTypes: the composer reads the registry
import { patternPermissionOptions } from "../src/patterns/registry.js";

import {
  siteCan,
  patternCan,
  patternActions,
  tabPermission,
  VIEW_PATTERN_LIST,
  CREATE_PATTERN,
  MANAGE_THEMES,
  MANAGE_TENANTS,
  EDIT_PATTERN,
  EDIT_PATTERN_PERMISSIONS,
  DELETE_PATTERN,
} from "../src/utils/adminPermissions.js";

const APP = "testapp";
const user = (groups = ["editors"], extra = {}) => ({ id: 7, authed: true, groups, ...extra });
const loggedOut = { authed: false, groups: ["public"] };
const admin = user([`${APP} Admin`]);

// Site permissions as AdminContext carries them (flat, public default added).
const site = (editorsPerms) => ({ groups: { public: ["view-page"], ...(editorsPerms ? { editors: editorsPerms } : {}) }, users: {} });
// Pattern permissions in the Access editor's subdomain-keyed save shape.
const pat = (editorsPerms, extra = {}) => ({
  pattern_type: "page",
  subdomain: "*",
  authPermissions: editorsPerms === undefined ? undefined : {
    "*": JSON.stringify({ groups: { public: ["view-page"], ...(editorsPerms ? { editors: editorsPerms } : {}), ...(extra.groups || {}) }, users: extra.users || {} }),
  },
  ...(extra.pattern_type ? { pattern_type: extra.pattern_type } : {}),
});
// Other people hold grants; the test user holds nothing on this pattern.
const lockedPat = pat(null, { groups: { owners: ["*"] } });

describe("siteCan", () => {
  it("logged out → never", () => {
    expect(siteCan(loggedOut, APP, site(["*"]), VIEW_PATTERN_LIST)).toBe(false);
  });
  it("${app} Admin → everything, even with no grants configured", () => {
    expect(siteCan(admin, APP, {}, VIEW_PATTERN_LIST)).toBe(true);
    expect(siteCan(admin, APP, {}, "*")).toBe(true);
  });
  it("no grants → nothing (no 'unconfigured → allow')", () => {
    expect(siteCan(user(), APP, site(), VIEW_PATTERN_LIST)).toBe(false);
    expect(siteCan(user(), APP, {}, VIEW_PATTERN_LIST)).toBe(false);
  });
  it("named permission grants only itself", () => {
    const s = site([VIEW_PATTERN_LIST]);
    expect(siteCan(user(), APP, s, VIEW_PATTERN_LIST)).toBe(true);
    expect(siteCan(user(), APP, s, CREATE_PATTERN)).toBe(false);
    expect(siteCan(user(), APP, s, "*")).toBe(false);
  });
  it("manage-themes alone doesn't open the list", () => {
    const s = site([MANAGE_THEMES]);
    expect(siteCan(user(), APP, s, MANAGE_THEMES)).toBe(true);
    expect(siteCan(user(), APP, s, VIEW_PATTERN_LIST)).toBe(false);
  });
  it("`*` grants every site permission", () => {
    const s = site(["*"]);
    for (const p of [VIEW_PATTERN_LIST, CREATE_PATTERN, MANAGE_THEMES, MANAGE_TENANTS, "*"]) {
      expect(siteCan(user(), APP, s, p)).toBe(true);
    }
  });
  it("user-level grants and the subdomain-keyed/string shape both work", () => {
    const s = JSON.stringify({ "*": JSON.stringify({ groups: {}, users: { 7: [MANAGE_TENANTS] } }) });
    expect(siteCan(user([]), APP, s, MANAGE_TENANTS)).toBe(true);
    expect(siteCan(user([], { id: 8 }), APP, s, MANAGE_TENANTS)).toBe(false);
  });
});

describe("patternCan", () => {
  const listOnly = site([VIEW_PATTERN_LIST]);

  it("site `*` / Admin → everything on every pattern", () => {
    for (const p of [EDIT_PATTERN, EDIT_PATTERN_PERMISSIONS, DELETE_PATTERN]) {
      expect(patternCan(user(), APP, site(["*"]), lockedPat, p)).toBe(true);
      expect(patternCan(admin, APP, {}, lockedPat, p)).toBe(true);
    }
  });
  it("logged out → never, even on an open pattern", () => {
    expect(patternCan(loggedOut, APP, site(["*"]), pat(undefined), EDIT_PATTERN)).toBe(false);
  });
  it("open pattern (never configured, or only the seeded public entry) → full control with view-pattern-list", () => {
    for (const p of [pat(undefined), pat(null)]) {
      expect(patternCan(user(), APP, listOnly, p, EDIT_PATTERN)).toBe(true);
      expect(patternCan(user(), APP, listOnly, p, EDIT_PATTERN_PERMISSIONS)).toBe(true);
      expect(patternCan(user(), APP, listOnly, p, DELETE_PATTERN)).toBe(true);
      // …but not without list access
      expect(patternCan(user(), APP, site([MANAGE_THEMES]), p, EDIT_PATTERN)).toBe(false);
    }
  });
  it("open auth/admin rows are NOT open: they hold the site's own grants", () => {
    for (const t of ["auth", "admin"]) {
      const p = { ...pat(undefined), pattern_type: t };
      expect(patternCan(user(), APP, listOnly, p, EDIT_PATTERN)).toBe(false);
      expect(patternCan(user(), APP, listOnly, p, EDIT_PATTERN_PERMISSIONS)).toBe(false);
      expect(patternCan(user(), APP, site(["*"]), p, EDIT_PATTERN_PERMISSIONS)).toBe(true);
    }
  });
  it("pattern with grants, none for this user → nothing", () => {
    for (const p of [EDIT_PATTERN, EDIT_PATTERN_PERMISSIONS, DELETE_PATTERN]) {
      expect(patternCan(user(), APP, listOnly, lockedPat, p)).toBe(false);
    }
  });
  it("named pattern permission grants only itself", () => {
    const p = pat([EDIT_PATTERN]);
    expect(patternCan(user(), APP, listOnly, p, EDIT_PATTERN)).toBe(true);
    expect(patternCan(user(), APP, listOnly, p, EDIT_PATTERN_PERMISSIONS)).toBe(false);
    expect(patternCan(user(), APP, listOnly, p, DELETE_PATTERN)).toBe(false);
  });
  it("pattern `*` → everything on that pattern", () => {
    const p = pat(["*"]);
    for (const perm of [EDIT_PATTERN, EDIT_PATTERN_PERMISSIONS, DELETE_PATTERN]) {
      expect(patternCan(user(), APP, listOnly, p, perm)).toBe(true);
    }
  });
  it("content permissions never grant admin access", () => {
    const p = pat(["view-page", "edit-page", "create-page", "publish-page", "edit-page-permissions"]);
    for (const perm of [EDIT_PATTERN, EDIT_PATTERN_PERMISSIONS, DELETE_PATTERN]) {
      expect(patternCan(user(), APP, listOnly, p, perm)).toBe(false);
    }
  });
  it("flat (old) pattern shape works too", () => {
    const p = { pattern_type: "page", authPermissions: { groups: { editors: [EDIT_PATTERN] }, users: {} } };
    expect(patternCan(user(), APP, listOnly, p, EDIT_PATTERN)).toBe(true);
    expect(patternCan(user(), APP, listOnly, p, DELETE_PATTERN)).toBe(false);
  });
  it("subdomain-specific grants win over `*` for a pattern on that subdomain", () => {
    const p = {
      pattern_type: "page",
      subdomain: "acme",
      authPermissions: {
        "*": JSON.stringify({ groups: { editors: ["*"] }, users: {} }),
        acme: JSON.stringify({ groups: { editors: [EDIT_PATTERN] }, users: {} }),
      },
    };
    expect(patternCan(user(), APP, listOnly, p, EDIT_PATTERN)).toBe(true);
    expect(patternCan(user(), APP, listOnly, p, DELETE_PATTERN)).toBe(false);
  });
});

// One `it` per access-matrix row (list row / editor / delete / duplicate).
describe("patternActions — access matrix rows", () => {
  const listOnly = site([VIEW_PATTERN_LIST]);
  const listCreate = site([VIEW_PATTERN_LIST, CREATE_PATTERN]);
  // Deleting a pattern is a SITE operation (owner, 2026-10-30) — it is granted on the site row,
  // beside create-pattern, not on the pattern row being deleted.
  const listDelete = site([VIEW_PATTERN_LIST, DELETE_PATTERN]);
  const act = (s, p, u = user()) => patternActions(u, APP, s, p);

  it("open pattern: link + edit, no delete without the SITE grant", () => {
    expect(act(listOnly, pat(undefined))).toMatchObject({ open: true, edit: true, editPermissions: true, delete: false, duplicate: false, locked: false });
  });
  it("grants, none for this user: locked", () => {
    expect(act(listOnly, lockedPat)).toMatchObject({ open: false, edit: false, delete: false, duplicate: false, locked: true });
  });
  it("edit-pattern: link + edit only", () => {
    expect(act(listOnly, pat([EDIT_PATTERN]))).toMatchObject({ open: true, edit: true, editPermissions: false, delete: false, duplicate: false, locked: false });
  });
  it("edit-pattern + edit-pattern-permissions", () => {
    expect(act(listOnly, pat([EDIT_PATTERN, EDIT_PATTERN_PERMISSIONS]))).toMatchObject({ open: true, edit: true, editPermissions: true, delete: false });
  });
  it("edit-pattern-permissions only: link (Access tab), no Edit action", () => {
    expect(act(listOnly, pat([EDIT_PATTERN_PERMISSIONS]))).toMatchObject({ open: true, edit: false, editPermissions: true, delete: false, locked: false });
  });
  it("delete-pattern on the PATTERN row confers nothing — it is a site verb now", () => {
    expect(act(listOnly, pat([DELETE_PATTERN]))).toMatchObject({ open: false, edit: false, delete: false, duplicate: false, locked: true });
  });
  it("delete-pattern on the SITE row: Delete, whatever the pattern grants", () => {
    expect(act(listDelete, pat([DELETE_PATTERN])).delete).toBe(true);
    expect(act(listDelete, pat([EDIT_PATTERN]))).toMatchObject({ open: true, edit: true, delete: true });
    expect(act(listDelete, pat(undefined)).delete).toBe(true);
  });
  it("pattern `*`: everything except Duplicate and Delete, both site grants", () => {
    expect(act(listOnly, pat(["*"]))).toMatchObject({ open: true, edit: true, editPermissions: true, delete: false, duplicate: false });
    expect(act(listDelete, pat(["*"])).delete).toBe(true);
  });
  it("create-pattern + edit-pattern (or `*`): + Duplicate", () => {
    expect(act(listCreate, pat([EDIT_PATTERN])).duplicate).toBe(true);
    expect(act(listCreate, pat(["*"])).duplicate).toBe(true);
    expect(act(listCreate, pat(undefined)).duplicate).toBe(true);
    expect(act(listCreate, pat([DELETE_PATTERN])).duplicate).toBe(false);
  });
  it("content permissions only: locked", () => {
    expect(act(listOnly, pat(["view-page", "edit-page"])).locked).toBe(true);
  });
  it("auth/admin rows never get Delete or Duplicate, even for Admin", () => {
    for (const t of ["auth", "admin"]) {
      expect(act({}, { ...pat(undefined), pattern_type: t }, admin)).toMatchObject({ open: true, edit: true, delete: false, duplicate: false });
    }
  });
  it("a type registered with admin.duplicable: false gets Delete but never Duplicate, even for Admin", () => {
    const row = { ...pat(undefined), pattern_type: "fake_type" };
    expect(patternActions(admin, APP, {}, row, { duplicable: false })).toMatchObject({ open: true, edit: true, delete: true, duplicate: false });
    expect(patternActions(admin, APP, {}, row, { duplicable: true })).toMatchObject({ duplicate: true });
    expect(patternActions(admin, APP, {}, row)).toMatchObject({ duplicate: true });
  });
  it("site `*` / Admin: everything", () => {
    expect(act(site(["*"]), lockedPat)).toMatchObject({ open: true, edit: true, editPermissions: true, delete: true, duplicate: true, locked: false });
    expect(act({}, lockedPat, admin)).toMatchObject({ open: true, delete: true, duplicate: true });
  });
});

describe("tabPermission", () => {
  it("only Access needs edit-pattern-permissions", () => {
    expect(tabPermission("permissions")).toBe(EDIT_PATTERN_PERMISSIONS);
    for (const tab of ["overview", "theme", "pages", "sources", "activity", "page_templates", "edit_pattern", "custom"]) {
      expect(tabPermission(tab)).toBe(EDIT_PATTERN);
    }
  });
});

// The Access editor's option list moved out of this module in Phase 3: it is composed from the
// DERIVED vocabulary by `patternPermissionOptions` (patterns/registry.js), so these cases register
// the real built-ins and read what the editor would actually offer.
describe("patternPermissionOptions — composed from the derived vocabularies", () => {
  const values = (type, opts) => patternPermissionOptions(type, opts).map(o => o.value);

  it("admin: pattern-row verbs plus everything under the site", () => {
    const v = values("admin");
    expect(v.slice(0, 1)).toEqual(["*"]);
    expect(v).toEqual(expect.arrayContaining([
      VIEW_PATTERN_LIST, CREATE_PATTERN, DELETE_PATTERN, MANAGE_THEMES, MANAGE_TENANTS,
      EDIT_PATTERN, EDIT_PATTERN_PERMISSIONS,
    ]));
  });

  it("auth: its own route verbs, plus the site list only while the admin row grants nothing", () => {
    expect(values("auth", { adminRowHasGrants: true }))
      .toEqual(expect.arrayContaining(["auth-users", "auth-groups", "view-as"]));
    expect(values("auth", { adminRowHasGrants: true })).not.toContain(MANAGE_THEMES);
    // the fallback borrows from the type named by `siteFallback` on the auth registry entry
    expect(values("auth", { adminRowHasGrants: false }))
      .toEqual(expect.arrayContaining([VIEW_PATTERN_LIST, CREATE_PATTERN, MANAGE_THEMES, MANAGE_TENANTS, "auth-users"]));
  });

  it("page: pattern-row verbs + the page and section domains", () => {
    const v = values("page");
    expect(v).toEqual(expect.arrayContaining([
      EDIT_PATTERN, EDIT_PATTERN_PERMISSIONS, "view-pattern",
      "view-page", "edit-page", "publish-page",
      "edit-page-params",     // was ungrantable: PAGE_OPTIONS hand-copied the domain and missed it
    ]));
    expect(v, "delete-pattern is a site verb now").not.toContain(DELETE_PATTERN);
  });

  it("datasets: pattern-level verbs + the source domain, and no stray view-page", () => {
    const v = values("datasets");
    expect(v).toEqual(expect.arrayContaining([
      "view-pattern", "view-sources", "view-source", "update-source", "edit-source-permissions", EDIT_PATTERN,
    ]));
    expect(v).not.toContain("edit-page");
    expect(v, "the duplicate that opened every source beneath a pattern").not.toContain("view-page");
  });

  it("an unregistered type: just `*` — it has no formats, so it declares nothing", () => {
    expect(values("some_app_pattern")).toEqual(["*"]);
  });

  it("deduplicates: a verb offered by two formats appears once", () => {
    const v = values("admin");
    expect(new Set(v).size).toBe(v.length);
  });
});
