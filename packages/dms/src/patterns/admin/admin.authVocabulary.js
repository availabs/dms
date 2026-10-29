// The admin pattern's auth vocabulary — see ../authVocabulary.js for the shape.
//
// The admin row holds the SITE's grants (utils/adminPermissions.js), so its `descendants` bucket is
// the site-level vocabulary: what a user may do across the site's patterns. `create-pattern` is a
// create against the site row, which is why it is its own verb rather than a flavour of edit.

export const adminAuthVocabulary = {
    self: [
        { value: 'edit-pattern',             label: 'Edit Pattern',             implies: ['read', 'edit'] },
        { value: 'edit-pattern-permissions', label: 'Edit Pattern Permissions', implies: ['read', 'edit', 'grant'] },
    ],
    descendants: [
        { value: 'view-pattern-list', label: 'View Pattern List', implies: ['read'] },
        { value: 'create-pattern',    label: 'Create Pattern',    implies: ['read', 'create'] },
        { value: 'manage-themes',     label: 'Manage Themes',     implies: ['read', 'edit'] },
        { value: 'manage-tenants',    label: 'Manage Tenants',    implies: ['read', 'edit'] },
    ],
}

export default adminAuthVocabulary
