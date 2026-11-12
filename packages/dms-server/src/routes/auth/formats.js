'use strict';
/**
 * FORMAT DECLARATIONS — what a site's client says about its row kinds, read from the `formats` table.
 *
 * dms-server cannot import the client package, so until 2026-11-06 a pattern type's declarations
 * (its auth rules, its permission vocabulary, its `childRefs`) reached the server only as a STAMP on
 * the row created with them, and a later change to a format never reached an existing row. Now they
 * are REGISTERED on the server: `scripts/register-formats.js` writes the rows the client package's
 * `scripts/emit-formats.mjs` prints (dry run by default, `--apply` to write), and the auth layer reads
 * them here. No client can write this table — not a browser, not the dms CLI (owner, 2026-11-06); the
 * only HTTP route is a read. The stamp is still read when the table says nothing about a kind, for one
 * release.
 *
 * ONE ROW PER (SITE, FORMAT KEY), IN THE SITE'S OWN TABLE. `app` is the site, because a site is one
 * client bundle and so one set of declarations — two sites on one server may run different library
 * versions and must not fight over one global row. Under per-app split mode the table sits in the
 * site's schema beside its data_items (`dms_<app>.formats`, SQLite `formats__<app>`), created on
 * first use; legacy mode keeps the shared `formats` (db/table-resolver.js resolveFormatsTable).
 * `type` is the format's own key, the same `app+type` the client's `dms-format` attributes name
 * (`datasets+source`, `dms-site+page`, `admin+dmsenv`), or `<pattern type>+pattern` for the
 * declarations a pattern TYPE makes about its own row and its subtree (`page+pattern`: the page
 * type's vocabulary and childRefs).
 *
 *     attributes       the format's attributes, plain data (components and functions dropped)
 *     auth_rules       the format's `rules: { [kind]: rule }` — a kind's rule is global per site
 *     auth_vocabulary  on `<type>+pattern`: the type's derived `{ self, descendants, publicRead? }`;
 *                      on a site-level container format (`admin+site`, `admin+dmsenv`): its own,
 *                      because no pattern row stands above those rows to declare for them
 *     child_refs       on `<type>+pattern`: `{ [ownerKind]: { [attribute]: childKind } }`
 *
 *     formatsFor(app)              → { byKey, byKind, rules }   cached TTL_MS per site
 *     upsertFormats(app, rows)     → { written, removed, same }  idempotent; the payload is the whole set
 *                                                                (the registration script's write; no route)
 *     listFormats(app)             → rows in the wire shape
 *     registerFormatRoutes(app)    GET /dms/formats (open): what a site holds, for `dms formats diff`
 *
 * Nothing here names a kind, a verb or a pattern type.
 */
const { getDb } = require('../../db');
const { loadConfig } = require('../../db/config');
const { ensureFormatsTable } = require('../../db/table-resolver');
const { parseJson } = require('./grants');
const { requestApp } = require('./requestUser');

const TTL_MS = 30 * 1000;
const COLUMNS = ['attributes', 'auth_vocabulary', 'auth_rules', 'child_refs'];
const WIRE = { attributes: 'attributes', auth_vocabulary: 'authVocabulary', auth_rules: 'authRules', child_refs: 'childRefs' };
const KEY = /^[A-Za-z0-9_.-]{1,200}\+[A-Za-z0-9_.-]{1,200}$/;

function dmsDb() {
  return getDb(process.env.DMS_DB_ENV || 'dms-sqlite');
}

/**
 * The site's table, created on first use: `dms_<app>.formats` / `formats__<app>` under per-app split
 * mode, the shared `formats` in legacy mode (db/table-resolver.js resolveFormatsTable).
 */
async function table(db, app) {
  const name = process.env.DMS_DB_ENV || 'dms-sqlite';
  const splitMode = loadConfig(name).splitMode;
  return (await ensureFormatsTable(db, app, db.type, splitMode)).fullName;
}

/** jsonb keeps no key order, so stored and sent values are compared canonically. */
const canonical = (v) => JSON.stringify(v ?? null, (k, x) => (x && typeof x === 'object' && !Array.isArray(x))
  ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x);

// ---- the index ----------------------------------------------------------------------------------

function index(app, rows) {
  const snap = { app, byKey: new Map(), byKind: new Map(), rules: {} };
  for (const r of rows) {
    const row = {
      type: r.type, attributes: parseJson(r.attributes), vocabulary: parseJson(r.auth_vocabulary),
      rules: parseJson(r.auth_rules), childRefs: parseJson(r.child_refs),
    };
    snap.byKey.set(r.type, row);
    const kind = r.type.slice(r.type.indexOf('+') + 1);
    // a pattern row's declaration is found by its pattern_type (`<type>+pattern`), never by kind
    if (row.vocabulary && kind !== 'pattern') {
      if (snap.byKind.has(kind)) console.warn(`[formats] ${app}: two formats declare a vocabulary for "${kind}" (${snap.byKind.get(kind).type}, ${r.type}); the first is read`);
      else snap.byKind.set(kind, row);
    }
    for (const [k, rule] of Object.entries(row.rules && typeof row.rules === 'object' ? row.rules : {})) {
      if (!rule || typeof rule !== 'object' || !rule.ops) { console.warn(`[formats] ${app}: ${r.type} declares a "${k}" rule with no ops; ignored`); continue; }
      if (snap.rules[k]) {
        if (canonical(snap.rules[k]) !== canonical(rule)) console.warn(`[formats] ${app}: "${k}" is ruled twice (${r.type} disagrees with an earlier row); the first is read`);
        continue;
      }
      snap.rules[k] = rule;
    }
  }
  return snap;
}

