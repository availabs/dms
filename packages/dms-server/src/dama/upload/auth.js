/**
 * Permission gates shared by the upload / publish routes (permissions-ds-upload-publish-routes).
 * Like the sourceAuth Express helpers, each answers the request itself (401 / 403, JSON) and
 * returns null (or false) when the caller is refused.
 *
 * Every route here needs a signed-in user (`requireLogin`, mounted in index.js). On top of that:
 *   - new source:      `create-source` on the datasets pattern the request names (`?dms_pattern=`);
 *   - new version:     `create-view` or `update-source` on the source (as uda `views.create`);
 *   - rows into an internal source (DMS publish / validate): `edit-source-data` or `update-source`;
 *   - a view's downloads and PM tiles (create / delete download, cache-pmtiles): `manage-downloads` on the
 *     view's source.
 * These routes checked nothing before, so `legacy` / `log` allow and log would-denies; `enforce`
 * decides (DMS_SOURCE_AUTH_MODE, see routes/uda/sourceAuth.js).
 */
const {
    authMode, requireUser, requireUserOrOpen, requestUserId, requestPatternRef, requireSourcePermission, requirePatternPermission,
    sourceIdForView,
} = require('../../routes/uda/sourceAuth');

const { createJudge, dataAuthMode } = require('../../routes/dms/dataAuth');
const { getInstance } = require('#db/type-utils.js');
const { getSubdomain } = require('../../utils/subdomain');

const ADD_VIEW_PERMS = ['create-view', 'update-source'];
const WRITE_ROWS_PERMS = ['edit-source-data', 'update-source'];
const MANAGE_DOWNLOADS_PERMS = ['manage-downloads'];

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
async function authorizePublish(req, res, sourceId, { env, app, allowUnnamed = false, anonWasOpen = false } = {}) {
    if (sourceId) return requireSourcePermission(req, res, sourceId, ADD_VIEW_PERMS, { env, wasOpen: true, anonWasOpen });
    if (allowUnnamed && !requestPatternRef(req)) return anonWasOpen ? requireUserOrOpen(req, res) : requireUser(req, res);
    return requirePatternPermission(req, res, 'create-source', { app, anonWasOpen });
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

/**
 * Gate an action on a view's downloads / tiles (create-download, delete-download, cache-pmtiles): `perms` on
 * the source the view belongs to, found from the view (`views.source_id`), not from the body's `source_id`.
 * Returns `{ user, sourceId }` (the view's own source, or the body's when the view has none, which the strict
 * rule then denies), or null when refused. These routes checked nothing before: `legacy` / `log` allow.
 */
async function authorizeViewAction(req, res, viewId, perms, bodySourceId, { anonWasOpen = false } = {}) {
    const caller = anonWasOpen ? requireUserOrOpen(req, res) : requireUser(req, res);
    if (!caller) return null;
    const env = req.params.pgEnv;
    const sourceId = await sourceIdForView(env, viewId);
    if (sourceId != null && bodySourceId != null && +bodySourceId !== sourceId) {
        console.warn(`[source-auth] view ${env}/${viewId} belongs to source ${sourceId}, body named ${bodySourceId}; using ${sourceId}`);
    }
    const id = sourceId ?? bodySourceId;
    const user = await requireSourcePermission(req, res, id ?? 0, perms, { wasOpen: true, anonWasOpen });
    return user ? { user, sourceId: id } : null;
}

/**
 * Gate a pattern action (duplicate, sync-filters) the way the admin UI gates its button: `perms` on the
 * pattern `app` + (`id` or `instance`), plus optional site-level `sitePerms` on `siteApp`. Judged by
 * routes/dms/dataAuth.js under DMS_DATA_AUTH_MODE (these routes checked nothing before: `log` allows
 * and logs). A signed-in user is always required. Returns the user, or null when refused.
 */
async function requirePatternAction(req, res, controller, { app, id, instance, perms, siteApp = app, sitePerms }) {
    const user = requireUser(req, res);
    if (!user) return null;
    const mode = dataAuthMode();
    if (mode === 'legacy') return user;
    const subdomain = req.headers ? getSubdomain(req) : '';
    const judge = createJudge({ app, subdomain, user, controller });
    let reason = null;
    try {
        const rows = await judge.patterns();
        const row = rows.find(r => (id != null ? +r.id === +id : true)
            && (instance ? getInstance(r.type) === instance : true)
            && !['admin', 'auth'].includes(r.data.pattern_type));
        if (!row) reason = `pattern ${app}/${id ?? instance} not found`;
        else if (!(await judge.patternCan(row.data, perms))) reason = `missing ${[].concat(perms).join(' or ')} on pattern ${row.id}`;
        else if (sitePerms) {
            const siteJudge = siteApp === app ? judge : createJudge({ app: siteApp, subdomain, user, controller });
            if (!(await siteJudge.siteCan(sitePerms))) reason = `missing site ${[].concat(sitePerms).join(' or ')} on ${siteApp}`;
        }
    } catch (e) {
        reason = `lookup failed: ${e.message}`;
    }
    if (!reason) return user;
    if (mode === 'log') {
        console.warn(`[data-auth] would-deny ${req.method} ${req.originalUrl || req.url} user=${user.id ?? user.email} ` +
            `groups=${(user.groups || []).join('|')} reason=${reason}`);
        return user;
    }
    res.status(403).json({ error: `Not authorized: ${reason}` });
    return null;
}

module.exports = { requirePatternAction, authorizeViewAction, ADD_VIEW_PERMS, WRITE_ROWS_PERMS, MANAGE_DOWNLOADS_PERMS, requireLogin, checkUploadOwner, authorizePublish, authorizeRowWrite };
