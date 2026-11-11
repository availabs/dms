'use strict';
/**
 * OWNERS — which row's grants, rules and vocabulary govern a row. One loader, one walk.
 *
 * Every question a rule can ask ("the site's grants", "my parent's", "the nearest pattern's") is a
 * position on the row's ancestry, and ancestry is data: `parent_id` where it is stamped, the type
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
 * An EXTERNAL source (a pgEnv's `data_manager.sources` row) lives in another database, so it is
 * MIRRORED as a DMS row of each site that uses the pgEnv, parented to that site's `:dmsenv` row for it
 * (dama/mirror.js; `scripts/reconcile-pgenv-mirror.js`). The snapshot indexes the mirrors by
 * `(pgEnv, source_id)` / `(pgEnv, view_id)`, so an address naming a pgEnv finds a row like any other.
 *
 * Snapshots are cached for `TTL_MS` per app; a write path asks for `fresh`, a read that missed for
 * `'recent'` (see appSnapshot).
 */
const { getDb, loadConfig } = require('../../db');
const { resolveTable } = require('../../db/table-resolver');
const { rowAuthCaps } = require('../dms/rowAuthCaps');
const { dmsMainTable } = require('../uda/utils');
const { getKind, getParent, getInstance } = require('#db/type-utils.js');
const { parseJson, resolveAuthPermissions, scopeOf, hasGrants, mergeAuthPermissions } = require('./grants');
const { vocabularyOf, fieldMaps } = require('./vocabulary');
const { formatsFor } = require('./formats');
const RULES = require('./rules');

const TTL_MS = 30 * 1000;
const MISS_REFRESH_MS = 3 * 1000;
const isDmsEnv = (env) => typeof env === 'string' && env.includes('+');

function dmsDb() {
  const dbEnv = process.env.DMS_DB_ENV || 'dms-sqlite';
  let splitMode;
  try { splitMode = loadConfig(dbEnv).splitMode; } catch { /* default below */ }
  return { db: getDb(dbEnv), splitMode: splitMode || process.env.DMS_SPLIT_MODE || 'legacy' };
}

// ---- rows ---------------------------------------------------------------------------------------

/** A database row in the shape the walk reads: parsed, with its kind and the parent its type names. */
function wrap(r, app) {
  const type = r.type || '';
  return {
    id: r.id, app, type, kind: getKind(type), instance: getInstance(type), parentKey: getParent(type),
    parent_id: r.parent_id ?? null, parent: r.parent || null,
    auth: parseJson(r.auth), data: parseJson(r.data) || {},
  };
}

/**
 * A row's OWN grants for one scope, resolved for the subdomain. `view: false` (a source narrowing
 * itself to its own grantees) rides out beside the grants.
 */
function grantsOf(row, scope, subdomain = '') {
  if (!row) return null;
  const col = row.auth && typeof row.auth === 'object' && !Array.isArray(row.auth) ? row.auth : null;
  // `data` first: it is where every client write lands, and nothing mirrors it into the column yet.
  // The column holds migrated grants for rows whose data names no one (the site row, after the sweep).
  const stored = row.data.authPermissions !== undefined ? row.data.authPermissions : row.data.auth_permissions;
  let g = scopeOf(resolveAuthPermissions(stored, subdomain), scope);
  if (!(g.groups || g.users) && col) {
    const { vocabulary, childRefs, view, ...rest } = col;
    g = scopeOf(resolveAuthPermissions(rest, subdomain), scope);
  }
  const { view: dv, ...rest } = g;
  const view = col && col.view !== undefined ? col.view : dv;
  return view === undefined ? rest : { ...rest, view };
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
  const snap = { app, rows, formats, byId: new Map(), byInstance: new Map(), external: new Map(), site: null };
  for (const r of rows) {
    snap.byId.set(String(r.id), r);
    // a mirror of a pgEnv's source / view, addressable by the pgEnv's own ids
    if (r.data.pgEnv && r.kind === 'source' && r.data.source_id != null) snap.external.set(`s:${r.data.pgEnv}:${r.data.source_id}`, r);
    if (r.data.pgEnv && r.kind === 'view' && r.data.view_id != null) snap.external.set(`v:${r.data.pgEnv}:${r.data.view_id}`, r);
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
  let caps = {};
  try { const t = resolveTable(app, '', db.type, splitMode); caps = await rowAuthCaps(db, t.schema, t.table, db.type); } catch { /* no columns */ }
  const cols = ['id', 'type', caps.parentId ? 'parent_id' : 'NULL AS parent_id', caps.auth ? 'auth' : 'NULL AS auth', 'data'].join(', ');
  const { rows } = await db.query(`SELECT ${cols} FROM ${tbl} WHERE app = $1 AND type LIKE '%:%'`, [app]);
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

/** Forget every cached snapshot (tests; a grant write may call it too). */
function clearSnapshots() { cache.clear(); }

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
 * `app` is a LOCATOR for an external env: it selects which site's mirror rows (and so whose env row,
 * grants and vocabulary) answer for the pgEnv, and confers nothing itself.
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
    // Grants over a pgEnv's sources are per site, so a request that names no site (`dms_app`) has
    // nothing to be judged in: refused, never answered from some other site's mirror.
    if (!app) return { error: 'no site named' };
    const snap = await appSnapshot(app, { fresh });
    const r = snap.external.get(`${want[0]}:${env}:${id}`);
    return r ? { snap, row: r } : { error: `${want} ${env}/${id} has no mirror row in ${app} (reconcile-pgenv-mirror.js)` };
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
 * The row above `row`: `parent` when the loader linked it, `parent_id` when it is stamped and known,
 * else the container the type path names. The path names a parent by instance only; when several
 * rows share that instance (two patterns slugged alike, a legacy case) the first row of another kind
 * wins — the walk guesses nothing by type (rule 2). Stamping `parent_id`, which the client does for
 * every `dms-format` child, is what removes the ambiguity; `parentId.js`'s reconciler reports rows
 * that lack one.
 */
function parentOf(snap, row) {
  if (!row) return null;
  if (row.parent) return row.parent;
  if (row.parent_id != null && snap.byId.has(String(row.parent_id))) return snap.byId.get(String(row.parent_id));
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

/** The source a view belongs to (its parent), by the id its env knows it by (a pgEnv's `source_id` for a mirror), or null. */
async function sourceOfView(env, viewId, app = null) {
  const { snap, row, error } = await snapshotFor({ env, viewId, app });
  if (error) return null;
  const p = parentOf(snap, row);
  return p && p.kind === 'source' ? (p.data.pgEnv ? p.data.source_id : p.id) : null;
}

module.exports = {
  snapshotFor, appSnapshot, clearSnapshots, snapshotLoads: () => loads, grantsAt, grantsOf, ruleFor, mapsFor,
  parentOf, ancestors, sourceOfView, isDmsEnv, dmsDb, LEGACY_POSITIONS,
};
