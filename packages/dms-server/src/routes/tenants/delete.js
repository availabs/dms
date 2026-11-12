'use strict';

/**
 * Delete a tenant of the hub, for good (tenant-subdomain-uniqueness.md, "Removed tenants permanently
 * burn their subdomain"; owner's decision 2026-11-11: delete, data erased, backup first).
 *
 * What a tenant is (tenantList.jsx addTenant / authSignup.jsx handleTenantSignup + POST /init/setup):
 *   hub      the `<inst>|<slug>:tenant` row (with its domain aliases) and its ref in the hub site row's
 *            `tenants` list
 *   dms db   the tenant app's schema `dms_<app>` (site, patterns, pages, datasets, split data tables,
 *            formats); its rows in the shared `dms.change_log`, `dms.page_visits`, `dms.formats` and
 *            `dms.data_items` (legacy remnants)
 *   auth db  the project `<app>`; the groups linked to it and to no other project, plus `<app> Admin` /
 *            `<app> Public` by name (initSetup re-uses a group that exists: a stale one would hand the
 *            old members to a new tenant of the same name) with their memberships; the project's
 *            group_requests (signup_requests), user_preferences and messages_new rows
 *
 * Kept: user accounts (an email can belong to other sites), `dms.access_log` and `dms.tasks` (audit and
 * job history), `logins`, and `dms.yjs_states`: it is keyed by item id alone, and per-app sequences give
 * every app the same ids, so a tenant's ids also name other apps' items (a known collision in the sync
 * rooms; deleting by id would erase another app's collaborative state).
 *
 * Order — every step idempotent, so a failed run can be repeated and finishes the job:
 *   1. backup   every row above, to <DMS_TENANT_BACKUP_DIR>/<app>-<timestamp>/ (COPY text, gzipped, one
 *               file per table, plus manifest.json with the auth rows, columns and counts). Any failure
 *               stops here: nothing is deleted without a backup.
 *   2. auth db  one transaction
 *   3. dms db   one transaction: the shared rows, then DROP SCHEMA dms_<app> CASCADE
 *   4. hub      the ref leaves the site's `tenants` list and the tenant row is deleted, through the DMS
 *               controller (change_log + broadcast). Last, so the tenant stays listed (and can be deleted
 *               again) until everything else is gone.
 * Then the server's caches that remember the app are cleared and the domains store reloads (which
 * clears the SSR route cache, index.js).
 *
 * Per-app Postgres only (the hub's mode): with every app in one table there is no schema to drop.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { to: copyTo } = require('pg-copy-streams');
const { getDb, loadConfig } = require('../../db');
const { sanitize, resolveSchema, clearCaches } = require('../../db/table-resolver');
const { dmsMainTable } = require('../uda/utils');

const SLUG = /^[a-z0-9_]+$/;

function backupRoot() {
  return process.env.DMS_TENANT_BACKUP_DIR || path.resolve(__dirname, '../../../var/tenant-backups');
}

function dmsDb() {
  const dbEnv = process.env.DMS_DB_ENV || 'dms-sqlite';
  let splitMode;
  try { splitMode = loadConfig(dbEnv).splitMode; } catch { /* default below */ }
  return { db: getDb(dbEnv), splitMode: splitMode || process.env.DMS_SPLIT_MODE || 'legacy' };
}

function authDb() {
  return getDb(process.env.DMS_AUTH_DB_ENV || 'auth-sqlite');
}

const parse = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };

/**
 * Everything the delete will touch, read-only. Throws (with `.status`) when it must refuse.
 * `subdomain` finds the tenant row(s) — linked or not, so a tenant "removed" the old way (unlinked only)
 * can be deleted too.
 */
