'use strict';
// THE BUILT-IN COPY of the auth rules. The rules are authored in the client's format files: each format
// object's `rules` (patterns/admin/admin.format.js, page/page.format.js, datasets/datasets.format.js),
// collected at registration (patterns/deriveAuthRules.js) and stamped as `data.authRules` on the row that
// carries them: the site row for site / theme / tenant / pattern / dmsenv, the pattern row for the rest.
// dataAuth.js `ruleFor` reads the stamped rule first and this file only when there is none.
//
// Why a copy still exists (owner, 2026-11-03: "fallback to built-in rules"):
//   1. Rows created before the stamp (2026-11-03) carry no rules, and nothing backfills them yet. Every
//      existing site and pattern is one of these, so without this file they would have no rules at all.
//   2. dms-server cannot read the client's registry (it has no dependency on the dms package), so it
//      cannot derive the rules itself.
//   3. `DEFAULT` (a kind no format declares) has no format to live on.
// Keep it identical to the formats: packages/dms/src/patterns/authRules.sync.test.js fails when they
// differ. Delete it once every row is stamped (a backfill) and an unstamped row may be refused.
//
// History: Alex's rules.cjs structure (auth-as-data, 2026-10-27), with the rules agreed 2026-10-29 (hub
// auth-levels-to-permissions.md, "Decisions 2026-10-29"). `ifOwnerBlank` (2026-10-30) is ours: the
// open-pattern rule (decision 5) needed a clause. Task: planning/tasks/current/pattern-auth-rules-as-data.md.
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
    // a pattern with no grants is open to whoever may see the pattern list (decision 5), core patterns excepted
    ifOwnerBlank: {
      owner: 'site-grants', perms: ['view-pattern-list'],
      unless: { field: 'pattern_type', in: ['auth', 'admin'] },
    },
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
