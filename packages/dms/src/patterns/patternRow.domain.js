// The pattern ROW's permission domain — the `self` scope of every pattern type.
//
// Every pattern row of every type is an `admin+pattern` row, so there is exactly one such list in
// the system. It lives in its own module for one reason: both `admin.format.js` (which hangs it on
// the pattern format's `authPermissions` attribute, where a domain belongs) and `registry.js`
// (which derives each type's vocabulary at registration) need it, and registry.js must not pull in
// admin.format.js's lazy component imports to get it. It is still ONE authored list — the format
// references this constant rather than restating it.
//
// `view-pattern` is the pattern-row read verb. It replaces `view-page`, which used to mean "view a
// page" on page patterns and "read the pattern row" everywhere else; dms-server's kindReadAuth.js
// accepts both while stored grants are backfilled.
//
// `delete-pattern` is NOT here — deleting a pattern is a site operation and lives on the site
// format (owner, 2026-10-30). See planning/tasks/current/permission-domain-single-source.md.

export const PATTERN_ROW_DOMAIN = [
  { label: '*',                        value: '*' },
  { label: 'View Pattern',             value: 'view-pattern',             implies: ['read'] },
  { label: 'Edit Pattern',             value: 'edit-pattern',             implies: ['read', 'edit'] },
  { label: 'Edit Pattern Permissions', value: 'edit-pattern-permissions', implies: ['read', 'edit', 'grant'] },
]

export default PATTERN_ROW_DOMAIN
