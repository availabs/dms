// @vitest-environment happy-dom
/**
 * Admin pattern row creation + first-load backfill against a REAL dms-server,
 * through the same avl-falcor client the browser uses — checks the call/get
 * response shapes the unit tests (adminPatternRow.test.js) only imitate.
 *
 * Opt-in: skipped unless DMS_TEST_API_HOST points at a dms-server whose DB is
 * disposable. Never point it at a shared or production server — it creates a
 * site and patterns under app `test-admin-pattern-row`, and deletes nothing
 * but its own rows.
 *
 * Example (a scratch dms-server copy with only the sqlite `cli-test` config,
 * see memory/project notes on local configs pointing at prod):
 *   DMS_DB_ENV=cli-test DMS_AUTH_DB_ENV=cli-test PORT=3457 node src/index.js
 *   DMS_TEST_API_HOST=http://localhost:3457 npx vitest run tests/adminPatternRow.integration.test.js
 */
import { describe, it, expect, beforeAll } from "vitest";
import { falcorGraph } from "@availabs/avl-falcor";

import { createCorePatterns, backfillAdminPattern } from "../src/utils/tenantProvisioning.js";

const HOST = process.env.DMS_TEST_API_HOST;
const APP = "test-admin-pattern-row";
const INSTANCE = `t${Date.now()}`;

const createdId = (res) => Object.keys(res?.json?.dms?.data?.byId || {}).find(k => k !== "$__path");

async function readRow(falcor, id) {
  await falcor.invalidate(["dms", "data", APP, "byId", id]);
  const res = await falcor.get(["dms", "data", APP, "byId", id, ["type", "data"]]);
  const row = res?.json?.dms?.data?.[APP]?.byId?.[id] || {};
  let data = row.data;
  if (data?.$type === "atom") data = data.value;
  if (typeof data === "string") data = JSON.parse(data);
  return { type: row.type, data };
}

describe.skipIf(!HOST)("admin pattern row against a live dms-server", () => {
  let falcor;

  beforeAll(async () => {
    const creds = { email: "admin-row-test@test.com", password: "AdminRowTest1", project: APP };
    const post = (path, body) => fetch(`${HOST}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json());
    await post("/init/setup", creds); // "already initialized" on a re-run is fine
    const login = await post("/login", creds);
    if (!login.user?.token) throw new Error(`login failed: ${JSON.stringify(login)}`);
    window.localStorage.setItem("userToken", login.user.token);
    falcor = falcorGraph(HOST);
  });

  const newSite = async (data = { site_name: "s" }) => {
    const id = createdId(await falcor.call(["dms", "data", "create"], [APP, `${INSTANCE}:site`, data]));
    expect(id).toBeTruthy();
    return +id;
  };

  it("createCorePatterns: new site gets auth + admin rows registered", async () => {
    const siteId = await newSite();
    const refs = await createCorePatterns(falcor, {
      app: APP, siteInstance: INSTANCE, siteId, adminGroupName: APP, adminPath: "/list",
    });
    const site = await readRow(falcor, siteId);
    expect(site.data.patterns.map(r => +r.id)).toEqual(refs.map(r => +r.id));
    const admin = await readRow(falcor, refs[1].id);
    expect(admin.type).toBe(`${INSTANCE}|admin:pattern`);
    expect(admin.data).toMatchObject({ pattern_type: "admin", name: "Admin", base_url: "list", subdomain: "*" });
  });

  it("backfill: adds one admin row to an old site, and is a no-op after that", async () => {
    const pageId = +createdId(await falcor.call(["dms", "data", "create"],
      [APP, `${INSTANCE}|docs:pattern`, { pattern_type: "page", name: "Docs", base_url: "/" }]));
    // the generic ref form a pattern-list save leaves behind
    const oldRefs = [{ ref: `${APP}+${INSTANCE}|pattern`, id: pageId }];
    const siteId = await newSite({ site_name: "old", patterns: oldRefs });

    const opts = { app: APP, siteInstance: INSTANCE, siteId, adminPath: "/list" };
    const ref = await backfillAdminPattern(falcor, opts);
    expect(ref).toBeTruthy();

    const site = await readRow(falcor, siteId);
    expect(site.data.patterns.map(r => +r.id)).toEqual([+ref.id, pageId]);
    const admin = await readRow(falcor, ref.id);
    expect(admin.type).toBe(`${INSTANCE}|admin:pattern`);
    expect(admin.data).toMatchObject({ pattern_type: "admin", base_url: "list" });
    expect(admin.data.authPermissions).toBeUndefined();

    expect(await backfillAdminPattern(falcor, opts)).toBeNull();
    expect((await readRow(falcor, siteId)).data.patterns.length).toBe(2);
  });

  it("backfill: two at once leave exactly one admin row on the site", async () => {
    const siteId = await newSite({ site_name: "race", patterns: [] });
    const opts = { app: APP, siteInstance: INSTANCE, siteId, adminPath: "/list" };
    const results = await Promise.all([backfillAdminPattern(falcor, opts), backfillAdminPattern(falcor, opts)]);
    const winners = results.filter(Boolean);
    const site = await readRow(falcor, siteId);
    expect(site.data.patterns.length).toBe(1);
    expect(winners.map(r => +r.id)).toEqual([+site.data.patterns[0].id]);
  });
});
