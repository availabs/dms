'use strict';
/**
 * The orphan sweep: rows nothing in the database can reach (planning/tasks/current/orphan-sweeper.md).
 * Used by scripts/sweep-orphans.js; written to be callable from a server route later (Phase 2), so it
 * takes an open adapter and never goes through getDb() (whose init runs DDL migrations).
 *
 * WHAT IS UNREACHABLE, per app, read from the data — no row kind or pattern type is named here:
 *
 *   unlisted children   a row of a kind some format declares as a CHILD (`childRefs`: the page pattern says
 *                       a page lists `component`s in `sections` / `draft_sections` and its `page-edit` in
 *                       `history`) that no live row of the owner kind lists. Both a list and a single ref
 *                       count (parentId.js refIdsOf). No declaration for the app → nothing is taken.
 *   dead containers     a row typed `<container>|<kind>` (no instance of its own) whose container is the
 *                       instance of no live row of the app (`<site>|<container>:pattern`, or a legacy pattern
 *                       row's `data.doc_type`). That is how a page whose pattern is gone looks, and every
 *                       row under it. Rows whose parent has more than one segment are left alone.
 *   unlisted patterns   a `pattern` row that no live row lists in `patterns` (the site's list, as
 *                       ownerDelete.js reads it). `duplicate` when a listed pattern row has the same type
 *                       (only the row goes), `alone` otherwise (it goes, and what it owned then falls under
 *                       "dead containers"). An app with no `patterns` list at all is skipped.
 *   other kinds         OPT-IN. "Dead containers" takes only page-content kinds: the kinds the formats'
 *                       childRefs name, as owner or child (page, component, page-edit). A row of any other
 *                       kind under a dead container (a map symbology whose pattern is gone) is `held` and
 *                       reported, and an `alone` pattern that still holds such rows is kept with them, so
 *                       they stay reachable from it. Asking for `other_kinds` takes both.
 *
 * Every candidate that is NOT a declared child kind (pages, templates, pattern rows …) is then searched for
 * in EVERY `data_items*` table of every schema, split tables included: a row outside the sweep whose data
 * holds a value equal to the candidate's id, at any depth, keeps it (`blocked`, with the referrer named).
 * Keeping a row makes what it lists live again, so the rules run to a fixed point.
 *
 * Rows created or updated within `minAgeHours` are kept (a section saved just before its page).
 * Container kinds (ownerDelete.js CONTAINER_KINDS) are never taken by the container rule.
 *
 * APPLY writes a gzipped NDJSON backup of every row it deletes (no backup, no delete), then deletes per
 * app in one transaction, re-reading the app first and taking only rows that are still candidates. No
 * change_log entries at all (owner, 2026-11-18): open clients keep stale copies until they reload.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { once } = require('events');
const { parseRowType } = require('#db/type-utils.js');
const { resolveTable, resolveFormatsTable, sanitize } = require('#db/table-resolver.js');
const { refIdsOf, mergeChildRefs } = require('./parentId');
const { backupRoot, CONTAINER_KINDS } = require('./ownerDelete');

const CHUNK = 500;
const SAFE_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PATTERN_KIND = 'pattern';           // the kind ownerDelete.js lists in a site's `patterns`
const PATTERN_LIST = 'patterns';
const LEGACY_INSTANCE = 'doc_type';       // a legacy pattern row names its container here
const CATEGORIES = ['unlisted_children', 'dead_containers', 'unlisted_patterns', 'other_kinds'];
// `other_kinds` is opt-in (owner, 2026-11-18): rows of a kind no format declares as page content
// (map symbologies, and anything like them) are kept unless it is asked for by name. Like sources, they
// can be worth keeping with nothing pointing at them, so deleting them is a deliberate choice.
const DEFAULT_CATEGORIES = ['unlisted_children', 'dead_containers', 'unlisted_patterns'];

const parseJson = (v) => { if (typeof v !== 'string') return v ?? null; try { return JSON.parse(v); } catch { return v; } };
const chunks = (arr, n = CHUNK) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const isPg = (db) => db.type === 'postgres';
const q = async (db, sql, params = []) => (await db.query(sql, params)).rows;

function splitModeOf(config) {
  return (config && config.splitMode) || process.env.DMS_SPLIT_MODE || 'legacy';
}

function mainTable(db, app, splitMode) {
  return resolveTable(app, '', db.type, splitMode).fullName;
}

// ---- reading -----------------------------------------------------------------------------------

/** Every app in the database (per-app PG: one per `dms_*` schema with rows; otherwise the main table). */
async function listApps(db, splitMode) {
  if (splitMode !== 'per-app') {
    return (await q(db, `SELECT DISTINCT app FROM ${mainTable(db, '', splitMode)} ORDER BY app`)).map(r => r.app);
  }
  const apps = new Set();
  for (const t of await dataTables(db)) {
    if (!t.main) continue;
    for (const r of await q(db, `SELECT DISTINCT app FROM ${t.fullName}`)) {
      // a per-app table holds its own app; a row of another app there is not this table's to sweep
      const own = resolveTable(r.app, '', db.type, splitMode);
      if (own.schema.replace(/"/g, '') === t.schema && own.table.replace(/"/g, '') === t.table) apps.add(r.app);
    }
  }
  return [...apps].sort();
}

