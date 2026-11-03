import { lazyComponent } from '../../utils/lazyComponent'

import TenantList from './components/tenantList'
import { listPatternTypes } from '../registry'
import { PATTERN_ROW_DOMAIN } from '../patternRow.domain'

// Code-split: the pattern list renders only on admin pages, but this format is
// imported eagerly (adminConfig builds every site's root dmsConfig). Same
// { EditComp, ViewComp } shape the module default-exports.
// See planning/tasks/completed/bundle-split-initial-graph.md.
const loadPatternList = () => import('./components/patternList')
const PatternList = {
  EditComp: lazyComponent('admin/PatternList.Edit', () => loadPatternList().then(m => ({ default: m.default.EditComp }))),
  ViewComp: lazyComponent('admin/PatternList.View', () => loadPatternList().then(m => ({ default: m.default.ViewComp }))),
}

export const themeFormat = {
  app: 'admin',
  type: 'theme',
  // Auth rules for this row kind (`rules`, keyed by row kind): which permission each write needs.
  // Collected at registration (deriveAuthRules.js) and stamped onto the pattern / site row; read by
  // dms-server's kindAuth/dataAuth.js. Built-in copy for unstamped rows: kindAuth/authRules.js.
  rules: { theme: { owner: 'site-grants', ops: { '*': ['manage-themes'] } } },
  attributes: [
    {
      key: "name",
      type: "text"
    },
    {
      key: "theme_id",
      type: "text"
    },
    {
      key: "theme",
      type: "json",
      default: {}
    },
    {
      key: "authPermissions",
      type: "json",
      required: false,
      default: [],
      permissionDomain: [
        { label: 'Manage Themes', value: 'manage-themes', implies: ['read', 'edit'] },
      ],
    }
  ]
}

export const dmsEnvFormat = {
  app: 'admin',
  type: 'dmsenv',
  // Auth rules for this row kind (`rules`, keyed by row kind): which permission each write needs.
  // Collected at registration (deriveAuthRules.js) and stamped onto the pattern / site row; read by
  // dms-server's kindAuth/dataAuth.js. Built-in copy for unstamped rows: kindAuth/authRules.js.
  rules: { dmsenv: { owner: 'datasets-grants', ops: { '*': ['create-source', 'delete-source', 'edit-pattern'] } } },
  registerFormats: [],
  attributes: [
    {
      key: "name",
      type: "text",
      required: true
    },
    {
      key: "sources",
      type: "json",
      default: []
    }
  ]
}

export const tenant = {
  app: "admin",
  type: "tenant",
  // Auth rules for this row kind (`rules`, keyed by row kind): which permission each write needs.
  // Collected at registration (deriveAuthRules.js) and stamped onto the pattern / site row; read by
  // dms-server's kindAuth/dataAuth.js. Built-in copy for unstamped rows: kindAuth/authRules.js.
  rules: { tenant: { owner: 'site-grants', ops: { '*': ['manage-tenants'] } } },
  registerFormats: [],
  attributes: [
    { key: "name", type: "text", required: true },
    { key: "subdomain", type: "text", required: true },
    { key: "app", type: "text", required: true },
    {
      key: "authPermissions",
      type: "json",
      required: false,
      default: [],
      permissionDomain: [
        { label: 'Manage Tenants', value: 'manage-tenants', implies: ['read', 'edit'] },
      ],
    }
  ]
}

