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
 *     Internal sources: the datasets pattern(s) of the env's app whose source list (own `sources`
 *     or linked dmsEnv) holds the source; none ⇒ deny. External sources: nothing in
 *     the db links a pgEnv to a pattern (pgEnvs are a client build setting), so the CLIENT names
 *     the pattern (`patternRef = { app, patternId }`). The server checks it is an existing datasets
 *     pattern and otherwise trusts it (owner decision 2026-10-20) — whoever holds a grant on a
 *     datasets pattern can claim it for any external source.
 *
 * Decision (`decideSource` / `decidePattern`): the repo's rule, as the client (owner, 2026-10-23; it was
 * strict until then): no permission set → open, otherwise an explicit perm or `*` (isUserAuthed below).
 * `${app} Admin` passes everything, as `isAppAdmin` does in the admin UI. FAILS CLOSED on lookups: a
 * missing row, a missing column, an unnamed pattern or any query error denies.
 *
 * Rollout (`DMS_SOURCE_AUTH_MODE`):
 *   - `legacy`  — today's rule (`legacyAllows`: missing row / query error / DMS env ⇒ allow) OR the
 *                 resolver's rule: whatever `enforce` would allow is never refused.
 *   - `log`     — (default) as `legacy`; every request the resolver's rule would deny is logged
 *                 (`[source-auth] would-deny …`), to feed the access-diff audit and the grant
 *                 migration before anything flips.
 *   - `enforce` — the resolver's rule decides.
 *
 * Mirrors the merge + check of the client `utils/auth.js` (mirror, don't import). Same rule on both sides
 * (owner, 2026-10-23): no permission set → open (see isUserAuthed below); `${app} Admin` passes.
 */
const { resolveAuthPermissions, isUserAuthed: lenientIsUserAuthed } = require('../dms/auth');
const { getDb, loadConfig } = require('../../db');
const { dmsMainTable, getSiteSources } = require('./utils');

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

// The repo's rule (owner, 2026-10-23): no permission set → open. `routes/dms/auth.js` isUserAuthed, the
// client's mirror: a signed-in user passes when nothing beyond `public` is set, anyone when nothing at all
// is; otherwise an explicit perm or `*` (the `public` group counts for everyone).
const isUserAuthed = lenientIsUserAuthed;

// Explicit grants only (no "nothing set ⇒ open"): the dms.data guard's rule for anonymous writes.
function holdsExplicitly({ user = {}, reqPermissions = [], authPermissions = {} }) {
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

// Internal source's own grants + the grants of the datasets pattern(s) that list it. Only the env's
// app is used: clients name an internal source's env by its data type (`app+internal_table`) or its
// slug (`app+roads`, clearData), not by its pattern, so the owners are found from the source itself.
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

        const { rows: patterns } = await db.query(
            `SELECT id, data->>'authPermissions' AS ap FROM ${tbl}
             WHERE app = $1 AND type LIKE '%:pattern' AND data->>'pattern_type' = 'datasets'`,
            [app]
        );
        const owning = [];
        for (const p of patterns) {
            const refs = await getSiteSources({ db, app, pattern_ids: [p.id], splitMode });
            if (refs.some(r => +(r && r.id) === +sourceId)) owning.push(p);
        }
        if (!owning.length) return { ok: false, reason: `source ${sourceId} is in no datasets pattern of ${app}` };

        const patternAP = unionAuthPermissions(owning.map(p => resolveAuthPermissions(p.ap, subdomain)));
        return { ok: true, app, ap: parseJson(rows[0].ap) || {}, patternAP };
    } catch (e) {
        return { ok: false, reason: `internal source query failed: ${e.message}` };
    }
}

// The source a view belongs to: `views.source_id` on a pgEnv; on a DMS env, the source row whose
// `data.views` refs list the view. Null when nothing is found (the decision then denies).
async function sourceIdForView(env, viewId) {
    try {
        if (!isDmsEnv(env)) {
            const db = getDb(env);
            const { rows } = await db.query(
                `SELECT source_id FROM ${db.type === 'postgres' ? 'data_manager.views' : 'views'} WHERE view_id = $1`,
                [+viewId]
            );
            return rows.length ? +rows[0].source_id : null;
        }
        const [app] = env.split('+');
        const { db, splitMode } = getDmsDb();
        const tbl = await dmsMainTable(db, app, splitMode);
        const { rows } = await db.query(
            `SELECT id, data->'views' AS views FROM ${tbl} WHERE app = $1 AND type LIKE '%:source'`,
            [app]
        );
        const row = rows.find(r => (parseJson(r.views) || []).some(v => +(v && v.id) === +viewId));
        return row ? +row.id : null;
    } catch (e) {
        console.warn(`[source-auth] view ${env}/${viewId} lookup failed: ${e.message}`);
        return null;
    }
}

