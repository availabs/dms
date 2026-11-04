'use strict';
/**
 * A source's env row — the ONE thing that still differs between internal and external sources.
 *
 * An internal source is a `data_items` row with `parent_id` pointing at its `:dmsenv`: a column
 * follow, nothing special. An external source lives in a pgEnv's `data_manager.sources`, in a
 * different database, with no `type`, no `parent_id`, and no column to follow. Giving each pgEnv a
 * `:dmsenv` row (`scripts/ensure-pgenv-rows.js`) makes the LEVEL uniform — one vocabulary, declared
 * in one place, for both populations — but it cannot make the link a column.
 *
 * So this module is the link, and it is deliberately the only asymmetry left:
 *
 *   internal   source.parent_id        → the env row          (a column follow)
 *   external   the pgEnv NAME          → the env row          (this lookup)
 *
 * IT LIVES IN `routes/auth/`, NOT `routes/uda/` (owner, 2026-11-02). Where a source's grants are
 * stored is a fact about authorization, so the auth folder absorbs it and nothing outside learns
 * it exists. A UDA route asks `readBlocked` and gets an answer; whether the row came from
 * `data_items` or a pgEnv is the resolver's business.
 *
 * NO NEW COLUMN, NO CROSS-DATABASE ID. A `parent_id` on an external source would point at a row in
 * another database — a reference nothing can validate. It is not needed: a caller cannot query an
 * external source without having named the env to connect to it (`getDb(env)`), so the name is
 * always in hand and the source stores nothing.
 *
 * THE APP IS A LOCATOR, NOT A GRANT SOURCE. Per-app split mode means env rows live in an
 * app-scoped table, so finding one needs an app name. That is addressing, not authorization —
 * it selects which table to read and confers nothing. This is the distinction the old code lost:
 * `mergedAuthForSource` took the datasets pattern the REQUEST named and let it LEND ITS GRANTS,
 * which `readAuth.js` records as "a placeholder, not a boundary" because the client picks it.
 *
 * See planning/tasks/current/row-auth-uda-unify-api.md, Phase 2.
 */
const { dmsMainTable } = require('../uda/utils');
const { vocabularyOf, impliesMaps } = require('./authVocabulary');
const { getDb, loadConfig } = require('../../db');
const { resolveAuthPermissions } = require('./auth');

const TTL_MS = 30 * 1000;
const cache = new Map();   // `${app}|${pgEnv}` → { at, promise }

function getDmsDb() {
  const dbEnv = process.env.DMS_DB_ENV || 'dms-sqlite';
  let splitMode;
  try { splitMode = loadConfig(dbEnv).splitMode; } catch { /* default below */ }
  return { db: getDb(dbEnv), splitMode: splitMode || process.env.DMS_SPLIT_MODE || 'legacy' };
}

async function load(app, pgEnv) {
  const { db, splitMode } = getDmsDb();
  const tbl = await dmsMainTable(db, app, splitMode);
  const { rows } = await db.query(
    `SELECT id, type, auth, data FROM ${tbl}
      WHERE app = $1 AND type LIKE '%:dmsenv' AND data->>'pgEnv' = $2 LIMIT 1`,
    [app, pgEnv]);
  if (!rows.length) return null;
  const r = rows[0];
  // The env contributes a DECLARATION and no grants — its `permissionDomain.self` is empty by
  // design (admin.format.js). Nothing here reads grants off it, and that is not an omission.
  return { id: r.id, app, maps: impliesMaps(vocabularyOf({ auth: r.auth, data: r.data })) };
}

/**
 * The `:dmsenv` row that declares for `pgEnv`, or null.
 * `null` means the env has no row yet — run `scripts/ensure-pgenv-rows.js`. A null vocabulary
 * fails closed on named verbs rather than silently widening: see the caller.
 */
function envRowForPgEnv(pgEnv, app) {
  if (!pgEnv || !app) return Promise.resolve(null);
  const key = `${app}|${pgEnv}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = load(app, pgEnv).catch(() => null);
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

/** Forget cached env rows (tests; a vocabulary sync could call it too). */
function clearEnvRowCache() { cache.clear(); }


/**
 * The INTERNAL twin: a source row's own grants, plus the vocabulary its ancestors declare.
 *
 * This is the ordinary parent walk and nothing more — `parent_id` to the env, and the first row up
 * the chain that declares wins, leaf → root. It replaced a reverse lookup over every datasets
 * pattern that listed the source, which unioned their grants because until the envs were stamped
 * the pattern was the only row carrying a vocabulary at all.
 *
 * NO LEVEL ABOVE THE SOURCE CONTRIBUTES GRANTS. The env declares and grants nothing — its
 * `permissionDomain.self` is empty by design — so the chain is one level deep and the source's own
 * `auth` is the whole answer. If an ancestor ever should grant, that is a change to
 * `admin.format.js`, not to this file.
 */
async function sourceChainFor(app, sourceId, subdomain = '') {
  const { db, splitMode } = getDmsDb();
  const tbl = await dmsMainTable(db, app, splitMode);
  const { rows } = await db.query(
    `SELECT id, type, parent_id, auth, data FROM ${tbl}
      WHERE id = $1 AND app = $2 AND type LIKE '%:source'`, [+sourceId, app]);
  if (!rows.length) return { ok: false, reason: 'source not found' };
  const src = rows[0];

  // Walk for the DECLARATION only. MAX_DEPTH guards a cycle the column should never contain.
  let cur = src, maps = null;
  for (let depth = 0; cur && depth < 8; depth++) {
    const v = vocabularyOf({ auth: cur.auth, data: cur.data });
    if (v) { maps = impliesMaps(v); break; }
    if (!cur.parent_id) break;
    const up = await db.query(
      `SELECT id, type, parent_id, auth, data FROM ${tbl} WHERE id = $1`, [cur.parent_id]);
    cur = up.rows[0];
  }
  return { ok: true, app, maps, auth: ownGrantsOf(src, subdomain) };
}

/** A source row's OWN grants — the `auth` column first, `data` as the fallback, as everywhere. */
function ownGrantsOf(row, subdomain) {
  const col = typeof row.auth === 'string' ? safeJson(row.auth) : row.auth;
  if (col) {
    const { vocabulary, childRefs, view, ...rest } = col;
    const resolved = resolveAuthPermissions(rest, subdomain) || {};
    if (resolved.groups || resolved.users) return resolved;
  }
  const data = typeof row.data === 'string' ? safeJson(row.data) : row.data;
  return resolveAuthPermissions(data && data.auth_permissions, subdomain) || {};
}

const safeJson = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };

module.exports = { envRowForPgEnv, sourceChainFor, clearEnvRowCache };
