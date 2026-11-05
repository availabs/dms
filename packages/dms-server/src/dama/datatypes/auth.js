/**
 * Permission checks for data-type plugin routes.
 *
 * Plugin routes used to answer anyone, so two layers sit on them:
 *   - writeGate, in front of every plugin router: a write (anything but GET / HEAD / OPTIONS) needs a
 *     signed-in user, unless the plugin lists the route in `openRoutes` (a webhook with its own secret);
 *   - the plugin helpers below, which each write route calls for its source / pattern permission.
 *
 * Both follow `DMS_AUTH_MODE` as any route that was open does: `enforce` refuses, `log` lets the call
 * through and logs a would-deny. Each helper answers the request itself (401 / 403) and returns null
 * when refused, otherwise the user (or ANON_CALLER, an anonymous caller let through).
 */
const { requireUserOrOpen, requestApp } = require('../../routes/auth/requestUser');
const { requireCan, authorize, authMode } = require('../../routes/auth');
const upload = require('../upload/auth');
const { getSubdomain } = require('../../utils/subdomain');

const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];

// 'POST /streams/:sourceId/webhook' → { method, re } matched against req.path inside the plugin router.
function compileOpenRoute(spec) {
    const [method, path] = String(spec).trim().split(/\s+/);
    const pattern = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\?:[A-Za-z_]\w*/g, '[^/]+');
    return { method: method.toUpperCase(), re: new RegExp(`^${pattern}/?$`) };
}

function writeGate(openRoutes = []) {
    const open = openRoutes.map(compileOpenRoute);
    return (req, res, next) => {
        if (READ_METHODS.includes(req.method)) return next();
        if (open.some(o => o.method === req.method && o.re.test(req.path))) return next();
        if (requireUserOrOpen(req, res)) next();
    };
}

/** A publish that creates a source (`create-source` on the named pattern) or adds a version (`create-view` / `update-source`). */
function authorizePublish(req, res, sourceId) {
    return upload.authorizePublish(req, res, sourceId, { open: true });
}

/**
 * `perms` on an existing source, named by `sourceId` or found from `viewId` (the view's own source wins
 * over a body `source_id` that disagrees). With neither, only `enforce` refuses (no source to judge).
 */
async function authorizeSourceWrite(req, res, { sourceId, viewId } = {}, perms) {
    if (viewId != null) {
        const r = await upload.authorizeViewAction(req, res, viewId, perms, sourceId, { open: true });
        return r ? r.user : null;
    }
    if (sourceId != null) return requireCan(req, res, { source: sourceId, verb: perms, open: true });
    const user = requireUserOrOpen(req, res);
    if (user && authMode() === 'enforce') {
        res.status(403).json({ error: 'no source named for this write' });
        return null;
    }
    return user;
}

/** Whether the caller holds one of `perms` on the source, without answering or logging: for what a reply carries. */
async function holdsSourcePermission(req, sourceId, perms) {
    const user = (req.availAuthContext && req.availAuthContext.user) || null;
    return (await authorize({
        env: req.params.pgEnv, sourceId, verb: [].concat(perms), user,
        subdomain: req.headers ? getSubdomain(req) : '', app: requestApp(req) || null,
    })).allow;
}

module.exports = { writeGate, compileOpenRoute, pluginHelpers: { authorizePublish, authorizeSourceWrite, holdsSourcePermission } };
