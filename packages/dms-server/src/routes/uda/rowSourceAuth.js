'use strict';

/**
 * UDA on row auth — the datasets half of task 6 (planning/tasks/current/row-auth-uda.md).
 *
 * `sourceAuth.js` / `readAuth.js` are KIND auth for datasets and stay exactly as they are; this is
 * their row-based twin, reached only when `DMS_UDA_GATE=row`. Same `{ allow, reason }` shape, so
 * each delegation at the top of a decider is a swap and not a rewrite.
 *
 * ---------------------------------------------------------------------------
 * Why this file lives in routes/uda and not routes/dms
 *
 * It reads `data_manager.sources`, pgEnv configs and the DMS table resolver — datasets knowledge.
 * Putting it under `routes/dms/` would make the generic auth core `require('../uda/…')`, which is
 * the one thing src/dms/CLAUDE.md exists to forbid, in the folder meant to embody it. `routes/uda/*`
 * already requires `../dms/*`; that is the direction, and nothing here crosses a new boundary.
 *
 * **routes/dms gains nothing for this.** The decision is already generic and already knows nothing
 * about sources:
 *
 *     verdict(mergeAuthChain(chain), user, verb, app)   // → { allow, reason }
 *
 * Task 7's "one decision module" is therefore untouched: the DECISION stays one function. What
 * varies per system is how a chain is DISCOVERED, which is data access — necessarily per-system,
 * the same split that lets rowAuth.js walk `data_items` without knowing what a page is.
 *
 * ---------------------------------------------------------------------------
 * The one branch
 *
 * `chainForSource` is the ONLY place uda auth asks "internal or external":
 *
 *   internal (`app+env`)  a `data_items` row — walk it: source → dmsEnv → pattern → site.
 *                         The dmsEnv→pattern hop needs the datasets pattern to declare
 *                         `childRefs: { datasets: { dmsEnvId: 'dmsenv' } }` so `stampChildren`
 *                         writes the env's parent_id. Until it does, the walk stops at the site
 *                         and the pattern's grants are not seen — which is a MISSING grant, i.e.
 *                         it fails closed.
 *   external (pgEnv)      no DMS row at all. The chain is [named pattern, source], known in one
 *                         step, so there is nothing to walk.
 *
 * ---------------------------------------------------------------------------
 * Permissions in, verbs out
 *
 * Callers pass today's vocabulary (`update-source`, `edit-source-permissions`, …) and the ROUTE has
 * already done the field→verb mapping — `uda.route.js:54-62` asks for `update-source`, plus
 * `edit-source-permissions` when the patch carries grants. So the escalation guard arrives through
 * the verb table (`edit-source-permissions → read, edit, grant`) and needs no key inspection here.
 *
 * `reqPermissions` is ANY-of, as it is in `decideSource`; the structural verbs WITHIN one
 * permission are all-of. Holding either `update-source` or `create-view` passes a check that names
 * both; holding `edit-source-permissions` requires `read` and `edit` and `grant`.
 */

const { getDb, loadConfig } = require('../../db');
const { createResolver } = require('../dms/rowAuth');
const { mergeAuthChain } = require('../dms/mergeAuth');
const { verdict, verbsFor } = require('../dms/rowAuthGate');
const { authColumns, rowAuthCaps } = require('../dms/rowAuthCaps');
const { resolveAuthPermissions } = require('../dms/auth');
const { resolveTable } = require('../../db/table-resolver');
const { dmsMainTable } = require('./utils');

/** `DMS_UDA_GATE`: `kind` (default) | `row`. Kind auth stays live until this says otherwise. */
function udaGate() {
  return String(process.env.DMS_UDA_GATE || 'kind').toLowerCase() === 'row' ? 'row' : 'kind';
}

const isDmsEnv = (env) => typeof env === 'string' && env.includes('+');
const parseJson = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
};
const sourcesTable = (db) => (db.type === 'postgres' ? 'data_manager.sources' : 'sources');

