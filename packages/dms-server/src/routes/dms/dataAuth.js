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
 *   - dmsenv / source / view / data — the datasets permissions (uda/sourceAuth.js)
 *   - anything else           — a signed-in user
 * Signed-in callers: the repo's rule, no permission set → open (owner, 2026-10-23; site and datasets checks
 * were strict until then). Anonymous callers pass only where the `public` group explicitly holds the
 * permission (owner, 2026-10-22).
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
    holdsExplicitly, isAppAdmin, unionAuthPermissions, decideSource, sourceIdForView, internalSourceGrants,
} = require('../uda/sourceAuth');
const AUTH_RULES = require('./authRules');
const { judge: judgeRules } = require('./authJudge');

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

// Row columns some clients copy into a whole-row save's data. The timestamps / authors are never
// judged and never written into data; `id` / `app` / `type` count as unchanged when they equal the
// stored data's value or the row's own column (the site editor echoes `type: 'prod:site'`).
const ECHO_ONLY = ['created_at', 'updated_at', 'created_by', 'updated_by'];
const ROW_KEYS = ['id', 'app', 'type'];

/**
 * How an edit is judged and what it writes. Editors often save whole rows (the site editor sends
 * `site_name` with a new `patterns` list; the pattern editor its unchanged `authPermissions`), so a
 * key equal to the stored value is not a change. It is also NOT WRITTEN: `write` holds only the
 * changed keys, each of which the guard judged. So a comparison that wrongly says "equal" (numbers
 * past double precision, say) can only drop a key from the write, never let a value through unjudged.
 *
 * `replace` (sync/push I onto an existing row: the whole data is replaced): a stored key the patch
 * leaves out is removed, so it is a change too; `write` is the full new data, with every key judged
 * unchanged taken from the stored row.
 *
 * Without the stored row (split rows) every key is a change and the patch is written as sent.
 * Returns { keys, write }.
 */
function planEdit(row, patch, { replace = false } = {}) {
    const p = parseJson(patch) || {};
    const s = parseJson(row && row.data);
    if (!s) return { keys: Object.keys(p).filter(k => !ECHO_ONLY.includes(k)), write: p };
    const unchanged = (k) => isEqual(p[k], s[k]) || (ROW_KEYS.includes(k) && row[k] != null && String(p[k]) === String(row[k]));
    const sent = Object.keys(p).filter(k => !ECHO_ONLY.includes(k));
    const changed = sent.filter(k => !unchanged(k));
    const removed = replace ? Object.keys(s).filter(k => !ECHO_ONLY.includes(k) && !(k in p)) : [];
    const pick = (obj, ks) => Object.fromEntries(ks.map(k => [k, obj[k]]));
    const write = replace
        ? { ...pick(s, Object.keys(s).filter(k => ECHO_ONLY.includes(k))), ...pick(s, sent.filter(unchanged)), ...pick(p, changed) }
        : pick(p, changed);
    return { keys: [...changed, ...removed], write };
}

const allow = (reason) => ({ allow: true, reason });
const deny = (reason) => ({ allow: false, reason });
const needs = (perms) => `missing ${[].concat(perms).join(' or ')}`;

