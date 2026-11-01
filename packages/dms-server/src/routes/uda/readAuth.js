'use strict';

/**
 * Who may read a source (planning/tasks/current/permissions-ds-read-visibility.md, owner 2026-10-26).
 *
 * The rule is the write path's (sourceAuth.js decideSource): pattern ⊕ source grants, the lenient rule (no
 * permission set → open), `${app} Admin` passes. Reading needs `view-source` or any source permission that
 * implies it (READ_PERMISSIONS). Internal sources are judged with the datasets patterns that list them (none
 * ⇒ deny, as for writes). External sources: the datasets pattern the request names (`dms_pattern`, sent by
 * the datasets pattern's Falcor model: sourceAuth.js requestPatternRef) lends its grants, accepted as writes
 * accept it (an existing datasets pattern: readNamedPattern); no pattern named → the source's own grants only.
 * PLACEHOLDER (owner, 2026-10-26): the client picks the pattern, so a caller can name whichever datasets
 * pattern grants the most. Better than no inheritance, not a boundary; see the read-visibility task, "Open".
 *
 * Rollout (`DMS_READ_AUTH_MODE`, apart from the write modes):
 *   - `legacy`  — nothing is checked or hidden.
 *   - `log`     — (default) nothing is refused; every read `enforce` would refuse is logged once per
 *                 user / source / kind for ten minutes (`[read-auth] would-deny …`), so a site's public
 *                 pages that would go blank show up before anyone enforces. Secret keys in `statistics`
 *                 are already dropped for non-editors (nothing reads them).
 *   - `enforce` — refused reads return nothing, catalog lists hold only readable sources, and
 *                 `auth_permissions` is trimmed to the caller's own entries for non-editors.
 *
 * Each env's grants are read once into a snapshot (every source's own grants, the owning patterns' grants
 * for internal sources, view → source) and kept for SNAPSHOT_TTL_MS, so a list or a data page costs no
 * extra queries per row. A grant change shows up after that.
 */
const { getDb } = require('../../db');
const { resolveAuthPermissions } = require('../dms/auth');
const { mergeAuthPermissions, unionAuthPermissions, isUserAuthed, isAppAdmin, readNamedPattern } = require('./sourceAuth');
const { vocabularyOf, impliesMaps, expandWithVocabulary } = require('../dms/authVocabulary');
const { expandAuth } = require('../dms/legacyVerbs');
const { rowAuthCaps } = require('../dms/rowAuthCaps');
const { resolveTable } = require('../../db/table-resolver');

const expandLevel = (auth, maps) => (maps ? expandWithVocabulary(auth, maps) : expandAuth(auth));

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
const { dmsMainTable, getSiteSources } = require('./utils');
const { loadConfig } = require('../../db');

// KIND AUTH ONLY. The row gate does not use this: it asks the one structural question (`read`),
// which every verb that should confer a read already declares in its `implies`
// (rowSourceAuth.readsRow, Phase 4(a) of permission-domain-single-source.md). This list is a
// hand-maintained restatement of the same thing for `isUserAuthed`, which matches by NAME and
// cannot expand anything — and it is wrong in exactly the way that motivated the change:
// `download-source`, `manage-downloads` and `view-source-api` confer no row access, yet appear
// here, so under kind auth a download grant still opens the source's metadata. It dies with kind
// auth; do not add to it.
const READ_PERMISSIONS = [
    'view-source', 'download-source', 'update-source', 'edit-source-data', 'create-view',
    'manage-downloads', 'view-source-api', 'delete-source', 'edit-source-permissions',
];
const GRANT_EDITORS = ['edit-source-permissions', 'update-source'];
const SECRET_EDITORS = ['update-source'];
const SNAPSHOT_TTL_MS = 30 * 1000;
const LOG_DEDUPE_MS = 10 * 60 * 1000;
// The name a trimmed grant list carries for the entries it leaves out: a group nobody is in, so the
// client's lenient rule doesn't read a trimmed list as "no grants set".
const HIDDEN_ENTRY = '(hidden)';
const SECRET_KEY = /(^|_)(secret|token)$/i;

function readMode({ logOnly = false } = {}) {
    const m = String(process.env.DMS_READ_AUTH_MODE || 'log').toLowerCase();
    const mode = ['legacy', 'log', 'enforce'].includes(m) ? m : 'log';
    // `logOnly`: a read path exempt from `enforce` (tiles), which still logs would-denies.
    return logOnly && mode === 'enforce' ? 'log' : mode;
}

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

// ---- Decisions ------------------------------------------------------------------------------------------

