// The datasets pattern's auth vocabulary — see ../authVocabulary.js for the shape.
//
// Pattern-level grants of the source verbs are defaults for every source (pattern ⊕ source:
// siteConfig.jsx, server uda/sourceAuth.js), which is exactly what `descendants` means.
//
// Several verbs imply NOTHING structurally. They are real permissions the client enforces, but no
// row stands behind them — `download-source` gates an artifact, `view-source-api` gates a UI
// affordance. Declaring them with `implies: []` is the point: the vocabulary says the verb exists
// and confers no row access, rather than leaving the server to guess from the name.

export const datasetsAuthVocabulary = {
    self: [
        { value: 'edit-pattern',             label: 'Edit Pattern',             implies: ['read', 'edit'] },
        { value: 'edit-pattern-permissions', label: 'Edit Pattern Permissions', implies: ['read', 'edit', 'grant'] },
        { value: 'delete-pattern',           label: 'Delete Pattern',           implies: ['read', 'delete'] },
        // The server needs view-page to load ANY non-auth/admin pattern row, datasets included.
        { value: 'view-page',                label: 'View Pattern',             implies: ['read'] },
    ],
    descendants: [
        { value: 'view-page',               label: 'View Pattern',          implies: ['read'] },
        { value: 'view-sources',            label: 'View Sources',          implies: ['read'] },
        { value: 'view-source',             label: 'View Source',           implies: ['read'] },
        { value: 'create-source',           label: 'Create Source',         implies: ['read', 'create'] },
        { value: 'update-source',           label: 'Update Source',         implies: ['read', 'edit'] },
        { value: 'edit-source-data',        label: 'Edit Source Data',      implies: ['read', 'create', 'edit', 'delete'] },
        { value: 'create-view',             label: 'Create Version',        implies: ['read', 'create'] },
        { value: 'delete-source',           label: 'Delete Source',         implies: ['read', 'delete'] },
        { value: 'edit-source-permissions', label: 'Edit Source Permissions', implies: ['read', 'edit', 'grant'] },
        // no row behind these
        { value: 'download-source',         label: 'Download Source',       implies: [] },
        { value: 'manage-downloads',        label: 'Manage Downloads',      implies: [] },
        { value: 'view-source-api',         label: 'View Source API',       implies: [] },
    ],
}

export default datasetsAuthVocabulary
