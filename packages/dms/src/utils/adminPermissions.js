// Admin panel permissions (shared by the admin and auth patterns, so it lives
// in utils/ — patterns never import from each other): what a user may do at the SITE level (the admin
// row's `authPermissions`, falling back to the auth pattern's — resolved by
// pattern2routes into AdminContext.authPermissions) and what they may do TO
// ONE PATTERN (that pattern's own `authPermissions`).
//
// See planning/tasks/completed/admin-granular-permissions.md for the access
// matrix these functions implement.
//
// Every check here is UI-only: `dms.data.edit` has no server-side
// authorization, so a user denied here can still write through Falcor or the
// CLI (defect B in auth-permission-chain-and-unguarded-writes.md).
//
// Unlike utils/auth.js's isUserAuthed, nothing here has an "unconfigured →
// allow" rule: a site with no admin grants lets in only `${app} Admin`.

import { resolveSubdomainAuthPermissions, hasAuthGrants } from './auth.js';

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

// Access editor dropdown options used to live here, as a `permissionOptionsFor` switch over
// pattern_type plus five hand-written option lists (SITE/AUTH/PATTERN_ADMIN/PAGE/DATASETS). They
// were a fifth copy of verbs already declared in the formats' `permissionDomain`s, and they drifted
// — PAGE_OPTIONS was an item-for-item hand-copy of page.format.js's domain, missing
// `edit-page-params`. The list is now composed from the derived vocabulary by
// `patternPermissionOptions` in patterns/registry.js, which is where the registry entries live.
// See planning/tasks/current/permission-domain-single-source.md.

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export function isAppAdmin(user, app) {
    return (user?.groups || []).some(g => g === `${app} Admin`);
}

// Every permission `user` holds in a resolved {groups, users} object.
function userPermissions(user, resolved) {
    const groups = resolved?.groups || {};
    const users = resolved?.users || {};
    const asList = p => (Array.isArray(p) ? p : p ? [p] : []);
    return [
        ...asList(users[user?.id]),
        ...(user?.groups || []).filter(g => groups[g]).flatMap(g => asList(groups[g])),
    ];
}

const holds = (perms, perm) => perms.some(p => p === '*' || p === perm);

// Whether `user` holds site-level `perm` (or `*`). `siteAuthPermissions` is
// AdminContext.authPermissions — flat or subdomain-keyed, string or object.
// `${app} Admin` always passes; logged-out users never do.
export function siteCan(user, app, siteAuthPermissions, perm) {
    if (!user?.authed) return false;
    if (isAppAdmin(user, app)) return true;
    const resolved = resolveSubdomainAuthPermissions(siteAuthPermissions, '');
    const perms = userPermissions(user, resolved);
    return perm === '*' ? perms.includes('*') : holds(perms, perm);
}

// Whether `user` holds pattern-level `perm` on `pattern`.
// - site `*` (or `${app} Admin`) → everything on every pattern
// - a pattern with no grants (ignoring the `public` group, which the Access
//   editor seeds into everything it saves) is open: anyone who can reach the
//   list page has full control of it
// - …except the auth and admin rows, which are never open: their Access tab
//   holds the site's own grants, so an open one would let a
//   `view-pattern-list` user grant themselves `*`
// - otherwise the pattern's own grants decide; `*` covers every perm
export function patternCan(user, app, siteAuthPermissions, pattern, perm) {
    if (!user?.authed) return false;
    if (siteCan(user, app, siteAuthPermissions, '*')) return true;
    const raw = pattern?.authPermissions;
    const subdomain = pattern?.subdomain || '';
    const isCore = ['auth', 'admin'].includes(pattern?.pattern_type);
    if (!isCore && !hasAuthGrants(raw, subdomain)) return siteCan(user, app, siteAuthPermissions, VIEW_PATTERN_LIST);
    const perms = userPermissions(user, resolveSubdomainAuthPermissions(raw, subdomain));
    return holds(perms, perm);
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
        // a site grant, symmetric with `duplicate` below and with dms-server's dataAuth.js
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