// `named`: the request's datasets pattern ({ app, ap }), used for external sources only (internal sources
// find their own patterns), as sourceAuth.js decideSource does.
function decideFrom(snap, sourceId, user, reqPermissions = READ_PERMISSIONS, named = null) {
    // ROW auth (./rowSourceAuth), behind DMS_UDA_GATE. Kind auth below is untouched and stays
    // live by default; task 7 is what deletes it. See planning/tasks/current/row-auth-uda.md.
    if (require('./rowSourceAuth').udaGate() === 'row') {
        return require('./rowSourceAuth').decideFromRow(snap, sourceId, user, reqPermissions, named);
    }
    const s = snap.sources.get(+sourceId);
    if (!s) return { allow: false, reason: 'source not found' };
    if (s.orphan) return { allow: false, reason: `source ${sourceId} is in no datasets pattern of ${snap.app}` };
    const external = snap.app == null;
    const app = external ? (named && named.app) : snap.app;
    const patternAP = external ? ((named && named.ap) || {}) : s.patternAP;
    if (isAppAdmin(user, app)) return { allow: true, reason: `${app} Admin` };
    const allow = isUserAuthed({ user, reqPermissions, authPermissions: mergeAuthPermissions(patternAP, s.ap) });
    return { allow, reason: allow ? 'granted' : `missing ${reqPermissions[0]}` };
}

/**
 * MAY `user` READ THIS SOURCE?
 *
 * Owner's rule (2026-10-30): **when a source states nothing at all — no `auth` column, no `data`
 * auth attributes — read is true and edit is false.** Grants otherwise work exactly as before; this
 * is a rule about the ABSENCE of grants, not a replacement for them. DAMA scopes an upload to its
 * creator with real grants on the source, and those keep working: a stated source is judged as it
 * always was, so creator-only stays creator-only and `groups: { public: [] }` still revokes.
 *
 * What changed is that a datasets PATTERN's grants can no longer DENY a read, only lend one. A
 * pattern granting `public: ['view-page']` used to gate every source beneath it, and because the
 * named verb was never expanded into the structural `read`, a grant written to open a source to the
 * public silently closed it — while `*` holders saw nothing wrong. `view-page` was never meant to be
 * the verb that opens a source.
 *
 * A source is narrowed only by something ON THE SOURCE:
 *   `auth: { view: false }`  → its own grantees only; no pattern may lend past it
 *   its own grants           → they decide, with the pattern still free to lend
 *
 * Internal and external sources alike. WRITES are untouched and still resolve the whole chain.
 */
function decideRead(snap, sourceId, user, named = null, reqPermissions = READ_PERMISSIONS) {
    const s = snap.sources.get(+sourceId);
    if (!s) return { allow: false, reason: 'source not found' };
    const external = snap.app == null;
    const app = external ? (named && named.app) : snap.app;
    if (app && isAppAdmin(user, app)) return { allow: true, reason: `${app} Admin` };

    const own = s.ap || {};
    const stated = Object.keys(own.groups || {}).length > 0 || Object.keys(own.users || {}).length > 0;

    if (!stated && s.view !== false) {
        return { allow: true, reason: 'nothing stated — read is the default' };
    }
    // `view: false` with nothing of its own means NO ONE, not everyone: the lenient "nothing set →
    // open" rule must not swallow an explicit narrowing.
    if (!stated) return { allow: false, reason: 'view: false' };

    // Stated: judged as always. `view: false` additionally refuses the pattern's lending.
    const patternAP = s.view === false ? {} : (external ? ((named && named.ap) || {}) : s.patternAP);
    // ROW gate: ONE structural question. Reading is what the verbs' `implies` already say it is,
    // so there is no list to keep in step — see rowSourceAuth.readsRow.
    if (require('./rowSourceAuth').udaGate() === 'row') {
        const v = require('./rowSourceAuth').readsRow(patternAP, own, user, app);
        return { allow: v.allow, reason: v.allow ? 'granted' : 'missing read' };
    }
    const allow = isUserAuthed({ user, reqPermissions, authPermissions: mergeAuthPermissions(patternAP, own) });
    return { allow, reason: allow ? 'granted' : `missing ${reqPermissions[0]}` };
}

const logged = new Map();
function logWouldDeny(kind, env, sourceId, user, reason) {
    const who = (user && (user.id ?? user.email)) ?? 'anon';
    const key = `${kind}|${env}|${sourceId}|${who}`;
    const now = Date.now();
    if (now - (logged.get(key) || 0) < LOG_DEDUPE_MS) return;
    logged.set(key, now);
    if (logged.size > 50000) logged.clear();
    console.warn(`[read-auth] would-deny ${kind} ${env}/${sourceId} user=${who} ` +
        `groups=${((user && user.groups) || []).join('|')} reason=${reason}`);
}

/**
 * Whether `user` may read `sourceId` on `env`, under the mode: `legacy` always, `log` always (logging a
 * would-deny), `enforce` as decided. A failed grant lookup denies under `enforce` and logs under `log`.
 */