/** Every `data_items*` table in the database: `{ fullName, schema, table, main }`. */
async function dataTables(db) {
  if (isPg(db)) {
    const rows = await q(db, `
      SELECT t.table_schema AS schema, t.table_name AS "table"
        FROM information_schema.tables t
        JOIN information_schema.columns c ON c.table_schema = t.table_schema AND c.table_name = t.table_name AND c.column_name IN ('data', 'app', 'type')
       WHERE (t.table_schema = 'dms' OR t.table_schema LIKE 'dms\\_%') AND t.table_name LIKE 'data\\_items%' AND t.table_type = 'BASE TABLE'
       GROUP BY 1, 2 HAVING COUNT(*) = 3
       ORDER BY 1, 2`);
    return rows.map(r => ({ ...r, fullName: `"${r.schema}"."${r.table}"`, main: r.table === 'data_items' }));
  }
  // only tables with the columns the scan reads (a history table has its own shape)
  const rows = await q(db, `SELECT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name LIKE 'data_items%'
    AND (SELECT COUNT(*) FROM pragma_table_info(m.name) p WHERE p.name IN ('data', 'app', 'type')) = 3 ORDER BY m.name`);
  // sqlite per-app main tables are `data_items__<app>`; split tables add a further `__<suffix>`
  return rows.map(r => ({ schema: 'main', table: r.name, fullName: r.name, main: r.name === 'data_items' || r.name.split('__').length === 2 }));
}

/**
 * The childRefs declarations: the app's own formats rows, else every app's in the database (the page
 * pattern declares the same thing on every site; an app that has not registered formats yet still has
 * pages). Returns `{ byOwnerKind, conflicts, source }`.
 */
