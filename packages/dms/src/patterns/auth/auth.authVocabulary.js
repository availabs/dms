// The auth pattern's auth vocabulary — see ../authVocabulary.js for the shape.
//
// `auth-users`, `auth-groups` and `view-as` imply nothing structurally: they gate auth ROUTES, and
// the users and groups they manage live in the auth database, not in `data_items`. There is no row
// for the resolver to grant access to, so the honest declaration is `implies: []`.
//
// The site-level verbs appear here too because site access falls back to the auth pattern while the
// admin row grants nothing (utils/adminPermissions.js, `adminRowHasGrants`), so they can genuinely
// be written onto this row.

export const authAuthVocabulary = {
    self: [
        { value: 'edit-pattern',             label: 'Edit Pattern',             implies: ['read', 'edit'] },
        { value: 'edit-pattern-permissions', label: 'Edit Pattern Permissions', implies: ['read', 'edit', 'grant'] },
    ],
    descendants: [
        { value: 'auth-users',        label: 'Manage Users',      implies: [] },
        { value: 'auth-groups',       label: 'Manage Groups',     implies: [] },
        { value: 'view-as',           label: 'View As User',      implies: [] },
        { value: 'view-pattern-list', label: 'View Pattern List', implies: ['read'] },
        { value: 'create-pattern',    label: 'Create Pattern',    implies: ['read', 'create'] },
        { value: 'manage-themes',     label: 'Manage Themes',     implies: ['read', 'edit'] },
        { value: 'manage-tenants',    label: 'Manage Tenants',    implies: ['read', 'edit'] },
    ],
}

export default authAuthVocabulary
