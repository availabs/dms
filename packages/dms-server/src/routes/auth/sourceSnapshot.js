'use strict';

/**
 * THE DATASETS READ SNAPSHOT — shared infrastructure, not a decision.
 *
 * Every env's grants are read ONCE into a snapshot — each source's own grants, the owning
 * patterns' grants for internal sources, and view → source — and kept for `SNAPSHOT_TTL_MS`, so a
 * catalog list or a data page costs no extra queries per row. A grant change shows up after that.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS SHARED, AND WHY IT USED TO LIVE IN `kindAuth/readAuth.js`
 *
 * It builds the snapshot the decision then reads. `sourceReads.js` hands this exact object to
 * `kindAuth/readAuth.js`'s `sourceDecision`, which is documented as needing no database access
 * precisely because the snapshot already holds everything. So the builder was never the
 * implementation's — it was shared code sitting inside a kind-auth file, which is why that file
 * imported the column probe and the verb machinery and made both look like kind-auth dependencies.
 *
 * Split out 2026-11-02 so the folders mean what they say: `kindAuth/` holds decisions, and what the
 * surface around them needs sits in `routes/auth/`. Nothing here judges anything — every function
 * returns data. `unionAuthPermissions` and `readNamedPattern` moved up from `kindAuth/sourceAuth.js`
 * for the same reason: a pure grant union and a pattern row read are not decisions either.
 *
 * ---------------------------------------------------------------------------
 * WHAT ROW AUTH TOOK WITH IT (2026-11-04)
 *
 * Each entry used to carry TWO resolved grant objects: `ap` for kind auth and `merged` — the whole
 * `parent_id` chain, resolved by `createResolver` and clamped by `mergeAuthChain` — for the row
 * gate. They could not be one object, because merging expands `'*'` into the five structural verbs
 * at resolve time (rule 3 has to clamp a child's `['*']` down to what its parent allowed), and kind
 * auth matches permission strings BY NAME, so handed that object it saw no `'*'` and no
 * `view-source` and refused everyone. With one implementation there is one representation, and the
 * resolver, the merge and the external env's synthetic chain row all went with the second one.
 *
 * ---------------------------------------------------------------------------
 * THE `auth` COLUMN IS THE SYSTEM OF RECORD, `data` ONLY THE FALLBACK, which is why `ownAuthOf`
 * exists here rather than each caller reading `data` for itself.
 */
const { getDb, loadConfig } = require('../../db');
const { resolveAuthPermissions } = require('./auth');
// EXPANSION IS STILL NEEDED, and not for the reason it was added. It is additive — the original
// permission strings survive — so it never changed a name match. What it also does is FLATTEN
// SCOPED grants: a vocabulary may declare `self:` / `descendants:` levels, and a grant written
// under one of those is invisible to `isUserAuthed`, which looks at `groups` / `users` and nothing
// else. Done here, once per snapshot, rather than once per decision.
const { vocabularyOf, impliesMaps, expandWithVocabulary } = require('./authVocabulary');
const { rowAuthCaps } = require('../dms/rowAuthCaps');
const { resolveTable } = require('../../db/table-resolver');
const { dmsMainTable } = require('../uda/utils');
const { getInstance, getParent } = require('#db/type-utils.js');
const { envRowForPgEnv } = require('./sourceAncestry');

const SNAPSHOT_TTL_MS = 30 * 1000;

const isDmsEnv = (env) => typeof env === 'string' && env.includes('+');

const parseJson = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
    return v;
};

function getDmsDb() {
    const dbEnv = process.env.DMS_DB_ENV || 'dms-sqlite';
    let splitMode;
    try { splitMode = loadConfig(dbEnv).splitMode; } catch { /* default below */ }
    return { db: getDb(dbEnv), splitMode: splitMode || process.env.DMS_SPLIT_MODE || 'legacy' };
}

