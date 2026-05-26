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
 * The server doesn't have subdomain context per-request, so we use the
 * global "*" entry if present, otherwise treat the value as flat.
 *
 * @param {Object|string|null|undefined} rawAuth
 * @returns {Object} { groups: {}, users: {} }
 */
function resolveAuthPermissions(rawAuth) {
  if (!rawAuth) return {};
  const parsed = typeof rawAuth === 'string'
    ? (() => { try { return JSON.parse(rawAuth); } catch { return {}; } })()
    : rawAuth;

  // Subdomain-aware format — use the global '*' entry
  if (parsed['*'] !== undefined) {
    const inner = parsed['*'];
    return typeof inner === 'string'
      ? (() => { try { return JSON.parse(inner); } catch { return {}; } })()
      : (inner || {});
  }

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
  console.log('authed groups and users', authedGroups, authedUsers)
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
