/**
 * Permission gates shared by the upload / publish routes (permissions-ds-upload-publish-routes).
 * Like the sourceAuth Express helpers, each answers the request itself (401 / 403, JSON) and
 * returns null (or false) when the caller is refused.
 *
 * Every route here needs a signed-in user (`requireLogin`, mounted in index.js). On top of that:
 *   - new source:      `create-source` on the datasets pattern the request names (`?dms_pattern=`);
 *   - new version:     `create-view` or `update-source` on the source (as uda `views.create`);
 *   - rows into an internal source (DMS publish / validate): `edit-source-data` or `update-source`.
 * These routes checked nothing before, so `legacy` / `log` allow and log would-denies; `enforce`
 * decides (DMS_SOURCE_AUTH_MODE, see routes/uda/sourceAuth.js).
 */
const {
    authMode, requireUser, requestUserId, requestPatternRef, requireSourcePermission, requirePatternPermission,
} = require('../../routes/uda/sourceAuth');

const ADD_VIEW_PERMS = ['create-view', 'update-source'];
const WRITE_ROWS_PERMS = ['edit-source-data', 'update-source'];

function requireLogin(req, res, next) {
    if (requireUser(req, res)) next();
}

// A staged upload belongs to the user who sent it; another user can't analyse or publish it. Missing
// entries are left to each route (they answer differently). Returns false when refused.
function checkUploadOwner(req, res, entry) {
    if (!entry || String(entry.userId) === String(requestUserId(req))) return true;
    res.status(403).json({ error: 'this upload belongs to another user' });
    return false;
}

/**
 * Gate a publish that creates a source (no `sourceId`) or adds a version to one.
 * `env`: the source's env when it isn't the route's :pgEnv (internal sources). `app`: a DMS app
 * the named pattern must belong to. `allowUnnamed`: with no pattern named, a signed-in user may
 * create the source (image cells and Lexical images upload private file sources from page editors,
 * which name no datasets pattern; owner decision 2026-10-21).
 */
async function authorizePublish(req, res, sourceId, { env, app, allowUnnamed = false } = {}) {
    if (sourceId) return requireSourcePermission(req, res, sourceId, ADD_VIEW_PERMS, { env, wasOpen: true });
    if (allowUnnamed && !requestPatternRef(req)) return requireUser(req, res);
    return requirePatternPermission(req, res, 'create-source', { app });
}

/** Gate a write of rows into each of `sourceIds` (internal sources of `env`); all must pass. */
async function authorizeRowWrite(req, res, sourceIds, env) {
    let user = requireUser(req, res);
    for (const id of [...new Set(sourceIds.filter(id => id != null).map(Number))]) {
        if (!user) return null;
        user = await requireSourcePermission(req, res, id, WRITE_ROWS_PERMS, { env, wasOpen: true });
    }
    // Nothing resolved: the strict rule has no source to check, so only `enforce` refuses.
    if (user && !sourceIds.some(id => id != null) && authMode() === 'enforce') {
        res.status(403).json({ error: 'no source resolved for this write' });
        return null;
    }
    return user;
}

module.exports = { ADD_VIEW_PERMS, WRITE_ROWS_PERMS, requireLogin, checkUploadOwner, authorizePublish, authorizeRowWrite };
