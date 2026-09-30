/**
 * The admin pattern as a saved row (`{instance}|admin:pattern`) — routing
 * fallback, creation helpers, and the first-load backfill.
 *
 * See planning/tasks/current/admin-pattern-data-row.md.
 *
 * Run: npx vitest run packages/dms/tests/adminPatternRow.test.js
 */
import { describe, it, expect } from "vitest";

import {
  pattern2routes,
  pickAdminPattern,
  hasAuthGrants,
  hasThemeSelection,
} from "../src/render/spa/utils/index.js";
import {
  adminPathToBaseUrl,
  buildAdminPatternData,
  createCorePatterns,
  backfillAdminPattern,
  mergeSitePatternRefs,
} from "../src/utils/tenantProvisioning.js";
import adminConfigs from "../src/patterns/admin/siteConfig.jsx";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

describe("adminPathToBaseUrl / buildAdminPatternData", () => {
  it("stores the admin path the way pattern rows store base_url", () => {
    expect(adminPathToBaseUrl("/list")).toBe("list");
    expect(adminPathToBaseUrl("list/")).toBe("list");
    expect(adminPathToBaseUrl("/")).toBe("/");
    expect(adminPathToBaseUrl("")).toBe("/");
  });

  it("pins only base_url — permissions and theme stay empty so they fall back", () => {
    expect(buildAdminPatternData({ adminPath: "/list" })).toEqual({
      pattern_type: "admin", name: "Admin", subdomain: "*", base_url: "list",
    });
    expect(buildAdminPatternData({})).toEqual({ pattern_type: "admin", name: "Admin", subdomain: "*" });
  });

  it("a tenant's admin row names the tenant subdomain", () => {
    expect(buildAdminPatternData({ adminPath: "/list", subdomain: "acme" }).subdomain).toBe("acme");
  });
});

describe("pickAdminPattern", () => {
  it("returns the only admin row, or undefined", () => {
    expect(pickAdminPattern([{ id: 1, pattern_type: "page" }])).toBeUndefined();
    expect(pickAdminPattern([{ id: 5, pattern_type: "admin" }]).id).toBe(5);
  });
  it("settles duplicates on the lowest id, whatever the order", () => {
    const rows = [{ id: 9, pattern_type: "admin" }, { id: 3, pattern_type: "admin" }, { id: 7, pattern_type: "admin" }];
    expect(pickAdminPattern(rows).id).toBe(3);
  });
});

describe("hasAuthGrants", () => {
  it("empty / public-only values grant nothing (so the auth pattern is used)", () => {
    for (const v of [undefined, "", "{}", "[]", { groups: {}, users: {} },
      // exactly what permissionsEditor.jsx saves for an untouched Access tab
      { "*": { groups: { public: ["view-page"] }, users: {} } },
      JSON.stringify({ "*": JSON.stringify({ groups: { public: ["view-page"] } }) }),
      { groups: { Editors: [] }, users: { 4: [] } },
    ]) expect(hasAuthGrants(v)).toBe(false);
  });
  it("a user or non-public group grant counts, flat or subdomain-keyed", () => {
    expect(hasAuthGrants({ groups: { Editors: ["*"] } })).toBe(true);
    expect(hasAuthGrants({ users: { 12: ["*"] } })).toBe(true);
    expect(hasAuthGrants({ "*": { groups: { public: ["view-page"], Editors: ["*"] } } })).toBe(true);
    expect(hasAuthGrants(JSON.stringify({ "*": JSON.stringify({ users: { 1: ["*"] } }) }))).toBe(true);
  });
});