async function childRefsFor(db, app, splitMode, cache) {
  const exists = async (t) => isPg(db)
    ? (await q(db, `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`, [t.schema.replace(/"/g, ''), t.table.replace(/"/g, '')])).length > 0
    : (await q(db, `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $1`, [t.table])).length > 0;
  const read = async (fullName) => q(db, `SELECT id, type, child_refs FROM ${fullName} WHERE child_refs IS NOT NULL`);
  const ownTable = resolveFormatsTable(app, db.type, splitMode);
  const own = (await exists(ownTable) ? await read(ownTable.fullName) : [])
    .map(r => ({ id: r.id, type: r.type, childRefs: parseJson(r.child_refs) }));
  if (own.length) return { ...mergeChildRefs(own), source: 'app' };
  if (!cache.all) {
    let tables = [];
    if (isPg(db)) {
      tables = (await q(db, `SELECT table_schema AS s FROM information_schema.tables WHERE table_name = 'formats' AND (table_schema = 'dms' OR table_schema LIKE 'dms\\_%')`))
        .map(r => `"${r.s}"."formats"`);
    } else {
      tables = (await q(db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'formats%'`)).map(r => r.name);
    }
    const all = [];
    for (const t of tables) for (const r of await read(t)) all.push({ id: r.id, type: r.type, childRefs: parseJson(r.child_refs) });
    cache.all = mergeChildRefs(all);
  }
  return { ...cache.all, source: cache.all && Object.keys(cache.all.byOwnerKind).length ? 'database' : 'none' };
}

/** The app's rows with only what the rules read: id, type, times, and the listed attributes. */
async function loadRows(db, table, app, attrs) {
  const sel = attrs.map(a => isPg(db) ? `data->'${a}' AS "a_${a}"` : `json_extract(data, '$.${a}') AS "a_${a}"`).join(', ');
  const rows = await q(db, `SELECT id, type, created_at, updated_at${sel ? ', ' + sel : ''} FROM ${table} WHERE app = $1`, [app]);
  return rows.map(r => {
    const row = { id: String(r.id), type: r.type, created_at: r.created_at, updated_at: r.updated_at, attrs: {} };
    for (const a of attrs) { const v = r[`a_${a}`]; if (v !== null && v !== undefined) row.attrs[a] = parseJson(v); }
    row.parsed = parseRowType(r.type);
    return row;
  });
}

// ---- the rules -----------------------------------------------------------------------------------

/**
 * The candidate set for one app, at a fixed point. `pinned` ids are kept whatever the rules say.
 * Returns `Map(id -> { category, reason, twinOf? })`.
 */
function computeCandidates(rows, { byOwnerKind, pinned, recentCutoff, hasPatternLists, takeOtherKinds = false }) {
  const byId = new Map(rows.map(r => [r.id, r]));
  const childKinds = new Map();                         // childKind -> [{ ownerKind, attribute }]
  for (const [ownerKind, attrs] of Object.entries(byOwnerKind || {})) {
    for (const [attribute, childKind] of Object.entries(attrs || {})) {
      if (!childKinds.has(childKind)) childKinds.set(childKind, []);
      childKinds.get(childKind).push({ ownerKind, attribute });
    }
  }
  // Page content: every kind childRefs names, as owner or as child. Read from the formats, never named here.
  const contentKinds = new Set(Object.keys(byOwnerKind || {}));
  for (const k of childKinds.keys()) contentKinds.add(k);
  const isOther = (r) => !contentKinds.has(r.parsed.kind) && !CONTAINER_KINDS.has(r.parsed.kind);
  const kept = (r) => pinned.has(r.id) || (recentCutoff && isRecent(r, recentCutoff));
  const out = new Map();
  let held = new Map();                                 // id -> { reason, holds? }, rows left only because they are other kinds
  for (let round = 0; round < 50; round++) {
    const live = rows.filter(r => !out.has(r.id));
    const before = out.size;
    held = new Map();

    // unlisted patterns
    if (hasPatternLists) {
      const listed = new Set();
      for (const r of live) for (const id of refIdsOf(r.attrs[PATTERN_LIST])) listed.add(String(id));
      const listedTypes = new Set(live.filter(r => r.parsed.kind === PATTERN_KIND && listed.has(r.id)).map(r => r.type));
      for (const r of live) {
        if (r.parsed.kind !== PATTERN_KIND || listed.has(r.id) || kept(r)) continue;
        const twin = listedTypes.has(r.type);
        if (!twin) {
          const holds = live.filter(x => x.parsed.parent === r.parsed.instance && !x.parsed.instance && isOther(x));
          if (holds.length) {
            const reason = `holds ${holds.length} ${[...new Set(holds.map(x => x.parsed.kind))].join(' / ')} row(s)`;
            // asked for: the pattern goes with what it holds, as one `other_kinds` choice
            if (takeOtherKinds) out.set(r.id, { category: 'other_kinds', reason });
            else held.set(r.id, { reason, holds: holds.length });
            continue;
          }
        }
        out.set(r.id, { category: 'unlisted_patterns', reason: twin ? 'duplicate' : 'alone' });
      }
    }

    // Any live row naming an id in a declared list attribute keeps it, WHATEVER the row's kind: a legacy
    // page (type = a bare UUID) lists new-format components too (npmrdsv5 2184453, found 2026-11-17 on a
    // scratch apply: 5 rows went that it listed). Deleting reads the lists conservatively.
    const listAttrs = new Set();
    for (const listers of childKinds.values()) for (const { attribute } of listers) listAttrs.add(attribute);
    const listedBy = (live) => {
      const ids = new Set();
      for (const r of live) for (const attribute of listAttrs) for (const id of refIdsOf(r.attrs[attribute])) ids.add(String(id));
      return ids;
    };

    // dead containers. A row a live row still lists is not taken here: a kept (blocked) page under a
    // dead container keeps what it lists.
    const liveNow = rows.filter(r => !out.has(r.id));
    const listedByLive = listedBy(liveNow);
    const instances = new Set();
    for (const r of liveNow) {
      if (r.parsed.instance) instances.add(r.parsed.instance);
      const legacy = r.attrs[LEGACY_INSTANCE];
      if (typeof legacy === 'string' && legacy) instances.add(legacy);
    }
    for (const r of liveNow) {
      const { parent, instance, kind } = r.parsed;
      if (instance || !parent || parent.includes('|') || CONTAINER_KINDS.has(kind)) continue;
      if (instances.has(parent) || listedByLive.has(r.id) || kept(r)) continue;
      if (isOther(r)) {
        if (takeOtherKinds) out.set(r.id, { category: 'other_kinds', reason: `no live row is "${parent}"` });
        else held.set(r.id, { reason: `no live row is "${parent}"` });
        continue;
      }
      out.set(r.id, { category: 'dead_containers', reason: `no live row is "${parent}"` });
    }

    // unlisted children
    const listedIds = listedBy(rows.filter(r => !out.has(r.id)));
    for (const [childKind, listers] of childKinds) {
      for (const r of rows) {
        if (out.has(r.id) || r.parsed.kind !== childKind || listedIds.has(r.id) || kept(r)) continue;
        out.set(r.id, { category: 'unlisted_children', reason: `no ${listers.map(l => `${l.ownerKind}.${l.attribute}`).join(' / ')} lists it` });
      }
    }

    if (out.size === before) break;
  }
  return { candidates: out, byId, childKinds, held };
}

function isRecent(r, cutoff) {
  // SQLite's datetime('now') is UTC with no zone: read it as UTC, not local time
  const t = (v) => (!v ? 0 : new Date(typeof v === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(v) ? `${v.replace(' ', 'T')}Z` : v).getTime() || 0);
  return Math.max(t(r.created_at), t(r.updated_at)) > cutoff;
}

// ---- the whole-database reference scan -----------------------------------------------------------

// A value names a row when it is a string equal to the row's id, or a number equal to it under a key
// that reads as a reference (`id`, `parent`, `pageId`, `sections`, …). Bare numbers elsewhere (`index`,
// widths, counts) would otherwise keep every row of an app whose ids are small.
const REF_KEY = /(^|_)id$|Id$|^id|parent|ref|page|pattern|section|child|link|target/i;

/** Walk a JSON value and collect every value that names one of `ids`. */
// `hits`: Map(id -> app named by a sibling `ref` ("<app>+<type>"), or null). Ids are per app, so a row of
// ANOTHER app naming the same number only counts when its `ref` says it means this app.
function valuesIn(value, ids, hits, key = '', refApp = null) {
  if (value === null || value === undefined) return;
  if (typeof value === 'object') {
    if (Array.isArray(value)) { for (const v of value) valuesIn(v, ids, hits, key, null); return; }
    const ref = typeof value.ref === 'string' && value.ref.includes('+') ? value.ref.slice(0, value.ref.indexOf('+')) : null;
    for (const [k, v] of Object.entries(value)) valuesIn(v, ids, hits, k, ref);
    return;
  }
  const s = String(value).trim();
  // JSON kept as text (a section's `element-data`, a snapshot's `row_data`) is read as JSON: map
  // sections name their symbology rows only in there (found on the 11-17 scratch apply, 2026-11-18).
  if (typeof value === 'string' && (s[0] === '{' || s[0] === '[')) {
    let parsed;
    try { parsed = JSON.parse(s); } catch { parsed = undefined; }
    if (parsed && typeof parsed === 'object') { valuesIn(parsed, ids, hits, key, refApp); return; }
  }
  if (!ids.has(s)) return;
  if (typeof value === 'string' || REF_KEY.test(key)) { if (!hits.has(s) || refApp) hits.set(s, refApp); }
}

/**
 * For each id in `ids` (Set of strings), the rows anywhere in the database whose data names it:
 * `Map(id -> [{ table, id, app, type }])`. Postgres narrows with a regex on the text, then reads the
 * matching rows 200 at a time (a page's data can be large; all of them at once does not fit).
 */
async function scanReferrers(db, ids, { log = () => {} } = {}) {
  const out = new Map();
  if (!ids.size) return out;
  const list = [...ids];
  const tables = await dataTables(db);
  for (const t of tables) {
    const t0 = Date.now();
    let found = 0;
    if (isPg(db)) {
      for (const part of chunks(list, 3000)) {
        const re = `(^|[^0-9])(${part.join('|')})([^0-9]|$)`;
        const partIds = new Set(part);
        let after = -1;
        for (;;) {
          const rows = await q(db, `SELECT id, app, type, data FROM ${t.fullName} WHERE id > $2 AND data::text ~ $1 ORDER BY id LIMIT 200`, [re, after]);
          if (!rows.length) break;
          found += collect(rows, t, partIds, out);
          after = rows[rows.length - 1].id;
        }
      }
    } else {
      let after = -1;
      for (;;) {
        const rows = await q(db, `SELECT id, app, type, data FROM ${t.fullName} WHERE id > $1 ORDER BY id LIMIT 500`, [after]);
        if (!rows.length) break;
        found += collect(rows, t, ids, out);
        after = rows[rows.length - 1].id;
      }
    }
    const secs = (Date.now() - t0) / 1000;
    if (secs > 2 || found) log(`    scanned ${t.fullName}: ${found} reference(s) (${secs.toFixed(1)}s)`);
  }
  return out;
}

function collect(rows, t, ids, out) {
  let n = 0;
  for (const r of rows) {
    const hits = new Map();
    valuesIn(parseJson(r.data), ids, hits);
    hits.delete(String(r.id));               // a row naming its own id is not a reference to it
    for (const [id, refApp] of hits) {
      if (!out.has(id)) out.set(id, []);
      out.get(id).push({ table: t.fullName.replace(/"/g, ''), id: String(r.id), app: r.app, type: r.type, refApp });
      n++;
    }
  }
  return n;
}

// ---- plan ----------------------------------------------------------------------------------------

/**
 * Plan the sweep. `opts`: { config, apps?, only?: [category], minAgeHours = 24, parents?: [name], kinds?: [kind], usage?, log }.
 * `kinds` narrows to rows of those kinds (one Clean up button: unused sections only).
 * `parents` narrows what is planned (and held) to rows under those containers, and pattern rows with those
 * instance names: a pattern's Storage tab passes its own, the site page a former pattern's.
 * `usage` adds every type's rows and size in the app (the Storage pages' usage bar).
 * Returns { at, apps: [{ app, table, skipped?, counts, bytes, groups, held, blocked, recentKept, usage?, notes }] }.
 */
async function planSweep(db, opts = {}) {
  const { config, minAgeHours = 24, log = () => {} } = opts;
  const only = opts.only && opts.only.length ? opts.only : DEFAULT_CATEGORIES;
  const takeOtherKinds = only.includes('other_kinds');
  const parents = opts.parents && opts.parents.length ? new Set(opts.parents) : null;
  const kinds = opts.kinds && opts.kinds.length ? new Set(opts.kinds) : null;
  const inScope = (r) => (!kinds || kinds.has(r.parsed.kind))
    && (!parents || parents.has(r.parsed.parent) || (r.parsed.kind === PATTERN_KIND && parents.has(r.parsed.instance)));
  const splitMode = splitModeOf(config);
  const at = new Date().toISOString();
  const recentCutoff = minAgeHours > 0 ? Date.now() - minAgeHours * 3600 * 1000 : 0;
  const cache = {};
  const apps = opts.apps && opts.apps.length ? opts.apps : await listApps(db, splitMode);
  const perApp = [];

  for (const app of apps) {
    const table = mainTable(db, app, splitMode);
    const refs = await childRefsFor(db, app, splitMode, cache);
    const attrs = new Set([PATTERN_LIST, LEGACY_INSTANCE]);
    for (const a of Object.values(refs.byOwnerKind || {})) for (const k of Object.keys(a)) attrs.add(k);
    const unsafe = [...attrs].filter(a => !SAFE_KEY.test(a));
    for (const a of unsafe) attrs.delete(a);
    let rows;
    try { rows = await loadRows(db, table, app, [...attrs]); }
    catch (e) { perApp.push({ app, table, skipped: `cannot read: ${e.message}` }); continue; }
    const hasPatternLists = rows.some(r => r.attrs[PATTERN_LIST] !== undefined);
    const notes = [];
    if (refs.source === 'database') notes.push('no formats of its own: childRefs read from the other apps');
    if (refs.source === 'none') notes.push('no childRefs declared anywhere: unlisted children not checked');
    if (!hasPatternLists) notes.push(`no row has a "${PATTERN_LIST}" list: unlisted patterns not checked`);
    if (refs.conflicts && refs.conflicts.length) notes.push(`childRefs conflicts dropped: ${refs.conflicts.map(c => `${c.ownerKind}.${c.attribute}`).join(', ')}`);
    if (unsafe.length) notes.push(`attributes not read (unsafe name): ${unsafe.join(', ')}`);
    perApp.push({ app, table, rows, byId: new Map(rows.map(r => [r.id, r])), refs, hasPatternLists, notes });
  }

  // First pass with no pins; then one database-wide scan for the non-child candidates.
  const needScan = new Map();                           // id -> [app entry] (ids repeat across apps)
  for (const a of perApp) {
    if (a.skipped) continue;
    const { candidates, childKinds } = computeCandidates(a.rows, { byOwnerKind: a.refs.byOwnerKind, pinned: new Set(), recentCutoff, hasPatternLists: a.hasPatternLists, takeOtherKinds });
    a.first = candidates;
    a.childKinds = childKinds;
    for (const [id] of candidates) {
      if (childKinds.has(a.byId.get(id).parsed.kind)) continue;
      if (!needScan.has(id)) needScan.set(id, []);
      needScan.get(id).push(a);
    }
  }
  log(`  searching the whole database for ${needScan.size} page/pattern-level id(s)…`);
  const referrers = await scanReferrers(db, new Set(needScan.keys()), { log });

  for (const a of perApp) {
    if (a.skipped) continue;
    const pinned = new Set();
    const blocked = [];
    let candidates = a.first;
    // Keeping a row can only shrink the set, so the scan above covers every later round.
    for (let round = 0; round < 50; round++) {
      let added = false;
      const table = a.table.replace(/"/g, '');
      for (const [id] of candidates) {
        // only page/pattern-level rows face the database-wide check; children are judged by their lists
        if (pinned.has(id) || a.childKinds.has(a.byId.get(id).parsed.kind) || !(referrers.get(id) || []).length) continue;
        const outside = referrers.get(id).filter(ref =>
          !(ref.table === table && candidates.has(ref.id)) &&
          (ref.app === a.app ? !ref.refApp || ref.refApp === a.app : ref.refApp === a.app));
        if (!outside.length) continue;
        pinned.add(id);
        blocked.push({ id, type: a.byId.get(id).type, by: outside.slice(0, 5), more: Math.max(0, outside.length - 5) });
        added = true;
      }
      if (!added) break;
      candidates = computeCandidates(a.rows, { byOwnerKind: a.refs.byOwnerKind, pinned, recentCutoff, hasPatternLists: a.hasPatternLists, takeOtherKinds }).candidates;
    }
    a.held = computeCandidates(a.rows, { byOwnerKind: a.refs.byOwnerKind, pinned, recentCutoff, hasPatternLists: a.hasPatternLists, takeOtherKinds }).held;
    for (const [id] of [...a.held]) if (!inScope(a.byId.get(id))) a.held.delete(id);
    const wanted = (id, c) => only.includes(c.category) && inScope(a.byId.get(id));
    for (const [id, c] of [...candidates]) if (!wanted(id, c)) candidates.delete(id);
    // what only the age rule keeps (the "changed in the last N hours" line)
    a.recentKept = 0;
    if (recentCutoff) {
      const all = computeCandidates(a.rows, { byOwnerKind: a.refs.byOwnerKind, pinned, recentCutoff: 0, hasPatternLists: a.hasPatternLists, takeOtherKinds }).candidates;
      for (const [id, c] of all) if (!candidates.has(id) && wanted(id, c)) a.recentKept++;
    }
    a.candidates = candidates;
    a.blocked = blocked.filter(b => !candidates.has(b.id));
  }

  const result = { at, splitMode, minAgeHours, apps: [] };
  for (const a of perApp) {
    if (a.skipped) { result.apps.push({ app: a.app, table: a.table, skipped: a.skipped }); continue; }
    const counts = {}, groups = {};
    for (const c of CATEGORIES) counts[c] = 0;
    const ids = [...a.candidates.keys()];
    const heldIds = [...a.held.keys()];
    const sizes = await sizesOf(db, a.table, [...ids, ...heldIds]);
    let bytes = 0;
    for (const [id, c] of a.candidates) {
      counts[c.category]++;
      const r = a.byId.get(id);
      const key = `${c.category}\t${r.type}\t${c.reason}`;
      const g = groups[key] || (groups[key] = { category: c.category, type: r.type, parent: r.parsed.parent || '', kind: r.parsed.kind, instance: r.parsed.instance || '', reason: c.reason, rows: 0, bytes: 0 });
      g.rows++;
      g.bytes += sizes.get(id) || 0;
      bytes += sizes.get(id) || 0;
    }
    result.apps.push({
      app: a.app, table: a.table, rowsInApp: a.rows.length, notes: a.notes, childRefsSource: a.refs.source,
      counts, total: ids.length, bytes, recentKept: a.recentKept,
      groups: Object.values(groups).sort((x, y) => y.rows - x.rows),
      blocked: a.blocked,
      held: heldGroups(a, sizes),
      ...(opts.usage ? { usage: await usageOf(db, a.table, a.app) } : {}),
      duplicates: [...a.candidates].filter(([, c]) => c.reason === 'duplicate').map(([id]) => ({ id, type: a.byId.get(id).type })),
      ids: Object.fromEntries(CATEGORIES.map(c => [c, ids.filter(id => a.candidates.get(id).category === c)])),
      _refs: a.refs, _hasPatternLists: a.hasPatternLists, _pinned: new Set(a.blocked.map(b => b.id)), _takeOtherKinds: takeOtherKinds,
    });
  }
  return result;
}

// Rows kept only because they are other kinds, grouped by type and reason: what `other_kinds` would add.
// A held pattern's `holds` counts the rows under it (they go with it when asked for, and are not in `rows`).
function heldGroups(a, sizes = new Map()) {
  const g = {};
  for (const [id, h] of a.held || []) {
    const r = a.byId.get(id);
    const key = `${r.type}\t${h.reason}`;
    const x = g[key] || (g[key] = { type: r.type, parent: r.parsed.parent || '', kind: r.parsed.kind, instance: r.parsed.instance || '', reason: h.reason, rows: 0, holds: 0, bytes: 0 });
    x.rows++;
    x.holds = Math.max(x.holds, h.holds || 0);
    x.bytes += sizes.get(id) || 0;
  }
  return Object.values(g).sort((x, y) => y.rows - x.rows);
}

/** Map(id -> size of its data, bytes). */
async function sizesOf(db, table, ids) {
  const out = new Map();
  const expr = isPg(db) ? 'pg_column_size(data)' : 'length(data)';
  for (const part of chunks(ids, 2000)) {
    for (const r of await q(db, `SELECT id, ${expr} AS b FROM ${table} WHERE id = ANY($1)`, [part.map(Number)])) out.set(String(r.id), Number(r.b) || 0);
  }
  return out;
}

/** Every type in the app with its rows and size: `[{ type, parent, kind, instance, rows, bytes }]`. */
async function usageOf(db, table, app) {
  const expr = isPg(db) ? 'pg_column_size(data)' : 'length(data)';
  const rows = await q(db, `SELECT type, COUNT(*) AS n, COALESCE(SUM(${expr}), 0) AS b FROM ${table} WHERE app = $1 GROUP BY type`, [app]);
  return rows.map(r => { const p = parseRowType(r.type); return { type: r.type, parent: p.parent || '', kind: p.kind, instance: p.instance || '', rows: Number(r.n), bytes: Number(r.b) }; })
    .sort((x, y) => y.bytes - x.bytes);
}

// ---- junk schemas (Postgres per-app) -------------------------------------------------------------

const TEST_RUN = /_(test|spike|check)_?\d{10,}$|_\d{13}$/;

/**
 * `dms_*` schemas that are no app's home: empty, made by a test run, or holding only rows of apps
 * whose own schema is another one. Never dropped here; see dropSchemas.
 */
async function listJunkSchemas(db, { config } = {}) {
  if (!isPg(db) || splitModeOf(config) !== 'per-app') return { supported: false, schemas: [] };
  const schemas = await q(db, `
    SELECT n.nspname AS schema,
           COALESCE(SUM(pg_total_relation_size(c.oid)), 0)::bigint AS bytes,
           COUNT(c.oid) AS tables
      FROM pg_namespace n LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relkind = 'r'
     WHERE n.nspname LIKE 'dms\\_%'
     GROUP BY n.nspname ORDER BY n.nspname`);
  const out = [];
  for (const s of schemas) {
    const tables = (await q(db, `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`, [s.schema])).map(r => r.t);
    let rows = 0;
    const apps = {};
    for (const t of tables) {
      const [c] = await q(db, `SELECT COUNT(*)::bigint AS n FROM "${s.schema}"."${t}"`);
      rows += Number(c.n);
      if (t === 'data_items' && Number(c.n)) {
        for (const r of await q(db, `SELECT app, COUNT(*)::bigint AS n FROM "${s.schema}".data_items GROUP BY app`)) apps[r.app] = Number(r.n);
      }
    }
    const suffix = s.schema.slice('dms_'.length);
    const home = Object.keys(apps).some(app => sanitize(app) === suffix);
    let reason = null;
    if (!rows) reason = 'empty';
    else if (TEST_RUN.test(s.schema)) reason = 'test run';
    else if (!home && Object.keys(apps).length) reason = 'no app of its own (rows belong to other apps)';
    else if (!home) reason = 'no data_items rows';
    if (reason) out.push({ schema: s.schema, reason, tables: tables.length, rows, bytes: Number(s.bytes), apps });
  }
  return { supported: true, schemas: out };
}

// ---- apply ---------------------------------------------------------------------------------------

async function openBackup(label) {
  const dir = backupRoot();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${label}-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson.gz`);
  const gz = zlib.createGzip();
  const fileStream = fs.createWriteStream(file);
  gz.pipe(fileStream);
  const write = async (obj) => { if (!gz.write(JSON.stringify(obj) + '\n')) await once(gz, 'drain'); };
  const close = async () => { gz.end(); await once(fileStream, 'finish'); return file; };
  return { file, write, close };
}

/**
 * Apply a plan. Re-reads each app inside its transaction and deletes only rows that are still
 * candidates (and still in the plan). `expect` = { [app]: { [category]: n } } refuses on a mismatch.
 * `dropSchemas` = names from listJunkSchemas to drop (anything else is refused).
 */
async function applySweep(db, plan, { config, expect, dropSchemas = [], log = () => {} } = {}) {
  const splitMode = splitModeOf(config);
  if (expect) {
    for (const a of plan.apps) {
      const want = expect[a.app];
      if (!want || a.skipped) continue;
      for (const [c, n] of Object.entries(want)) {
        if ((a.counts[c] || 0) !== Number(n)) throw Object.assign(new Error(`${a.app}: ${c} is ${a.counts[c] || 0}, expected ${n}; the data changed since the plan was shown`), { status: 409 });
      }
    }
  }
  let junk = null;
  if (dropSchemas.length) {
    junk = await listJunkSchemas(db, { config });
    const known = new Set(junk.schemas.map(s => s.schema));
    const refused = dropSchemas.filter(s => !known.has(s));
    if (refused.length) throw Object.assign(new Error(`not junk schemas (refused): ${refused.join(', ')}`), { status: 400 });
  }

  const backup = await openBackup('sweep-orphans');
  await backup.write({ kind: 'header', at: new Date().toISOString(), planAt: plan.at, splitMode,
    apps: plan.apps.map(a => ({ app: a.app, table: a.table, counts: a.counts })), dropSchemas });
  const results = [];
  try {
    // Back up first, everything: no backup, no delete.
    for (const a of plan.apps) {
      if (a.skipped || !a.total) continue;
      const ids = CATEGORIES.flatMap(c => a.ids[c]);
      for (const part of chunks(ids)) {
        for (const row of await q(db, `SELECT * FROM ${a.table} WHERE id = ANY($1)`, [part.map(Number)])) {
          await backup.write({ kind: 'row', table: a.table, row });
        }
      }
    }
    for (const s of dropSchemas) {
      const tables = (await q(db, `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`, [s])).map(r => r.t);
      for (const t of tables) for (const row of await q(db, `SELECT * FROM "${s}"."${t}"`)) await backup.write({ kind: 'schema_row', schema: s, table: t, row });
    }
  } finally {
    await backup.close();
  }
  log(`  backup: ${backup.file}`);

  for (const a of plan.apps) {
    if (a.skipped || !a.total) continue;
    const res = await db.withTransaction(async (tx) => {
      // Re-read inside the transaction: a row listed again since the plan stays.
      const fresh = await loadRowsTx(tx, db, a.table, a.app, collectAttrs(a));
      const recentCutoff = plan.minAgeHours > 0 ? Date.now() - plan.minAgeHours * 3600 * 1000 : 0;
      const { candidates } = computeCandidates(fresh, { byOwnerKind: a._refs.byOwnerKind, pinned: a._pinned, recentCutoff, hasPatternLists: a._hasPatternLists, takeOtherKinds: a._takeOtherKinds });
      const planned = CATEGORIES.flatMap(c => a.ids[c]);
      const go = planned.filter(id => candidates.has(id));
      const kept = planned.length - go.length;
      for (const part of chunks(go)) await tx.promise(`DELETE FROM ${a.table} WHERE id = ANY($1)`, [part.map(Number)]);
      return { app: a.app, deleted: go.length, keptSincePlan: kept };
    });
    log(`  ${a.app}: deleted ${res.deleted}${res.keptSincePlan ? `, kept ${res.keptSincePlan} that changed since the plan` : ''}`);
    results.push(res);
  }

  const dropped = [];
  for (const s of dropSchemas) {
    await db.query(`DROP SCHEMA "${s}" CASCADE`);
    dropped.push(s);
    log(`  dropped schema ${s}`);
  }
  return { backup: backup.file, results, dropped };
}

function collectAttrs(a) {
  const attrs = new Set([PATTERN_LIST, LEGACY_INSTANCE]);
  for (const x of Object.values(a._refs.byOwnerKind || {})) for (const k of Object.keys(x)) if (SAFE_KEY.test(k)) attrs.add(k);
  return [...attrs];
}

async function loadRowsTx(tx, db, table, app, attrs) {
  const shim = { type: db.type, query: async (sql, p) => ({ rows: await tx.promise(sql, p) }) };
  return loadRows(shim, table, app, attrs);
}

/** A plan without the in-memory working state, for printing or sending. */
function publicPlan(plan) {
  return { ...plan, apps: plan.apps.map(a => Object.fromEntries(Object.entries(a).filter(([k]) => !k.startsWith('_')))) };
}

module.exports = { planSweep, applySweep, listJunkSchemas, publicPlan, computeCandidates, CATEGORIES, DEFAULT_CATEGORIES };