// Readers live here rather than being imported from sourceAuth.js, which task 7 deletes. They are
// data access, not decisions, and they are short.
function getDmsDb() {
  const dbEnv = process.env.DMS_DB_ENV || 'dms-sqlite';
  const db = getDb(dbEnv);
  let splitMode;
  try { splitMode = loadConfig(dbEnv).splitMode; } catch { /* default below */ }
  return { db, splitMode: splitMode || process.env.DMS_SPLIT_MODE || 'legacy', dbEnv };
}

async function externalSourceAuth(db, sourceId) {
  const { rows } = await db.query(
    `SELECT auth_permissions AS ap FROM ${sourcesTable(db)} WHERE source_id = $1`, [sourceId]);
  if (!rows.length) return { ok: false, reason: 'source not found' };
  return { ok: true, auth: parseJson(rows[0].ap) || {} };
}

/** A client-named pattern, accepted only as an existing DATASETS pattern of `app` — as kind auth. */
async function namedPatternAuth({ app, patternId } = {}, subdomain = '') {
  if (!app || !patternId) return { ok: false, reason: 'no pattern named' };
  const { db, splitMode } = getDmsDb();
  const tbl = await dmsMainTable(db, app, splitMode);
  const { rows } = await db.query(
    `SELECT data->>'authPermissions' AS ap, data->>'pattern_type' AS pattern_type
       FROM ${tbl} WHERE id = $1 AND app = $2 AND type LIKE '%:pattern'`, [+patternId, app]);
  if (!rows.length) return { ok: false, reason: `pattern ${app}/${patternId} not found` };
  if (rows[0].pattern_type !== 'datasets') return { ok: false, reason: `pattern ${patternId} is not a datasets pattern` };
  return { ok: true, app, auth: resolveAuthPermissions(rows[0].ap, subdomain) || {} };
}

/** A resolver over one app's `data_items`, with the projection the row-auth contract requires. */
async function dmsResolver(app, subdomain) {
  const { db, splitMode } = getDmsDb();
  const t = resolveTable(app, '', db.type, splitMode);
  const caps = await rowAuthCaps(db, t.schema, t.table, db.type);
  const cols = authColumns(caps, db.type).join(', ');
  const loadByIds = async (ids) => {
    if (!ids.length) return [];
    const ph = ids.map((_, i) => `$${i + 2}`).join(',');
    const { rows } = await db.query(
      `SELECT ${cols} FROM ${t.fullName} WHERE app = $1 AND id IN (${ph})`, [app, ...ids]);
    return rows;
  };
  return {
    db,
    loadByIds,
    resolver: createResolver({
      loadByIds,
      loadContainers: async () => {
        const { rows } = await db.query(
          `SELECT ${cols} FROM ${t.fullName} WHERE app = $1 AND type LIKE '%:%'`, [app]);
        return rows.filter(r => typeof r.type === 'string' && /([^|]+):[^:]+$/.test(r.type));
      },
      subdomain,
    }),
  };
}

/**
 * The merged auth a source inherits, and the app it belongs to.
 *
 * THE ONLY `isDms` BRANCH IN UDA AUTH. Returns `{ ok, merged, app }` or `{ ok: false, reason }`.
 */
async function mergedAuthForSource({ db, env, sourceId, patternRef, subdomain = '' }) {
  if (sourceId === undefined || sourceId === null) return { ok: false, reason: 'no source named' };

  if (isDmsEnv(env)) {
    const [app] = String(env).split('+');
    const merged = await resolveRowById(app, sourceId, subdomain);
    if (!merged) return { ok: false, reason: 'source not found' };
    return { ok: true, merged, app };
  }

  const src = await externalSourceAuth(db || getDb(env), sourceId);
  if (!src.ok) return src;
  const pat = await namedPatternAuth(patternRef, subdomain);
  // An unusable pattern name only loses the pattern's grants; the source's own still count — same
  // rule kind auth applies, and the accepted risk recorded on this task is unchanged by it.
  const chain = pat.ok ? [pat.auth, src.auth] : [src.auth];
  return { ok: true, merged: mergeAuthChain(chain), app: pat.ok ? pat.app : null };
}

