'use strict';

/**
 * Server-side auth utilities — mirrors the client-side logic in
 * packages/dms/src/patterns/page/auth.js
 */

/**
 * Resolve an authPermissions value that may be either:
 *   - flat format:       { groups: {...}, users: {...} }
 *   - subdomain format:  { "*": { groups: {...}, users: {...} }, "sub": {...} }
 *
 * Mirrors resolveSubdomainAuthPermissions() in render/spa/utils/index.js.
 * Presence of a "*" key signals the subdomain-aware format; the subdomain-
 * specific entry is preferred, with "*" as fallback.
 *
 * @param {Object|string|null|undefined} rawAuth
 * @param {string} subdomain  e.g. "songs", "" for no subdomain
 * @returns {Object} { groups: {}, users: {} }
 */
function resolveAuthPermissions(rawAuth, subdomain = '') {
  if (!rawAuth) return {};
  const parse = v => {
    if (!v) return {};
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
    return v;
  };

  const parsed = parse(rawAuth);

  // Subdomain-aware format — pick subdomain entry, fall back to '*'
  if (parsed['*'] !== undefined)
    return parse(parsed[subdomain] !== undefined ? parsed[subdomain] : parsed['*']);

  return parsed;
}

/**
 * The read verbs (task permissions-blank-row-read-only, owner decision 2026-10-29: a row with no grants is
 * read-only). A verb not on this list is an edit. A request is a read when it names ANY read verb: a
 * permission list means "any of", and a row with no grants grants every read verb, so e.g.
 * dms.route.js's PATTERN_READ_PERMISSIONS (`view-page` or an edit verb) stays open on such a row.
 * Mirrored (not imported) by the client's utils/auth.js READ_PERMISSIONS once its gates follow the rule.
 */
const READ_PERMISSIONS = [
  'view-page', 'view-pattern-list',
  'view-source', 'view-sources', 'view-source-api', 'download-source',
];
const isReadRequest = (reqPermissions = []) => reqPermissions.some(p => READ_PERMISSIONS.includes(p));

// Grants besides the `public` group (the Access editor seeds `public` into everything it saves).
// Mirrors the client's utils/auth.js hasAuthGrants.
const hasGrants = (ap) =>
  Object.keys((ap && ap.groups) || {}).some(g => g !== 'public') || Object.keys((ap && ap.users) || {}).length > 0;

/**
 * Whether `user` holds one of `reqPermissions` explicitly: a user grant, or a grant to one of their groups
 * or `public`, of the permission or `*`. No "nothing set ⇒ open".
 */
function holdsExplicitly({ user = {}, reqPermissions = [], authPermissions = {} } = {}) {
  if (!reqPermissions || !reqPermissions.length) return true;
  const groups = (authPermissions && authPermissions.groups) || {};
  const users = (authPermissions && authPermissions.users) || {};
  const effectiveGroups = [...new Set([...((user && user.groups) || []), 'public'])];
  const userPerms = [
    ...(users[user && user.id] || []),
    ...effectiveGroups
      .filter(g => groups[g])
      .reduce((acc, g) => {
        const gp = Array.isArray(groups[g]) ? groups[g] : [groups[g]];
        if (gp && gp.length) acc.push(...gp);
        return acc;
      }, []),
  ];
  return userPerms.some(p => p === '*' || reqPermissions.includes(p));
}

/**
 * The rule (owner 2026-10-29, replacing 2026-10-23's "no permission set → open" for edits): on grants with
 * nothing beyond `public`, a READ passes as before (signed in, or anyone when nothing at all is set) and an
 * EDIT needs an explicit grant (`public` grants count). Otherwise an explicit perm or `*`, as before.
 * The exceptions live with the callers: `${app} Admin`, the site `*` escapes, patternCan's
 * `view-pattern-list` clause for a pattern with no grants.
 *
 * @param {{ user?: Object, reqPermissions?: string[], authPermissions?: Object }} opts
 * @returns {boolean}
 */
function isUserAuthed(opts = {}) {
  const { reqPermissions = [], authPermissions = {} } = opts;
  if (!reqPermissions?.length) return true;
  if (!hasGrants(authPermissions) && !isReadRequest(reqPermissions)) {
    return holdsExplicitly({ ...opts, user: opts.user || {}, authPermissions: authPermissions || {} });
  }
  return isUserAuthedOpen(opts);
}

/** Why isUserAuthed refuses what isUserAuthedOpen allows: for would-deny lines and refusals. */
function blankRowRefusal(opts = {}) {
  return !isUserAuthed(opts) && isUserAuthedOpen(opts) ? 'blank row (no grants: edits need an explicit grant)' : null;
}

/**
 * The OLD rule, kept for the guards' `log` answers (and the audit): no restrictions beyond
 * `public` and signed in → allow; nothing at all → allow; otherwise an explicit perm or `*`. Mirrors the
 * client's isUserAuthed (utils/auth.js), whose gates keep it until enforce (owner 2026-11-02).
 */
function isUserAuthedOpen({ user = null, reqPermissions = [], authPermissions = {} } = {}) {
  if (!reqPermissions?.length) return true;

  const u = user || {};
  const authedGroups = authPermissions.groups || {};
  const authedUsers  = authPermissions.users  || {};
  // No restrictions beyond the public group and user is logged in → allow
  if (
    u.authed &&
    !Object.keys(authedGroups).filter(g => g !== 'public').length &&
    !Object.keys(authedUsers).length
  ) return true;

  // No restrictions at all → allow
  if (!Object.keys(authedGroups).length && !Object.keys(authedUsers).length) return true;

  // The client's defaultUserState always includes 'public' in groups — unauthenticated
  // users are in the public group. Mirror that here so server-side checks match.
  const effectiveGroups = [...new Set([...(u.groups || []), 'public'])];

  const userAuthPermissions = [
    ...(authedUsers[u.id] || []),
    ...effectiveGroups
      .filter(group => authedGroups[group])
      .reduce((acc, group) => {
        const groupPerms = Array.isArray(authedGroups[group])
          ? authedGroups[group]
          : [authedGroups[group]];
        if (groupPerms?.length) acc.push(...groupPerms);
        return acc;
      }, []),
  ];

  return userAuthPermissions.some(p => p === '*' || reqPermissions.includes(p));
}

module.exports = {
  isUserAuthed, isUserAuthedOpen, holdsExplicitly, blankRowRefusal, hasGrants, isReadRequest, READ_PERMISSIONS,
  resolveAuthPermissions,
};
