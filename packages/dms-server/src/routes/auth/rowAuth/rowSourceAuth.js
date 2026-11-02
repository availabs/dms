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
 * Putting it under `routes/dms/` would make the generic auth core `require('../../uda/…')`, which is
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
 *   internal (`app+env`)  [union of the patterns that LIST this source, the source's own grants]
 *   external (pgEnv)      [the client-named pattern, the source's own grants]
 *
 * Both build the same two-level chain; only where the pattern level comes from differs. That is the
 * whole of the internal/external split in uda auth.
 *
 * **Why not `parent_id` for the internal case.** A first version declared
 * `childRefs: { pattern: { dmsEnvId: 'dmsenv' } }` so `stampChildren` would give a dmsEnv a parent
 * and the chain could be walked. It is withdrawn (owner, 2026-10-29: *"I think an env can have
 * multiple parents"*), and the owner is right twice over:
 *
 *   - a dmsEnv IS referenced by several patterns — on `rowauth-test`, `datasets` #1499610 and `qa`
 *     #2860547 both name env 1676363 — and `parent_id` is ONE column. It cannot hold two.
 *   - kind auth has always UNIONED the grants of every owning pattern
 *     (`sourceAuth.readInternalSource` → `unionAuthPermissions`). A single-parent walk would pick
 *     one and silently drop the rest.
 *
 * The declaration was also unsound for a second reason worth remembering: `childRefs` is keyed by
 * row KIND, and every pattern TYPE shares the kind `pattern`, so a datasets-specific declaration
 * applied to every pattern row in the app.
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

const { getDb, loadConfig } = require('../../../db');
const { mergeAuthChain } = require('./mergeAuth');
const { verdict, verbsFor, holdsPermission } = require('./rowAuthGate');
const { resolveAuthPermissions } = require('../auth');
const { vocabularyOf, impliesMaps } = require('./authVocabulary');
const { expandLevel } = require('./expandLevel');
const { dmsMainTable, getSiteSources } = require('../../uda/utils');
const { rowAuthCaps } = require('./rowAuthCaps');
const { resolveTable } = require('../../../db/table-resolver');

// A chain built by hand has to expand each level just as `resolve()` does for DMS rows via
// `authOf` — see ../expandLevel.js for the precedence and why it lives there.

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

/**
 * `auth` as a selectable expression, or the literal NULL when the table has no such column.
 *
 * A plain `SELECT auth` throws on an UNMIGRATED table — `no such column: auth` on sqlite — and the
 * throw is caught by `decideSourceRow`, which fails closed. The symptom is every request denied
 * with `lookup failed: …`, which under `log` reads as a would-deny on a request that should have
 * been granted. The vocabulary then comes from `data.authVocabulary` alone, which is where an
 * unmigrated app keeps it anyway.
 */
async function authColExpr(db, app, splitMode) {
  try {
    const t = resolveTable(app, '', db.type, splitMode);
    const caps = await rowAuthCaps(db, t.schema, t.table, db.type);
    return caps.auth ? 'auth' : 'NULL';
  } catch { return 'NULL'; }
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
  const authCol = await authColExpr(db, app, splitMode);
  const { rows } = await db.query(
    `SELECT data->>'authPermissions' AS ap, data->>'pattern_type' AS pattern_type,
            ${authCol} AS authcol, data->'authVocabulary' AS av
       FROM ${tbl} WHERE id = $1 AND app = $2 AND type LIKE '%:pattern'`, [+patternId, app]);
  if (!rows.length) return { ok: false, reason: `pattern ${app}/${patternId} not found` };
  if (rows[0].pattern_type !== 'datasets') return { ok: false, reason: `pattern ${patternId} is not a datasets pattern` };
  const maps = impliesMaps(vocabularyOf({ auth: rows[0].authcol, data: { authVocabulary: rows[0].av } }));
  return { ok: true, app, maps, auth: resolveAuthPermissions(rows[0].ap, subdomain) || {} };
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
    const r = await internalSourceChain(app, sourceId, subdomain);
    if (!r.ok) return r;
    return { ok: true, merged: mergeAuthChain(r.chain), app };   // levels already expanded
  }

  const src = await externalSourceAuth(db || getDb(env), sourceId);
  if (!src.ok) return src;
  const pat = await namedPatternAuth(patternRef, subdomain);
  // An unusable pattern name only loses the pattern's grants; the source's own still count — same
  // rule kind auth applies, and the accepted risk recorded on this task is unchanged by it.
  const maps = pat.ok ? pat.maps : null;
  const chain = pat.ok
    ? [expandLevel(pat.auth, maps), expandLevel(src.auth, maps)]
    : [expandLevel(src.auth, null)];
  return { ok: true, merged: mergeAuthChain(chain), app: pat.ok ? pat.app : null };
}

/**
 * The two-level chain for an INTERNAL source: [patterns that list it (unioned), its own grants].
 *
 * Which patterns list it is a reference-list question — a datasets pattern reaches its sources
 * through its dmsEnv (`data.dmsEnvId` → the env's `data.sources`) or, on an older pattern, through
 * its own `data.sources`. Mirrors `sourceAuth.readInternalSource` exactly, including the union: a
 * source may belong to SEVERAL patterns, and every one of their grants counts.
 */
async function internalSourceChain(app, sourceId, subdomain) {
  const { db, splitMode } = getDmsDb();
  const tbl = await dmsMainTable(db, app, splitMode);
  const { rows: srcRows } = await db.query(
    `SELECT data->>'auth_permissions' AS ap FROM ${tbl} WHERE id = $1 AND app = $2 AND type LIKE '%:source'`,
    [+sourceId, app]);
  if (!srcRows.length) return { ok: false, reason: 'source not found' };

  const authCol = await authColExpr(db, app, splitMode);
  const { rows: pats } = await db.query(
    `SELECT id, data->>'authPermissions' AS ap, ${authCol} AS authcol, data->'authVocabulary' AS av
       FROM ${tbl}
      WHERE app = $1 AND type LIKE '%:pattern' AND data->>'pattern_type' = 'datasets'`, [app]);
  const owning = [];
  for (const p of pats) {
    const refs = await getSiteSources({ db, app, pattern_ids: [p.id], splitMode });
    if (refs.some(r => +(r && r.id) === +sourceId)) owning.push(p);
  }
  if (!owning.length) return { ok: false, reason: `source ${sourceId} is in no datasets pattern of ${app}` };

  // Expand EACH pattern against ITS OWN vocabulary before unioning: two patterns may declare the
  // same verb with different implications, and unioning the raw strings first would lose that.
  const patternLevel = unionAuthPermissions(owning.map((p) => expandLevel(
    resolveAuthPermissions(p.ap, subdomain) || {},
    impliesMaps(vocabularyOf({ auth: p.authcol, data: { authVocabulary: p.av } })))));
  const maps = owning.map((p) => impliesMaps(vocabularyOf({ auth: p.authcol, data: { authVocabulary: p.av } })))
    .find(Boolean) || null;
  return { ok: true, chain: [patternLevel, expandLevel(parseJson(srcRows[0].ap) || {}, maps)] };
}

/** Union per principal — several patterns may list one source, and every grant counts. */
function unionAuthPermissions(list) {
  const out = { groups: {}, users: {} };
  const asList = (p) => (Array.isArray(p) ? p : p ? [p] : []);
  for (const ap of list) {
    for (const key of ['groups', 'users']) {
      for (const [k, perms] of Object.entries((ap && ap[key]) || {})) {
        out[key][k] = [...new Set([...(out[key][k] || []), ...asList(perms)])];
      }
    }
  }
  return out;
}

/**
 * Does `user` hold ANY of `reqPermissions` under `merged`? All structural verbs within one — or,
 * for a permission that implies none, the permission itself by name (`holdsPermission`). That is
 * what keeps `download-source` a capability rather than a flavour of `edit`.
 */
function holdsAny(merged, user, app, reqPermissions) {
  for (const perm of [].concat(reqPermissions || [])) {
    if (holdsPermission(merged, user, app, perm)) return { allow: true, reason: 'granted' };
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
    return holdsAny(pat.auth, user, pat.app, reqPermissions);
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

/**
 * THE ONE QUESTION THE READ GATE ASKS: does this chain grant structural `read`?
 *
 * Not "does the user hold one of nine named permissions" — that list (`READ_PERMISSIONS` in
 * readAuth.js) was a hand-maintained restatement of which verbs happen to include reading, and it
 * drifted: every verb that should confer a read already declares `read` in its `implies`
 * (datasets.format.js), and the three that should NOT — `download-source`, `manage-downloads`,
 * `view-source-api` — declare `implies: []` and are checked by name where they are used.
 *
 * So reading is derived, not maintained. `view-source` alone reads without downloading;
 * `download-source` alone downloads without reading. See
 * planning/tasks/current/permission-domain-single-source.md, Phase 4(a).
 */
function readsRow(patternAP, ownAP, user, app) {
  return verdict(mergeAuthChain([patternAP || {}, ownAP || {}]), user, 'read', app);
}

module.exports = {
  udaGate, mergedAuthForSource, decideSourceRow, decidePatternRow, decideFromRow,
  holdsAny, readsRow, isDmsEnv,
};