// Signed in → the repo's rule (no permission set ⇒ open); anon → explicit grants only (`*` counts for all).
const holds = (user, ap, perms) => (user && user.authed
    ? lenientAuthed({ user, reqPermissions: [].concat(perms), authPermissions: ap || {} })
    : holdsExplicitly({ user: {}, reqPermissions: [].concat(perms), authPermissions: ap || {} }));

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
        return decideSource({ env: internalEnv(slug), sourceId, subdomain, reqPermissions: [].concat(perms), user,
            explicitOnly: !(user && user.authed) });
    }

    // ---- per kind. `op`: create | edit | delete. `row`: { id, type, data } (data = stored row for
    // edits/deletes, the new data for creates). `patch`: the edit's data.
    async function judge(op, row, patch, keys) {
        const type = row.type || '';
        const kind = getKind(type);
        // An edit that changes nothing writes only updated_at / updated_by: any of the row's edit
        // permissions passes it (a permissions-only user re-saving unchanged grants, say).
        const noChange = op === 'edit' && keys.length === 0;
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
                    ...(keys.some(k => k !== 'authPermissions') ? [['edit-pattern']] : []),
                    ...(noChange ? [['edit-pattern', 'edit-pattern-permissions']] : []),
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
                    // `filters` is the editor's Filters pane, which edit-page-params opens
                    const isOther = (k) => k !== 'authPermissions' && k !== 'filters' && !isPublish(k);
                    groups = [
                        ...(keys.includes('authPermissions') ? [['edit-page-permissions']] : []),
                        ...(keys.some(isPublish) ? [['publish-page']] : []),
                        ...(keys.includes('filters') ? [['edit-page', 'edit-page-params']] : []),
                        ...(keys.some(isOther) ? [['edit-page']] : []),
                        ...(noChange ? [['edit-page', 'publish-page', 'edit-page-permissions', 'edit-page-params']] : []),
                    ];
                }
                if (await siteCan('*')) return allow('site *');
                for (const perms of groups) {
                    if (!holds(user, ap, perms)) return deny(`${kind} ${row.id || 'new'} of ${getParent(type)} ${needs(perms)}`);
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
                else if (keys.includes('auth_permissions')) {
                    // and update-source for any other key, as uda.sources.update (owner 2026-10-29)
                    const d = await onSource(row.id, ['edit-source-permissions'], getInstance(type));
                    if (!d.allow || keys.every(k => k === 'auth_permissions')) return d;
                }
                else if (only(['views'])) perms = ['create-view', 'update-source', 'delete-source'];
                else if (noChange) perms = ['update-source', 'edit-source-permissions', 'create-view'];
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

    // ---- TRIAL (DMS_DATA_AUTH_JUDGE=data): the same decision as authRules.js data + the authJudge.js
    // interpreter. The owner lookups below are the part the rules can't express (auth-as-data README).
    async function resolveOwner(name, op, row) {
        const type = row.type || '';
        const ownGrants = () => resolveAuthPermissions((parseJson(row.data) || {}).authPermissions, subdomain);
        const patternOf = async () => {
            const p = await contentPattern(getParent(type));
            return resolveAuthPermissions(p && p.data.authPermissions, subdomain);
        };
        switch (name) {
            case 'site-grants': return siteGrants();
            case 'datasets-grants': return datasetsGrants();
            case 'self-pattern': return ownGrants();
            case 'parent-pattern': return patternOf();
            case 'parent-pattern+row': {
                const p = await patternOf();
                const r = op === 'create' ? {} : ownGrants();
                return { groups: { ...(p.groups || {}), ...(r.groups || {}) }, users: { ...(p.users || {}), ...(r.users || {}) } };
            }
            case 'self-source': return internalSourceGrants(internalEnv(getInstance(type)), row.id, subdomain);
            case 'owning-source': {
                const env = internalEnv(getParent(type));
                return internalSourceGrants(env, await sourceIdForView(env, row.id), subdomain);
            }
            case 'source-by-slug': {
                const slug = getParent(type);
                return internalSourceGrants(internalEnv(slug), await controller.getSourceIdBySlug(app, slug), subdomain);
            }
        }
        return null;
    }

    // Every owner a kind's rule names: its default owner, plus any clause's own.
    function ownersIn(rule) {
        const out = new Set([rule.owner]);
        const walk = (n) => {
            if (n && typeof n === 'object') {
                if (typeof n.owner === 'string') out.add(n.owner);
                Object.values(n).forEach(walk);
            }
        };
        walk(rule);
        return [...out].filter(Boolean);
    }

    async function judgeAsData(op, row, patch, keys) {
        const type = row.type || '';
        const kind = getKind(type);
        const rule = AUTH_RULES[kind];
        const grants = {};
        if (rule) {
            for (const name of ownersIn(rule)) grants[name] = await resolveOwner(name, op, row);
        }
        return judgeRules(AUTH_RULES, {
            user,
            isAppAdmin: false,  // checked by decide()
            grants,
            // an owner that couldn't be found holds nothing (fail closed, as onSource's 'source not found')
            holds: (ap, perms) => (ap == null ? false : holds(user, ap, perms)),
            isBlank: (ap) => ap != null && !hasGrants(ap),
        }, { kind, op, keys, patch: parseJson(patch) || {}, split: isSplitType(type),
            row: op === 'create' ? parseJson(patch) || {} : parseJson(row.data) || {} });
    }

    // `keys`: the edit's changed keys (planEdit); computed here when the caller has none.
    const decide = async (op, row, patch, keys = op === 'edit' ? planEdit(row, patch).keys : []) => {
        if (isAppAdmin(user, app)) return allow(`${app} Admin`);
        try {
            if (process.env.DMS_DATA_AUTH_JUDGE === 'data') return await judgeAsData(op, row, patch, keys);
            return await judge(op, row, patch, keys);
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
 * Throw unless `router.user` may do `op` on `row` (under DMS_DATA_AUTH_MODE). `row` must be the stored
 * row ({ id, app, type, data }) for edits / deletes (see the routes). `patch`: an edit's data;
 * `replace`: the write replaces the whole data (sync/push I onto an existing id).
 * Returns the data to write: for an edit judged against its stored row, only what planEdit judged
 * (see there); otherwise `patch` as given. `legacy` checks and filters nothing.
 * `skipNoChange`: an edit of a stored row that changes nothing returns NO_CHANGE, unjudged, and the caller
 * writes nothing (owner 2026-10-29: a save with no changes is not an update).
 */
const NO_CHANGE = Symbol('no change');

async function assertDataWrite(router, controller, op, app, row, patch, { replace = false, skipNoChange = false } = {}) {
    const mode = dataAuthMode();
    if (mode === 'legacy') return patch;
    const user = (router && router.user) || null;
    const plan = op === 'edit' ? planEdit(row, patch, { replace }) : { keys: [], write: patch };
    if (skipNoChange && op === 'edit' && parseJson(row && row.data) && plan.keys.length === 0) return NO_CHANGE;
    const d = await createJudge({ app, subdomain: (router && router.subdomain) || '', user, controller })(op, row, patch, plan.keys);
    if (d.allow) return plan.write;
    if (mode === 'log') { logWouldDeny(op, app, row, user, d.reason); return plan.write; }
    const e = new Error(user ? `Not authorized: ${d.reason}` : 'Sign in to do this');
    e.status = user ? 403 : 401; // for the REST callers (sync/push)
    throw e;
}

module.exports = { assertDataWrite, NO_CHANGE, dataAuthMode, createJudge, logWouldDeny, planEdit };
