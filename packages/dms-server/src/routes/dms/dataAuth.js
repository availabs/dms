'use strict';

/**
 * Permission checks on the `dms.data.*` writes (defects B/E in
 * planning/tasks/current/auth-permission-chain-and-unguarded-writes.md, "B/E design").
 *
 * Each write is judged by the kind of row it touches (`getKind(type)`) and, for edits, by the keys it
 * changes. `${app} Admin` passes everything. The permission per kind:
 *   - site / theme / tenant   — site-level grants (the admin row's, falling back to the auth pattern's)
 *   - pattern                 — the pattern's own grants, as the admin UI's `patternCan`
 *   - page / component        — pattern ⊕ page grants, as the read gate in dms.route.js
 *   - dmsenv / source / view / data — the datasets permissions (uda/sourceAuth.js, strict)
 *   - anything else           — a signed-in user
 * Anonymous callers pass only where the `public` group explicitly holds the permission; the "no grants
 * ⇒ open" leniency of page / pattern content is for signed-in users only.
 *
 * Rollout (`DMS_DATA_AUTH_MODE`):
 *   - `legacy`  — nothing checked (today's behaviour).
 *   - `log`     — (default) allowed; every write the rule would refuse is logged
 *                 (`[data-auth] would-deny …`) so grants can be fixed before anything flips.
 *   - `enforce` — the rule decides; a refused write throws.
 * A failed lookup denies (fail closed).
 */
const { isEqual } = require('lodash');
const { getKind, getParent, getInstance, isSplitType } = require('#db/type-utils.js');
const { isUserAuthed: lenientAuthed, resolveAuthPermissions } = require('./auth');
const {
    isUserAuthed: strictAuthed, isAppAdmin, unionAuthPermissions, decideSource, sourceIdForView,
} = require('../uda/sourceAuth');

function dataAuthMode() {
    const m = String(process.env.DMS_DATA_AUTH_MODE || 'log').toLowerCase();
    return ['legacy', 'log', 'enforce'].includes(m) ? m : 'log';
}

const parseJson = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
    return v;
};

// Grants besides the `public` group (the Access editor seeds `public` into everything it saves).
// Mirrors the client's utils/auth.js hasAuthGrants.
const hasGrants = (ap) =>
    Object.keys((ap && ap.groups) || {}).some(g => g !== 'public') || Object.keys((ap && ap.users) || {}).length > 0;

// Row columns a client echoes back in its data (whole-row saves); never a change.
const ROW_COLUMNS = ['id', 'app', 'type', 'created_at', 'updated_at', 'created_by', 'updated_by'];

// The keys an edit actually changes. Editors often save the whole row (the site editor sends
// `site_name` with a new `patterns` list; the pattern editor sends its unchanged `authPermissions`),
// so a key whose value equals the stored one doesn't count. Without the stored row (split rows),
// every key counts.
function changedKeys(patch, stored) {
    const p = parseJson(patch) || {};
    const s = parseJson(stored);
    return Object.keys(p).filter(k => !ROW_COLUMNS.includes(k) && !(s && isEqual(parseJson(p[k]) ?? p[k], parseJson(s[k]) ?? s[k])));
}

const allow = (reason) => ({ allow: true, reason });
const deny = (reason) => ({ allow: false, reason });
const needs = (perms) => `missing ${[].concat(perms).join(' or ')}`;

// Every perm the user holds in resolved grants (`*` counts for all).
const holds = (user, ap, perms) => strictAuthed({ user: user || {}, reqPermissions: [].concat(perms), authPermissions: ap || {} });

// Page / pattern content: signed in → the read gate's rule (no grants ⇒ open); anon → explicit grants only.
const contentAuthed = (user, ap, perms) => (user && user.authed
    ? lenientAuthed({ user, reqPermissions: [].concat(perms), authPermissions: ap || {} })
    : holds(null, ap, perms));

/**
 * One judge per write. `ctx`: { app, subdomain, user, controller }. Pattern rows of the app are read
 * once per judge (sites have a handful).
 */