describe("hasThemeSelection", () => {
  it("true only when the row selects a theme or carries admin overrides", () => {
    expect(hasThemeSelection(undefined)).toBe(false);
    expect(hasThemeSelection({})).toBe(false);
    expect(hasThemeSelection({ theme: {} })).toBe(false);
    expect(hasThemeSelection({ theme: { selectedTheme: "brand" } })).toBe(true);
    expect(hasThemeSelection({ theme: { settings: { theme: { theme: "brand" } } } })).toBe(true);
    expect(hasThemeSelection({ theme: { admin: { logo: {} } } })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pattern2routes
// ---------------------------------------------------------------------------

const APP = "test-app";
const dmsConfig = adminConfigs[0]({ app: APP, type: "prod", baseUrl: "/list" });
const authRow = { id: 10, pattern_type: "auth", base_url: "auth", subdomain: "*" };
const pageRow = { id: 11, pattern_type: "page", base_url: "/", subdomain: "*" };
const routesFor = (patterns, extra = {}) =>
  pattern2routes([{ id: 1, patterns }], {
    dmsConfig, adminPath: "/list", themes: { default: {} }, host: "localhost", ...extra,
  });
const paths = (routes) => routes.map(r => r.path);

describe("pattern2routes with a saved admin row", () => {
  it("no admin row: admin routes come from the in-code admin pattern at adminPath", () => {
    const p = paths(routesFor([authRow, pageRow]));
    expect(p.some(x => x.startsWith("/list"))).toBe(true);
  });

  it("an empty (freshly backfilled) row routes exactly like no row", () => {
    const before = paths(routesFor([authRow, pageRow]));
    const after = paths(routesFor([{ id: 12, pattern_type: "admin", name: "Admin", subdomain: "*" }, authRow, pageRow]));
    expect(after).toEqual(before);
  });

  it("a backfilled row pinned to the current admin path also routes identically", () => {
    const before = paths(routesFor([authRow, pageRow]));
    const after = paths(routesFor([{ id: 12, ...buildAdminPatternData({ adminPath: "/list" }) }, authRow, pageRow]));
    expect(after).toEqual(before);
  });

  it("the row's base_url moves the admin routes, and the row is never routed on its own", () => {
    const before = paths(routesFor([authRow, pageRow]));
    const after = paths(routesFor([{ id: 12, pattern_type: "admin", base_url: "site_admin", subdomain: "*" }, authRow, pageRow]));
    expect(after.length).toBe(before.length);
    expect(after).toEqual(before.map(x => x.replace(/^\/list/, "/site_admin")));
  });

  it("a tenant's admin row (subdomain = slug) routes on that tenant's subdomain", () => {
    const tenantRow = { id: 12, pattern_type: "admin", base_url: "list", subdomain: "acme" };
    const onTenant = paths(routesFor([tenantRow, authRow, pageRow], { host: "acme.localhost:5173" }));
    const baseline = paths(routesFor([authRow, pageRow], { host: "acme.localhost:5173" }));
    expect(onTenant).toEqual(baseline);
    expect(onTenant.some(x => x.startsWith("/list"))).toBe(true);
  });

  it("two admin rows: the lowest id's base_url wins", () => {
    const p = paths(routesFor([
      { id: 30, pattern_type: "admin", base_url: "second" },
      { id: 20, pattern_type: "admin", base_url: "first" },
      authRow, pageRow,
    ]));
    expect(p.some(x => x.startsWith("/first"))).toBe(true);
    expect(p.some(x => x.startsWith("/second"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// creation + backfill, against an in-memory stand-in for dms-server
// ---------------------------------------------------------------------------

// Mirrors the dms.data.* call/get shapes the helpers use (create → new id under
// json.dms.data.byId, dms.data[app].byId[id].data as an atom, the no-access
// stub for rows the caller can't view) — checked against a live server by
// adminPatternRow.integration.test.js. `hooks.beforeEdit` lets a test interleave a second writer.
function fakeServer({ siteId = 1, patterns = [], rows = {}, blocked = [] } = {}) {
  let nextId = 100;
  const db = { [siteId]: { app: APP, type: "prod:site", data: { site_name: "s", patterns } }, ...rows };
  const hooks = {};
  const calls = [];
  const falcor = {
    async invalidate() {},
    async get([, , app, byIdKey, ids]) {
      if (byIdKey !== "byId") throw new Error("expected the app-namespaced dms.data[app].byId path");
      const byId = {};
      for (const id of [].concat(ids)) {
        const row = db[id];
        if (!row) continue;
        byId[id] = {
          data: blocked.includes(+id)
            ? { $type: "atom", value: { id: "no-access", pattern_type: row.data.pattern_type } }
            : { $type: "atom", value: structuredClone(row.data) },
        };
      }
      return { json: { dms: { data: { [app]: { byId } } } } };
    },
    async call([, , op], args) {
      calls.push([op, args]);
      if (op === "create") {
        const [app, type, data] = args;
        const id = nextId++;
        db[id] = { app, type, data: structuredClone(data) };
        return { json: { dms: { data: { byId: { [id]: {}, $__path: [] } } } } };
      }
      if (op === "edit") {
        const [, id, data] = args;
        await hooks.beforeEdit?.(+id, data);
        db[id].data = { ...db[id].data, ...structuredClone(data) };
        return { json: {} };
      }
      if (op === "delete") {
        const [, , id] = args;
        delete db[id];
        return { json: {} };
      }
      throw new Error(`unexpected call ${op}`);
    },
  };
  return { falcor, db, hooks, calls, siteId };
}

const sitePatternIds = (db, siteId = 1) => db[siteId].data.patterns.map(r => +r.id);
const adminRowIds = (db) => Object.entries(db).filter(([, r]) => r.data?.pattern_type === "admin").map(([id]) => +id);

describe("createCorePatterns", () => {
  it("creates auth + admin rows and registers both on the site straight away", async () => {
    const { falcor, db } = fakeServer();
    const refs = await createCorePatterns(falcor, {
      app: APP, siteInstance: "prod", siteId: 1, adminGroupName: "proj", adminPath: "/list",
    });
    expect(refs.map(r => r.ref)).toEqual([`${APP}+prod|auth:pattern`, `${APP}+prod|admin:pattern`]);
    expect(sitePatternIds(db)).toEqual(refs.map(r => r.id));
    expect(db[refs[1].id]).toMatchObject({ type: "prod|admin:pattern", data: { pattern_type: "admin", base_url: "list" } });
    expect(JSON.parse(db[refs[0].id].data.authPermissions).groups["proj Admin"]).toEqual(["*"]);
  });

  it("tenant: both rows land in the tenant's app with the tenant subdomain", async () => {
    const { falcor, db } = fakeServer();
    const refs = await createCorePatterns(falcor, {
      app: "acme", siteInstance: "prod", siteId: 1, adminGroupName: "acme", subdomain: "acme", adminPath: "/list",
    });
    expect(refs.map(r => r.ref)).toEqual(["acme+prod|auth:pattern", "acme+prod|admin:pattern"]);
    for (const r of refs) expect(db[r.id]).toMatchObject({ app: "acme", data: { subdomain: "acme" } });
  });
});

describe("mergeSitePatternRefs", () => {
  const r = (id) => ({ ref: `${APP}+prod|pattern`, id });

  it("the create-site wipe: a stale copy that never saw auth/admin keeps them on save", () => {
    // the list page loaded [] (local store), the server has auth 10 + admin 11
    const merged = mergeSitePatternRefs({ edited: [{ name: "Docs" }], baseline: [], server: [r(10), r(11)] });
    expect(merged).toEqual([r(10), r(11), { name: "Docs" }]);
  });

  it("a ref the user removed stays removed", () => {
    const merged = mergeSitePatternRefs({ edited: [r(10)], baseline: [r(10), r(12)], server: [r(10), r(12)] });
    expect(merged.map(x => x.id)).toEqual([10]);
  });

  it("an explicit removal wins even if the stale copy never had it", () => {
    const merged = mergeSitePatternRefs({ edited: [r(10)], baseline: [r(10)], server: [r(10), r(13)], removed: [13] });
    expect(merged.map(x => x.id)).toEqual([10]);
  });

  it("nothing extra on the server: the edited list is written as-is", () => {
    const edited = [r(11), r(10)];
    expect(mergeSitePatternRefs({ edited, baseline: [r(10), r(11)], server: [r(10), r(11)] })).toBe(edited);
  });
});

describe("backfillAdminPattern", () => {
  const existing = {
    10: { app: APP, type: "prod|auth:pattern", data: { pattern_type: "auth" } },
    11: { app: APP, type: "prod|docs:pattern", data: { pattern_type: "page" } },
  };
  const refs = [{ ref: `${APP}+prod|pattern`, id: 10 }, { ref: `${APP}+prod|pattern`, id: 11 }];

  it("creates one admin row, first in the site's list, other refs untouched", async () => {
    const { falcor, db } = fakeServer({ patterns: refs, rows: structuredClone(existing) });
    const ref = await backfillAdminPattern(falcor, { app: APP, siteInstance: "prod", siteId: 1, adminPath: "/list" });
    expect(ref).toMatchObject({ ref: `${APP}+prod|admin:pattern` });
    expect(db[1].data.patterns).toEqual([ref, ...refs]);
    expect(db[ref.id].data).toEqual({ pattern_type: "admin", name: "Admin", subdomain: "*", base_url: "list" });
  });

  it("does nothing when the site already has one — detected by row, not by ref string", async () => {
    // saving the pattern list rewrites every ref to the generic `|pattern` form
    const rows = { ...structuredClone(existing), 12: { app: APP, type: "prod|admin:pattern", data: { pattern_type: "admin" } } };
    const { falcor, db, calls } = fakeServer({ patterns: [...refs, { ref: `${APP}+prod|pattern`, id: 12 }], rows });
    expect(await backfillAdminPattern(falcor, { app: APP, siteInstance: "prod", siteId: 1, adminPath: "/list" })).toBeNull();
    expect(calls).toEqual([]);
    expect(adminRowIds(db)).toEqual([12]);
  });

  it("sees an admin row the user can't view, through the no-access stub", async () => {
    const rows = { ...structuredClone(existing), 12: { app: APP, type: "prod|admin:pattern", data: { pattern_type: "admin" } } };
    const { falcor, calls } = fakeServer({ patterns: [...refs, { ref: "x", id: 12 }], rows, blocked: [12] });
    expect(await backfillAdminPattern(falcor, { app: APP, siteInstance: "prod", siteId: 1 })).toBeNull();
    expect(calls).toEqual([]);
  });

  it("on a tenant subdomain the backfilled row names the tenant", async () => {
    const { falcor, db } = fakeServer({ patterns: refs, rows: structuredClone(existing) });
    const ref = await backfillAdminPattern(falcor, { app: APP, siteInstance: "prod", siteId: 1, adminPath: "/list", subdomain: "acme" });
    expect(db[ref.id].data.subdomain).toBe("acme");
  });

  it("a second run is a no-op", async () => {
    const { falcor, db } = fakeServer({ patterns: refs, rows: structuredClone(existing) });
    const opts = { app: APP, siteInstance: "prod", siteId: 1, adminPath: "/list" };
    await backfillAdminPattern(falcor, opts);
    expect(await backfillAdminPattern(falcor, opts)).toBeNull();
    expect(adminRowIds(db).length).toBe(1);
  });

  it("two admins at once: one admin row survives and is the one on the site", async () => {
    const server = fakeServer({ patterns: refs, rows: structuredClone(existing) });
    const opts = { app: APP, siteInstance: "prod", siteId: 1, adminPath: "/list" };
    const [a, b] = await Promise.all([
      backfillAdminPattern(server.falcor, opts),
      backfillAdminPattern(server.falcor, opts),
    ]);
    const survivors = adminRowIds(server.db);
    expect(survivors.length).toBe(1);
    expect([a, b].filter(Boolean).map(r => r.id)).toEqual(survivors);
    const onSite = sitePatternIds(server.db).filter(id => survivors.includes(id));
    expect(onSite).toEqual(survivors);
    expect(sitePatternIds(server.db)).toEqual([survivors[0], 10, 11]);
  });

  it("backs off and deletes its own row if another admin row appears before its write", async () => {
    const server = fakeServer({ patterns: refs, rows: structuredClone(existing) });
    // Another tab's backfill lands between this one's create and its re-read.
    const origCall = server.falcor.call;
    server.falcor.call = async (path, args) => {
      const res = await origCall(path, args);
      if (path[2] === "create") {
        server.db[50] = { app: APP, type: "prod|admin:pattern", data: { pattern_type: "admin" } };
        server.db[1].data.patterns = [{ ref: "x", id: 50 }, ...server.db[1].data.patterns];
        server.falcor.call = origCall;
      }
      return res;
    };
    expect(await backfillAdminPattern(server.falcor, { app: APP, siteInstance: "prod", siteId: 1 })).toBeNull();
    expect(adminRowIds(server.db)).toEqual([50]);
    expect(sitePatternIds(server.db)).toEqual([50, 10, 11]);
  });

  it("if its site write is overwritten by another writer, it deletes its orphaned row", async () => {
    const server = fakeServer({ patterns: refs, rows: structuredClone(existing) });
    // the other tab's site write (its own admin row, 60) lands right after this one's
    const origCall = server.falcor.call;
    server.falcor.call = async (path, args) => {
      const res = await origCall(path, args);
      if (path[2] === "edit") {
        server.db[60] = { app: APP, type: "prod|admin:pattern", data: { pattern_type: "admin" } };
        server.db[1].data.patterns = [{ ref: "x", id: 60 }, ...refs];
        server.falcor.call = origCall;
      }
      return res;
    };
    expect(await backfillAdminPattern(server.falcor, { app: APP, siteInstance: "prod", siteId: 1 })).toBeNull();
    expect(adminRowIds(server.db)).toEqual([60]);
    expect(sitePatternIds(server.db)).toEqual([60, 10, 11]);
  });
});
