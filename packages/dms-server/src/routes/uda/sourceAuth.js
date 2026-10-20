'use strict';

/**
 * Per-source and per-datasets-pattern permission checks (permissions-server-source-auth-core).
 *
 * Effective perms = PATTERN ⊕ SOURCE (source `[]` revokes an inherited grant, non-empty replaces).
 *
 * Where the grants live:
 *   - External source (env = pgEnv): `data_manager.sources.auth_permissions` (postgres) /
 *     `sources.auth_permissions` (sqlite) on the pgEnv db.
 *   - Internal source (env = `app+instance`): `data->'auth_permissions'` on the source row in the
 *     DMS db.
 *   - Pattern: `data->'authPermissions'` on the pattern row in the DMS db (never the pgEnv db).
 *     Internal sources: the env's own pattern(s), found the way the sources list finds them
 *     (getSitePatterns), and only when the source is one of theirs. External sources: nothing in
 *     the db links a pgEnv to a pattern (pgEnvs are a client build setting), so the CLIENT names
 *     the pattern (`patternRef = { app, patternId }`). The server checks it is an existing datasets
 *     pattern and otherwise trusts it (owner decision 2026-10-20) — whoever holds a grant on a
 *     datasets pattern can claim it for any external source.
 *
 * Decision (`decideSource` / `decidePattern`): STRICT — an explicit perm or `*`, no "unconfigured ⇒
 * logged-in may". `${app} Admin` passes everything, as `isAppAdmin` does in the admin UI. FAILS
 * CLOSED: a missing row, a missing column or any query error denies.
 *
 * Rollout (`DMS_SOURCE_AUTH_MODE`):
 *   - `legacy`  — today's rule only (`legacyAllows`): missing row / query error / DMS env ⇒ allow.
 *   - `log`     — (default) today's rule decides; every request the strict rule would deny is
 *                 logged (`[source-auth] would-deny …`), to feed the access-diff audit and the
 *                 grant migration before anything flips.
 *   - `enforce` — the strict rule decides.
 *
 * Mirrors the merge + check of the client `utils/auth.js` (mirror, don't import); the client keeps
 * a "logged-in ⇒ allow" UI escape hatch that the server deliberately does not.
 */
const { resolveAuthPermissions } = require('../dms/auth');
const { getDb, loadConfig } = require('../../db');
const { dmsMainTable, getSitePatterns, getSiteSources } = require('./utils');

// merge source override onto pattern base: [] disables an inherited grant, non-empty replaces
function mergeAuthPermissions(base = {}, override) {
    if (!override) return base || {};
    const groups = { ...((base && base.groups) || {}) };
    const users = { ...((base && base.users) || {}) };
    for (const [id, perms] of Object.entries((override && override.users) || {})) {
        if (Array.isArray(perms) && perms.length === 0) delete users[id];
        else users[id] = perms;
    }
    for (const [name, perms] of Object.entries((override && override.groups) || {})) {
        if (Array.isArray(perms) && perms.length === 0) delete groups[name];
        else groups[name] = perms;
    }
    return { groups, users };
}

// Union of several resolved grants (an env shared by several patterns): a perm granted by any wins.
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

// STRICT: grant only on an explicit perm or `*`. No "logged-in ⇒ allow" / "unconfigured ⇒ allow".
function isUserAuthed({ user = {}, reqPermissions = [], authPermissions = {} }) {
    if (!reqPermissions || !reqPermissions.length) return true;
    const groups = authPermissions.groups || {};
    const users = authPermissions.users || {};
    const effectiveGroups = [...new Set([...((user && user.groups) || []), 'public'])];
    const userPerms = [
        ...(users[user && user.id] || []),
        ...effectiveGroups
            .filter(g => groups[g])
            .reduce((acc, g) => {
                const gp = Array.isArray(groups[g]) ? groups[g] : [groups[g]];
                if (gp && gp.length) acc.push(...gp);
                return acc;
            }, []),
    ];
    return userPerms.some(p => p === '*' || reqPermissions.includes(p));
}

// Mirrors utils/adminPermissions.js isAppAdmin.
function isAppAdmin(user, app) {
    return !!app && ((user && user.groups) || []).some(g => g === `${app} Admin`);
}

function authMode() {
    const m = String(process.env.DMS_SOURCE_AUTH_MODE || 'log').toLowerCase();
    return ['legacy', 'log', 'enforce'].includes(m) ? m : 'log';
}

const isDmsEnv = (env) => typeof env === 'string' && env.includes('+');

function getDmsDb() {
    const dbEnv = process.env.DMS_DB_ENV || 'dms-sqlite';
    const db = getDb(dbEnv);
    let splitMode;
    try { splitMode = loadConfig(dbEnv).splitMode; } catch { /* default below */ }
    return { db, splitMode: splitMode || process.env.DMS_SPLIT_MODE || 'legacy' };
}

const parseJson = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
    return v;
};

const sourcesTable = (db) => (db.type === 'postgres' ? 'data_manager.sources' : 'sources');

