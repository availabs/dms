// Admin panel permissions (shared by the admin and auth patterns, so it lives in utils/ — patterns
// never import from each other): what a user may do at the SITE level (the admin row's
// `authPermissions`, falling back to the auth pattern's — resolved by pattern2routes into
// AdminContext.authPermissions) and what they may do TO ONE PATTERN (that pattern's own
// `authPermissions`).
//
// THE SAME JUDGE AS THE SERVER. `patternCan` runs dms-server's rule interpreter
// (utils/authJudge.js, a verified copy of routes/auth/judge.js) over the `pattern` rule the admin
// format declares (admin.format.js `rules.pattern`, read from the registry) and the grants the
// client already holds — so the site `*` escape, the open-pattern clause (a pattern granting nothing
// is open to whoever may see the pattern list, core patterns excepted) and the name-match are the
// server's, not a hand copy of them. The access matrix:
// planning/tasks/completed/admin-granular-permissions.md.
//
// Unlike utils/auth.js's isUserAuthed, nothing here has an "unconfigured → allow" rule: a site with
// no admin grants lets in only `${app} Admin`.

import { resolveSubdomainAuthPermissions } from './auth.js';
import { holds, judge, judgeEnv } from './authJudge.js';
import { getPatternType } from '../patterns/registry.js';

// Site level — the admin row (falling back to the auth pattern).
export const VIEW_PATTERN_LIST = 'view-pattern-list';
export const CREATE_PATTERN = 'create-pattern';
export const MANAGE_THEMES = 'manage-themes';
export const MANAGE_TENANTS = 'manage-tenants';

// Site level, but stay on the auth pattern: they gate auth routes.
export const AUTH_USERS = 'auth-users';
export const AUTH_GROUPS = 'auth-groups';
export const VIEW_AS = 'view-as';

// Pattern level — on each pattern's own authPermissions, next to its content
// permissions (view-page, edit-page, …).
export const EDIT_PATTERN = 'edit-pattern';
export const EDIT_PATTERN_PERMISSIONS = 'edit-pattern-permissions';
export const DELETE_PATTERN = 'delete-pattern';

// Any one of these opens the Pattern Editor (the tabs are filtered further).
export const PATTERN_EDITOR_PERMISSIONS = [EDIT_PATTERN, EDIT_PATTERN_PERMISSIONS];
// Any one of these means the list row isn't fully locked.
// `DELETE_PATTERN` is NOT here: deleting a pattern is a site operation (owner, 2026-10-30), so it
// is not one of the pattern-row verbs that decide whether a row is shown locked.
export const PATTERN_ADMIN_PERMISSIONS = [EDIT_PATTERN, EDIT_PATTERN_PERMISSIONS];

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export function isAppAdmin(user, app) {
    return (user?.groups || []).some(g => g === `${app} Admin`);
}

// The `pattern` rule, as the admin format declares it and the server reads it. Without a registry
// (a test that never registered the built-ins) the site `*` escape alone applies.
const patternRule = () =>
    getPatternType('admin')?.authRules?.pattern
    || { owner: 'self', escape: { owner: 'site', perms: ['*'] }, ops: {} };

// Whether `user` holds site-level `perm` (or `*`). `siteAuthPermissions` is
// AdminContext.authPermissions — flat or subdomain-keyed, string or object.
// `${app} Admin` always passes; logged-out users never do.
export function siteCan(user, app, siteAuthPermissions, perm) {
    if (!user?.authed) return false;
    if (isAppAdmin(user, app)) return true;
    return holds(user, resolveSubdomainAuthPermissions(siteAuthPermissions, ''), [perm]);
}

// Whether `user` holds pattern-level `perm` on `pattern`, judged by the pattern rule:
// - site `*` (or `${app} Admin`) → everything on every pattern (the rule's `escape`)
// - a pattern with no grants (ignoring the `public` group, which the Access editor seeds into
//   everything it saves) is open to whoever may see the pattern list (`ifOwnerBlank`) — except the
//   auth and admin rows, which hold the site's own grants (`unless`)
// - otherwise the pattern's own grants decide; `*` covers every perm
export function patternCan(user, app, siteAuthPermissions, pattern, perm) {
    if (!user?.authed) return false;
    if (isAppAdmin(user, app)) return true;
    const grants = {
        self: resolveSubdomainAuthPermissions(pattern?.authPermissions, pattern?.subdomain || ''),
        site: resolveSubdomainAuthPermissions(siteAuthPermissions, ''),
    };
    return judge(patternRule(), judgeEnv(user, grants), { op: perm, row: pattern || {} }).allow;
}

// The row actions on the admin list (and the Overview's danger zone) for one
// pattern. Auth and admin rows are never duplicated or deleted from the list.
// `typeAdmin`: the row's registered type's `admin` metadata (patterns/registry.js,
// passed in so this file stays free of pattern imports); a type registered with
// `duplicable: false` is never duplicated either.
export function patternActions(user, app, siteAuthPermissions, pattern, typeAdmin) {
    const can = perm => patternCan(user, app, siteAuthPermissions, pattern, perm);
    const isCore = ['auth', 'admin'].includes(pattern?.pattern_type);
    const duplicable = typeAdmin?.duplicable !== false;
    const edit = can(EDIT_PATTERN);
    const editPermissions = can(EDIT_PATTERN_PERMISSIONS);
    return {
        open: edit || editPermissions,
        edit,
        editPermissions,
        // a site grant, symmetric with `duplicate` below and with the server's site rule
        delete: !isCore && siteCan(user, app, siteAuthPermissions, DELETE_PATTERN),
        duplicate: !isCore && duplicable && edit && siteCan(user, app, siteAuthPermissions, CREATE_PATTERN),
        // nothing at all: shown locked and counted in the no-access banner
        locked: !PATTERN_ADMIN_PERMISSIONS.some(can),
    };
}

// The permission a Pattern Editor tab needs. Access (`permissions`) is the
// only tab behind edit-pattern-permissions; every other tab, including a
// pattern's own custom `pages`, needs edit-pattern.
export function tabPermission(path) {
    return path === 'permissions' ? EDIT_PATTERN_PERMISSIONS : EDIT_PATTERN;
}
