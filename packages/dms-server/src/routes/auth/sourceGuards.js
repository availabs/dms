'use strict';
/**
 * SOURCE AND PATTERN AUTHORIZATION, and the guards that answer a request with it.
 *
 * Two layers, neither of which is a decision of its own:
 *
 *   `isUserAuthedForSource` / `isUserAuthedForPattern` apply the MODE — refuse under `enforce`,
 *   allow and log a would-deny under `log` — around whichever `decideSource` / `decidePattern` the
 *   implementation switch selects. That wrapper is identical for both, so it belongs to neither.
 *
 *   `requireSourcePermission` / `assertSourcePermission` and their pattern twins answer the request
 *   on a refusal (401/403, or a Falcor throw) and otherwise get out of the way.
 *
 * WHO THE CALLER IS moved to `./requestUser.js` on 2026-11-03 — none of that was about sources.
 *
 * WHY IT IS HERE AND NOT IN `kindAuth/`. It is implementation-independent: `parsePatternRef`,
 * `requestUserId` and `requireReader` mean the same thing whichever judge answers, so duplicating
 * them per implementation would be duplicating code with no decision in it. Leaving them in
 * `kindAuth/` forced every UDA and DAMA route to import a named implementation to get them, which
 * is what made an earlier attempt to put the datasets surface behind the facade re-export 29
 * symbols to serve 11 call sites — a switch in name only, reverted the same session.
 *
 * This is the same split `readAuth.js` got on 2026-11-02, where the snapshot builder turned out to
 * be shared infrastructure sitting inside a kind-auth file.
 *
 * See planning/tasks/current/row-auth-uda-unify-api.md, Phase 3.
 */
// ⚠ STILL LAZY, for a narrower reason than before. The cycle it used to avoid is gone —
// `kindAuth/sourceAuth.js` no longer re-exports this module — but `decide()` now reaches the
// SELECTED implementation's helpers, and reading it per call is what lets a suite choose an
// implementation after this module has loaded. The guards below call the authorize functions in
// this file directly; nothing about which judge answers is decided here.
const decide = () => require('./kindAuth/sourceAuth');
const { getDb } = require('../../db');
const { ANON_CALLER, parsePatternRef, readerAllowed, requestPatternRef, requestUserId, requestUserIdWarnBody, requireFalcorUser, requireReader, requireUser, requireUserOrOpen } = require('./requestUser');

/** An internal env is `app+instance`; a pgEnv is a bare name. Trivial, and local so this
 *  file does not import a decision module just to ask a question about a string. */
const isDmsEnv = (env) => typeof env === 'string' && env.includes('+');

// `app`: the route acts on that DMS app, so a pattern of another app is dropped (and so denies).
/**
 * THE TWO GUARDS. One question, one per transport.
 *
 * There used to be four — `requireSourcePermission`, `requirePatternPermission`,
 * `assertSourcePermission`, `assertPatternPermission` — which is two transports times two
 * SUBJECTS. The subject axis was the fake one: a source and a pattern differ only in which row is
 * being asked about, and naming the subject is the caller's job either way. What genuinely differs
 * is how a refusal reaches the client: Express answers 401/403, Falcor throws.
 *
 * Name the subject with `source` (an id) or `pattern` (a ref). See unified-auth-api.md Phase 2.
 */

/** Express: answers the response on a refusal and returns null. */
async function requireCan(req, res, { source, pattern, perms, env, app, wasOpen = false, anonWasOpen = false } = {}) {
    const user = anonWasOpen ? requireUserOrOpen(req, res) : requireUser(req, res);
    if (!user || user === ANON_CALLER) return user;
    const reqPermissions = [].concat(perms);
    if (source !== undefined) {
        const pgEnv = env || req.params.pgEnv || req.params.env;
        const ok = await isUserAuthedForSource({
            env: pgEnv, db: isDmsEnv(pgEnv) ? undefined : getDb(pgEnv), sourceId: +source, reqPermissions, user,
            patternRef: requestPatternRef(req), wasOpen,
        });
        if (!ok) { res.status(403).json({ error: `requires ${reqPermissions.join(' or ')} on source ${source}` }); return null; }
        return user;
    }
    const named = pattern || requestPatternRef(req);
    const ref = named && (!app || named.app === app) ? named : null;
    const ok = await isUserAuthedForPattern({ patternRef: ref, reqPermissions, user });
    if (!ok) { res.status(403).json({ error: `requires ${reqPermissions.join(' or ')} on pattern ${ref ? `${ref.app}/${ref.patternId}` : '(none named)'}` }); return null; }
    return user;
}

/**
 * Falcor: throws on a refusal. On a DMS env a pattern must belong to the env's app — a ref to
 * another app's pattern is dropped, and so denies.
 */
async function assertCan(router, { env, source, pattern, perms, wasOpen = false } = {}) {
    const user = requireFalcorUser(router);
    const reqPermissions = [].concat(perms);
    const subdomain = (router && router.subdomain) || '';
    if (source !== undefined) {
        const ok = await isUserAuthedForSource({
            env, db: isDmsEnv(env) ? undefined : getDb(env), sourceId: +source, reqPermissions, user,
            patternRef: pattern || null, wasOpen, subdomain,
        });
        if (!ok) throw new Error(`Not authorized: needs ${reqPermissions.join(' or ')} on source ${source}`);
        return user;
    }
    const ref = pattern && (!isDmsEnv(env) || pattern.app === env.split('+')[0]) ? pattern : null;
    const ok = await isUserAuthedForPattern({ patternRef: ref, reqPermissions, user, subdomain });
    if (!ok) throw new Error(`Not authorized: needs ${reqPermissions.join(' or ')} on pattern ${ref ? `${ref.app}/${ref.patternId}` : '(none named)'}`);
    return user;
}


