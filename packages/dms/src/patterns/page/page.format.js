import React from 'react'
import SectionArray from './components/sections/sectionArray'

export const cmsSection = {
  app: "dms-site",
  type: "component",
  // Auth rules for this row kind (`rules`, keyed by row kind): which permission each write needs,
  // and what earns a read. Collected at registration (deriveAuthRules.js) and stamped onto the
  // pattern / site row; read by dms-server's routes/auth (owners.js, judge.js). Built-in copy for
  // unstamped rows: dms-server/src/routes/auth/rules.js — kept identical by authRules.sync.test.js.
  // Owners are positions on the row's ancestry: `self`, `parent`, `ancestor:<kind>`, `site`, or a
  // list spread in order (rule 2: a rule never names a pattern type). `{ blank: owner }` in a `read`
  // clause says the row is readable when that owner grants nothing.
  // judged as the page is, minus the per-key split
  rules: { component: { owner: 'ancestor:pattern', escape: { owner: 'site', perms: ['*'] },
                        ops: { '*': ['edit-page', 'publish-page'] } } },
  // A component declares no `parent` / `url_slug` of its own. Both used to sit here, resolving
  // through `joinKey: 'parent'` + `serverFn: 'recurse_extract_data'` — a reader wired up for a
  // field that was measured 52.6% wrong and has since been retired (see routes/dms/parentId.js, and
  // planning/tasks/current/row-auth-parentage.md). A component's containment is `parent_id`.
  attributes: [
    { key: "title",
      type: "text",
      required: false,
      default: "Untitled Section"
    },
    {
      key: "helpText",
      type: "lexical"
    },
    { key: "level",
      type: "select",
      options: [
        {value: '0', label: 'Hidden'},
        {value: '1', label: 'H1'},
        {value: '2', label: 'H2'},
        {value: '3', label: 'H3'},
        {value: '4', label: 'H4'}
      ],
      required: false,
      default: "1"
    },
    { key: "tags",
      type: "text",
      required: false
    },
    { key: "requirements",
      type: "text",
      required: false
    },
    {
     key: "description",
      type: "text",
      required: false
    },
      {
          key: "authPermissions",
          type: "json",
          required: false,
          default: [],
          permissionDomain: [
              // `view` is the permission the section VIEW gate actually checks
              // (components/sections/section.jsx). It was missing here, so the only grant an
              // author could make that satisfied that gate was the blanket `*` — which also
              // hands over edit. Listed first so "let this group see the section" is the
              // obvious choice rather than `*` by default.
              {label: 'View Section', value: 'view', implies: ['read']},
              {label: 'Edit Section', value: 'edit', implies: ['read', 'edit']},
              {label: '*', value: '*'},
          ],
          defaultPermission: ['*']
      },
    {
      key: "size",
      type: "text"
    },
    // In-page-nav opt-in (Phase 3). A section with `navLabel` shows in the
    // sidebar rail and gets a clean DOM anchor id — decoupled from title/level
    // so empty-title `h2`-headed sections can participate. `anchorId` overrides
    // the slug derived from `navLabel`.
    {
      key: "navLabel",
      type: "text",
      required: false
    },
    {
      key: "anchorId",
      type: "text",
      required: false
    },
      {
          "key": "is_draft",
          "type": "switch",
      },
    { key: "element",
      // type: "selector",
      required: false,
    }
  ] 
}


const pageEdit = {
  app: "dms-site",
  type: "page-edit",
  // Auth rules for this row kind (`rules`, keyed by row kind): which permission each write needs,
  // and what earns a read. Collected at registration (deriveAuthRules.js) and stamped onto the
  // pattern / site row; read by dms-server's routes/auth (owners.js, judge.js). Built-in copy for
  // unstamped rows: dms-server/src/routes/auth/rules.js — kept identical by authRules.sync.test.js.
  // Owners are positions on the row's ancestry: `self`, `parent`, `ancestor:<kind>`, `site`, or a
  // list spread in order (rule 2: a rule never names a pattern type). `{ blank: owner }` in a `read`
  // clause says the row is readable when that owner grants nothing.
  // a page's edit history, written by whoever edits the page
  rules: { 'page-edit': { owner: 'ancestor:pattern', escape: { owner: 'site', perms: ['*'] },
                          ops: { '*': ['edit-page', 'publish-page'] } } },
  attributes: [
    {
      key: "entries",
      type: "json",
      default: []
    }
  ]
}


