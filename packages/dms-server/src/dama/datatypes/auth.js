/**
 * Permission checks for data-type plugin routes (dms-template planning/shared datatype-plugin-route-permissions).
 *
 * Plugin routes used to answer anyone, so two layers now sit on them:
 *   - writeGate, put in front of every plugin router by mountDatatypeRoutes: a write (anything but GET /
 *     HEAD / OPTIONS) needs a signed-in user, unless the plugin lists the route in `openRoutes`
 *     (a webhook with its own secret, a read served over POST);
 *   - the plugin helpers below, which each write route calls for its source / pattern permission.
 *
 * Both follow DMS_SOURCE_AUTH_MODE as for any route that was open (routes/uda/sourceAuth.js): `enforce`
 * refuses, `log` lets the call through and logs a would-deny line, `legacy` lets it through.
 * Each helper answers the request itself (401 / 403) and returns null when the caller is refused,
 * otherwise the user (or ANON_CALLER, an anonymous caller let through: its id is null).
 */
const { authMode, requireUserOrOpen, requireSourcePermission } = require('../../routes/uda/sourceAuth');
const upload = require('../upload/auth');

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

/** A publish that creates a source (no `sourceId`: `create-source` on the named pattern) or adds a version
 *  to one (`create-view` or `update-source` on it). */
function authorizePublish(req, res, sourceId) {
    return upload.authorizePublish(req, res, sourceId, { anonWasOpen: true });
}

/**
 * `perms` on an existing source, named by `sourceId` or found from `viewId` (the view's own source wins
 * over a body `source_id` that disagrees). With neither, only `enforce` refuses (no source to judge).
 */
async function authorizeSourceWrite(req, res, { sourceId, viewId } = {}, perms) {
    if (viewId != null) {
        const r = await upload.authorizeViewAction(req, res, viewId, perms, sourceId, { anonWasOpen: true });
        return r ? r.user : null;
    }
    if (sourceId != null) return requireSourcePermission(req, res, sourceId, perms, { wasOpen: true, anonWasOpen: true });
    const user = requireUserOrOpen(req, res);
    if (user && authMode() === 'enforce') {
        res.status(403).json({ error: 'no source named for this write' });
        return null;
    }
    return user;
}

module.exports = { writeGate, compileOpenRoute, pluginHelpers: { authorizePublish, authorizeSourceWrite } };
