'use strict';
// Trial (DMS_DATA_AUTH_JUDGE=data): Alex's rules.cjs structure (auth-as-data, 2026-10-27), with the rules as agreed
// 2026-10-29 (hub auth-levels-to-permissions.md, "Decisions 2026-10-29"). To move into pattern data:
// planning/tasks/current/pattern-auth-rules-as-data.md. Known gap: an open pattern's view-pattern-list rule.
module.exports = {
  site: {
    owner: 'site-grants',
    ops: {
      create: ['*'],
      delete: ['*'],
      edit: {
        byKey: {
          patterns:   ['create-pattern', 'delete-pattern'],
          theme_refs: ['manage-themes'],
          tenants:    ['manage-tenants'],
          // the one clause that needs a different owner than the kind's
          dms_envs:   { anyOf: [
            { owner: 'datasets-grants', perms: ['create-source', 'edit-pattern'] },
            { owner: 'site-grants',     perms: ['*'] },
          ] },
        },
        default: ['*'],
      },
    },
  },

  theme:  { owner: 'site-grants', ops: { '*': ['manage-themes'] } },
  tenant: { owner: 'site-grants', ops: { '*': ['manage-tenants'] } },

  pattern: {
    owner: 'self-pattern',
    escape: { owner: 'site-grants', perms: ['*'] },   // site * may do anything to any pattern (decision 4)
    ops: {
      create: { owner: 'site-grants', perms: ['create-pattern'] },
      delete: ['delete-pattern'],
      edit: {
        byKey:   { authPermissions: ['edit-pattern-permissions'] },
        default: ['edit-pattern'],
      },
    },
    noChange: ['edit-pattern', 'edit-pattern-permissions'],
  },

  page: {
    owner:  'parent-pattern+row',          // pattern ⊕ this row's own grants
    escape: { owner: 'site-grants', perms: ['*'] },
    ops: {
      create: ['create-page'],
      delete: ['edit-page'],
      edit: {
        byKey: {
          authPermissions: ['edit-page-permissions'],
          filters:         ['edit-page', 'edit-page-params'],
        },
        when: [
          { keyIn: ['sections', 'section_groups', 'dataSources'], perms: ['publish-page'] },
          { key: 'published', valueNot: 'draft',                  perms: ['publish-page'] },
        ],
        default: ['edit-page'],            // every key not matched above
      },
    },
    noChange: ['edit-page', 'publish-page', 'edit-page-permissions', 'edit-page-params'],
  },

  // components and page history are judged as the page is, minus the per-key split
  component:    { owner: 'parent-pattern', escape: { owner: 'site-grants', perms: ['*'] },
                  ops: { '*': ['edit-page', 'publish-page'] } },
  'page-edit':  { owner: 'parent-pattern', escape: { owner: 'site-grants', perms: ['*'] },
                  ops: { '*': ['edit-page', 'publish-page'] } },

  dmsenv: { owner: 'datasets-grants', ops: { '*': ['create-source', 'delete-source', 'edit-pattern'] } },

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

  view: {
    owner: 'owning-source',
    ops: {
      create: { owner: 'source-by-slug', perms: ['create-view'] },
      delete: ['delete-source'],
      edit:   ['update-source', 'create-view'],
    },
  },

  data: {
    owner: 'source-by-slug',
    appliesWhen: 'split',                  // non-split :data rows fall through to the default
    ops: { '*': ['edit-source-data'] },
  },

  // no kind matched
  DEFAULT: { signedIn: true },
};
