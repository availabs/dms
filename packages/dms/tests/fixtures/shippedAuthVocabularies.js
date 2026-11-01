// FROZEN SNAPSHOT of the seven hand-written `*.authVocabulary.js` files as they shipped, taken at
// the moment Phase 3 deleted them (2026-10-30).
//
// This is a TEST FIXTURE, not a declaration. Nothing in the app reads it. Its only job is to let
// `deriveAuthVocabulary.test.js` keep asserting that the derivation still produces what the
// hand-written files produced — the regression guard that made deleting them safe. The intended
// differences are asserted case by case in that suite; anything else is a defect.
//
// Do not "fix" a verb here to make a test pass. A change in the derivation's output is either an
// intended change (assert it in the suite, beside the others) or a bug.
// See planning/tasks/current/permission-domain-single-source.md.

export const SHIPPED_AUTH_VOCABULARIES = {
    page: {
    self: [
        { value: 'edit-pattern',             label: 'Edit Pattern',             implies: ['read', 'edit'] },
        { value: 'edit-pattern-permissions', label: 'Edit Pattern Permissions', implies: ['read', 'edit', 'grant'] },
        { value: 'delete-pattern',           label: 'Delete Pattern',           implies: ['read', 'delete'] },
    ],
    descendants: [
        // page rows
        { value: 'view-page',              label: 'View Page',              implies: ['read'] },
    // `edit-page` confers `delete` as well: kind auth requires exactly `edit-page` to delete a page
    // (dms-server routes/dms/dataAuth.js:220, `op === 'delete'`), and that is shipped behaviour —
    // `LEGACY_IMPLIES` has encoded it since 2026-10-29. This list omitted `delete`, so on an app
    // whose vocabulary had been synced a grantee was refused a delete that kind auth allowed.
    // Found by the permissionDomain/vocabulary agreement test, 2026-10-30.
        { value: 'edit-page',              label: 'Edit Page Content',     implies: ['read', 'edit', 'delete'] },
        { value: 'create-page',            label: 'Create Page',            implies: ['read', 'create'] },
        { value: 'edit-page-permissions',  label: 'Edit Page Permissions',  implies: ['read', 'edit', 'grant'] },
        { value: 'publish-page',           label: 'Publish Page',           implies: ['read', 'edit'] },
        { value: 'edit-page-params',       label: 'Edit Page Parameters',   implies: ['read', 'edit'] },
        // section rows (page.format.js's section-level permissionDomain)
        { value: 'view',                   label: 'View Section',           implies: ['read'] },
        { value: 'edit',                   label: 'Edit Section',           implies: ['read', 'edit'] },
    ],
},
    datasets: {
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
},
    auth: {
    publicRead: true,
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
},
    admin: {
    publicRead: true,
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
},
    mapeditor: {
    self: [
        { value: 'edit-pattern',             label: 'Edit Pattern',             implies: ['read', 'edit'] },
        { value: 'edit-pattern-permissions', label: 'Edit Pattern Permissions', implies: ['read', 'edit', 'grant'] },
        { value: 'delete-pattern',           label: 'Delete Pattern',           implies: ['read', 'delete'] },
    ],
    descendants: [
        { value: 'view-page',   label: 'View Symbologies',   implies: ['read'] },
        { value: 'edit-page',   label: 'Edit Symbologies',   implies: ['read', 'edit'] },
        { value: 'create-page', label: 'Create Symbology',   implies: ['read', 'create'] },
    ],
},
    qa: {
    self: [
        { value: 'edit-pattern',             label: 'Edit Pattern',             implies: ['read', 'edit'] },
        { value: 'edit-pattern-permissions', label: 'Edit Pattern Permissions', implies: ['read', 'edit', 'grant'] },
        { value: 'delete-pattern',           label: 'Delete Pattern',           implies: ['read', 'delete'] },
    ],
    descendants: [
        { value: 'view-page',        label: 'View Tickets',        implies: ['read'] },
        { value: 'edit-page',        label: 'Edit Tickets',        implies: ['read', 'edit'] },
        { value: 'create-page',      label: 'Create Ticket',       implies: ['read', 'create'] },
        // the install's datasets
        { value: 'view-source',      label: 'View Ticket Data',    implies: ['read'] },
        { value: 'edit-source-data', label: 'Edit Ticket Data',    implies: ['read', 'create', 'edit', 'delete'] },
    ],
},
    chat: {
    self: [
        { value: 'edit-pattern',             label: 'Edit Pattern',             implies: ['read', 'edit'] },
        { value: 'edit-pattern-permissions', label: 'Edit Pattern Permissions', implies: ['read', 'edit', 'grant'] },
        { value: 'delete-pattern',           label: 'Delete Pattern',           implies: ['read', 'delete'] },
    ],
    descendants: [
        { value: 'view-page',        label: 'View Channels',    implies: ['read'] },
        { value: 'create-page',      label: 'Create Channel',   implies: ['read', 'create'] },
        { value: 'edit-page',        label: 'Edit Channel',     implies: ['read', 'edit'] },
        // posting is a write against the channel's own `:data` rows, not against the channel row
        { value: 'edit-source-data', label: 'Post Messages',    implies: ['read', 'create', 'edit'] },
    ],
},
}

export default SHIPPED_AUTH_VOCABULARIES
