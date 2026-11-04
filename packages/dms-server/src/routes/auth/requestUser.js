'use strict';
/**
 * WHO IS ASKING — request identity, and the Express / Falcor helpers that answer on a refusal.
 *
 * NOTHING HERE IS ABOUT SOURCES, which is why it is no longer in a file named for them. It reads
 * the caller out of a verified token, decides whether an unauthenticated caller may proceed at
 * all, and answers 401 / throws for Falcor when they may not. Any route wants this; the datasets
 * routes are simply where it was first needed.
 *
 * It also parses the datasets PATTERN a request names (`?dms_pattern=app/id`, or the
 * `X-DMS-Pattern` header). That is request parsing, not authorization: since 2026-11-03 a named
 * pattern lends no grants to anything, and the app it names survives only as a locator for an
 * external env's row.
 *
 * Split out of `sourceGuards.js` on 2026-11-03, which kept the source- and pattern-level authorize
 * functions. See planning/tasks/current/row-auth-uda-unify-api.md.
 */
const { isUserAuthed } = require('./auth');
const { authMode } = require('./settings');
// ⚠ LAZY. `sourceGuards.js` requires this module for identity, so a top-level require back is a
// cycle — Node would hand back partially-initialised exports and every name would be `undefined`
// with no throw. Only the REPORTING pair is needed: an anonymous caller refused at the door is
// written to the access log the same way a refused source is.
const report = () => require('./sourceGuards');

// The caller let through by requireUserOrOpen when nobody is signed in: truthy, so route code reads it as
// "allowed", with no id (an owner taken from it is null).
const ANON_CALLER = Object.freeze({ id: null, groups: [], anonymous: true });

// `env` defaults to the route's :pgEnv; `wasOpen` as for isUserAuthedForSource. `anonWasOpen`: anyone
// could call the route before, so an anonymous caller is judged by requireUserOrOpen, not refused outright.
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


// The site the request comes from: query `dms_app=<app>` (every pattern's Falcor model sends it,
// render/dmsPageFactory.jsx) or the `X-DMS-App` header. Used only where no datasets pattern is
// named: to file an access-log row under its site, and for the `${app} Admin` check on an EXTERNAL
// source read (a pgEnv is added to a site only by a sysadmin's config change, so that site's admins
// may read its sources; owner 2026-11-03). It lends no pattern's grants.
function requestApp(req) {
    const raw = (req && req.query && req.query.dms_app) || (req && req.headers && req.headers['x-dms-app']);
    return typeof raw === 'string' && /^[A-Za-z0-9_.-]{1,200}$/.test(raw) ? raw : null;
}


// The app to file a signed-out call under: the named pattern's, else the request's.
const requestLogApp = (req) => (requestPatternRef(req) || {}).app || requestApp(req) || '';


// Express helpers. Each answers the request itself (401 / 403, JSON) and returns null when the
// caller is refused; otherwise returns the user.
function requireUser(req, res) {
    const user = req.availAuthContext && req.availAuthContext.user;
    if (!user) { res.status(401).json({ error: 'authentication required' }); return null; }
    return user;
}


/**
 * Reads that were open to anyone (task and schedule status: lists, runs, events). They now need a signed-in
 * user: `enforce` refuses anon, `log` lets anon through and logs it. Per-source `view-source` comes
 * with read visibility (permissions-ds-read-visibility). `what` names the read in the log, and `app`
 * is the site it is filed under (the named pattern's, else `dms_app`).
 */
function readerAllowed(user, what, app = '') {
    const mode = authMode();
    if (user) return true;
    if (mode === 'log') { report().logWouldDeny('read', what, [], null, 'not signed in', app); return true; }
    report().refused('read', what, [], null, 'not signed in', app);
    return false;
}


// Express middleware form of readerAllowed.
function requireReader(req, res, next) {
    const user = req.availAuthContext && req.availAuthContext.user;
    if (readerAllowed(user, `${req.method} ${req.originalUrl || req.url}`, requestLogApp(req))) return next();
    res.status(401).json({ error: 'authentication required' });
}


/**
 * A write route anyone could call before (the data-type plugin routes): `enforce` refuses an anonymous
 * caller (401), `log` lets it through and logs once per request, `legacy` lets it through. Returns the
 * user, ANON_CALLER, or null (refused, answered).
 */
function requireUserOrOpen(req, res) {
    const user = req.availAuthContext && req.availAuthContext.user;
    if (user) return user;
    const mode = authMode();
    if (mode === 'enforce') {
        report().refused('route', `${req.method} ${req.originalUrl || req.url}`, [], null, 'not signed in', requestLogApp(req));
        return requireUser(req, res);
    }
    if (mode === 'log' && !req.anonWouldDenyLogged) {
        req.anonWouldDenyLogged = true;
        report().logWouldDeny('route', `${req.method} ${req.originalUrl || req.url}`, [], null, 'not signed in', requestLogApp(req));
    }
    return ANON_CALLER;
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

module.exports = {
    requestUserId, requestUserIdWarnBody, requestPatternRef, requestApp, requestLogApp,
    requireUser, readerAllowed, requireReader, requireUserOrOpen, parsePatternRef, requireFalcorUser, ANON_CALLER,
};