/** Union a list of grant objects. Pure; no decision, no implementation knowledge. */
function unionAuthPermissions(list) {
    const out = { groups: {}, users: {} };
    const asList = p => (Array.isArray(p) ? p : p ? [p] : []);
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
 * The datasets pattern a request NAMES (`dms_pattern`), read from the database.
 * `{ ok, app, ap }` — grants as stored, resolved for the subdomain. Expansion is the caller's.
 */
async function readNamedPattern({ app, patternId }, subdomain) {
    if (!app || !patternId) return { ok: false, reason: 'no pattern named' };
    try {
        const { db, splitMode } = getDmsDb();
        const tbl = await dmsMainTable(db, app, splitMode);
        const { rows } = await db.query(
            `SELECT data->>'authPermissions' AS ap, data->>'pattern_type' AS pattern_type
             FROM ${tbl} WHERE id = $1 AND app = $2 AND type LIKE '%:pattern'`,
            [+patternId, app]
        );
        if (!rows.length) return { ok: false, reason: `pattern ${app}/${patternId} not found` };
        if (rows[0].pattern_type !== 'datasets') return { ok: false, reason: `pattern ${patternId} is not a datasets pattern` };
        return { ok: true, app, ap: resolveAuthPermissions(rows[0].ap, subdomain) };
    } catch (e) {
        return { ok: false, reason: `pattern query failed: ${e.message}` };
    }
}


/** `auth` when the migrated column exists, else the literal NULL — same probe the dms side uses. */
async function authColExpr(db, app, splitMode) {
    try {
        const t = resolveTable(app, '', db.type, splitMode);
        return (await rowAuthCaps(db, t.schema, t.table, db.type)).auth ? 'auth' : 'NULL';
    } catch { return 'NULL'; }
}

/**
 * `parent_id`, or `NULL` on a table that has not been migrated — the same probe `authColExpr` uses,
 * for the same reason. Selecting a column that is not there does not degrade the query, it THROWS,
 * and a throw here takes the whole snapshot down and refuses every read in the env. Found exactly
 * that way: 5 of `test-read-auth.js`'s cases went red with `no such column: parent_id` the moment
 * the env lookup started following parentage.
 */
async function parentColExpr(db, app, splitMode) {
    try {
        const t = resolveTable(app, '', db.type, splitMode);
        return (await rowAuthCaps(db, t.schema, t.table, db.type)).parentId ? 'parent_id' : 'NULL';
    } catch { return 'NULL'; }
}

/**
 * One row's OWN grants, column-first.
 *
 * Mirrors `rowAuth.rawAuthOf`: the `auth` column wins, but only when it NAMES something — a column
 * holding nothing but declarations (`vocabulary`, `childRefs`, `view`) is an absence, not a
 * statement, and must fall through to `data` where every client still writes. `view` rides back out
 * with the grants so the caller can read it; it is stripped before anything treats it as a principal.
 */
function ownAuthOf(row, dataKey, subdomain = '') {
    const col = typeof row.authcol === 'string' ? parseJson(row.authcol) : row.authcol;
    let view, grants = null;
    if (col) {
        const { vocabulary, childRefs, view: v, ...rest } = col;
        view = v;
        const resolved = resolveAuthPermissions(rest, subdomain) || {};
        // An EXPLICITLY empty `{groups:{},users:{}}` is a statement (someone cleared the grants);
        // a column holding only declarations names nothing and falls through, as rawAuthOf does.
        if (resolved.groups || resolved.users) grants = resolved;
    }
    if (!grants) {
        grants = resolveAuthPermissions(row[dataKey] !== undefined ? row[dataKey] : row.ap, subdomain) || {};
    }
    return view === undefined ? grants : { ...grants, view };
}

// ---- Snapshots ------------------------------------------------------------------------------------------

const snapshots = new Map(); // `${env}|${subdomain}` → { at, promise }

const DMS_ROW_COLS = (authCol, parentCol) => `id, type, ${parentCol} AS parent_id, ${authCol} AS auth, data`;

async function loadExternal(env, app, subdomain = '') {
    const db = getDb(env);
    const pg = db.type === 'postgres';
    const { rows } = await db.query(`SELECT source_id, auth_permissions AS ap FROM ${pg ? 'data_manager.sources' : 'sources'}`);
    const { rows: views } = await db.query(`SELECT view_id, source_id FROM ${pg ? 'data_manager.views' : 'views'}`);
    // A source's own grants must be EXPANDED, or a grant written under a `self:` / `descendants:`
    // scope is invisible to `isUserAuthed`, which reads `groups` / `users` and nothing else. The
    // vocabulary is its ENV's — the `:dmsenv` row that declares for this pgEnv
    // (`scripts/ensure-pgenv-rows.js`), which is the same declaration an INTERNAL source uses
    // (admin.format.js `dmsEnvFormat`). One vocabulary, both populations.
    //
    // `app` is a LOCATOR here and nothing else: per-app split mode puts env rows in an app-scoped
    // table, so finding one needs an app name. It selects a table and confers no grant — the
    // distinction `./sourceAncestry.js` exists to hold. A null vocabulary (no env row yet) expands
    // nothing, so named verbs are checked by name and nothing silently widens.
    const envRow = app ? await envRowForPgEnv(env, app) : null;
    const maps = envRow ? envRow.maps : null;
    const grantsOf = (r) => { const { view, ...ap } = parseJson(r.ap) || {}; return { view, ap }; };

    return {
        app: null,
        sources: new Map(rows.map(r => {
            const { view, ap } = grantsOf(r);
            return [+r.source_id, { ap: expandWithVocabulary(ap, maps), patternAP: {}, view, maps }];
        })),
        viewSource: new Map(views.map(v => [+v.view_id, +v.source_id])),
    };
}

async function loadInternal(env, subdomain) {
    const [app] = env.split('+');
    const { db, splitMode } = getDmsDb();
    const tbl = await dmsMainTable(db, app, splitMode);
    // THE `auth` COLUMN IS THE SYSTEM OF RECORD, `data` ONLY THE FALLBACK. This path used to read `data` alone, so a grant
    // written to the column and not mirrored into `data` was invisible here: no error, and callers
    // holding `*` unaffected, which is the shape that hides itself.
    const authCol = await authColExpr(db, app, splitMode);
    const parentCol = await parentColExpr(db, app, splitMode);
    const cols = DMS_ROW_COLS(authCol, parentCol);
    const { rows } = await db.query(
        `SELECT ${cols} FROM ${tbl} WHERE app = $1 AND type LIKE '%:source'`, [app]);

    // ============================================================================================
    // A SOURCE'S GRANTS ARE ITS OWN, AND THAT IS THE WHOLE RULE.
    //
    // Until 2026-11-03 this function built a source's grants by hand: it unioned the grants of
    // every datasets PATTERN that listed the source, unioned their vocabularies, and expanded the
    // source's own grants against the result. That was necessary while a pattern was the only row
    // carrying a vocabulary — and it was a second implementation of inheritance, for one row kind.
    //
    // Slices D and K removed the pattern from the chain, which left this reading a source's OWN
    // grants and nothing else. Measured against `createGate().judge(rows, 'read')` on
    // `rowauth-test`: 71 sources × 4 principals, **284/284 identical**. The special path was no
    // longer deciding anything different — it was just deciding it separately.
    //
    // ⚠ NOTHING ABOVE A SOURCE GRANTS TODAY, BY DECLARATION (`admin.format.js`,
    // `permissionDomain.self: []`), which is why reading a source's own `auth` is the whole answer.
    // That is a property of the data, not of the code: give an env grants and this stops inheriting
    // them, silently. Until 2026-11-04 the row gate's `createResolver` walked the chain here and
    // would have picked them up; it went with row auth, because only row auth read what it
    // produced. Restoring inheritance means resolving the env row's grants here, not reviving a
    // second judge.
    //
    // WHAT STAYS IS THE CACHE, which is what this file is actually for: an env's grants are read
    // once per 30s rather than once per decision, because a catalog listing covers thousands of
    // sources.
    // ============================================================================================

    // The vocabulary a source's verbs are read in — its ENV's, found by `parent_id` where the
    // column exists and by the type path otherwise.
    const { rows: envs } = await db.query(
        `SELECT id, type, ${authCol} AS auth, data FROM ${tbl} WHERE app = $1 AND type LIKE '%:dmsenv'`, [app]);
    const envMaps = new Map(), envByName = new Map();
    for (const e of envs) {
        const m = impliesMaps(vocabularyOf({ auth: e.auth, data: parseJson(e.data) }));
        if (!m) continue;
        envMaps.set(String(e.id), m);
        const name = getInstance(e.type || '');
        if (name) envByName.set(name, m);
    }
    const mapsForSource = (r) =>
        (r.parent_id != null && envMaps.get(String(r.parent_id)))
        || envByName.get(getParent(r.type || '')) || null;

    const sources = new Map();
    const viewSource = new Map();
    for (const r of rows) {
        // `view` is a narrowing flag the source carries beside its grants, not a principal —
        // `ownAuthOf` strips it out and hands it back separately. It reads the column under the
        // name the old projection gave it (`authcol`), so the row is handed over in that shape
        // rather than renaming it at the query: the resolver wants `auth`, and both want the same
        // column. Losing this silently dropped `view: false` on every source.
        const data = parseJson(r.data) || {};
        const own = ownAuthOf({ authcol: r.auth, ap: data.auth_permissions }, 'auth_permissions', subdomain) || {};
        const { view, ...ap } = own;
        const maps = mapsForSource(r);
        sources.set(+r.id, {
            ap: expandWithVocabulary(ap, maps),
            view,
            maps,
            // NO PATTERN LEVEL. Kept as an empty object so the decision functions keep one shape
            // for internal and external sources.
            patternAP: {},
        });
        for (const v of (data.views || [])) if (v && v.id != null) viewSource.set(+v.id, +r.id);
    }
    return { app, sources, viewSource };
}

/**
 * `app` is read only for an EXTERNAL env, to locate its `:dmsenv` row, and it is part of the cache
 * key because two apps may locate different env rows for the same pgEnv. An internal env carries
 * its app in the env string already, so it ignores the argument.
 */
function snapshot(env, subdomain = '', { fresh = false, app = null } = {}) {
    const key = `${env}|${subdomain}|${isDmsEnv(env) ? '' : (app || '')}`;
    const hit = snapshots.get(key);
    if (hit && !fresh && Date.now() - hit.at < SNAPSHOT_TTL_MS) return hit.promise;
    const promise = (isDmsEnv(env) ? loadInternal(env, subdomain) : loadExternal(env, app, subdomain))
        .catch((e) => { snapshots.delete(key); throw e; });
    snapshots.set(key, { at: Date.now(), promise });
    return promise;
}

// The named datasets pattern's grants, for external sources: { app, ap } or null (unusable name). Kept as
// long as a snapshot.
// `namedPattern` DELETED 2026-11-03 — a cache, and a database round-trip per uncached read, whose
// result had become unused. It fetched the request-named datasets pattern's grants and vocabulary;
// pattern lending is gone (Slice K), so `.ap` went with it, and an external source's vocabulary now
// comes from its `:dmsenv` row inside `loadExternal`, so `.maps` went too. The last field anything
// read off it was `.app` — which the caller already holds as `patternRef.app`. `readNamedPattern`
// stays: kind auth's PATTERN-level decisions still ask it about a pattern's own grants.

/** Forget cached grants (tests; a grant write could call it too). */
function clearReadSnapshots() { snapshots.clear(); }

module.exports = {
    isDmsEnv, parseJson, getDmsDb,
    expandWithVocabulary, authColExpr, ownAuthOf,
    unionAuthPermissions, readNamedPattern,
    snapshot, clearReadSnapshots,
};