async function planTenantDelete({ hubApp, hubType, subdomain }) {
  const sub = `${subdomain || ''}`.toLowerCase();
  const refuse = (status, msg) => { const e = new Error(msg); e.status = status; throw e; };
  if (!SLUG.test(sub)) refuse(400, `"${subdomain}" is not a tenant subdomain`);
  const { db, splitMode } = dmsDb();
  if (db.type !== 'postgres' || splitMode !== 'per-app') refuse(400, 'Deleting a tenant needs per-app Postgres (each app in its own schema)');

  const hubTbl = await dmsMainTable(db, hubApp, splitMode);
  const site = (await db.query(`SELECT id, data FROM ${hubTbl} WHERE app = $1 AND type = $2 ORDER BY id LIMIT 1`, [hubApp, `${hubType}:site`])).rows[0];
  if (!site) refuse(500, `no hub site row (${hubApp} / ${hubType}:site)`);
  const siteData = parse(site.data) || {};
  const allTenants = (await db.query(`SELECT id, type, data FROM ${hubTbl} WHERE app = $1 AND type LIKE '%:tenant'`, [hubApp])).rows
    .map(r => ({ id: +r.id, type: r.type, data: parse(r.data) || {} }));
  const rows = allTenants.filter(r => `${r.data.subdomain || ''}`.toLowerCase() === sub);
  if (!rows.length) refuse(404, `no tenant "${sub}"`);

  const apps = [...new Set(rows.map(r => `${r.data.app || sub}`))];
  if (apps.length !== 1) refuse(409, `tenant "${sub}" has rows for several apps (${apps.join(', ')}); delete by hand`);
  const app = apps[0];
  const schema = resolveSchema(app, 'postgres', 'per-app'); // dms_<app>, cut to Postgres's 63 characters
  if (!sanitize(app) || app === hubApp || schema === resolveSchema(hubApp, 'postgres', 'per-app')) refuse(400, 'That is the hub itself');
  const shared = allTenants.filter(r => !rows.includes(r) && resolveSchema(`${r.data.app || r.data.subdomain || ''}`, 'postgres', 'per-app') === schema);
  if (shared.length) refuse(409, `another tenant (${shared.map(r => r.data.subdomain).join(', ')}) uses the same app schema ${schema}`);

  const tables = (await db.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`, [schema])).rows.map(r => r.table_name);
  const ids = new Set(rows.map(r => r.id));
  const tenantsAfter = (Array.isArray(siteData.tenants) ? siteData.tenants : []).filter(t => !ids.has(+(t && t.id)));
  return {
    sub, app, schema, schemaSql: schema, schemaExists: tables.length > 0, tables,
    hub: { app: hubApp, table: hubTbl, siteId: +site.id, tenantRows: rows, tenantsAfter, linked: tenantsAfter.length !== (siteData.tenants || []).length },
  };
}

/** The auth rows of the tenant's project: what step 2 deletes (and the backup keeps). */
async function authRows(adb, app) {
  const one = async (sql, params) => (await adb.query(sql, params)).rows;
  const links = await one('SELECT * FROM groups_in_projects WHERE project_name = $1', [app]);
  const candidates = [...new Set([...links.map(l => l.group_name), `${app} Admin`, `${app} Public`])];
  const groups = [];
  for (const g of candidates) {
    const elsewhere = await one('SELECT count(1) AS n FROM groups_in_projects WHERE group_name = $1 AND project_name <> $2', [g, app]);
    const row = (await one('SELECT * FROM groups WHERE name = $1', [g]))[0];
    groups.push({ name: g, exists: !!row, row: row || null, sharedWithOtherProjects: +elsewhere[0].n > 0 });
  }
  const doomed = groups.filter(g => g.exists && !g.sharedWithOtherProjects).map(g => g.name);
  const members = doomed.length ? await one(`SELECT * FROM users_in_groups WHERE group_name = ANY($1)`, [doomed]) : [];
  return {
    project: (await one('SELECT * FROM projects WHERE name = $1', [app]))[0] || null,
    groups_in_projects: links,
    groups,
    doomedGroups: doomed,
    users_in_groups: members,
    signup_requests: await one('SELECT * FROM signup_requests WHERE project_name = $1', [app]),
    user_preferences: await one('SELECT * FROM user_preferences WHERE project_name = $1', [app]),
    messages_new: await one('SELECT * FROM messages_new WHERE project_name = $1', [app]),
  };
}

// The shared dms-db rows of the app, as (name, SELECT) pairs: backed up, then deleted.
function sharedSelects(client, plan) {
  const lit = (v) => client.escapeLiteral(v);
  return [
    ['dms.change_log', `SELECT * FROM dms.change_log WHERE app = ${lit(plan.app)}`],
    ['dms.page_visits', `SELECT * FROM dms.page_visits WHERE app = ${lit(plan.app)}`],
    ['dms.formats', `SELECT * FROM dms.formats WHERE app = ${lit(plan.app)}`],
    ['dms.data_items', `SELECT * FROM dms.data_items WHERE app = ${lit(plan.app)}`],
  ];
}

async function tableExists(client, qualified) {
  const [schema, table] = qualified.split('.');
  const r = await client.query('SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2', [schema, table]);
  return r.rowCount > 0;
}

/** Step 1. Returns the backup directory. Throws on any failure (and nothing is deleted). */
async function backup(plan, auth, { by }) {
  const { db } = dmsDb();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(backupRoot(), `${plan.app}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const client = await db.getConnection();
  const files = [];
  try {
    const dump = async (name, select) => {
      const file = `${name}.copy.gz`;
      const columns = (await client.query(`SELECT * FROM (${select}) q LIMIT 0`)).fields.map(f => f.name);
      await pipeline(client.query(copyTo(`COPY (${select}) TO STDOUT`)), zlib.createGzip(), fs.createWriteStream(path.join(dir, file)));
      const rows = +(await client.query(`SELECT count(*) AS n FROM (${select}) q`)).rows[0].n;
      files.push({ table: name, file, columns, rows });
    };
    for (const t of plan.tables) await dump(`${plan.schema}.${t}`, `SELECT * FROM ${plan.schemaSql}."${t}"`);
    for (const [name, select] of sharedSelects(client, plan)) {
      if (await tableExists(client, name)) await dump(name, select);
    }
  } finally {
    client.release();
  }
  const manifest = {
    what: 'tenant delete backup (dms-server routes/tenants/delete.js). Restore by hand: CREATE SCHEMA, the tables (columns below), COPY FROM each .copy.gz (text format); auth rows below.',
    created_at: new Date().toISOString(), by,
    tenant: { subdomain: plan.sub, app: plan.app, schema: plan.schema },
    hub: { app: plan.hub.app, siteId: plan.hub.siteId, tenantRows: plan.hub.tenantRows, linked: plan.hub.linked },
    tables: files,
    auth,
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { dir, files };
}

/** Step 2. */
async function deleteAuth(adb, app, auth) {
  const run = async (q) => {
    await q('DELETE FROM user_preferences WHERE project_name = $1', [app]);
    await q('DELETE FROM messages_new WHERE project_name = $1', [app]);
    await q('DELETE FROM signup_requests WHERE project_name = $1', [app]);
    await q('DELETE FROM groups_in_projects WHERE project_name = $1', [app]);
    for (const g of auth.doomedGroups) {
      await q('DELETE FROM users_in_groups WHERE group_name = $1', [g]);
      await q('DELETE FROM groups_in_projects WHERE group_name = $1', [g]);
      await q('DELETE FROM groups WHERE name = $1', [g]);
    }
    await q('DELETE FROM projects WHERE name = $1', [app]);
  };
  if (typeof adb.withTransaction === 'function') return adb.withTransaction(tx => run((s, p) => tx.query(s, p)));
  return run((s, p) => adb.query(s, p));
}

/** Step 3: one transaction. Which shared tables exist is read before it opens (no adapter calls inside). */
async function deleteDmsData(plan) {
  const { db } = dmsDb();
  const present = new Set();
  for (const t of ['change_log', 'page_visits', 'formats', 'data_items']) {
    const r = await db.query('SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2', ['dms', t]);
    if (r.rows.length) present.add(t);
  }
  await db.withTransaction(async (tx) => {
    if (present.has('change_log')) await tx.query('DELETE FROM dms.change_log WHERE app = $1', [plan.app]);
    if (present.has('page_visits')) await tx.query('DELETE FROM dms.page_visits WHERE app = $1', [plan.app]);
    if (present.has('formats')) await tx.query('DELETE FROM dms.formats WHERE app = $1', [plan.app]);
    if (present.has('data_items')) await tx.query('DELETE FROM dms.data_items WHERE app = $1', [plan.app]);
    await tx.query(`DROP SCHEMA IF EXISTS ${plan.schemaSql} CASCADE`);
  });
}

/** Step 4, through the controller so the hub's clients see it (change_log + broadcast). */
async function deleteHubRows(plan, user) {
  const { controller } = require('../dms/dms.route');
  if (plan.hub.linked) await controller.setDataById(plan.hub.siteId, { tenants: plan.hub.tenantsAfter }, user, plan.hub.app);
  for (const r of plan.hub.tenantRows) await controller.deleteData(plan.hub.app, r.type, [r.id], user);
}

function forgetApp() {
  clearCaches();
  try { require('../auth').clearSnapshots(); } catch { /* not loaded */ }
  try { require('../auth/formats').clearFormats(); } catch { /* not loaded */ }
}

/**
 * Delete the tenant whose subdomain is `subdomain`. `user` is the caller (judged by the route).
 * Returns { tenant, backup, deleted } — the counts of what went.
 */
async function deleteTenant({ hubApp, hubType, subdomain, user }) {
  const plan = await planTenantDelete({ hubApp, hubType, subdomain });
  const adb = authDb();
  const auth = await authRows(adb, plan.app);
  const { dir, files } = await backup(plan, auth, { by: user && user.email });
  await deleteAuth(adb, plan.app, auth);
  await deleteDmsData(plan);
  await deleteHubRows(plan, user);
  forgetApp();
  return {
    tenant: { subdomain: plan.sub, app: plan.app },
    backup: dir,
    deleted: {
      schema: plan.schemaExists ? plan.schema : null,
      tables: plan.tables.length,
      rows: Object.fromEntries(files.map(f => [f.table, f.rows])),
      groups: auth.doomedGroups,
      memberships: auth.users_in_groups.length,
      project: !!auth.project,
      tenantRows: plan.hub.tenantRows.map(r => r.id),
    },
  };
}

module.exports = { deleteTenant, planTenantDelete, authRows, backupRoot };
