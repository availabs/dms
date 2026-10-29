// The page pattern's auth vocabulary — see ../authVocabulary.js for the shape, and
// planning/tasks/current/row-auth-vocabulary.md for why it lives on the pattern row.
//
// `descendants` is the SERVER's complete map for everything under the pattern: page rows AND the
// section rows beneath them. It is deliberately wider than any one Access editor's list — the
// section editor offers `view`/`edit` and the page editor offers `view-page`/`edit-page`, and a
// grant written by either has to confer something. The per-format `permissionDomain` arrays stay
// the narrower, row-kind-specific lists the UI shows; `tests/test-auth-vocabulary.js` asserts every
// one of their values appears here, so an author can never save a grant that confers nothing.

export const pageAuthVocabulary = {
    self: [
        { value: 'edit-pattern',             label: 'Edit Pattern',             implies: ['read', 'edit'] },
        { value: 'edit-pattern-permissions', label: 'Edit Pattern Permissions', implies: ['read', 'edit', 'grant'] },
        { value: 'delete-pattern',           label: 'Delete Pattern',           implies: ['read', 'delete'] },
    ],
    descendants: [
        // page rows
        { value: 'view-page',              label: 'View Page',              implies: ['read'] },
        { value: 'edit-page',              label: 'Edit Page Content',      implies: ['read', 'edit'] },
        { value: 'create-page',            label: 'Create Page',            implies: ['read', 'create'] },
        { value: 'edit-page-permissions',  label: 'Edit Page Permissions',  implies: ['read', 'edit', 'grant'] },
        { value: 'publish-page',           label: 'Publish Page',           implies: ['read', 'edit'] },
        { value: 'edit-page-params',       label: 'Edit Page Parameters',   implies: ['read', 'edit'] },
        // section rows (page.format.js's section-level permissionDomain)
        { value: 'view',                   label: 'View Section',           implies: ['read'] },
        { value: 'edit',                   label: 'Edit Section',           implies: ['read', 'edit'] },
    ],
}

export default pageAuthVocabulary