/**
 * One DMS row's chain, merged — or null when the row is gone.
 *
 * The row is LOADED first: `resolve()` walks upward FROM the rows it is given, so it needs the
 * leaf's own `type`, `parent_id` and `auth`, not just an id.
 */
async function resolveRowById(app, id, subdomain) {
  const { loadByIds, resolver } = await dmsResolver(app, subdomain);
  const [row] = await loadByIds([String(id)]);
  if (!row) return null;
  const got = await resolver.resolve([row]);
  return got.get(String(row.id)) || null;
}

/** Does `user` hold ANY of `reqPermissions` under `merged`? All structural verbs within one. */
function holdsAny(merged, user, app, reqPermissions) {
  for (const perm of [].concat(reqPermissions || [])) {
    const verbs = verbsFor([perm]);
    if (verbs.every(v => verdict(merged, user, v, app).allow)) {
      return { allow: true, reason: 'granted' };
    }
  }
  return { allow: false, reason: `missing ${[].concat(reqPermissions || []).join(' or ')}` };
}

/** Row-auth twin of `sourceAuth.decideSource`. Same arguments, same return. */
async function decideSourceRow(opts = {}) {
  const { reqPermissions, user, subdomain = '' } = opts;
  if (!reqPermissions || !reqPermissions.length) return { allow: true, reason: 'nothing required' };
  try {
    const got = await mergedAuthForSource(opts);
    if (!got.ok) return { allow: false, reason: got.reason };
    return holdsAny(got.merged, user, got.app, reqPermissions);
  } catch (e) {
    return { allow: false, reason: `lookup failed: ${e.message}` };   // fail closed
  }
}

/** Row-auth twin of `sourceAuth.decidePattern` — a pattern-level permission, judged on the row. */
async function decidePatternRow({ patternRef, subdomain = '', reqPermissions, user } = {}) {
  if (!reqPermissions || !reqPermissions.length) return { allow: true, reason: 'nothing required' };
  try {
    const pat = await namedPatternAuth(patternRef, subdomain);
    if (!pat.ok) return { allow: false, reason: pat.reason };
    const merged = await resolveRowById(pat.app, patternRef.patternId, subdomain);
    // The pattern row resolved through its own chain (site included), not its grants in isolation.
    return holdsAny(merged || pat.auth, user, pat.app, reqPermissions);
  } catch (e) {
    return { allow: false, reason: `lookup failed: ${e.message}` };
  }
}

/**
 * Row-auth twin of `readAuth.decideFrom` — SYNCHRONOUS, and deliberately so.
 *
 * The read path pre-loads a snapshot of an env's sources precisely so a catalog listing costs no
 * per-source queries (`filterReadableSources`). That snapshot ALREADY holds both levels of the
 * chain — `s.patternAP` and `s.ap` — for internal and external alike, which it normalised when it
 * was built. So reads need no database access here and, notably, **no `isDms` branch at all**: the
 * only branch is which object supplies the pattern level, which the snapshot decided already.
 */
function decideFromRow(snap, sourceId, user, reqPermissions, named = null) {
  const s = snap.sources.get(+sourceId);
  if (!s) return { allow: false, reason: 'source not found' };
  if (s.orphan) return { allow: false, reason: `source ${sourceId} is in no datasets pattern of ${snap.app}` };
  const external = snap.app == null;
  const app = external ? (named && named.app) : snap.app;
  const patternAP = external ? ((named && named.ap) || {}) : s.patternAP;
  return holdsAny(mergeAuthChain([patternAP || {}, s.ap || {}]), user, app, reqPermissions);
}

module.exports = {
  udaGate, mergedAuthForSource, decideSourceRow, decidePatternRow, decideFromRow,
  holdsAny, isDmsEnv,
};
