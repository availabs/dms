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
const { dmsMainTable, getSiteSources } = require('./utils');
const { loadConfig } = require('../../db');

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
        sources: new Map(rows.map(r => [+r.source_id, { ap: parseJson(r.ap) || {}, patternAP: {} }])),
        viewSource: new Map(views.map(v => [+v.view_id, +v.source_id])),
    };
}

async function loadInternal(env, subdomain) {
    const [app] = env.split('+');
    const { db, splitMode } = getDmsDb();
    const tbl = await dmsMainTable(db, app, splitMode);
    const { rows } = await db.query(
        `SELECT id, data->>'auth_permissions' AS ap, data->'views' AS views FROM ${tbl} WHERE app = $1 AND type LIKE '%:source'`,
        [app]);
    const { rows: patterns } = await db.query(
        `SELECT id, data->>'authPermissions' AS ap FROM ${tbl}
         WHERE app = $1 AND type LIKE '%:pattern' AND data->>'pattern_type' = 'datasets'`,
        [app]);
    const owners = new Map(); // source id → resolved grants of each datasets pattern listing it
    for (const p of patterns) {
        const refs = await getSiteSources({ db, app, pattern_ids: [p.id], splitMode });
        for (const r of refs) {
            const id = +(r && r.id);
            if (!owners.has(id)) owners.set(id, []);
            owners.get(id).push(resolveAuthPermissions(p.ap, subdomain));
        }
    }
    const sources = new Map();
    const viewSource = new Map();
    for (const r of rows) {
        const owning = owners.get(+r.id);
        sources.set(+r.id, {
            ap: parseJson(r.ap) || {},
            patternAP: owning ? unionAuthPermissions(owning) : {},
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
    const promise = readNamedPattern(patternRef, subdomain).then(p => (p.ok ? { app: p.app, ap: p.ap } : null));
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
    try { d = decideFrom(await snapshot(env, subdomain), sourceId, user, READ_PERMISSIONS, await namedPattern(patternRef, subdomain)); }
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