// ------------------------------------------------------------------------------------------------
// Readers. Each returns { ok: true, ... } or { ok: false, reason } — callers deny on !ok.
// ------------------------------------------------------------------------------------------------

// External source's own grants.
async function readExternalSource(db, sourceId) {
    try {
        const { rows } = await db.query(
            `SELECT auth_permissions AS ap FROM ${sourcesTable(db)} WHERE source_id = $1`,
            [sourceId]
        );
        if (!rows.length) return { ok: false, reason: 'source not found' };
        // SQLite returns the JSON column as text (the adapter only parses `data`/`attributes`).
        return { ok: true, ap: parseJson(rows[0].ap) || {} };
    } catch (e) {
        return { ok: false, reason: `source query failed: ${e.message}` };
    }
}

// A client-named pattern, accepted only if it is an existing datasets pattern of `app`.
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

// Internal source's own grants + the grants of the env's pattern(s), if the source is theirs.
async function readInternalSource(env, sourceId, subdomain) {
    const [app] = env.split('+');
    try {
        const { db, splitMode } = getDmsDb();
        const tbl = await dmsMainTable(db, app, splitMode);
        const { rows } = await db.query(
            `SELECT data->>'auth_permissions' AS ap FROM ${tbl} WHERE id = $1 AND app = $2 AND type LIKE '%:source'`,
            [+sourceId, app]
        );
        if (!rows.length) return { ok: false, reason: 'source not found' };

        const patternIds = await getSitePatterns({ db, app, env, splitMode });
        const owning = [];
        for (const id of patternIds) {
            const refs = await getSiteSources({ db, app, pattern_ids: [id], splitMode });
            if (refs.some(r => +(r && r.id) === +sourceId)) owning.push(id);
        }
        if (!owning.length) return { ok: false, reason: `source ${sourceId} is not in env ${env}` };

        const { rows: patterns } = await db.query(
            `SELECT data->>'authPermissions' AS ap FROM ${tbl} WHERE id = ANY($1)`,
            [owning.map(Number)]
        );
        const patternAP = unionAuthPermissions(patterns.map(p => resolveAuthPermissions(p.ap, subdomain)));
        return { ok: true, app, ap: parseJson(rows[0].ap) || {}, patternAP };
    } catch (e) {
        return { ok: false, reason: `internal source query failed: ${e.message}` };
    }
}

// ------------------------------------------------------------------------------------------------
// Decisions
// ------------------------------------------------------------------------------------------------

/**
 * Strict decision for `reqPermissions` on a source. `env` picks internal vs external; without it
 * the source is treated as external on `db`. Returns { allow, reason }.
 */
async function decideSource({ db, env, sourceId, patternRef, subdomain = '', reqPermissions, user }) {
    if (!reqPermissions || !reqPermissions.length) return { allow: true, reason: 'nothing required' };

    let sourceAP, patternAP = {}, app = null;
    if (isDmsEnv(env)) {
        const r = await readInternalSource(env, sourceId, subdomain);
        if (!r.ok) return { allow: false, reason: r.reason };
        ({ app, ap: sourceAP, patternAP } = r);
    } else {
        const r = await readExternalSource(db || getDb(env), sourceId);
        if (!r.ok) return { allow: false, reason: r.reason };
        sourceAP = r.ap;
        if (patternRef) {
            const p = await readNamedPattern(patternRef, subdomain);
            // An unusable pattern name only loses the pattern's grants; the source's own still count.
            if (p.ok) ({ app, ap: patternAP } = p);
        }
    }

    if (isAppAdmin(user, app)) return { allow: true, reason: `${app} Admin` };
    const allow = isUserAuthed({ user, reqPermissions, authPermissions: mergeAuthPermissions(patternAP, sourceAP) });
    return { allow, reason: allow ? 'granted' : `missing ${reqPermissions.join(' or ')}` };
}

/** Strict decision for a pattern-level permission (`create-source`, `edit-pattern`). */
async function decidePattern({ patternRef, subdomain = '', reqPermissions, user }) {
    if (!reqPermissions || !reqPermissions.length) return { allow: true, reason: 'nothing required' };
    const p = await readNamedPattern(patternRef || {}, subdomain);
    if (!p.ok) return { allow: false, reason: p.reason };
    if (isAppAdmin(user, p.app)) return { allow: true, reason: `${p.app} Admin` };
    const allow = isUserAuthed({ user, reqPermissions, authPermissions: p.ap });
    return { allow, reason: allow ? 'granted' : `missing ${reqPermissions.join(' or ')}` };
}

// Today's rule, kept for `legacy` / `log`: missing row, query error or DMS env ⇒ allow; a found
// external source is checked strictly against its own grants (patternId was never passed).
async function legacyAllows({ db, env, sourceId, reqPermissions, user }) {
    if (isDmsEnv(env)) return true;
    const r = await readExternalSource(db || getDb(env), sourceId);
    if (!r.ok) return true;
    return isUserAuthed({ user, reqPermissions, authPermissions: r.ap });
}