async function allowSourceRead({ env, sourceId, user, subdomain = '', patternRef = null, kind = 'source', logOnly = false }) {
    const mode = readMode({ logOnly });
    if (mode === 'legacy') return true;
    let d;
    try { d = decideRead(await snapshot(env, subdomain), sourceId, user, await namedPattern(patternRef, subdomain)); }
    catch (e) { d = { allow: false, reason: `grant lookup failed: ${e.message}` }; }
    if (d.allow) return true;
    if (mode === 'log') { logWouldDeny(kind, env, sourceId, user, d.reason); return true; }
    return false;
}

/** The source a view belongs to (null when not found, after one refresh of the snapshot). */
async function sourceOfView(env, viewId, subdomain = '') {
    let snap = await snapshot(env, subdomain);
    if (!snap.viewSource.has(+viewId)) snap = await snapshot(env, subdomain, { fresh: true });
    return snap.viewSource.get(+viewId) ?? null;
}

/** allowSourceRead for the source a view belongs to. An unknown view denies under `enforce`. */
async function allowViewRead({ env, viewId, user, subdomain = '', patternRef = null, kind = 'view', logOnly = false }) {
    const mode = readMode({ logOnly });
    if (mode === 'legacy') return true;
    let sourceId;
    try { sourceId = await sourceOfView(env, viewId, subdomain); }
    catch (e) { sourceId = null; }
    if (sourceId == null) {
        if (mode === 'log') { logWouldDeny(kind, env, `view:${viewId}`, user, 'view not found'); return true; }
        return false;
    }
    return allowSourceRead({ env, sourceId, user, subdomain, patternRef, kind, logOnly });
}

/** The ids of `sourceIds` the user may read, in order (all of them unless `enforce`). */
async function filterReadableSources({ env, sourceIds, user, subdomain = '', patternRef = null, kind = 'list' }) {
    const mode = readMode();
    if (mode === 'legacy') return sourceIds;
    const out = [];
    for (const id of sourceIds) {
        if (await allowSourceRead({ env, sourceId: id, user, subdomain, patternRef, kind })) out.push(id);
    }
    return out;
}

/** Whether `user` holds one of `perms` on the source itself (no mode: for what a reply carries). */
async function holdsOnSource({ env, sourceId, user, subdomain = '', patternRef = null, perms }) {
    try { return decideFrom(await snapshot(env, subdomain), sourceId, user, perms, await namedPattern(patternRef, subdomain)).allow; }
    catch { return false; }
}

// ---- What a source row carries ------------------------------------------------------------------------

/** `auth_permissions` with only the entries naming the user or their groups, plus HIDDEN_ENTRY when any were left out. */
function trimGrants(raw, user) {
    const ap = parseJson(raw);
    if (!ap || typeof ap !== 'object') return raw;
    const mine = (map, keys) => Object.fromEntries(Object.entries(map || {}).filter(([k]) => keys.includes(String(k))));
    const groups = mine(ap.groups, [...((user && user.groups) || []), 'public']);
    const users = mine(ap.users, user && user.id != null ? [String(user.id)] : []);
    const hidden = Object.keys(ap.groups || {}).length + Object.keys(ap.users || {}).length
        > Object.keys(groups).length + Object.keys(users).length;
    const out = { groups: hidden ? { ...groups, [HIDDEN_ENTRY]: [] } : groups, users };
    return typeof raw === 'string' ? JSON.stringify(out) : out;
}

/** `statistics` without keys that hold secrets (`webhook_secret`, `*_token`), at any depth. */
function dropSecrets(raw) {
    const stats = parseJson(raw);
    if (!stats || typeof stats !== 'object') return raw;
    const strip = (o) => Array.isArray(o) ? o.map(strip)
        : o && typeof o === 'object'
            ? Object.fromEntries(Object.entries(o).filter(([k]) => !SECRET_KEY.test(k)).map(([k, v]) => [k, strip(v)]))
            : o;
    const out = strip(stats);
    return typeof raw === 'string' ? JSON.stringify(out) : out;
}

/**
 * A source row's attributes as this reader may see them: secrets dropped for non-updaters (`log` and
 * `enforce`), grants trimmed for non-editors (`enforce`). Mutates and returns `row`.
 */
async function redactSourceRow({ env, sourceId, row, user, subdomain = '', patternRef = null }) {
    const mode = readMode();
    if (mode === 'legacy' || !row) return row;
    if (row.statistics != null && !(await holdsOnSource({ env, sourceId, user, subdomain, patternRef, perms: SECRET_EDITORS }))) {
        row.statistics = dropSecrets(row.statistics);
    }
    if (mode === 'enforce' && row.auth_permissions != null
        && !(await holdsOnSource({ env, sourceId, user, subdomain, patternRef, perms: GRANT_EDITORS }))) {
        row.auth_permissions = trimGrants(row.auth_permissions, user);
    }
    return row;
}

module.exports = {
    READ_PERMISSIONS, HIDDEN_ENTRY,
    readMode, allowSourceRead, allowViewRead, filterReadableSources, sourceOfView, holdsOnSource,
    redactSourceRow, trimGrants, dropSecrets, clearReadSnapshots,
};
