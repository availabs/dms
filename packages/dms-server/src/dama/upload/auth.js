/**
 * Permission gates shared by the upload / publish routes. Each answers the request itself (401 / 403,
 * JSON) and returns null (or false) when the caller is refused.
 *
 * Every route here needs a signed-in user (`requireLogin`, mounted in index.js). On top of that:
 *   - new source:      `create-source` on the env the source is created in (its `:dmsenv` row);
 *   - new version:     `create-view` or `update-source` on the source (as uda `views.create`);
 *   - rows into an internal source (DMS publish / validate): `edit-source-data` or `update-source`;
 *   - a view's downloads and PM tiles: `manage-downloads` on the view's source.
 * All under `DMS_AUTH_MODE` (routes/auth): `log` allows and logs would-denies, `enforce` refuses.
 */
const { requireUser, requireUserOrOpen, requestUserId, requestApp } = require('../../routes/auth/requestUser');
const { requireCan, authorize, applyMode, sourceOfView, siteCan, patternRow, authMode } = require('../../routes/auth');
const { getSubdomain } = require('../../utils/subdomain');

const ADD_VIEW_PERMS = ['create-view', 'update-source'];
const WRITE_ROWS_PERMS = ['edit-source-data', 'update-source'];
const MANAGE_DOWNLOADS_PERMS = ['manage-downloads'];

function requireLogin(req, res, next) {
    if (requireUser(req, res)) next();
}

// A staged upload belongs to the user who sent it; another user can't analyse or publish it.
function checkUploadOwner(req, res, entry) {
    if (!entry || String(entry.userId) === String(requestUserId(req))) return true;
    res.status(403).json({ error: 'this upload belongs to another user' });
    return false;
}

const siteOf = (req) => requestApp(req) || null;

/**
 * Gate a publish that creates a source (no `sourceId`) or adds a version to one. `env`: the source's
 * env when it isn't the route's :pgEnv (internal sources). `app`: the site whose env row locates an
 * external env. `allowUnnamed`: with no site named, a signed-in user may create the source (page
 * editors upload private file sources from outside any datasets pattern). `open`: the route answered
 * anyone before, so an anonymous caller is judged by `requireUserOrOpen`.
 */
async function authorizePublish(req, res, sourceId, { env, app, allowUnnamed = false, open = false } = {}) {
    if (sourceId) return requireCan(req, res, { source: sourceId, verb: ADD_VIEW_PERMS, env, open });
    if (allowUnnamed && !(app || requestApp(req))) return open ? requireUserOrOpen(req, res) : requireUser(req, res);
    return requireCan(req, res, { verb: 'create-source', env: env || true, app, open });
}

/** Gate a write of rows into each of `sourceIds` (internal sources of `env`); all must pass. */
async function authorizeRowWrite(req, res, sourceIds, env) {
    let user = requireUser(req, res);
    for (const id of [...new Set(sourceIds.filter(id => id != null).map(Number))]) {
        if (!user) return null;
        user = await requireCan(req, res, { source: id, verb: WRITE_ROWS_PERMS, env });
    }
    // Nothing resolved: there is no source to judge, so only `enforce` refuses.
    if (user && !sourceIds.some(id => id != null) && authMode() === 'enforce') {
        res.status(403).json({ error: 'no source resolved for this write' });
        return null;
    }
    return user;
}

/**
 * Gate an action on a view's downloads / tiles: `perms` on the source the view belongs to, found from
 * the view, not from the body's `source_id`. Returns `{ user, sourceId }` or null when refused.
 */
async function authorizeViewAction(req, res, viewId, perms, bodySourceId, { open = false } = {}) {
    const caller = open ? requireUserOrOpen(req, res) : requireUser(req, res);
    if (!caller) return null;
    const env = req.params.pgEnv;
    const sourceId = await sourceOfView(env, viewId, siteOf(req));
    if (sourceId != null && bodySourceId != null && +bodySourceId !== sourceId) {
        console.warn(`[auth] view ${env}/${viewId} belongs to source ${sourceId}, body named ${bodySourceId}; using ${sourceId}`);
    }
    const id = sourceId ?? bodySourceId;
    const user = await requireCan(req, res, { source: id ?? 0, verb: perms, open });
    return user ? { user, sourceId: id } : null;
}

/**
 * Gate a pattern action (duplicate, sync-filters) the way the admin UI gates its button: `perms` on
 * the pattern `app` + (`id` or `instance`), plus optional site-level `sitePerms` on `siteApp`. A
 * signed-in user is always required. Returns the user, or null when refused.
 */
async function requirePatternAction(req, res, _controller, { app, id, instance, perms, siteApp = app, sitePerms }) {
    const user = requireUser(req, res);
    if (!user) return null;
    const subdomain = req.headers ? getSubdomain(req) : '';
    let d;
    try {
        const row = await patternRow(app, { id, instance });
        if (!row) d = { allow: false, reason: `pattern ${app}/${id ?? instance} not found` };
        else {
            d = await authorize({ row, verb: perms, user, app, subdomain, fresh: true });
            if (d.allow && sitePerms && !(await siteCan(siteApp, user, sitePerms, subdomain))) {
                d = { allow: false, reason: `missing site ${[].concat(sitePerms).join(' or ')} on ${siteApp}` };
            }
        }
    } catch (e) {
        d = { allow: false, reason: `lookup failed: ${e.message}` };
    }
    const target = `${req.method} ${(req.originalUrl || req.url || '').split('?')[0]}`;
    if (applyMode(d, { guard: 'upload', kind: 'route', target, perms: [].concat(perms, sitePerms || []), user, app })) return user;
    res.status(403).json({ error: `Not authorized: ${d.reason}` });
    return null;
}

module.exports = { requirePatternAction, authorizeViewAction, ADD_VIEW_PERMS, WRITE_ROWS_PERMS, MANAGE_DOWNLOADS_PERMS, requireLogin, checkUploadOwner, authorizePublish, authorizeRowWrite };
