'use strict';
/**
 * OWNERS — which row's grants, rules and vocabulary govern a row. One loader, one walk.
 *
 * Every question a rule can ask ("the site's grants", "my parent's", "the nearest pattern's") is a
 * position on the row's ancestry, and ancestry is data: `data.parent_id` where it is stamped, the type
 * path (`{parent}:{instance}|{kind}`) where it is not. So the whole folder needs one snapshot of an
 * app's container rows — site, patterns, envs, sources, views, themes, tenants: every row whose
 * type names an instance — and one function that walks it.
 *
 *     snapshotFor(address)       → { snap, row }       the subject, with the rows above it loaded
 *     grantsAt(snap, row, pos)   → grants | null        pos: self | parent | ancestor:<kind> | site
 *     ruleFor(snap, row)         → the kind's rule      declared in `formats` (formats.js), else the
 *                                                       stamp on the nearest ancestor, else built in
 *     mapsFor(snap, row)         → { maps, scope, publicRead }
 *
 * A row kind's rule and vocabulary are what the site's client DECLARED for it: the `formats` table
 * (formats.js, registered by scripts/register-formats.js), loaded with the snapshot as `snap.formats`.
 * A row created before the registration carries a copy of the same declaration (`data.authRules`,
 * `data.authVocabulary`), read only when the table says nothing about its kind.
 *
 * An EXTERNAL source (a pgEnv's `data_manager.sources` row) lives in another database and is NOT a DMS
 * row. `snapshotFor` builds one in memory for it (`externalRow`): its grants are the pgEnv's own
 * `auth_permissions` column, its parent the requesting site's `:dmsenv` row for the pgEnv, a view's
 * parent its source. Everything past `snapshotFor` reads it as it reads a stored row. (Until
 * 2026-11-12 each one was mirrored as a stored row per site; see dama/pgEnv.js.)
 *
 * Snapshots are cached for `TTL_MS` per app; a write path asks for `fresh`, a read that missed for
 * `'recent'` (see appSnapshot).
 */
const { getDb, loadConfig } = require('../../db');
const { resolveSplitMode } = require('../../db/table-resolver');
const { dmsMainTable } = require('../uda/utils');
const { getKind, getParent, getInstance } = require('#db/type-utils.js');
const { parseJson, resolveAuthPermissions, scopeOf, hasGrants, mergeAuthPermissions } = require('./grants');
const { vocabularyOf, fieldMaps } = require('./vocabulary');
const { formatsFor } = require('./formats');
const RULES = require('./rules');
const { sourcesTable, viewsTable } = require('../../dama/pgEnv');

const TTL_MS = 30 * 1000;
const MISS_REFRESH_MS = 3 * 1000;
const isDmsEnv = (env) => typeof env === 'string' && env.includes('+');

function dmsDb() {
  const dbEnv = process.env.DMS_DB_ENV || 'dms-sqlite';
  let splitMode;
  try { splitMode = loadConfig(dbEnv).splitMode; } catch { splitMode = resolveSplitMode(); /* env or per-app */ }
  return { db: getDb(dbEnv), splitMode };
}

// ---- rows ---------------------------------------------------------------------------------------

/** A database row in the shape the walk reads: parsed, with its kind and the parent its type names. */
function wrap(r, app) {
  const type = r.type || '';
  return {
    id: r.id, app, type, kind: getKind(type), instance: getInstance(type), parentKey: getParent(type),
    parent: r.parent || null, data: parseJson(r.data) || {},
  };
}

/**
 * A row's OWN grants for one scope, resolved for the subdomain. `view: false` (a source narrowing
 * itself to its own grantees) rides out beside the grants.
 */
function grantsOf(row, scope, subdomain = '') {
  if (!row) return null;
  // `data` is where every write lands: `authPermissions` on DMS rows, `auth_permissions` on sources.
  const stored = row.data.authPermissions !== undefined ? row.data.authPermissions : row.data.auth_permissions;
  return scopeOf(resolveAuthPermissions(stored, subdomain), scope);
}

// ---- snapshots ----------------------------------------------------------------------------------

const cache = new Map();   // key → { at, promise }   (`at`: when the load started)
let loads = 0;              // snapshot loads since start (tests count them)