const cmsPageFormat = {
  app: "dms-site",
  type: "page",
  // Auth rules for this row kind (`rules`, keyed by row kind): which permission each write needs,
  // and what earns a read. Collected at registration (deriveAuthRules.js) and stamped onto the
  // pattern / site row; read by dms-server's routes/auth (owners.js, judge.js). Built-in copy for
  // unstamped rows: dms-server/src/routes/auth/rules.js — kept identical by authRules.sync.test.js.
  // Owners are positions on the row's ancestry: `self`, `parent`, `ancestor:<kind>`, `site`, or a
  // list spread in order (rule 2: a rule never names a pattern type). `{ blank: owner }` in a `read`
  // clause says the row is readable when that owner grants nothing.
  rules: {
    page: {
      owner:  ['ancestor:pattern', 'self'],   // the pattern's grants, this row's own spread over them
      escape: { owner: 'site', perms: ['*'] },
      ops: {
        // readable when nothing is granted at all, else with view-page
        read: { anyOf: [{ blank: true }, { perms: ['view-page'] }] },
        create: ['create-page'],
        delete: ['edit-page'],
        // The field rules are DECLARED ON THE VERBS, below: `fields` / `when` on each
        // permissionDomain entry, read through `verbsForFields` by BOTH implementations. They
        // were `byKey` / `when` clauses here until 2026-11-03, where only kind auth's judge
        // could reach them. `default` stays as the answer for a chain that declares nothing.
        edit: {
          default: ['edit-page'],
        },
      },
      noChange: ['edit-page', 'publish-page', 'edit-page-permissions', 'edit-page-params'],
    },
  },
  registerFormats: [cmsSection, pageEdit],
  defaultSearch: `data ->> 'index' = '0' and (data ->> 'parent' = '' or data ->> 'parent' is null) and (data ->> 'template_id' is null)`,
  defaultSort: (d) =>  {
    if(typeof d.sort !== 'function') { return d => d }
    return d?.sort((a,b) => {
     return (b.parent===null)-(a.parent===null) || a.index - b.index || +a.parent - +b.parent
    })
  },
  attributes: [
    { key: "title",
      type: "text",
      required: true,
      default: "New Page"
    },
    // if is generated by template or is template -99
    {
      key: 'template_id',
      type: 'number'
    },
    {
      key: 'data_controls',
      type: "text",
      hidden: true
    },
    {
      'key': 'generated-pages',
      type: 'text',
      isArray: true
    },
    //nav settings
    {
      key: "hide_in_nav",
      type: "text",
      default: false
    },
    // Link page: the page renders no content, it only carries a nav entry pointing
    // somewhere else. Accepts a site-absolute path into another pattern on this host
    // ('/actions/dashboard'), a cross-subdomain 'sub://<subdomain>/<path>', or a full
    // external URL. utils/nav.js turns it into the nav item's path (skipping baseUrl,
    // which a site-absolute value must not pick up) and pages/view.jsx redirects a
    // direct visit. Declared here — unlike icon/show_in_footer/is_cover_page — because
    // it changes routing behavior, so it should be findable from the format.
    {
      key: "nav_link",
      type: "text"
    },
    {
      key: "index",
      type: "number",
      default: "props:index",
      editable: false,
      hidden: true
    },
      {
          "key": "parent",
          "name": "parent",
          "type": "text",
          "display_name": "parent",
          // editable: false,
          // hidden: true,
          joinKey: "parent", // this is the id key.
          valueKey: "title",
          joinWithChar: ",", // if undefined, an array is returned
          serverFn: "recurse_extract_data",
          keepOriginal: false,
      },
      {
          key: "authPermissions",
          type: "json",
          required: false,
          default: [],
          permissionDomain: [
              // some defaults to take care of in implementation:
              // if you create, you get view and edit
              // each page created gets created with default permissions (if set in pattern), and assign full access (*) to the user who created it
              {label: '*', value: '*'},
              {label: 'View Page', value: 'view-page', implies: ['read']},
              // `edit-page` confers `delete` as well: kind auth requires exactly `edit-page` to
              // delete a page (dms-server dataAuth.js), and that is shipped behaviour.
              // ── WHICH FIELDS EACH VERB GOVERNS ──────────────────────────────────────────
              // `fields` moves "changing X needs verb Y" out of the server and into the row kind
              // that owns X. `'*'` claims every field no other verb named — the ordinary edit.
              // Before 2026-11-03 these lived twice in dms-server: as `byKey` / `when` / `onlyKeys`
              // clauses in kind auth's authRules.js, and as a hardcoded `GRANT_KEYS` in the row
              // gate. See planning/tasks/current/unified-auth-api.md, Phase 1.
              // `filters` is claimed by BOTH this and `edit-page-params`: either opens the Filters
              // pane. Two verbs on one field mean "any of"; two fields in one write mean "all of".
              {label: 'Edit Page Content', value: 'edit-page', implies: ['read', 'edit', 'delete'], fields: ['*', 'filters']},
              {label: 'Create Page', value: 'create-page', implies: ['read', 'create']},
              {label: 'Edit Page Permissions', value: 'edit-page-permissions', implies: ['read', 'edit', 'grant'], fields: ['authPermissions']},
              // `publish()` copies the drafts into these. `published: 'draft'` is what a new or
              // unpublished page carries, so it is NOT a publish — the one value predicate.
              {label: 'Publish Page', value: 'publish-page', implies: ['read', 'edit'],
               fields: ['sections', 'section_groups', 'dataSources'],
               when: [{ field: 'published', notValue: 'draft' }]},
              // Declared in the vocabulary, but it appeared in NO permissionDomain — so it has
              // never been grantable except through a blanket `*`.
              {label: 'Edit Page Parameters', value: 'edit-page-params', implies: ['read', 'edit'], fields: ['filters']},
          ]
      },
    {
      key: 'url_slug',
      type: "text",
      matchWildcard: true,
      hidden: true
    },
    //display settings
    {
      key: 'sidebar',
      type: "text",
      hidden: true
    },
    {
      key: 'header',
      type: "text",
      hidden: true
    },
    {
      key: 'footer',
      type: "text",
      hidden: true
    },
    {
      key: 'full_width',
      type: "text",
      hidden: true
    },
    {
      key: 'navOptions',
      type: "json",
      hidden: true
    },
    {
      key: 'theme',
      type: "json",
      hidden: true
    },
    {
      key: 'section_groups',
      type: "json",
      hidden: true
    },
    {
      key: 'draft_section_groups',
      type: "json",
      hidden: true
    },
    //content
    {
      key: 'sections',
      type: 'dms-format',
      isArray: true,
      format: 'dms-site+component',
      DisplayComp: SectionArray
    },
    {
      key: 'draft_sections',
      type: 'dms-format',
      isArray: true,
      format: 'dms-site+component',
      DisplayComp: SectionArray
    },
    // page-level data source configs (Phase 5)
    {
      key: 'dataSources',
      type: "json",
      hidden: true
    },
    {
      key: 'draft_dataSources',
      type: "json",
      hidden: true
    },
    // status
    {
      key: 'published',
      type: 'text',
      default: "draft"
    },
    {
      key: 'has_changes',
      type: 'boolean',
      default: false
    },
    {
      key: 'history',
      type: 'dms-format',
      format: 'dms-site+page-edit',
    }
  ]
}



export default cmsPageFormat