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
 * It builds the snapshot BOTH implementations then decide from. `readAuth.decideFrom` hands this
 * exact object to `rowSourceAuth.decideFromRow` under `DMS_UDA_GATE=row`, and `allowViewRead` hands
 * it to `readsRow`; `rowSourceAuth.decideFromRow` is documented as needing no database access
 * precisely because the snapshot already holds both levels of the chain. So the builder was never
 * kind auth's — it was shared code sitting inside a kind-auth file, which is why that file imported
 * `rowAuthCaps.js` and `legacyVerbs.js` and made both look like kind-auth dependencies.
 *
 * Split out 2026-11-02 so the folders mean what they say: `kindAuth/` holds decisions, and what
 * both sides need sits in `routes/auth/`. Nothing here judges anything — every function returns
 * data. `unionAuthPermissions` and `readNamedPattern` moved up from `kindAuth/sourceAuth.js` for
 * the same reason: a pure grant union and a pattern row read are not decisions either.
 *
 * It does, however, import three modules from `rowAuth/` — see the note at those requires.
 *
 * ---------------------------------------------------------------------------
 * THE `auth` COLUMN IS THE SYSTEM OF RECORD, `data` ONLY THE FALLBACK — the same precedence
 * `rowAuth.rawAuthOf` applies everywhere else, and the reason `ownAuthOf` exists here rather than
 * each caller reading `data` for itself.
 */
const { getDb, loadConfig } = require('../../db');
const { resolveAuthPermissions } = require('./auth');
// ⚠ A SHARED MODULE REACHING INTO `rowAuth/`, deliberately. The expansion below is row auth's
// work, done here because here is where the rows are read — once per snapshot rather than once per
// decision. Kind auth is unaffected by it: `isUserAuthed` matches verbs BY NAME and cannot expand
// anything, and expansion is additive (the original strings survive), so a pre-expanded snapshot
// answers a kind-auth question exactly as a raw one would. Each expansion site below says which
// row-gate bug it fixes; none of them is for kind auth's benefit.
const { vocabularyOf, impliesMaps } = require('./rowAuth/authVocabulary');
const { expandLevel } = require('./rowAuth/expandLevel');
const { rowAuthCaps } = require('./rowAuth/rowAuthCaps');
const { resolveTable } = require('../../db/table-resolver');
const { dmsMainTable, getSiteSources } = require('../uda/utils');

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

async function loadExternal(env) {
    const db = getDb(env);
    const pg = db.type === 'postgres';
    const { rows } = await db.query(`SELECT source_id, auth_permissions AS ap FROM ${pg ? 'data_manager.sources' : 'sources'}`);
    const { rows: views } = await db.query(`SELECT view_id, source_id FROM ${pg ? 'data_manager.views' : 'views'}`);
    return {
        app: null,
        sources: new Map(rows.map(r => {
            const { view, ...ap } = parseJson(r.ap) || {};
            // A source's own grants must be EXPANDED too, or `view-source` never becomes the
            // structural `read` the row gate asks for. An external source belongs to no DMS
            // pattern, so there is no vocabulary to expand against and the legacy table is all
            // there is — `expandLevel(.., null)`.
            return [+r.source_id, { ap: expandLevel(ap, null), patternAP: {}, view }];
        })),
        viewSource: new Map(views.map(v => [+v.view_id, +v.source_id])),
    };
}

