export const view = {
  app: "datasets",
  type: "view",
  // Auth rules for this row kind (`rules`, keyed by row kind): which permission each write needs.
  // Collected at registration (deriveAuthRules.js) and stamped onto the pattern / site row; read by
  // dms-server's kindAuth/dataAuth.js. Built-in copy for unstamped rows: kindAuth/authRules.js.
  rules: {
    view: {
      owner: 'owning-source',
      ops: {
        create: { owner: 'source-by-slug', perms: ['create-view'] },
        delete: ['delete-source'],
        edit:   ['update-source', 'create-view'],
      },
    },
  },
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
  // Auth rules for this row kind (`rules`, keyed by row kind): which permission each write needs.
  // Collected at registration (deriveAuthRules.js) and stamped onto the pattern / site row; read by
  // dms-server's kindAuth/dataAuth.js. Built-in copy for unstamped rows: kindAuth/authRules.js.
  // `data`: a split source's rows. They have no format object of their own, so their rule rides here.
  rules: {
    source: {
      owner: 'self-source',
      ops: {
        create: { owner: 'datasets-grants', perms: ['create-source'] },
        delete: ['delete-source'],
        edit: {
          byKey:    { auth_permissions: ['edit-source-permissions'] },
          onlyKeys: [{ keys: ['views'], perms: ['create-view', 'update-source', 'delete-source'] }],
          default:  ['update-source'],
        },
      },
      noChange: ['update-source', 'edit-source-permissions', 'create-view'],
    },
    data: {
      owner: 'source-by-slug',
      appliesWhen: 'split',                  // non-split :data rows fall through to the default
      ops: { '*': ['edit-source-data'] },
    },
  },
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
        { label: 'Update source',    value: 'update-source',    implies: ['read', 'edit'] },                 // edit description/categories/metadata
        { label: 'Edit source data', value: 'edit-source-data', implies: ['read', 'create', 'edit', 'delete'] }, // rows on editable sources
        { label: 'Create version',   value: 'create-view',      implies: ['read', 'create'] },
        { label: 'Manage downloads', value: 'manage-downloads', implies: [] },                              // capability: one UI control
        { label: 'View source API',  value: 'view-source-api',  implies: [] },                              // capability; checked nowhere today
        { label: 'Delete source',    value: 'delete-source',    implies: ['read', 'delete'] },
        { label: 'Edit permissions', value: 'edit-source-permissions', implies: ['read', 'edit', 'grant'] },
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

const datasetsFormat = {
    app: "datasets",
    type: "form-manager",
    registerFormats: [source],
    attributes: [
        {
            key: 'name',
            placeholder: 'Name',
            type: "text",
            hidden: true
        },
        {
            key: 'sources',
            type: 'dms-format',
            isArray: true,
            format: 'datasets+source',
        },
        // The datasets PATTERN-INSTANCE domain. `form-manager` is the row kind that IS the datasets
        // pattern, so these join the shared `admin+pattern` domain to make this type's `self` scope
        // — they are granted at the pattern level and nowhere else.
        //
        // `view-sources` must NOT be a descendants verb. It is the verb that decides whether you
        // can see any pages at the datasets level, and it gates the pattern's whole route subtree by
        // name (siteConfig.jsx, `reqPermissions: ['view-sources']`). In `descendants` a pattern-level
        // `public: ['view-sources']` would open every source beneath it — the identical shape to the
        // `view-page` regression this replaces (row-auth-uda.md). `view-source` (singular) stays the
        // per-source read, on the source format below.
        {
            key: "authPermissions",
            type: "json",
            required: false,
            default: [],
            permissionDomain: [
                { label: 'View Sources',  value: 'view-sources',  implies: ['read'] },
                { label: 'Create Source', value: 'create-source', implies: ['read', 'create'] },
            ],
        },
    ]
}

export default datasetsFormat