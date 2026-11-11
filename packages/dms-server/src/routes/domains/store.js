'use strict';

/**
 * The hub's tenant domains (tenant-external-domains.md, Phase B): each tenant row of the hub
 * (the master site, DMS_APP / DMS_TYPE) carries `aliases: [{ domain, status, … }]` and `primary`.
 *
 *     tenants({ fresh })      the site's LINKED tenant rows ({ id, type, data }), cached 30 s
 *     tenantBySubdomain(sub)  one of them, or null
 *     refresh()               reload, and hand the verified map to utils/subdomain.js (grants,
 *                             the primary redirect); also run every 30 s while the hub serves
 *     writeTenant(row, patch, user)   merge `patch` into a tenant row through the DMS controller,
 *                             so change_log and the sync broadcast happen as for any edit
 *
 * Only the hub runs this: multi-tenant with a root domain (utils/subdomain.js rootDomain()).
 * A tenant removed from the site's `tenants` list (unlinked, its row kept) has no domains.
 */
const { getDb, loadConfig } = require('../../db');
const { dmsMainTable } = require('../uda/utils');
const { setDomainAliasMap, rootDomain } = require('../../utils/subdomain');

const TTL_MS = 30 * 1000;
const VERIFIED = 'verified';

const hubApp = () => process.env.DMS_APP || process.env.VITE_DMS_APP || '';
const hubType = () => process.env.DMS_TYPE || process.env.VITE_DMS_TYPE || '';
const parse = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };

function dmsDb() {
  const dbEnv = process.env.DMS_DB_ENV || 'dms-sqlite';
  let splitMode;
  try { splitMode = loadConfig(dbEnv).splitMode; } catch { /* default below */ }
  return { db: getDb(dbEnv), splitMode: splitMode || process.env.DMS_SPLIT_MODE || 'legacy' };
}

let cache = { at: 0, rows: [] };
let inflight = null;

async function load() {
  const app = hubApp(), type = hubType();
  if (!app || !type) return [];
  const { db, splitMode } = dmsDb();
  const tbl = await dmsMainTable(db, app, splitMode);
  const site = (await db.query(`SELECT id, data FROM ${tbl} WHERE app = $1 AND type = $2 ORDER BY id LIMIT 1`, [app, `${type}:site`])).rows[0];
  const ids = ((parse(site && site.data) || {}).tenants || []).map(t => +t.id).filter(Number.isFinite);
  if (!ids.length) return [];
  const rows = (await db.query(`SELECT id, type, data FROM ${tbl} WHERE app = $1 AND id IN (${ids.map((_, i) => `$${i + 2}`).join(', ')})`, [app, ...ids])).rows;
  return rows.map(r => ({ id: +r.id, type: r.type, data: parse(r.data) || {} })).filter(r => /:tenant$/.test(r.type));
}

/** The alias map utils/subdomain.js reads: verified domains → tenant, tenant → primary (a verified alias of its own). */
function aliasMapOf(rows) {
  const aliases = new Map(), primary = new Map();
  for (const { data } of rows) {
    const sub = `${data.subdomain || ''}`.toLowerCase();
    if (!sub) continue;
    for (const a of Array.isArray(data.aliases) ? data.aliases : []) {
      const d = `${(a && a.domain) || ''}`.toLowerCase();
      if (d && a.status === VERIFIED && !aliases.has(d)) aliases.set(d, sub);
    }
    const p = `${data.primary || ''}`.toLowerCase();
    if (p && aliases.get(p) === sub) primary.set(sub, p);
  }
  return { aliases, primary };
}

async function refresh() {
  if (!inflight) {
    inflight = load()
      .then(rows => { cache = { at: Date.now(), rows }; setDomainAliasMap(aliasMapOf(rows)); return rows; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

async function tenants({ fresh = false } = {}) {
  if (!fresh && Date.now() - cache.at < TTL_MS) return cache.rows;
  return refresh();
}

async function tenantBySubdomain(sub, opts) {
  const s = `${sub || ''}`.toLowerCase();
  return (await tenants(opts)).find(r => `${r.data.subdomain || ''}`.toLowerCase() === s) || null;
}

/** Merge `patch` into the tenant row (a top-level merge, as a Falcor edit), then reload the map. */
async function writeTenant(row, patch, user) {
  const { controller } = require('../dms/dms.route');
  await controller.setDataById(row.id, patch, user, hubApp());
  await refresh();
}

let timer = null;
/** Keep the map current on the hub (a write elsewhere, another server, a raw edit). */
function start() {
  if (!rootDomain() || timer) return;
  refresh().catch(e => console.warn('[domains] load failed:', e.message));
  timer = setInterval(() => refresh().catch(e => console.warn('[domains] load failed:', e.message)), TTL_MS);
  timer.unref();
}

module.exports = { tenants, tenantBySubdomain, refresh, writeTenant, start, aliasMapOf, hubApp, VERIFIED };
