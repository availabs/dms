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
export const PATTERN_ADMIN_PERMISSIONS = [EDIT_PATTERN, EDIT_PATTERN_PERMISSIONS, DELETE_PATTERN];

// ---------------------------------------------------------------------------
// Access editor dropdown options, per pattern_type
// ---------------------------------------------------------------------------

const ALL = { label: '*', value: '*' };

const SITE_OPTIONS = [
    { label: 'View Pattern List', value: VIEW_PATTERN_LIST },
    { label: 'Create Pattern', value: CREATE_PATTERN },
    { label: 'Manage Themes', value: MANAGE_THEMES },
    { label: 'Manage Tenants', value: MANAGE_TENANTS },
];

const AUTH_OPTIONS = [
    { label: 'Manage Users', value: AUTH_USERS },
    { label: 'Manage Groups', value: AUTH_GROUPS },
    { label: 'View As User', value: VIEW_AS },
];

const PATTERN_ADMIN_OPTIONS = [
    { label: 'Edit Pattern', value: EDIT_PATTERN },
    { label: 'Edit Pattern Permissions', value: EDIT_PATTERN_PERMISSIONS },
    { label: 'Delete Pattern', value: DELETE_PATTERN },
];

const PAGE_OPTIONS = [
    { label: 'View Page', value: 'view-page' },
    { label: 'Edit Page Content', value: 'edit-page' },
    { label: 'Create Page', value: 'create-page' },
    { label: 'Edit Page Permissions', value: 'edit-page-permissions' },
    { label: 'Publish Page', value: 'publish-page' },
];

// Pattern-level grants of the source permissions are defaults for every
// source (pattern ⊕ source: datasets/siteConfig.jsx, server uda/sourceAuth.js).
// Keep in step with datasets.format.js's source `authPermissions` domain.
const DATASETS_OPTIONS = [
    // The server needs view-page to load ANY non-auth/admin pattern row
    // (dms-server dms.route.js), datasets included — keep it grantable.
    { label: 'View Pattern', value: 'view-page' },
    { label: 'View Sources', value: 'view-sources' },
    { label: 'View Source', value: 'view-source' },
    { label: 'Download Source', value: 'download-source' },
    { label: 'Update Source', value: 'update-source' },
    { label: 'Create Version', value: 'create-view' },
    { label: 'Manage Downloads', value: 'manage-downloads' },
    { label: 'View Source API', value: 'view-source-api' },
    { label: 'Delete Source', value: 'delete-source' },
    { label: 'Edit Source Permissions', value: 'edit-source-permissions' },
];

// The options the Access editor offers for a pattern. `adminRowHasGrants`:
// while the admin row grants nothing, site access still comes from the auth
// pattern, so the auth pattern offers the site-level list too.
// Only changes what's OFFERED — MultiSelect keeps saved values that aren't in
// its options, so nothing stored is dropped.
export function permissionOptionsFor(patternType, { adminRowHasGrants = true } = {}) {
    switch (patternType) {
        case 'admin':
            return [ALL, ...SITE_OPTIONS];
        case 'auth':
            return [ALL, ...AUTH_OPTIONS, ...(adminRowHasGrants ? [] : SITE_OPTIONS)];
        case 'page':
            return [ALL, ...PATTERN_ADMIN_OPTIONS, ...PAGE_OPTIONS];
        case 'datasets':
            return [ALL, ...PATTERN_ADMIN_OPTIONS, ...DATASETS_OPTIONS];
        default:
            return [ALL, ...PATTERN_ADMIN_OPTIONS];
    }
}

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
// A qa install is never duplicated either: the copy takes a fixed field list
// and would drop the install's own settings and dataset refs.
export function patternActions(user, app, siteAuthPermissions, pattern) {
    const can = perm => patternCan(user, app, siteAuthPermissions, pattern, perm);
    const isCore = ['auth', 'admin'].includes(pattern?.pattern_type);
    const isQa = pattern?.pattern_type === 'qa';
    const edit = can(EDIT_PATTERN);
    const editPermissions = can(EDIT_PATTERN_PERMISSIONS);
    return {
        open: edit || editPermissions,
        edit,
        editPermissions,
        delete: !isCore && can(DELETE_PATTERN),
        duplicate: !isCore && !isQa && edit && siteCan(user, app, siteAuthPermissions, CREATE_PATTERN),
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