// ------------------------------------------------------------------------------------------------
// Decisions
// ------------------------------------------------------------------------------------------------

/**
 * Strict decision for `reqPermissions` on a source. `env` picks internal vs external; without it
 * the source is treated as external on `db`. Returns { allow, reason }.
 */
// `explicitOnly`: explicit grants only (holdsExplicitly), for the dms.data guard's anonymous writes.
async function decideSource({ db, env, sourceId, patternRef, subdomain = '', reqPermissions, user, explicitOnly = false }) {
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
    const check = explicitOnly ? holdsExplicitly : isUserAuthed;
    const allow = check({ user, reqPermissions, authPermissions: mergeAuthPermissions(patternAP, sourceAP) });
    return { allow, reason: allow ? 'granted' : `missing ${reqPermissions.join(' or ')}` };
}

/** Decision for a pattern-level permission (`create-source`, `edit-pattern`). */
async function decidePattern({ patternRef, subdomain = '', reqPermissions, user }) {
    if (!reqPermissions || !reqPermissions.length) return { allow: true, reason: 'nothing required' };
    const p = await readNamedPattern(patternRef || {}, subdomain);
    if (!p.ok) return { allow: false, reason: p.reason };
    if (isAppAdmin(user, p.app)) return { allow: true, reason: `${p.app} Admin` };
    const allow = isUserAuthed({ user, reqPermissions, authPermissions: p.ap });
    return { allow, reason: allow ? 'granted' : `missing ${reqPermissions.join(' or ')}` };
}

// Today's rule, kept for `legacy` / `log`: missing row, query error or DMS env ⇒ allow; a found
// external source is checked against its own grants (patternId was never passed).
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
 * `wasOpen`: the route checked nothing before, so today's rule is "allow" (as for patterns).
 */
