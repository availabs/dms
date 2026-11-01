// The auth pattern's formats.
//
// Both `siteConfig` entries used to return the stub `{app, attributes: []}` — no type, no
// attributes, nowhere to hang a `permissionDomain`. A pattern must describe every DMS row kind it
// stores (documentation/pattern-registry.md), and the auth pattern manages two: users and groups.
//
// THESE ROWS DO NOT LIVE IN `data_items`. They live in the auth database, so nothing resolves their
// `implies` against a row and the routes that use them are gated by a BY-NAME check — the same
// mechanism `download-source` uses (permission-domain-single-source.md, decision 3). Where a row is
// STORED is a storage fact; the format is what declares the row kind exists and owns its verb list.
//
// `implies: []` IS THE POINT, and it is what the hand-written vocabulary said. A first draft of
// this file gave them `['read','edit']` on the reasoning that it is "true of the users and groups"
// — the --sync-vocabulary diff caught it. There is no `data_items` row behind these verbs, so the
// only thing those structural verbs could reach is a descendant of the auth PATTERN row, which
// would quietly widen every existing `auth-users` grant. Changing what a verb is OFFERED on is
// safe; changing what it IMPLIES is not.

export const userFormat = {
  app: 'auth',
  type: 'user',
  registerFormats: [],
  attributes: [
    { key: 'email', type: 'text' },
    {
      key: 'authPermissions',
      type: 'json',
      required: false,
      default: [],
      permissionDomain: [
        { label: '*',            value: '*' },
        { label: 'Manage Users', value: 'auth-users', implies: [] },
        { label: 'View As User', value: 'view-as',    implies: [] },
      ],
    },
  ],
}

export const groupFormat = {
  app: 'auth',
  type: 'group',
  registerFormats: [],
  attributes: [
    { key: 'name', type: 'text' },
    {
      key: 'authPermissions',
      type: 'json',
      required: false,
      default: [],
      permissionDomain: [
        { label: 'Manage Groups', value: 'auth-groups', implies: [] },
      ],
    },
  ],
}

const authFormat = {
  app: 'auth',
  type: 'auth',
  registerFormats: [userFormat, groupFormat],
  attributes: [],
}

export default authFormat