/**
 * The cached load for `key` if it started less than `maxAge` ms ago (finished or still running),
 * else a new one. `maxAge` 0 always loads.
 */
function cached(key, load, maxAge) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < maxAge) return hit.promise;
  loads++;
  const promise = load().catch((e) => { if (cache.get(key) && cache.get(key).promise === promise) cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

function index(app, rows, formats = null) {
  const snap = { app, rows, formats, byId: new Map(), byInstance: new Map(), site: null };
  for (const r of rows) {
    snap.byId.set(String(r.id), r);
    if (r.instance) {
      if (!snap.byInstance.has(r.instance)) snap.byInstance.set(r.instance, []);
      snap.byInstance.get(r.instance).push(r);
    }
    if (r.kind === 'site' && !snap.site) snap.site = r;
  }
  for (const list of snap.byInstance.values()) list.sort((a, b) => +b.id - +a.id);   // newest first, as the slug lookup picks
  return snap;
}

/** Every container row of `app`: the rows a type path can name as a parent, plus sources and views; and the site's declarations. */
async function loadApp(app, fresh = false) {
  const { db, splitMode } = dmsDb();
  const formats = await formatsFor(app, { fresh });
  const tbl = await dmsMainTable(db, app, splitMode);
  const { rows } = await db.query(`SELECT id, type, data FROM ${tbl} WHERE app = $1 AND type LIKE '%:%'`, [app]);
  return index(app, rows.map(r => wrap(r, app)), formats);
}

/**
 * `fresh`: `true` loads now (a write is judged on what is stored now); `'recent'` accepts a load
 * started in the last MISS_REFRESH_MS (a read that missed: whatever was stored by then is found, and
 * a listing of N unknown sources, or N concurrent misses, costs one load, not N —
 * auth-snapshot-reload-on-miss.md); `false` accepts one up to TTL_MS old.
 */
function appSnapshot(app, { fresh = false } = {}) {
  const maxAge = fresh === true ? 0 : fresh === 'recent' ? MISS_REFRESH_MS : TTL_MS;
  return cached(`app|${app}`, () => loadApp(app, !!fresh), maxAge);
}

/** Forget every cached snapshot, app and pgEnv (tests; a grant write may call it too). */
function clearSnapshots() { cache.clear(); }

// ---- a pgEnv's sources and views ----------------------------------------------------------------
//
// They are rows of ANOTHER database, so they are not in an app's snapshot. What the walk needs of them
// is small: a source's grants, and which source a view belongs to. One bulk read per pgEnv, cached like
// an app snapshot, answers a listing judged id by id; a `fresh` question (every write) asks the pgEnv
// for that one subject and never reloads the lot.

/** `{ sources: Map(source_id → grants), views: Map(view_id → source_id) }` of a pgEnv. */
async function loadPgEnv(env) {
  const db = getDb(env);
  const { rows: s } = await db.query(`SELECT source_id, auth_permissions FROM ${sourcesTable(db)}`);
  const { rows: v } = await db.query(`SELECT view_id, source_id FROM ${viewsTable(db)}`);
  return {
    sources: new Map(s.map(r => [+r.source_id, parseJson(r.auth_permissions)])),
    views: new Map(v.map(r => [+r.view_id, +r.source_id])),
  };
}

const pgEnvCatalog = (env) => cached(`pgenv|${env}`, () => loadPgEnv(env), TTL_MS);

/** Forget what is cached of one pgEnv (a grant write to one of its sources). */
function clearPgEnv(env) { cache.delete(`pgenv|${env}`); }

/**
 * A pgEnv's source, or the source of one of its views, as stored now: `{ sourceId, grants }`, or null
 * when the pgEnv has no such row. `fresh` reads that one subject from the pgEnv and updates the cache.
 */
async function pgEnvSubject(env, want, id, fresh) {
  if (!fresh) {
    const cat = await pgEnvCatalog(env);
    const sourceId = want === 'source' ? id : cat.views.get(id);
    return sourceId != null && cat.sources.has(sourceId) ? { sourceId, grants: cat.sources.get(sourceId) } : null;
  }
  const db = getDb(env);
  let sourceId = id;
  if (want === 'view') {
    const { rows } = await db.query(`SELECT source_id FROM ${viewsTable(db)} WHERE view_id = $1`, [id]);
    if (!rows[0]) return null;
    sourceId = +rows[0].source_id;
  }
  const { rows } = await db.query(`SELECT auth_permissions FROM ${sourcesTable(db)} WHERE source_id = $1`, [sourceId]);
  if (!rows[0]) return null;
  const grants = parseJson(rows[0].auth_permissions);
  const hit = cache.get(`pgenv|${env}`);
  if (hit) hit.promise.then((cat) => { cat.sources.set(sourceId, grants); if (want === 'view') cat.views.set(id, sourceId); }).catch(() => {});
  return { sourceId, grants };
}

/**
 * The row the walk reads for a pgEnv's source or view. It is stored nowhere: built from the pgEnv's own
 * row and parented to the site's `:dmsenv` row for the pgEnv, so the kind's rule, the env's grants and
 * its vocabulary apply to it exactly as they do to an internal source (`parentOf` reads `parent` first).
 */
function externalRow(app, envRow, env, want, id, { sourceId, grants }) {
  const data = { pgEnv: env, source_id: sourceId, auth_permissions: grants && typeof grants === 'object' ? grants : {} };
  const source = {
    id: null, app, type: `${envRow.instance}|s${sourceId}:source`, kind: 'source', instance: `s${sourceId}`,
    parentKey: envRow.instance, parent: envRow, data,
  };
  if (want === 'source') return source;
  return {
    id: null, app, type: `s${sourceId}|v${id}:view`, kind: 'view', instance: `v${id}`,
    parentKey: source.instance, parent: source, data: { pgEnv: env, view_id: id, source_id: sourceId },
  };
}

// ---- the subject --------------------------------------------------------------------------------

/**
 * Resolve an address to `{ snap, row }`, or `{ error }`.
 *
 *     { row, app }                  a DMS row the caller holds (a page, a pattern, a stored source…)
 *     { env, sourceId, app }        a source — `app+instance` (internal) or a pgEnv name (external)
 *     { env, viewId, app }          a view
 *     { env, app }                  the env itself: an internal one by the pattern or env instance in
 *                                   `app+instance`, an external one by the `:dmsenv` row of `app` whose
 *                                   `data.pgEnv` names it (what `create-source` is asked of)
 *     { app, patternId }            a pattern row by id
 *
 * `app` is a LOCATOR for an external env: it selects which site's env row (and so whose env-level
 * grants and vocabulary) sits above the pgEnv's sources, and confers nothing itself.
 */
async function snapshotFor({ row, env, sourceId, viewId, app, patternId, fresh = false }) {
  if (row) {
    const a = app || row.app;
    if (!a) return { error: 'no app' };
    const snap = await appSnapshot(a, { fresh });
    const known = row.id != null ? snap.byId.get(String(row.id)) : null;
    return { snap, row: known || wrap(row, a) };
  }
  if (env !== undefined && (sourceId !== undefined || viewId !== undefined)) {
    const want = sourceId !== undefined ? 'source' : 'view';
    const id = +(sourceId !== undefined ? sourceId : viewId);
    if (isDmsEnv(env)) {
      const snap = await appSnapshot(env.split('+')[0], { fresh });
      const r = snap.byId.get(String(id));
      return r && r.kind === want ? { snap, row: r } : { error: `${want} ${env}/${id} not found` };
    }
    // A pgEnv's source: its own grants are the pgEnv's (shared by every app on it), the grants above
    // it are the requesting site's env row's. So a request that names no site (`dms_app`) has nothing
    // to be judged in: refused, never answered from some other site's env row.
    if (!app) return { error: 'no site named' };
    const snap = await appSnapshot(app, { fresh });
    const envRow = snap.rows.find(x => x.kind === 'dmsenv' && x.data.pgEnv === env) || null;
    if (!envRow) return { error: `pgEnv ${env} is not attached to ${app} (no :dmsenv row names it; attach-pgenv.js)` };
    const subject = await pgEnvSubject(env, want, id, fresh);
    return subject ? { snap, row: externalRow(app, envRow, env, want, id, subject) } : { error: `${want} ${env}/${id} not found` };
  }
  if (env !== undefined) {
    if (isDmsEnv(env)) {
      const [a, instance] = env.split('+');
      const snap = await appSnapshot(a, { fresh });
      const named = snap.byInstance.get(instance) || [];
      const pattern = named.find(r => r.kind === 'pattern');
      const r = named.find(r => r.kind === 'dmsenv')
        || (pattern && pattern.data.dmsEnvId != null ? snap.byId.get(String(pattern.data.dmsEnvId)) : null);
      if (r && r.kind === 'dmsenv') return { snap, row: r };
      // `app+<format type>` names no row (what the client sends for an app's internal sources): the app's
      // internal env is then the site's own business, judged on the site row
      return snap.site ? { snap, row: snap.site } : { error: `env ${env} has no :dmsenv row` };
    }
    if (!app) return { error: 'no app' };
    const snap = await appSnapshot(app, { fresh });
    const r = snap.rows.find(x => x.kind === 'dmsenv' && x.data.pgEnv === env) || null;
    return r ? { snap, row: r } : { error: `env ${env} has no :dmsenv row in ${app}` };
  }
  if (app && patternId != null) {
    const snap = await appSnapshot(app, { fresh });
    const r = snap.byId.get(String(patternId));
    return r && r.kind === 'pattern' ? { snap, row: r } : { error: `pattern ${app}/${patternId} not found` };
  }
  return { error: 'name a row, a source, a view, an env or a pattern' };
}

// ---- the walk -----------------------------------------------------------------------------------

/**
 * The row above `row`: `parent` when the loader linked it, `data.parent_id` when it is stamped and known,
 * else the container the type path names. The path names a parent by instance only; when several
 * rows share that instance (two patterns slugged alike, a legacy case) the first row of another kind
 * wins — the walk guesses nothing by type (rule 2). Stamping `parent_id`, which the client does for
 * every `dms-format` child, is what removes the ambiguity; `parentId.js`'s reconciler reports rows
 * that lack one.
 */
function parentOf(snap, row) {
  if (!row) return null;
  if (row.parent) return row.parent;
  const pid = row.data && row.data.parent_id;
  if (pid != null && snap.byId.has(String(pid))) return snap.byId.get(String(pid));
  if (!row.parentKey) return row.kind === 'site' ? null : snap.site;
  return (snap.byInstance.get(row.parentKey) || []).find(r => r !== row && r.kind !== row.kind) || null;
}

function* ancestors(snap, row) {
  const seen = new Set();
  let cur = parentOf(snap, row);
  while (cur && !seen.has(cur)) { seen.add(cur); yield cur; cur = parentOf(snap, cur); }
}

/** The site's grants: the site row's own. Site-level verbs live there and nowhere else (rule 3). */
function siteGrants(snap, subdomain) {
  return (snap.site && grantsOf(snap.site, 'self', subdomain)) || { groups: {}, users: {} };
}

/** Rules were written against these names; they are positions on the walk. */
const LEGACY_POSITIONS = {
  'site-grants': 'site', 'datasets-grants': 'ancestor:dmsenv', 'self-pattern': 'self',
  'parent-pattern': 'ancestor:pattern', 'parent-pattern+row': ['ancestor:pattern', 'self'],
  'self-source': ['ancestor:dmsenv', 'self'],
  'owning-source': ['ancestor:dmsenv', 'ancestor:source'],
  'source-by-slug': ['ancestor:dmsenv', 'ancestor:source'],
};

/**
 * The grants at `position` relative to `row`, or null when nothing is there (an owner that cannot
 * be found holds nothing: the judge fails closed). A list of positions is spread in order, later
 * entries replacing earlier ones per principal — a page's own grants over its pattern's.
 */
function grantsAt(snap, row, position, { op = 'edit', subdomain = '' } = {}) {
  const pos = LEGACY_POSITIONS[position] || position;
  if (Array.isArray(pos)) {
    const parts = pos.map(p => grantsAt(snap, row, p, { op, subdomain }));
    if (parts.every(p => p == null)) return null;
    // `view: false` on a row means "my own grantees only": that part alone, nothing lent to it
    const narrowed = parts.filter(p => p && p.view === false).pop();
    if (narrowed) return narrowed;
    return parts.reduce((acc, p) => (p == null ? acc : mergeAuthPermissions(acc || {}, p)), null);
  }
  if (pos === 'self') return op === 'create' ? { groups: {}, users: {} } : grantsOf(row, 'self', subdomain);
  if (pos === 'parent') return grantsOf(parentOf(snap, row), 'descendants', subdomain);
  if (pos === 'site') return siteGrants(snap, subdomain);
  if (pos.startsWith('ancestor:')) {
    const kind = pos.slice('ancestor:'.length);
    for (const a of ancestors(snap, row)) if (a.kind === kind) return grantsOf(a, 'descendants', subdomain);
    return null;
  }
  return null;
}

/**
 * The rule for `row`'s kind: the site's declaration (`formats`), else the stamp on the nearest
 * ancestor that carries one (`data.authRules`), else the built-in copy. Never read from the row
 * itself: its data is the caller's.
 */
function ruleFor(snap, row) {
  const kind = row.kind;
  const declared = snap.formats && snap.formats.rules[kind];
  if (declared) return { rule: declared, from: 'formats' };
  const stampedOn = (r) => (r && r.data.authRules && typeof r.data.authRules === 'object' && r.data.authRules[kind]) || null;
  let stamped = null;
  for (const a of ancestors(snap, row)) if ((stamped = stampedOn(a))) break;
  if (!stamped) return { rule: RULES[kind] || null, from: 'built-in' };
  if (typeof stamped !== 'object' || !stamped.ops || typeof stamped.ops !== 'object') throw new Error(`the stamped ${kind} rule has no ops`);
  // a rule stamped before the formats carried `read` reads as the built-in does; `read: []` says open
  const read = stamped.ops.read === undefined && RULES[kind] ? RULES[kind].ops.read : stamped.ops.read;
  return { rule: read === undefined ? stamped : { ...stamped, ops: { ...stamped.ops, read } }, from: 'stamped' };
}

/**
 * What `r` declares for itself and the rows beneath it: a pattern row declares its type's
 * vocabulary (`<pattern_type>+pattern` in `formats`); a site-level container (site, env) its own
 * format's. The stamp on the row answers when the table does not.
 */
function vocabularyAt(snap, r) {
  const f = snap.formats;
  const d = f && (r.kind === 'pattern' ? f.byKey.get(`${r.data.pattern_type}+pattern`) : f.byKind.get(r.kind));
  return (d && d.vocabulary) || vocabularyOf(r);
}

/**
 * The vocabulary that governs `row`, and the scope to read it in: a row declaring its own is
 * governed by `self`; one that inherited a declaration from above is governed by `descendants`
 * (a pattern row's vocabulary carries `edit-pattern` under `self` and `edit-page` under
 * `descendants`, and reading the wrong one offers a page editor the pattern's verb).
 *
 * `publicRead` is the declaring row's: a pattern that declares it is readable without a session,
 * and so is everything it declares for.
 */
function mapsFor(snap, row) {
  const own = vocabularyAt(snap, row);
  if (own) return { maps: fieldMaps(own), scope: 'self', publicRead: own.publicRead === true };
  for (const a of ancestors(snap, row)) {
    const v = vocabularyAt(snap, a);
    if (v) return { maps: fieldMaps(v), scope: 'descendants', publicRead: v.publicRead === true };
  }
  return { maps: null, scope: 'flat', publicRead: false };
}

/** The source a view belongs to (its parent), by the id its env knows it by (a pgEnv's `source_id`), or null. */
async function sourceOfView(env, viewId, app = null) {
  const { snap, row, error } = await snapshotFor({ env, viewId, app });
  if (error) return null;
  const p = parentOf(snap, row);
  return p && p.kind === 'source' ? (p.data.pgEnv ? p.data.source_id : p.id) : null;
}

module.exports = {
  snapshotFor, appSnapshot, clearSnapshots, clearPgEnv, snapshotLoads: () => loads, grantsAt, grantsOf, ruleFor, mapsFor,
  parentOf, ancestors, sourceOfView, isDmsEnv, dmsDb, LEGACY_POSITIONS,
};
