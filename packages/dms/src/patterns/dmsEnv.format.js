// The row kinds a dmsEnv owns: its sources, and each source's views.
//
// THEY LIVE HERE, NOT UNDER THE DATASETS PATTERN, because the datasets pattern is not their
// ancestor and never was. A source's type is `{env}|{name}:source` — the env is above it and the
// pattern is nowhere in the path, which is why `getSiteSources` has to reverse-look-up through
// `pattern.dmsEnvId` to find any. Declaring these formats under the pattern put their
// `permissionDomain` on a row kind that does not govern them, so the verbs an author was shown and
// the verbs the server honoured were free to drift.
//
// `admin.format.js` registers them under `dmsEnvFormat`, which makes the env the declaring
// ancestor and lets a source reach its vocabulary by the ordinary parent walk. `datasets.format.js`
// re-exports them for the editor UI, which still renders sources from inside the pattern.
//
// See planning/tasks/current/row-auth-uda-unify-api.md, Phase 1 and Phase 2.

export const view = {
  app: "datasets",
  type: "view",
  attributes: [
    { key: "name",
      placeholder: 'Name',
      type: "text",
      required: false
    }
  ] 
}

export const source = {
  app: "datasets",
  type: "source",
  registerFormats: [view],
  attributes: [
    { key: "name",
      placeholder: 'Name',
      type: "text",
      required: false
    },
    { key: 'config',
      placeholder: 'please select a type',
      type: 'config'
    },
    { key: "description",
      placeholder: 'Description',
      type: "lexical",
      required: true
    },
    { key: "categories",
      placeholder: 'Categories',
      type: "text",
      required: true
    },
    // Per-source access control (mirrors the page pattern's page-level authPermissions).
    // Shape: { groups: { [name]: [perm…] }, users: { [id]: [perm…] } }. Effective perms are
    // pattern ⊕ source, evaluated by DatasetsContext.isUserAuthed (SourcePage merges this in).
    // `permissionDomain` is the vocabulary shown in the Access editor (UI.Permissions).
    // (server-side indexing fields — serverFn/joinWithChar — are wired in P4 enforcement.)
    { key: "auth_permissions",
      placeholder: 'Access',
      type: "json",
      required: false,
      default: {},
      // `implies` is what each verb confers STRUCTURALLY, read by the server; `label`/`value` are
      // what the Access editor shows. One declaration, two readers — see
      // planning/tasks/current/permission-domain-single-source.md.
      //
      // THE LINE THIS LIST DRAWS. `read` governs whether you may see the row. The three verbs with
      // `implies: []` are CAPABILITIES: they gate an action, confer no row access, and are checked
      // BY NAME where they are used. Read and download are deliberately different things — a user
      // may hold `view-source` and be unable to download, or `download-source` and be unable to
      // see the source's metadata (owner, 2026-10-30).
      permissionDomain: [
        { label: 'View source',      value: 'view-source',      implies: ['read'] },                        // THE read verb
        { label: 'Download source',  value: 'download-source',  implies: [] },                              // capability: the signed-link route checks it by name
        // `fields`: which attributes each verb governs — see page.format.js for the full note.
        // `update-source` claims everything unclaimed, and shares `views` with the two verbs below:
        // adding or removing a VERSION through the source's `views` list is not an ordinary edit.
        { label: 'Update source',    value: 'update-source',    implies: ['read', 'edit'], fields: ['*', 'views'] },  // edit description/categories/metadata
        { label: 'Edit source data', value: 'edit-source-data', implies: ['read', 'create', 'edit', 'delete'] }, // rows on editable sources
        { label: 'Create version',   value: 'create-view',      implies: ['read', 'create'], fields: ['views'] },
        { label: 'Manage downloads', value: 'manage-downloads', implies: [] },                              // capability: one UI control
        { label: 'View source API',  value: 'view-source-api',  implies: [] },                              // capability; checked nowhere today
        { label: 'Delete source',    value: 'delete-source',    implies: ['read', 'delete'], fields: ['views'] },
        { label: 'Edit permissions', value: 'edit-source-permissions', implies: ['read', 'edit', 'grant'], fields: ['auth_permissions'] },
        { label: 'All (*)',          value: '*' },                                                          // an affordance, never a declared verb
      ],
    },
    {
      key: 'views',
      type: 'dms-format',
      isArray: true,
      format: 'datasets+view',
    },
  ]
}
