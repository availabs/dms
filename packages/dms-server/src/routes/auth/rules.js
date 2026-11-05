'use strict';
/**
 * THE BUILT-IN COPY of the auth rules, for rows stamped before the formats carried their own.
 *
 * The rules are authored in the client's format files (`rules: { [rowKind]: rule }` beside each
 * `permissionDomain`), collected at registration (patterns/deriveAuthRules.js) and stamped as
 * `data.authRules` on the site row (site-level kinds) or the pattern row. `owners.js ruleFor` reads
 * the stamped rule first and this file only when there is none. Keep it identical to the formats:
 * packages/dms/src/patterns/authRules.sync.test.js fails when they differ. Delete it once every row
 * is stamped (planning/tasks/current/auth-rules-stamp-backfill.md).
 *
 * Owners are positions on the row's ancestry (owners.js): `self`, `parent`, `ancestor:<kind>`,
 * `site`, or a list spread in order. The older names (`parent-pattern+row`, `site-grants`, …) still
 * resolve, for rows stamped with them. Nothing here names a pattern type (rule 2,
 * planning/tasks/current/auth-grants-on-the-owner-row.md).
 *
 * `read`: what earns a read of the row. A kind with no `read` op is open on read. `{ blank: owner }`
 * says a row is readable when that owner grants nothing (a row with no grants is read-only, owner
 * 2026-10-29); a source is narrowed only by something ON THE SOURCE, so its clause names `self`.
 */
const SOURCE_READ = ['view-source', 'update-source', 'edit-source-data', 'create-view', 'delete-source', 'edit-source-permissions'];
const readOr = (blank, perms) => ({ anyOf: [{ blank }, { perms }] });

module.exports = {
  site: {
    owner: 'site',
    ops: {
      create: ['*'],
      delete: ['*'],
      edit: {
        // an env is made where a pattern is made: whoever may create a pattern may add one
        byKey: { dms_envs: ['create-pattern'] },
        default: ['*'],
      },
    },
  },

  theme:  { owner: 'site', ops: { '*': ['manage-themes'] } },
  tenant: { owner: 'site', ops: { '*': ['manage-tenants'] } },

  pattern: {
    owner: 'self',
    escape: { owner: 'site', perms: ['*'] },
    // a pattern with no grants is open to whoever may see the pattern list
    ifOwnerBlank: { owner: 'site', perms: ['view-pattern-list'] },
    ops: {
      // `view-page` is accepted beside `view-pattern` while stored grants are backfilled: flat grants
      // on page patterns hold `view-page`, and that is what earns the pattern-row read today.
      read: readOr(true, ['view-pattern', 'view-page', 'edit-pattern', 'edit-pattern-permissions']),
      create: { owner: 'site', perms: ['create-pattern'] },
      delete: ['delete-pattern'],
      edit: { default: ['edit-pattern'] },
    },
    noChange: ['edit-pattern', 'edit-pattern-permissions'],
  },

  page: {
    owner: ['ancestor:pattern', 'self'],     // the pattern's grants, the page's own spread over them
    escape: { owner: 'site', perms: ['*'] },
    ops: {
      read: readOr(true, ['view-page']),
      create: ['create-page'],
      delete: ['edit-page'],
      edit: { default: ['edit-page'] },
    },
    noChange: ['edit-page', 'publish-page', 'edit-page-permissions', 'edit-page-params'],
  },

  component:   { owner: 'ancestor:pattern', escape: { owner: 'site', perms: ['*'] }, ops: { '*': ['edit-page', 'publish-page'] } },
  'page-edit': { owner: 'ancestor:pattern', escape: { owner: 'site', perms: ['*'] }, ops: { '*': ['edit-page', 'publish-page'] } },

  // The env holds the grants over its sources (swept there from the datasets pattern, which is not
  // their ancestor). Its managers are whoever may make or remove a source in it.
  dmsenv: {
    owner: ['site', 'self'],
    ops: {
      create: { owner: 'site', perms: ['create-pattern'] },
      delete: { owner: 'site', perms: ['*'] },
      edit: { byKey: { authPermissions: ['edit-source-permissions'] }, default: ['create-source', 'delete-source'] },
    },
  },

  // A source's grants are its own, spread over its env's.
  source: {
    owner: ['ancestor:dmsenv', 'self'],
    ops: {
      read: readOr('self', SOURCE_READ),
      create: ['create-source'],
      delete: ['delete-source'],
      edit: { default: ['update-source'] },
    },
    noChange: ['update-source', 'edit-source-permissions', 'create-view'],
  },

  view: {
    owner: ['ancestor:dmsenv', 'ancestor:source'],
    ops: {
      read: readOr('ancestor:source', SOURCE_READ),
      create: ['create-view'],
      delete: ['delete-source'],
      edit:   ['update-source', 'create-view'],
    },
  },

  data: {
    owner: ['ancestor:dmsenv', 'ancestor:source'],
    appliesWhen: 'split',
    ops: { '*': ['edit-source-data'] },
  },
};
