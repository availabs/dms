export const view = {
  app: "forms",
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
  app: "forms",
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
      permissionDomain: [
        { label: 'View source',      value: 'view-source' },       // see metadata/overview
        { label: 'Download source',  value: 'download-source' },    // download the data (old DOWNLOAD level)
        { label: 'Update source',    value: 'update-source' },      // edit description/categories/metadata
        { label: 'Create version',   value: 'create-view' },
        { label: 'Manage downloads', value: 'manage-downloads' },   // create/refresh download artifacts
        { label: 'View source API',  value: 'view-source-api' },
        { label: 'Delete source',    value: 'delete-source' },
        { label: 'Edit permissions', value: 'edit-source-permissions' },
        { label: 'All (*)',          value: '*' },
      ],
    },
    {
      key: 'views',
      type: 'dms-format',
      isArray: true,
      format: 'forms+view',
    },
  ]
}

const datasetsFormat = {
    app: "forms",
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
            format: 'forms+source',
        },
    ]
}

export default datasetsFormat