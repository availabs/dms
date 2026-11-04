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
 * Decision (`decideSource` / `decidePattern`): routes/dms/auth.js isUserAuthed. On grants with nothing beyond
 * `public`, reads stay open and edits need an explicit grant (owner 2026-10-29, task
 * permissions-blank-row-read-only; it was "no permission set → open" from 2026-10-23, strict before that);
 * otherwise an explicit perm or `*`. The `log` answer keeps the old rule (`legacyAllows`).
 * `${app} Admin` passes everything, as `isAppAdmin` does in the admin UI. FAILS CLOSED on lookups: a
 * missing row, a missing column, an unnamed pattern or any query error denies.
 *
 * Mode (`DMS_AUTH_MODE`, ../settings.js — one flag for every surface):
 *   - `log`     — (default) the OLD rule still answers (`legacyAllows`: missing row / query error /
 *                 DMS env ⇒ allow), so whatever it allowed is never refused; every request the
 *                 resolver's rule would deny is logged (`[source-auth] would-deny …`), to feed the
 *                 access-diff audit and the grant migration before anything flips.
 *   - `enforce` — the resolver's rule decides.
 *
 * `legacyAllows` therefore outlives the `legacy` MODE it was named for: the name now refers to the
 * old rule it implements, which `log` still needs, not to a setting.
 *
 * Mirrors the merge of the client `utils/auth.js` (mirror, don't import). The client's gates keep the old open
 * rule until enforce (owner 2026-11-02); `${app} Admin` passes on both sides.
 */
const {
    resolveAuthPermissions, isUserAuthed, isUserAuthedOpen, holdsExplicitly, blankRowRefusal,
} = require('../auth');
const { getDb, loadConfig } = require('../../../db');
const accessLog = require('../../../access-log');
const { dmsMainTable, getSiteSources } = require('../../uda/utils');
// MOVED to ../sourceSnapshot.js (2026-11-02): a pure grant union and a pattern-row read are data
// access, not decisions, and the shared snapshot builder needs both. Re-exported below so the ~20
// callers of this module keep their import; there is still only one definition.
const { unionAuthPermissions, readNamedPattern } = require('../sourceSnapshot');

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

// The rule and its helpers live in routes/dms/auth.js: `isUserAuthed` (no grants ⇒ reads open, edits need an
// explicit grant; owner 2026-10-29), `isUserAuthedOpen` (the old "no permission set → open", for the legacy /
// log answers), `holdsExplicitly` (explicit grants only: the dms.data guard's anonymous writes).

// Mirrors utils/adminPermissions.js isAppAdmin.
function isAppAdmin(user, app) {
    return !!app && ((user && user.groups) || []).some(g => g === `${app} Admin`);
}

// `DMS_AUTH_MODE` — the one mode, shared with every other surface (../settings.js). It was
// `DMS_SOURCE_AUTH_MODE` until 2026-11-03, and `legacy` went with the rename: `log` already
// refuses nothing, and it says what it would have refused.
const { authMode } = require('../settings');

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
    const authPermissions = mergeAuthPermissions(patternAP, sourceAP);
    const allow = check({ user, reqPermissions, authPermissions });
    return { allow, reason: allow ? 'granted' : refusal({ user, reqPermissions, authPermissions }) };
}

/**
 * An internal source's effective grants (owning datasets patterns ⊕ the source's own), as decideSource
 * merges them, for callers that judge with their own rule (dataAuth.js). Null when the source can't be
 * read, so the caller fails closed.
 */
async function internalSourceGrants(env, sourceId, subdomain = '') {
    if (!sourceId) return null;
    const r = await readInternalSource(env, sourceId, subdomain);
    return r.ok ? mergeAuthPermissions(r.patternAP, r.ap) : null;
}

/** Decision for a pattern-level permission (`create-source`, `edit-pattern`). */
async function decidePattern({ patternRef, subdomain = '', reqPermissions, user }) {
    if (!reqPermissions || !reqPermissions.length) return { allow: true, reason: 'nothing required' };
    const p = await readNamedPattern(patternRef || {}, subdomain);
    if (!p.ok) return { allow: false, reason: p.reason };
    if (isAppAdmin(user, p.app)) return { allow: true, reason: `${p.app} Admin` };
    const allow = isUserAuthed({ user, reqPermissions, authPermissions: p.ap });
    return { allow, reason: allow ? 'granted' : refusal({ user, reqPermissions, authPermissions: p.ap }) };
}

// A refusal's reason: the missing permission, and "blank row" when only the 2026-10-29 rule refuses it.
function refusal(opts) {
    const blank = blankRowRefusal(opts);
    return `missing ${opts.reqPermissions.join(' or ')}${blank ? `; ${blank}` : ''}`;
}

// Today's rule, kept for `log`: missing row, query error or DMS env ⇒ allow; a found
// external source is checked against its own grants (patternId was never passed).
async function legacyAllows({ db, env, sourceId, reqPermissions, user }) {
    if (isDmsEnv(env)) return true;
    const r = await readExternalSource(db || getDb(env), sourceId);
    if (!r.ok) return true;
    return isUserAuthedOpen({ user, reqPermissions, authPermissions: r.ap });
}

// `app`: whose access log counts it (accessLog.appOf for sources). `outcome`: would-deny (log) / refused (enforce).
function logWouldDeny(kind, target, reqPermissions, user, reason, app = '', outcome = 'would-deny') {
    accessLog.record({ app, guard: 'source', outcome, kind, target, perms: reqPermissions, user, reason });
    if (outcome !== 'would-deny') return;
    console.warn(`[source-auth] would-deny ${kind} ${target} perms=${(reqPermissions || []).join(',')} ` +
        `user=${(user && (user.id ?? user.email)) ?? 'anon'} groups=${((user && user.groups) || []).join('|')} reason=${reason}`);
}
const refused = (kind, target, reqPermissions, user, reason, app) =>
    logWouldDeny(kind, target, reqPermissions, user, reason, app, 'refused');

// NOTHING IS RE-EXPORTED FROM HERE ANY MORE (2026-11-03). The request plumbing went to
// `../requestUser.js` and the authorize-plus-guard layer to `../sourceGuards.js`, and for a while
// both were re-exported through this file so existing imports kept working. That is what made a
// named implementation look like the place to get them: every UDA and DAMA route reached into
// `kindAuth/` for functions that had nothing to do with kind auth. Callers now import from the
// module that defines what they want. What is left below is kind auth's own decisions.

module.exports = {
    mergeAuthPermissions,
    unionAuthPermissions,
    isUserAuthed,
    isUserAuthedOpen,
    holdsExplicitly,
    isAppAdmin,
    authMode,
    decideSource,
    internalSourceGrants,
    decidePattern,
    legacyAllows,
    readNamedPattern,
    // ../sourceGuards.js needs these to do the lookups its authorize functions depend on
    isDmsEnv, getDmsDb,
    // reporting helpers — ../sourceGuards.js refuses with them
    refusal, logWouldDeny, refused,
};