async function isUserAuthedForSource(opts) {
    const mode = authMode();
    const d = await decideSource(opts);
    if (mode === 'enforce' || d.allow) return d.allow;
    // legacy / log: today's rule may allow what the resolver's rule denies, never the reverse. (Today's rule
    // reads only the source's own grants, so it refused `${app} Admin` and pattern grantees.)
    const legacy = opts.wasOpen || await legacyAllows(opts);
    if (mode === 'log' && legacy) logWouldDeny('source', `${opts.env || 'db'}/${opts.sourceId}`, opts.reqPermissions, opts.user, d.reason);
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

/**
 * Reads that were open to anyone (task and schedule status: lists, runs, events). They now need a signed-in
 * user: `enforce` refuses anon, `log` lets anon through and logs it, `legacy` allows. Per-source
 * `view-source` comes with read visibility (permissions-ds-read-visibility). `what` names the read in the log.
 */
function readerAllowed(user, what) {
    const mode = authMode();
    if (user || mode === 'legacy') return true;
    if (mode === 'log') { logWouldDeny('read', what, [], null, 'not signed in'); return true; }
    return false;
}

// Express middleware form of readerAllowed.
function requireReader(req, res, next) {
    const user = req.availAuthContext && req.availAuthContext.user;
    if (readerAllowed(user, `${req.method} ${req.originalUrl || req.url}`)) return next();
    res.status(401).json({ error: 'authentication required' });
}

// The caller let through by requireUserOrOpen when nobody is signed in: truthy, so route code reads it as
// "allowed", with no id (an owner taken from it is null).
const ANON_CALLER = Object.freeze({ id: null, groups: [], anonymous: true });

/**
 * A write route anyone could call before (the data-type plugin routes): `enforce` refuses an anonymous
 * caller (401), `log` lets it through and logs once per request, `legacy` lets it through. Returns the
 * user, ANON_CALLER, or null (refused, answered).
 */
function requireUserOrOpen(req, res) {
    const user = req.availAuthContext && req.availAuthContext.user;
    if (user) return user;
    const mode = authMode();
    if (mode === 'enforce') return requireUser(req, res);
    if (mode === 'log' && !req.anonWouldDenyLogged) {
        req.anonWouldDenyLogged = true;
        logWouldDeny('route', `${req.method} ${req.originalUrl || req.url}`, [], null, 'not signed in');
    }
    return ANON_CALLER;
}

// `env` defaults to the route's :pgEnv; `wasOpen` as for isUserAuthedForSource. `anonWasOpen`: anyone
// could call the route before, so an anonymous caller is judged by requireUserOrOpen, not refused outright.
async function requireSourcePermission(req, res, sourceId, perms, { env, wasOpen = false, anonWasOpen = false } = {}) {
    const user = anonWasOpen ? requireUserOrOpen(req, res) : requireUser(req, res);
    if (!user || user === ANON_CALLER) return user;
    const pgEnv = env || req.params.pgEnv || req.params.env;
    const reqPermissions = [].concat(perms);
    const ok = await isUserAuthedForSource({
        env: pgEnv, db: isDmsEnv(pgEnv) ? undefined : getDb(pgEnv), sourceId: +sourceId, reqPermissions, user,
        patternRef: requestPatternRef(req), wasOpen,
    });
    if (!ok) { res.status(403).json({ error: `requires ${reqPermissions.join(' or ')} on source ${sourceId}` }); return null; }
    return user;
}

// `app`: the route acts on that DMS app, so a pattern of another app is dropped (and so denies).
async function requirePatternPermission(req, res, perms, { patternRef, app, anonWasOpen = false } = {}) {
    const user = anonWasOpen ? requireUserOrOpen(req, res) : requireUser(req, res);
    if (!user || user === ANON_CALLER) return user;
    const named = patternRef || requestPatternRef(req);
    const ref = named && (!app || named.app === app) ? named : null;
    const reqPermissions = [].concat(perms);
    const ok = await isUserAuthedForPattern({ patternRef: ref, reqPermissions, user });
    if (!ok) { res.status(403).json({ error: `requires ${reqPermissions.join(' or ')} on pattern ${ref ? `${ref.app}/${ref.patternId}` : '(none named)'}` }); return null; }
    return user;
}

// ------------------------------------------------------------------------------------------------
// Falcor helpers. A Falcor route has no response to answer, so these THROW (the client's call / set
// rejects) and return the user otherwise. `router` is the route's `this` (user, subdomain).
// ------------------------------------------------------------------------------------------------

// The datasets pattern a Falcor call names in its last argument: `{ app, patternId }`, `{ app, id }`
// (the client's `{ app, id: parent.id }`) or `'app/id'`. Calls can't carry `?dms_pattern=`: the
// falcor client is shared by every pattern and batches requests.
function parsePatternRef(v) {
    if (!v) return null;
    if (typeof v === 'string') return requestPatternRef({ query: { dms_pattern: v } });
    const patternId = +(v.patternId ?? v.id);
    return v.app && Number.isFinite(patternId) && patternId > 0 ? { app: String(v.app), patternId } : null;
}

function requireFalcorUser(router) {
    const user = router && router.user;
    if (!user) throw new Error('Sign in to do this');
    return user;
}

/** Throw unless the router's user holds one of `perms` on the source. Options as isUserAuthedForSource. */
async function assertSourcePermission(router, env, sourceId, perms, { patternRef = null, wasOpen = false } = {}) {
    const user = requireFalcorUser(router);
    const reqPermissions = [].concat(perms);
    const ok = await isUserAuthedForSource({
        env, db: isDmsEnv(env) ? undefined : getDb(env), sourceId: +sourceId, reqPermissions, user,
        patternRef, wasOpen, subdomain: (router && router.subdomain) || '',
    });
    if (!ok) throw new Error(`Not authorized: needs ${reqPermissions.join(' or ')} on source ${sourceId}`);
    return user;
}

/**
 * Throw unless the router's user holds one of `perms` on the named datasets pattern. On a DMS env the
 * pattern must belong to the env's app (a ref to another app's pattern is dropped, and so denies).
 */
async function assertPatternPermission(router, env, perms, patternRef) {
    const user = requireFalcorUser(router);
    const reqPermissions = [].concat(perms);
    const ref = patternRef && (!isDmsEnv(env) || patternRef.app === env.split('+')[0]) ? patternRef : null;
    const ok = await isUserAuthedForPattern({ patternRef: ref, reqPermissions, user, subdomain: (router && router.subdomain) || '' });
    if (!ok) throw new Error(`Not authorized: needs ${reqPermissions.join(' or ')} on pattern ${ref ? `${ref.app}/${ref.patternId}` : '(none named)'}`);
    return user;
}

module.exports = {
    mergeAuthPermissions,
    unionAuthPermissions,
    isUserAuthed,
    holdsExplicitly,
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
    readNamedPattern,
    requireUser,
    requireUserOrOpen,
    ANON_CALLER,
    readerAllowed,
    requireReader,
    requireSourcePermission,
    requirePatternPermission,
    sourceIdForView,
    parsePatternRef,
    assertSourcePermission,
    assertPatternPermission,
};