const cache = new Map();   // app → { at, promise }

async function load(app) {
  const db = dmsDb();
  let rows = [];
  try {
    ({ rows } = await db.query(`SELECT type, ${COLUMNS.join(', ')} FROM ${await table(db, app)} WHERE app = $1 ORDER BY type`, [app]));
  } catch (e) {
    // a legacy-mode database that predates the columns: nothing declared, the stamp answers
    if (!/no such column|does not exist/i.test(e.message)) throw e;
  }
  return index(app, rows);
}

/** The site's declarations, cached for TTL_MS. `fresh` reloads. */
function formatsFor(app, { fresh = false } = {}) {
  const key = String(app);
  const hit = cache.get(key);
  if (hit && !fresh && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = load(key).catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

function clearFormats() { cache.clear(); }

// ---- reading and writing ------------------------------------------------------------------------

const toWire = (r) => Object.fromEntries([['type', r.type], ...COLUMNS.map(c => [WIRE[c], parseJson(r[c])])]);

async function listFormats(app) {
  const db = dmsDb();
  const { rows } = await db.query(`SELECT type, ${COLUMNS.join(', ')} FROM ${await table(db, app)} WHERE app = $1 ORDER BY type`, [app]);
  return rows.map(toWire);
}

/**
 * Make the site's rows equal to `rows` (the wire shape: `{ type, attributes, authVocabulary,
 * authRules, childRefs }`). A row equal to what is stored is not written; a stored key the payload
 * leaves out is removed, since the payload is everything the registry declares. Returns what changed.
 */
async function upsertFormats(app, rows) {
  if (typeof app !== 'string' || !/^[A-Za-z0-9_.-]{1,200}$/.test(app)) throw new Error('formats: app must be a site name');
  if (!Array.isArray(rows)) throw new Error('formats: expected an array of { type, attributes, authVocabulary, authRules, childRefs }');
  const seen = new Set();
  for (const r of rows) {
    if (!r || typeof r.type !== 'string' || !KEY.test(r.type)) throw new Error(`formats: "${r && r.type}" is not a format key (app+type)`);
    if (seen.has(r.type)) throw new Error(`formats: "${r.type}" is sent twice`);
    seen.add(r.type);
    for (const [col, wire] of Object.entries(WIRE)) {
      const v = r[wire];
      if (v != null && (typeof v !== 'object')) throw new Error(`formats: ${r.type}.${wire} must be an object, an array or null`);
      if (col === 'auth_rules' && v != null && (Array.isArray(v) || Object.values(v).some(x => !x || typeof x !== 'object' || !x.ops))) {
        throw new Error(`formats: ${r.type}.authRules must be { [kind]: { ops, … } }`);
      }
    }
  }
  const db = dmsDb();
  const T = await table(db, app);
  const { rows: stored } = await db.query(`SELECT type, ${COLUMNS.join(', ')} FROM ${T} WHERE app = $1`, [app]);
  const have = new Map(stored.map(r => [r.type, r]));
  const written = [], same = [];
  const now = db.type === 'postgres' ? 'NOW()' : "datetime('now')";
  for (const r of rows) {
    const want = Object.fromEntries(COLUMNS.map(c => [c, r[WIRE[c]] ?? null]));
    const cur = have.get(r.type);
    if (cur && COLUMNS.every(c => canonical(parseJson(cur[c])) === canonical(want[c]))) { same.push(r.type); continue; }
    const vals = COLUMNS.map(c => (want[c] == null ? null : JSON.stringify(want[c])));
    if (cur) {
      await db.query(`UPDATE ${T} SET attributes = $3, auth_vocabulary = $4, auth_rules = $5, child_refs = $6, updated_at = ${now}
                      WHERE app = $1 AND type = $2`, [app, r.type, ...vals]);
    } else {
      await db.query(`INSERT INTO ${T} (app, type, attributes, auth_vocabulary, auth_rules, child_refs) VALUES ($1, $2, $3, $4, $5, $6)`,
        [app, r.type, ...vals]);
    }
    written.push(r.type);
  }
  const removed = stored.map(r => r.type).filter(t => !seen.has(t));
  for (const t of removed) await db.query(`DELETE FROM ${T} WHERE app = $1 AND type = $2`, [app, t]);
  if (written.length || removed.length) {
    cache.delete(app);
    require('./owners').clearSnapshots();   // the app snapshot carries these
  }
  return { app, written, removed, same: same.length };
}

// ---- the route ----------------------------------------------------------------------------------

/** GET /dms/formats?dms_app=<app>: the site's stored rows. Declarations are the client bundle's own data, so open. */
function registerFormatRoutes(app) {
  app.get('/dms/formats', async (req, res) => {
    try {
      const site = requestApp(req);
      if (!site) return res.status(400).json({ error: 'name the site: ?dms_app=<app>' });
      res.json({ app: site, formats: await listFormats(site) });
    } catch (e) {
      console.error('[formats]', e.message);
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { formatsFor, clearFormats, listFormats, upsertFormats, canonical, registerFormatRoutes, TTL_MS };