function logWouldDeny(kind, target, reqPermissions, user, reason) {
    console.warn(`[source-auth] would-deny ${kind} ${target} perms=${(reqPermissions || []).join(',')} ` +
        `user=${(user && (user.id ?? user.email)) ?? 'anon'} groups=${((user && user.groups) || []).join('|')} reason=${reason}`);
}

/**
 * Authorize `user` for `reqPermissions` on a source, under DMS_SOURCE_AUTH_MODE.
 * `env` (pgEnv or `app+instance`) is preferred; `db` alone means an external source on that db.
 */
async function isUserAuthedForSource(opts) {
    const mode = authMode();
    if (mode === 'enforce') return (await decideSource(opts)).allow;
    const legacy = await legacyAllows(opts);
    if (mode === 'log' && legacy) {
        const d = await decideSource(opts);
        if (!d.allow) logWouldDeny('source', `${opts.env || 'db'}/${opts.sourceId}`, opts.reqPermissions, opts.user, d.reason);
    }
    return legacy;
}

/**
 * Authorize `user` for a pattern-level permission. Nothing checked these before, so `legacy` and
 * `log` allow (log reports would-denies); `enforce` decides.
 */
async function isUserAuthedForPattern(opts) {
    const mode = authMode();
    if (mode === 'legacy') return true;
    const d = await decidePattern(opts);
    if (mode === 'enforce') return d.allow;
    if (!d.allow) {
        const ref = opts.patternRef || {};
        logWouldDeny('pattern', `${ref.app}/${ref.patternId}`, opts.reqPermissions, opts.user, d.reason);
    }
    return true;
}

// ------------------------------------------------------------------------------------------------
// Request identity + Express helpers
// ------------------------------------------------------------------------------------------------

/** The caller's user id, from the verified token only. Never from the body. */
function requestUserId(req) {
    const user = req && req.availAuthContext && req.availAuthContext.user;
    return user ? (user.id ?? null) : null;
}

/**
 * Same as requestUserId, but logs when the body names a different `user_id` (transition aid: those
 * callers used to trust the body).
 */
function requestUserIdWarnBody(req) {
    const id = requestUserId(req);
    const bodyId = req && req.body && req.body.user_id;
    if (bodyId != null && String(bodyId) !== String(id)) {
        console.warn(`[source-auth] body user_id=${bodyId} ignored; token user=${id ?? 'anon'} (${req.method} ${req.originalUrl || req.url})`);
    }
    return id;
}

// The datasets pattern a request names: query `dms_pattern=<app>/<patternId>` (what the client sends:
// a plain query param needs no CORS preflight) or the `X-DMS-Pattern: <app>/<patternId>` header.
// Mirrors the client's utils/authedFetch.js. Not read from the body: some bodies already carry an
// unrelated `patternId` (sync-filters).
function requestPatternRef(req) {
    const raw = (req && req.query && req.query.dms_pattern) || (req && req.headers && req.headers['x-dms-pattern']);
    if (!raw) return null;
    const i = String(raw).lastIndexOf('/');
    const patternId = i > 0 ? +String(raw).slice(i + 1) : NaN;
    return Number.isFinite(patternId) && patternId > 0 ? { app: String(raw).slice(0, i), patternId } : null;
}

// Express helpers. Each answers the request itself (401 / 403, JSON) and returns null when the
// caller is refused; otherwise returns the user.
function requireUser(req, res) {
    const user = req.availAuthContext && req.availAuthContext.user;
    if (!user) { res.status(401).json({ error: 'authentication required' }); return null; }
    return user;
}

async function requireSourcePermission(req, res, sourceId, perms, { env } = {}) {
    const user = requireUser(req, res);
    if (!user) return null;
    const pgEnv = env || req.params.pgEnv || req.params.env;
    const reqPermissions = [].concat(perms);
    const ok = await isUserAuthedForSource({
        env: pgEnv, db: isDmsEnv(pgEnv) ? undefined : getDb(pgEnv), sourceId: +sourceId, reqPermissions, user,
        patternRef: requestPatternRef(req),
    });
    if (!ok) { res.status(403).json({ error: `requires ${reqPermissions.join(' or ')} on source ${sourceId}` }); return null; }
    return user;
}

async function requirePatternPermission(req, res, perms, { patternRef } = {}) {
    const user = requireUser(req, res);
    if (!user) return null;
    const ref = patternRef || requestPatternRef(req);
    const reqPermissions = [].concat(perms);
    const ok = await isUserAuthedForPattern({ patternRef: ref, reqPermissions, user });
    if (!ok) { res.status(403).json({ error: `requires ${reqPermissions.join(' or ')} on pattern ${ref ? `${ref.app}/${ref.patternId}` : '(none named)'}` }); return null; }
    return user;
}

module.exports = {
    mergeAuthPermissions,
    unionAuthPermissions,
    isUserAuthed,
    isAppAdmin,
    authMode,
    decideSource,
    decidePattern,
    legacyAllows,
    isUserAuthedForSource,
    isUserAuthedForPattern,
    requestUserId,
    requestUserIdWarnBody,
    requestPatternRef,
    requireUser,
    requireSourcePermission,
    requirePatternPermission,
};
