'use strict';

/**
 * Per-source permission enforcement for DAMA sources (datasets-permissions-model · P4).
 *
 * Effective perms = PATTERN ⊕ SOURCE. The source's authPermissions live in
 * `data_manager.sources."authPermissions"` (postgres) / `sources."authPermissions"` (sqlite),
 * populated by `scripts/migrate-source-auth-to-permissions.js`. The pattern's live in the DMS
 * `data_items` (`data->'authPermissions'`).
 *
 * Transition-safe: dms-server had NO prior source enforcement, so if the `authPermissions` column
 * doesn't exist yet (un-migrated pgEnv), `isUserAuthedForSource` returns `true` (no regression —
 * preserves today's open behavior). A migrated source (column present, even `{}`) is enforced
 * STRICTLY: grant only on an explicit perm or `*` — an empty source denies (matches "a source with
 * no grants is modifiable by no one").
 *
 * `resolveAuthPermissions` (subdomain-aware) is reused from ../dms/auth; the merge + strict check
 * mirror the client `utils/auth.js` (client keeps a "logged-in ⇒ allow" UI escape hatch; the server
 * deliberately does not).
 */
const { resolveAuthPermissions } = require('../dms/auth');

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

// STRICT: grant only on an explicit perm or `*`. No "logged-in ⇒ allow" / "unconfigured ⇒ allow".
function isUserAuthed({ user = {}, reqPermissions = [], authPermissions = {} }) {
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

const sourcesTable = (db) => (db.type === 'postgres' ? 'data_manager.sources' : 'sources');
const dataItemsTable = (db) => (db.type === 'postgres' ? 'dms.data_items' : 'data_items');

// source's own authPermissions; `undefined` ⇒ column missing (un-migrated env → caller allows)
async function getSourceAuthPermissions(db, sourceId) {
    try {
        const { rows } = await db.query(
            `SELECT auth_permissions AS ap FROM ${sourcesTable(db)} WHERE source_id = $1`,
            [sourceId]
        );
        if (!rows.length) return undefined;
        return rows[0].ap == null ? {} : rows[0].ap; // column exists but null/default → enforce as {}
    } catch (e) {
        return undefined; // column doesn't exist yet
    }
}

// pattern authPermissions from the DMS data_items (best-effort; {} if absent)
async function getPatternAuthPermissions(db, patternId, subdomain = '') {
    if (!patternId) return {};
    try {
        const { rows } = await db.query(
            `SELECT data->'authPermissions' AS ap FROM ${dataItemsTable(db)} WHERE id = $1`,
            [patternId]
        );
        return resolveAuthPermissions(rows[0] && rows[0].ap, subdomain);
    } catch (e) {
        return {};
    }
}

/**
 * Authorize `user` for `reqPermissions` on `sourceId` (pattern ⊕ source, strict).
 * Returns true (no enforcement) for un-migrated envs where the column is absent.
 */
async function isUserAuthedForSource({ db, sourceId, patternId, subdomain = '', reqPermissions, user }) {
    const sourceAP = await getSourceAuthPermissions(db, sourceId);
    if (sourceAP === undefined) return true; // un-migrated env — preserve today's open behavior
    const patternAP = await getPatternAuthPermissions(db, patternId, subdomain);
    return isUserAuthed({ user, reqPermissions, authPermissions: mergeAuthPermissions(patternAP, sourceAP) });
}

module.exports = {
    mergeAuthPermissions,
    isUserAuthed,
    getSourceAuthPermissions,
    getPatternAuthPermissions,
    isUserAuthedForSource,
};
