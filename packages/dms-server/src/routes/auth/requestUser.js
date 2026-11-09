'use strict';
/**
 * WHO IS ASKING — request identity, and the Express / Falcor helpers that answer when nobody is.
 * Nothing here decides what a caller may do; that is `./index.js`'s `authorize`.
 *
 * the site it comes from (`?dms_app=`, `X-DMS-App`). Both are locators: a named pattern lends no
 * grants, and the app only says which site's env row sits above an external source.
 */
const { authMode } = require('./settings');
const { refuse } = require('./report');

// The caller let through by requireUserOrOpen when nobody is signed in: truthy, so route code reads it
// as "allowed", with no id.
const ANON_CALLER = Object.freeze({ id: null, groups: [], anonymous: true });

/** The caller's user id, from the verified token only. Never from the body. */
function requestUserId(req) {
    const user = req && req.availAuthContext && req.availAuthContext.user;
    return user ? (user.id ?? null) : null;
}

/** Same, logging when the body names a different `user_id` (those callers used to trust the body). */
function requestUserIdWarnBody(req) {
    const id = requestUserId(req);
    const bodyId = req && req.body && req.body.user_id;
    if (bodyId != null && String(bodyId) !== String(id)) {
        console.warn(`[auth] body user_id=${bodyId} ignored; token user=${id ?? 'anon'} (${req.method} ${req.originalUrl || req.url})`);
    }
    return id;
}

/** The site the request comes from: `?dms_app=` or the `X-DMS-App` header, else null. */
function requestApp(req) {
    const raw = (req && req.query && req.query.dms_app) || (req && req.headers && req.headers['x-dms-app']);
    return typeof raw === 'string' && /^[A-Za-z0-9_.-]{1,200}$/.test(raw) ? raw : null;
}

/** The app to file a signed-out call under: the named pattern's, else the request's. */
const requestLogApp = (req) => requestApp(req) || '';

// ---- Express ------------------------------------------------------------------------------------

/** Answers 401 and returns null when nobody is signed in; otherwise the user. */
function requireUser(req, res) {
    const user = req.availAuthContext && req.availAuthContext.user;
    if (!user) { res.status(401).json({ error: 'authentication required' }); return null; }
    return user;
}

/** A read that was open to anyone: a signed-in user passes; anonymous is refused under `enforce` and logged under `log`. */
function readerAllowed(user, what, app = '') {
    if (user) return true;
    return refuse('not signed in', { guard: 'read', kind: 'read', target: what, user: null, app });
}

/** Express middleware form of readerAllowed. */
function requireReader(req, res, next) {
    const user = req.availAuthContext && req.availAuthContext.user;
    if (readerAllowed(user, `${req.method} ${req.originalUrl || req.url}`, requestLogApp(req))) return next();
    res.status(401).json({ error: 'authentication required' });
}

/**
 * A write route anyone could call before: `enforce` refuses an anonymous caller (401), `log` lets
 * it through and logs once per request. Returns the user, ANON_CALLER, or null (refused, answered).
 */
function requireUserOrOpen(req, res) {
    const user = req.availAuthContext && req.availAuthContext.user;
    if (user) return user;
    let allowed;
    if (req.anonWouldDenyLogged) allowed = authMode() !== 'enforce';
    else {
        req.anonWouldDenyLogged = true;
        allowed = refuse('not signed in', { guard: 'route', kind: 'route', target: `${req.method} ${req.originalUrl || req.url}`, user: null, app: requestLogApp(req) });
    }
    return allowed ? ANON_CALLER : requireUser(req, res);
}

// ---- Falcor -------------------------------------------------------------------------------------

/** A Falcor route has no response to answer, so this throws when nobody is signed in. */
function requireFalcorUser(router) {
    const user = router && router.user;
    if (!user) throw new Error('Sign in to do this');
    return user;
}

module.exports = {
    requestUserId, requestUserIdWarnBody, requestApp, requestLogApp,
    requireUser, readerAllowed, requireReader, requireUserOrOpen, requireFalcorUser, ANON_CALLER,
};
