'use strict';

/**
 * UDA on row auth — the datasets half of task 6 (planning/tasks/current/row-auth-uda.md).
 *
 * `sourceAuth.js` / `readAuth.js` are KIND auth for datasets and stay exactly as they are; this is
 * their row-based twin, reached when `DMS_AUTH_IMPL=row` (../impl.js). Same `{ allow, reason }` shape, so
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
const { vocabularyOf, impliesMaps, expandWithVocabulary } = require('./authVocabulary');
const { dmsMainTable, getSiteSources } = require('../../uda/utils');
const { rowAuthCaps } = require('./rowAuthCaps');
const { envRowForPgEnv, sourceChainFor } = require('./sourceAncestry');
const { resolveTable } = require('../../../db/table-resolver');

// A chain built by hand has to expand each level just as `resolve()` does for DMS rows via
// `authOf` — grants expand against the vocabulary their chain declares, and against nothing else.

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
async function mergedAuthForSource(opts = {}) {
  const { db, env, sourceId, patternRef, subdomain = '' } = opts;
  if (sourceId === undefined || sourceId === null) return { ok: false, reason: 'no source named' };

  // INTERNAL. The ordinary parent walk: the source's own grants, expanded against the vocabulary
  // its env declares. No level above it contributes grants, so the chain is one deep — see
  // ./sourceAncestry.js. This replaced `internalSourceChain`, which reverse-looked-up every
  // datasets pattern listing the source and unioned their grants, because until the envs were
  // stamped (migrate-row-auth.js pass 1b) the pattern was the only row carrying a vocabulary.
  if (isDmsEnv(env)) {
    const [app] = String(env).split('+');
    const r = await sourceChainFor(app, sourceId, subdomain);
    if (!r.ok) return r;
    return { ok: true, merged: mergeAuthChain([expandWithVocabulary(r.auth, r.maps)]), maps: r.maps, app };
  }

  // EXTERNAL. One level — the source's own grants — expanded against the vocabulary its ENV
  // declares, which is the same vocabulary an internal source uses (admin.format.js dmsEnvFormat).
  //
  // The datasets pattern is NOT in this chain any more. It never was an ancestor: a source's type
  // is `{env}|{name}:source` and the pattern is nowhere in it. Letting the pattern the REQUEST
  // named lend its grants is the hole `readAuth.js` records as "a placeholder, not a boundary" —
  // the client picks it, so a caller could name whichever pattern granted the most. Gone.
  //
  // `patternRef.app` survives only as a LOCATOR: per-app split mode puts env rows in an app-scoped
  // table, so finding one needs an app name. Addressing, not authorization — it selects a table
  // and confers nothing. See ./sourceAncestry.js.
  const src = await externalSourceAuth(db || getDb(env), sourceId);
  if (!src.ok) return src;
  const app = opts.app || (patternRef && patternRef.app) || null;
  const envRow = await envRowForPgEnv(env, app);
  const maps = envRow ? envRow.maps : null;
  return { ok: true, merged: mergeAuthChain([expandWithVocabulary(src.auth, maps)]), maps, app };
}

// `internalSourceChain` DELETED 2026-11-02 — replaced by the parent walk in
// ./sourceAncestry.js `sourceChainFor`. See row-auth-uda-unify-api.md, Slice D.

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
 *
 * `maps` is the vocabulary that governs the chain `merged` came from — the SAME declaration its
 * grants were expanded with. Without it nothing translates and every permission is checked by
 * name, which is the correct answer for a chain that declares nothing.
 */
function holdsAny(merged, user, app, reqPermissions, maps = null) {
  for (const perm of [].concat(reqPermissions || [])) {
    if (holdsPermission(merged, user, app, perm, maps)) return { allow: true, reason: 'granted' };
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
    return holdsAny(got.merged, user, got.app, reqPermissions, got.maps);
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
    return holdsAny(pat.auth, user, pat.app, reqPermissions, pat.maps);
  } catch (e) {
    return { allow: false, reason: `lookup failed: ${e.message}` };
  }
}

/**
 * ROW AUTH'S DATASETS READ DECISION — the contract `../sourceReads.js` calls, and the twin of
 * `kindAuth/readAuth.js`'s `sourceDecision`.
 *
 * SYNCHRONOUS, and deliberately so. The read path pre-loads a snapshot of an env's sources
 * precisely so a catalog listing costs no per-source queries (`filterReadableSources`), and `s`
 * carries everything needed: the source's own grants, already expanded, and the vocabulary they
 * were expanded with. Since 2026-11-03 nothing lends to a source, so the chain is one level deep
 * and there is no `isDms` branch here at all.
 *
 * `check` is accepted and ignored: it selects between kind auth's strict and lenient rules, and
 * this judge has neither — it asks the one structural question instead.
 */
const sourceDecision = {
  // `s.merged` is the CHAIN, resolved by the ordinary resolver (`sourceSnapshot.loadInternal`) —
  // the same walk a page or a theme gets, so anything an ancestor grants is inherited here too.
  // `s.ap` is the source's own grants, kept for kind auth, which cannot read a merged chain.
  reads(s, user, app) {
    const v = verdict(s.merged || mergeAuthChain([s.ap || {}]), user, 'read', app);
    return { allow: v.allow, reason: v.allow ? 'granted' : 'missing read' };
  },
  holds(s, user, app, reqPermissions) {
    return holdsAny(s.merged || mergeAuthChain([s.ap || {}]), user, app, reqPermissions, s.maps || null);
  },
};

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
  mergedAuthForSource, decideSourceRow, decidePatternRow, sourceDecision,
  holdsAny, readsRow, isDmsEnv,
};