// ================================================================================================
// THE AUTHORIZE FUNCTIONS, and the view lookup they need.
//
// Moved here from `kindAuth/sourceAuth.js` on 2026-11-03 (criterion 5 of
// row-auth-uda-unify-api.md): every UDA and DAMA route that wanted them was importing KIND AUTH by
// name to get them, while the decision inside had been dispatching on `DMS_AUTH_IMPL` for weeks.
//
// NEITHER OF THEM DECIDES. They apply the MODE — refuse under `enforce`, allow and write a
// would-deny under `log` — around whichever `decideSource` / `decidePattern` the switch selects.
// That wrapper is identical for both implementations, which is why it does not belong to either.
// ================================================================================================
const { authMode } = require('./settings');
const { isRow } = require('./settings');
const accessLog = require('../../access-log');

function logWouldDeny(kind, target, reqPermissions, user, reason, app = '', outcome = 'would-deny') {
    accessLog.record({ app, guard: 'source', outcome, kind, target, perms: reqPermissions, user, reason });
    if (outcome !== 'would-deny') return;
    console.warn(`[source-auth] would-deny ${kind} ${target} perms=${(reqPermissions || []).join(',')} ` +
        `user=${(user && (user.id ?? user.email)) ?? 'anon'} groups=${((user && user.groups) || []).join('|')} reason=${reason}`);
}
const refused = (kind, target, reqPermissions, user, reason, app) =>
    logWouldDeny(kind, target, reqPermissions, user, reason, app, 'refused');

/**
 * Authorize `user` for `reqPermissions` on a source, under `DMS_AUTH_MODE`.
 * `env` (pgEnv or `app+instance`) is preferred; `db` alone means an external source on that db.
 * `wasOpen`: the route checked nothing before, so today's rule is "allow" (as for patterns).
 */
async function isUserAuthedForSource(opts) {
    // WHICH IMPLEMENTATION DECIDES is `DMS_AUTH_IMPL` and nothing else (../impl.js). It was
    // `DMS_UDA_GATE` until 2026-11-03 — a second switch that let the datasets surfaces run a
    // different judge from the rest of the server.
    const mode = authMode();
    const d = isRow()
        ? await require('./rowAuth/rowSourceAuth').decideSourceRow(opts)
        : await decide().decideSource(opts);
    if (d.allow) return true;
    const target = `${opts.env || 'db'}/${opts.sourceId}`;
    const app = accessLog.appOf(opts.env, opts.patternRef);
    if (mode === 'enforce') { refused('source', target, opts.reqPermissions, opts.user, d.reason, app); return false; }
    // `log`: today's rule may allow what the resolver's rule denies, never the reverse. (Today's rule
    // reads only the source's own grants, so it refused `${app} Admin` and pattern grantees.)
    const legacy = opts.wasOpen || await decide().legacyAllows(opts);
    if (legacy) logWouldDeny('source', target, opts.reqPermissions, opts.user, d.reason, app);
    return legacy;
}

/**
 * Authorize `user` for a pattern-level permission. Nothing checked these before, so `log` allows
 * and reports the would-deny; `enforce` decides.
 */
async function isUserAuthedForPattern(opts) {
    const mode = authMode();
    const d = isRow()
        ? await require('./rowAuth/rowSourceAuth').decidePatternRow(opts)
        : await decide().decidePattern(opts);
    if (d.allow) return true;
    const ref = opts.patternRef || {};
    const target = ref.app || ref.patternId ? `${ref.app}/${ref.patternId}` : '(no pattern named)';
    if (mode === 'enforce') { refused('pattern', target, opts.reqPermissions, opts.user, d.reason, ref.app || ''); return false; }
    logWouldDeny('pattern', target, opts.reqPermissions, opts.user, d.reason, ref.app || '');
    return true;
}

// The source a view belongs to: `views.source_id` on a pgEnv; on a DMS env, the source row whose
// `data.views` refs list the view. Null when nothing is found (the decision then denies).
async function sourceIdForView(env, viewId) {
    try {
        if (!decide().isDmsEnv(env)) {
            const db = getDb(env);
            const { rows } = await db.query(
                `SELECT source_id FROM ${db.type === 'postgres' ? 'data_manager.views' : 'views'} WHERE view_id = $1`,
                [+viewId]
            );
            return rows.length ? +rows[0].source_id : null;
        }
        const [app] = env.split('+');
        const { db, splitMode } = decide().getDmsDb();
        const tbl = await require('../uda/utils').dmsMainTable(db, app, splitMode);
        const { rows } = await db.query(
            `SELECT id, data->'views' AS views FROM ${tbl} WHERE app = $1 AND type LIKE '%:source'`,
            [app]
        );
        const row = rows.find(r => (require('./sourceSnapshot').parseJson(r.views) || []).some(v => +(v && v.id) === +viewId));
        return row ? +row.id : null;
    } catch (e) {
        console.warn(`[source-auth] view ${env}/${viewId} lookup failed: ${e.message}`);
        return null;
    }
}


module.exports = {
    // THE QUESTION, with the mode applied: may this caller do this to this row?
    isUserAuthedForSource, isUserAuthedForPattern,
    // the same question, answering the request itself on a refusal — Express, then Falcor
    requireCan, assertCan,
    // a lookup, and the reporting pair ./requestUser.js shares
    sourceIdForView, logWouldDeny, refused,
};

// NOT RE-EXPORTED since 2026-11-03: `requestUserId`, `requireUser`, `requireReader` and the rest of
// ./requestUser.js. They passed through here for a week and 18 of this module's import-sites were
// reaching for them, which is most of what made its surface look like 19 functions. Who is asking
// and what they may do are different questions; the files are separate and so are the imports.