function createJudge(ctx) {
    const { app, subdomain = '', user, controller } = ctx;
    let patternRows;
    const patterns = async () => {
        if (!patternRows) {
            patternRows = (await controller.getPatternRows(app)).map(r => ({
                id: r.id, type: r.type, data: parseJson(r.data) || {},
            }));
        }
        return patternRows;
    };

    // Site-level grants: the admin row's, falling back to the auth pattern's while it grants nothing
    // (as pattern2routes resolves AdminContext.authPermissions).
    async function siteGrants() {
        const rows = await patterns();
        const of = (pt) => unionAuthPermissions(rows
            .filter(r => r.data.pattern_type === pt)
            .map(r => resolveAuthPermissions(r.data.authPermissions, subdomain)));
        const admin = of('admin');
        return hasGrants(admin) ? admin : of('auth');
    }

    async function siteCan(perms) {
        return holds(user, await siteGrants(), [].concat(perms));
    }

    // Mirrors utils/adminPermissions.js patternCan: site `*` → all; a non-core pattern with no grants
    // is open to whoever may see the pattern list; otherwise the pattern's own grants.
    async function patternCan(pattern, perms) {
        if (await siteCan('*')) return true;
        const ap = resolveAuthPermissions(pattern && pattern.authPermissions, subdomain);
        const isCore = ['auth', 'admin'].includes(pattern && pattern.pattern_type);
        if (user && user.authed && !isCore && !hasGrants(ap)) return siteCan('view-pattern-list');
        return holds(user, ap, perms);
    }

    // The content pattern with this instance name (skips admin/auth rows sharing it, as
    // getPatternAuthPermissions does).
    async function contentPattern(instance) {
        const rows = await patterns();
        return rows.find(r => getInstance(r.type) === instance && !['admin', 'auth'].includes(r.data.pattern_type)) || null;
    }

    async function datasetsGrants() {
        const rows = (await patterns()).filter(r => r.data.pattern_type === 'datasets');
        return unionAuthPermissions(rows.map(r => resolveAuthPermissions(r.data.authPermissions, subdomain)));
    }

    const internalEnv = (slug) => `${app}+${slug || 'internal'}`;

    async function onSource(sourceId, perms, slug) {
        if (!sourceId) return deny('source not found');
        return decideSource({ env: internalEnv(slug), sourceId, subdomain, reqPermissions: [].concat(perms), user });
    }

    // ---- per kind. `op`: create | edit | delete. `row`: { id, type, data } (data = stored row for
    // edits/deletes, the new data for creates). `patch`: the edit's data.
    async function judge(op, row, patch) {
        const type = row.type || '';
        const kind = getKind(type);
        const keys = op === 'edit' ? changedKeys(patch, row.data) : [];
        // an edit that changes nothing writes only updated_at / updated_by: judged as any edit of the row
        const only = (allowed) => keys.length > 0 && keys.every(k => allowed.includes(k));

        switch (kind) {
            case 'site': {
                if (op !== 'edit') return (await siteCan('*')) ? allow('site grant') : deny(`site ${needs('*')}`);
                // each changed key needs its own grant; anything not listed needs site `*`
                const SITE_KEYS = {
                    patterns: ['create-pattern', 'delete-pattern'],
                    theme_refs: ['manage-themes'],
                    tenants: ['manage-tenants'],
                };
                for (const k of keys.length ? keys : ['*']) {
                    if (k === 'dms_envs') {
                        // a new dmsEnv registered on the site (datasets settings)
                        if (!holds(user, await datasetsGrants(), ['create-source', 'edit-pattern']) && !(await siteCan('*'))) {
                            return deny(`site dms_envs ${needs(['create-source', 'edit-pattern'])}`);
                        }
                        continue;
                    }
                    const perms = SITE_KEYS[k] || ['*'];
                    if (!(await siteCan(perms))) return deny(`site ${k} ${needs(perms)}`);
                }
                return allow('site grant');
            }
            case 'theme':
                return (await siteCan('manage-themes')) ? allow('site grant') : deny(`site ${needs('manage-themes')}`);
            case 'tenant':
                return (await siteCan('manage-tenants')) ? allow('site grant') : deny(`site ${needs('manage-tenants')}`);

            case 'pattern': {
                if (op === 'create') {
                    return (await siteCan('create-pattern')) ? allow('site grant') : deny(`site ${needs('create-pattern')}`);
                }
                const pattern = parseJson(row.data) || {};
                const groups = op === 'delete' ? [['delete-pattern']] : [
                    ...(keys.includes('authPermissions') ? [['edit-pattern-permissions']] : []),
                    ...(!keys.length || keys.some(k => k !== 'authPermissions') ? [['edit-pattern']] : []),
                ];
                for (const perms of groups) {
                    if (!(await patternCan(pattern, perms))) return deny(`pattern ${row.id} ${needs(perms)}`);
                }
                return allow('pattern grant');
            }

            case 'page':
            case 'component':
            case 'page-edit': {  // page-edit: a page's edit history, written by whoever edits it
                const pattern = await contentPattern(getParent(type));
                const patternAP = resolveAuthPermissions(pattern && pattern.data.authPermissions, subdomain);
                const pageAP = kind === 'page' && op !== 'create'
                    ? resolveAuthPermissions((parseJson(row.data) || {}).authPermissions, subdomain) : {};
                const ap = {
                    groups: { ...(patternAP.groups || {}), ...(pageAP.groups || {}) },
                    users: { ...(patternAP.users || {}), ...(pageAP.users || {}) },
                };
                let groups;
                if (kind !== 'page') groups = [['edit-page', 'publish-page']];
                else if (op === 'create') groups = [['create-page']];
                else if (op === 'delete') groups = [['edit-page']];
                else {
                    // publish() copies the drafts into these. `published: 'draft'` is what a new or
                    // unpublished page carries, not a publish.
                    const patchData = parseJson(patch) || {};
                    const isPublish = (k) => ['sections', 'section_groups', 'dataSources'].includes(k)
                        || (k === 'published' && patchData.published !== 'draft');
                    groups = [
                        ...(keys.includes('authPermissions') ? [['edit-page-permissions']] : []),
                        ...(keys.some(isPublish) ? [['publish-page']] : []),
                        ...(!keys.length || keys.some(k => k !== 'authPermissions' && !isPublish(k)) ? [['edit-page']] : []),
                    ];
                }
                if (await siteCan('*')) return allow('site *');
                for (const perms of groups) {
                    if (!contentAuthed(user, ap, perms)) return deny(`${kind} ${row.id || 'new'} of ${getParent(type)} ${needs(perms)}`);
                }
                return allow('page grant');
            }

            case 'dmsenv': {
                const perms = ['create-source', 'delete-source', 'edit-pattern'];
                return holds(user, await datasetsGrants(), perms) ? allow('datasets grant') : deny(`dmsenv ${needs(perms)}`);
            }
            case 'source': {
                if (op === 'create') {
                    return holds(user, await datasetsGrants(), 'create-source') ? allow('datasets grant') : deny(`source ${needs('create-source')}`);
                }
                let perms = ['update-source'];
                if (op === 'delete') perms = ['delete-source'];
                else if (keys.includes('auth_permissions')) perms = ['edit-source-permissions'];
                else if (only(['views'])) perms = ['create-view', 'update-source', 'delete-source'];
                return onSource(row.id, perms, getInstance(type));
            }
            case 'view': {
                const slug = getParent(type);
                const sourceId = op === 'create'
                    ? await controller.getSourceIdBySlug(app, slug)
                    : await sourceIdForView(internalEnv(slug), row.id);
                const perms = op === 'create' ? ['create-view'] : op === 'delete' ? ['delete-source'] : ['update-source', 'create-view'];
                return onSource(sourceId, perms, slug);
            }
            case 'data': {
                if (!isSplitType(type)) break;
                const slug = getParent(type);
                return onSource(await controller.getSourceIdBySlug(app, slug), ['edit-source-data'], slug);
            }
        }
        return user ? allow('signed in') : deny('sign in required');
    }

    const decide = async (op, row, patch) => {
        if (isAppAdmin(user, app)) return allow(`${app} Admin`);
        try {
            return await judge(op, row, patch);
        } catch (e) {
            return deny(`lookup failed: ${e.message}`);
        }
    };
    // for the pattern REST routes (dama/upload/auth.js requirePatternAction)
    decide.patterns = patterns;
    decide.siteCan = async (perms) => isAppAdmin(user, app) || siteCan(perms);
    decide.patternCan = async (pattern, perms) => isAppAdmin(user, app) || patternCan(pattern, perms);
    return decide;
}

function logWouldDeny(op, app, row, user, reason) {
    console.warn(`[data-auth] would-deny ${op} ${app}/${row.id || 'new'} type=${row.type} ` +
        `user=${(user && (user.id ?? user.email)) ?? 'anon'} groups=${((user && user.groups) || []).join('|')} reason=${reason}`);
}

/**
 * Throw unless `router.user` may do `op` on `row` (under DMS_DATA_AUTH_MODE). `row.type` must be the
 * stored type for edits / deletes (see the routes). `patch`: an edit's data.
 */
async function assertDataWrite(router, controller, op, app, row, patch) {
    const mode = dataAuthMode();
    if (mode === 'legacy') return;
    const user = (router && router.user) || null;
    const d = await createJudge({ app, subdomain: (router && router.subdomain) || '', user, controller })(op, row, patch);
    if (d.allow) return;
    if (mode === 'log') { logWouldDeny(op, app, row, user, d.reason); return; }
    const e = new Error(user ? `Not authorized: ${d.reason}` : 'Sign in to do this');
    e.status = user ? 403 : 401; // for the REST callers (sync/push)
    throw e;
}

module.exports = { assertDataWrite, dataAuthMode, createJudge, logWouldDeny };
