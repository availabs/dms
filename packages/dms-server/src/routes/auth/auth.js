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
 * Check whether a user has the required permissions, given a resolved
 * authPermissions object.  Mirrors isUserAuthed() on the client side.
 *
 * @param {{ user?: Object, reqPermissions?: string[], authPermissions?: Object }} opts
 * @returns {boolean}
 */
function isUserAuthed({ user = null, reqPermissions = [], authPermissions = {} } = {}) {
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

module.exports = { isUserAuthed, resolveAuthPermissions };