export const pattern = {
  app: "admin",
  type: "pattern",
  // Auth rules for this row kind (`rules`, keyed by row kind): which permission each write needs.
  // Collected at registration (deriveAuthRules.js) and stamped onto the pattern / site row; read by
  // dms-server's kindAuth/dataAuth.js. Built-in copy for unstamped rows: kindAuth/authRules.js.
  rules: {
    pattern: {
      owner: 'self-pattern',
      escape: { owner: 'site-grants', perms: ['*'] },   // site * may do anything to any pattern
      // a pattern with no grants is open to whoever may see the pattern list, core patterns excepted
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
  },
  registerFormats: [],
  attributes: [
      // we need a type for this?
    { key: "pattern_type",
      type: "select",
      required: true,
      default: "page",
      // the registered pattern types (patterns/registry.js), read when the
      // format is used — a host app's types register after this module loads
      get options() {
        return listPatternTypes()
          .filter(d => d.admin?.addable)
          .map(d => ({ value: d.name, label: d.label || d.name }))
      },
    },
    // doc_type: uuid string to identify pattern entries in db
    { key: "name",
      placeholder: 'Name',
      type: "text",
      required: true
    },
    { key: "base_url",
      placeholder: 'Base URL',
      type: "text",
      required: true
    },
    { key: "subdomain",
      placeholder: 'Subdomain',
      type: "text",
      required: true
    },
    // Additional {subdomain, base_url} mounts beyond the primary pair above —
    // the same pattern served at more than one location (see
    // planning/tasks/current/pattern-multi-location-mounts.md). Optional and
    // additive: absent/empty keeps single-mount behavior.
    { key: "locations",
      type: "json",
      required: false,
      default: [],
    },
    // Subdomains this pattern USED to answer on and no longer mounts. They
    // redirect to the pattern's primary base_url on the root domain instead of
    // 404ing, so old bookmarks survive a move onto a path
    // (utils/retiredSubdomain.js). Optional; absent/empty = no redirects.
    { key: "retired_subdomains",
      type: "json",
      required: false,
      default: [],
    },
    { key: "html_title",
      placeholder: 'Browser tab title (defaults to pattern name)',
      type: "text",
      required: false
    },
    { key: "preload_data",
      type: "boolean",
      required: false,
      default: false,
    },
    {
      key: "filters",
      type: "json",
      required: false,
      default: [],
    },
    {
      key: "authPermissions",
      type: "json",
      required: false,
      default: [],
      // THE SHARED PATTERN-ROW DOMAIN. Every pattern row of every type is an
      // `admin+pattern` row, so this one list is the `self` scope for all seven
      // pattern types — which is why five of the seven hand-written
      // *.authVocabulary.js files carried an identical `self` bucket. A type
      // adds to it only through its own pattern-instance format (datasets'
      // `form-manager`). See deriveAuthVocabulary.js and
      // planning/tasks/current/permission-domain-single-source.md.
      //
      // `view-pattern` replaces `view-page` here. One string used to mean "view
      // a page" on page patterns and "read the pattern row" everywhere else;
      // kindReadAuth.js accepts BOTH while stored grants are backfilled.
      // `delete-pattern` is NOT here — deleting a pattern is a site operation
      // and lives on the site format below (owner, 2026-10-30).
      permissionDomain: PATTERN_ROW_DOMAIN,
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
    { key: 'theme',
      placeholder: '',
      type: 'config'
    }
  ]
}

const patternAdminFormat = {
  app: "admin",
  type: "site",
  // Auth rules for this row kind (`rules`, keyed by row kind): which permission each write needs.
  // Collected at registration (deriveAuthRules.js) and stamped onto the pattern / site row; read by
  // dms-server's kindAuth/dataAuth.js. Built-in copy for unstamped rows: kindAuth/authRules.js.
  rules: {
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
  },
  registerFormats: [pattern, tenant, themeFormat, dmsEnvFormat],
  attributes: [

    // if is generated by template or is template -99
    {
      key: 'site_name',
      placeholder: 'Site Name',
      type: "text",
      hidden: true
    },
    //content
    {
      key: 'patterns',
      type: 'dms-format',
      isArray: true,
      format: 'admin+pattern',
      DisplayComp: PatternList
    },
    {
      key: 'tenants',
      type: 'dms-format',
      isArray: true,
      format: 'admin+tenant',
      DisplayComp: TenantList
    },
    // NOTE: there is no `themes` attribute. Site rows created before the
    // ref-based theme model still carry a `data.themes` array holding every
    // theme's full JSON inline (470 kB on mitigat-ny-prod, 444 kB on avail),
    // but nothing reads it — `theme_refs` below is the live model, and both the
    // renderer (render/spa/utils.js) and the admin theme pages resolve themes
    // through that. Declaring it here only round-tripped half a megabyte of
    // dead weight through every site save. See
    // planning/tasks/current/site-bootstrap-payload-and-pattern-lookup.md.
    {
      key: 'theme_refs',
      type: 'dms-format',
      isArray: true,
      format: 'admin+theme'
    },
    {
      key: 'dms_envs',
      type: 'dms-format',
      isArray: true,
      format: 'admin+dmsenv'
    },
    // THE SITE-LEVEL DOMAIN. These verbs govern rows registered UNDER the site —
    // patterns, themes, tenants, dmsEnvs — so they derive as the admin pattern's
    // `descendants` with no special case. `manage-themes` and `manage-tenants`
    // live on the formats they describe (themeFormat, tenant); what is left here
    // is what governs pattern rows collectively.
    //
    // `delete-pattern` sits here rather than on the pattern row (owner,
    // 2026-10-30: deleting a pattern is a site operation, offered by admin and
    // no other type). dataAuth.js's site `SITE_KEYS.patterns` already pairs it
    // with `create-pattern`; its pattern-row branch is corrected to match.
    {
      key: "authPermissions",
      type: "json",
      required: false,
      default: [],
      permissionDomain: [
        { label: '*',                 value: '*' },
        { label: 'View Pattern List', value: 'view-pattern-list', implies: ['read'] },
        { label: 'Create Pattern',    value: 'create-pattern',    implies: ['read', 'create'] },
        { label: 'Delete Pattern',    value: 'delete-pattern',    implies: ['read', 'delete'] },
      ],
    }
  ]
}



export default patternAdminFormat