async function loadInternal(env, subdomain) {
    const [app] = env.split('+');
    const { db, splitMode } = getDmsDb();
    const tbl = await dmsMainTable(db, app, splitMode);
    // THE `auth` COLUMN IS THE SYSTEM OF RECORD, `data` ONLY THE FALLBACK — the same precedence
    // `rowAuth.rawAuthOf` applies everywhere else. This path used to read `data` alone, so a grant
    // written to the column and not mirrored into `data` was invisible here: no error, and callers
    // holding `*` unaffected, which is the shape that hides itself. On `rowauth-test` the two agree
    // today only because the backfill copied one into the other.
    const authCol = await authColExpr(db, app, splitMode);
    const { rows } = await db.query(
        `SELECT id, ${authCol} AS authcol, data->>'auth_permissions' AS ap, data->'views' AS views
           FROM ${tbl} WHERE app = $1 AND type LIKE '%:source'`,
        [app]);
    const { rows: patterns } = await db.query(
        `SELECT id, ${authCol} AS authcol, data->>'authPermissions' AS ap, data->'authVocabulary' AS av
           FROM ${tbl}
         WHERE app = $1 AND type LIKE '%:pattern' AND data->>'pattern_type' = 'datasets'`,
        [app]);
    const owners = new Map(); // source id → resolved grants of each datasets pattern listing it
    for (const p of patterns) {
        const refs = await getSiteSources({ db, app, pattern_ids: [p.id], splitMode });
        // Expand each pattern's grants against ITS OWN vocabulary before unioning, exactly as
        // `rowSourceAuth.internalSourceChain` does. Without this a named verb never becomes a
        // structural one: `public: ['view-page']` stayed a bare string, never became `read`, and a
        // deliberate public grant denied the public while `*` holders sailed through.
        const maps = impliesMaps(vocabularyOf({ auth: p.authcol, data: { authVocabulary: p.av } }));
        const grants = expandLevel(ownAuthOf(p, 'authPermissions', subdomain), maps);
        for (const r of refs) {
            const id = +(r && r.id);
            if (!owners.has(id)) owners.set(id, []);
            owners.get(id).push({ grants, maps });
        }
    }
    // A source has no vocabulary of its own — its verbs are the datasets pattern's. Union the maps
    // of every pattern that lists it, so the SOURCE's own grants expand against the same vocabulary
    // its pattern's do. Before this the source level stayed unexpanded and `view-source` on a
    // source never became `read`.
    const unionMaps = (list) => {
        const maps = list.map(o => o.maps).filter(Boolean);
        if (!maps.length) return null;
        const out = { self: {}, descendants: {}, flat: {} };
        for (const m of maps) for (const scope of ['self', 'descendants', 'flat']) {
            for (const [verb, implies] of Object.entries(m[scope] || {})) {
                out[scope][verb] = [...new Set([...(out[scope][verb] || []), ...implies])];
            }
        }
        return out;
    };
    const sources = new Map();
    const viewSource = new Map();
    for (const r of rows) {
        const owning = owners.get(+r.id);
        const { view, ...ap } = ownAuthOf(r, 'auth_permissions', subdomain) || {};
        sources.set(+r.id, {
            ap: expandLevel(ap, owning ? unionMaps(owning) : null),
            view,
            patternAP: owning ? unionAuthPermissions(owning.map(o => o.grants)) : {},
            orphan: !owning,
        });
        for (const v of parseJson(r.views) || []) if (v && v.id != null) viewSource.set(+v.id, +r.id);
    }
    return { app, sources, viewSource };
}

function snapshot(env, subdomain = '', { fresh = false } = {}) {
    const key = `${env}|${subdomain}`;
    const hit = snapshots.get(key);
    if (hit && !fresh && Date.now() - hit.at < SNAPSHOT_TTL_MS) return hit.promise;
    const promise = (isDmsEnv(env) ? loadInternal(env, subdomain) : loadExternal(env))
        .catch((e) => { snapshots.delete(key); throw e; });
    snapshots.set(key, { at: Date.now(), promise });
    return promise;
}

// The named datasets pattern's grants, for external sources: { app, ap } or null (unusable name). Kept as
// long as a snapshot.
const namedPatterns = new Map(); // `${app}/${patternId}|${subdomain}` → { at, promise }
function namedPattern(patternRef, subdomain = '') {
    if (!patternRef) return Promise.resolve(null);
    const key = `${patternRef.app}/${patternRef.patternId}|${subdomain}`;
    const hit = namedPatterns.get(key);
    if (hit && Date.now() - hit.at < SNAPSHOT_TTL_MS) return hit.promise;
    // EXPAND the named pattern's grants against its own vocabulary, exactly as `loadInternal` does
    // for the patterns it finds itself. `readNamedPattern` lives in sourceAuth.js (kind auth, left
    // untouched) and returns the raw strings, so the vocabulary is read here. Without this the
    // pattern lends `view-source` as a bare string and the row gate's `read` question never sees
    // it — the external-source half of the same defect `loadInternal`'s comment describes.
    const promise = readNamedPattern(patternRef, subdomain).then(async (p) => {
        if (!p.ok) return null;
        let maps = null;
        try {
            const { db, splitMode } = getDmsDb();
            const tbl = await dmsMainTable(db, p.app, splitMode);
            const authCol = await authColExpr(db, p.app, splitMode);
            const { rows } = await db.query(
                `SELECT ${authCol} AS authcol, data->'authVocabulary' AS av
                   FROM ${tbl} WHERE id = $1 AND app = $2`, [+patternRef.patternId, p.app]);
            if (rows.length) {
                maps = impliesMaps(vocabularyOf({ auth: rows[0].authcol, data: { authVocabulary: rows[0].av } }));
            }
        } catch { /* no vocabulary: expandLevel falls back to the legacy table */ }
        return { app: p.app, ap: expandLevel(p.ap, maps) };
    });
    namedPatterns.set(key, { at: Date.now(), promise });
    if (namedPatterns.size > 5000) namedPatterns.clear();
    return promise;
}

/** Forget cached grants (tests; a grant write could call it too). */
function clearReadSnapshots() { snapshots.clear(); namedPatterns.clear(); }

module.exports = {
    SNAPSHOT_TTL_MS, isDmsEnv, parseJson, getDmsDb,
    expandLevel, authColExpr, ownAuthOf,
    unionAuthPermissions, readNamedPattern,
    snapshot, namedPattern, clearReadSnapshots,
};
