'use strict';
/**
 * GRANTS — the stored shape, and the one name-match over it.
 *
 * A grant is `{ groups: { [name]: [verb…] }, users: { [id]: [verb…] } }`, optionally keyed by
 * subdomain (`{ '*': {…}, 'sub': {…} }`) or split by scope (`{ self: {…}, descendants: {…} }`).
 * Everything here is pure and reads nothing but its arguments.
 *
 * Mirrors the client's utils/auth.js (`resolveSubdomainAuthPermissions`, `hasAuthGrants`,
 * `mergeAuthPermissions`); the two packages share no code, so keep them in step.
 */

const parseJson = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
};

const asList = (p) => (Array.isArray(p) ? p : p ? [p] : []);

/**
 * A stored grant resolved for one subdomain. A `'*'` key marks the subdomain-keyed form: the
 * subdomain's entry wins, `'*'` is the fallback. Anything else is returned parsed.
 */
function resolveAuthPermissions(raw, subdomain = '') {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object') return {};
  if (parsed['*'] !== undefined) return parseJson(parsed[subdomain] !== undefined ? parsed[subdomain] : parsed['*']) || {};
  return parsed;
}

/**
 * The bucket of a scoped grant. A grant split into `self` / `descendants` answers two questions —
 * "may you do this to the row?" and "may you do this to what is beneath it?" — and the caller says
 * which it is asking. A flat grant means both.
 */
function scopeOf(ap, scope) {
  if (!ap || typeof ap !== 'object') return {};
  if (ap.self === undefined && ap.descendants === undefined) return ap;
  return (scope === 'self' ? ap.self : ap.descendants) || {};
}

/** Grants naming someone besides the `public` group (the Access editor seeds `public` into everything it saves). */
const hasGrants = (ap) =>
  Object.keys((ap && ap.groups) || {}).some(g => g !== 'public') || Object.keys((ap && ap.users) || {}).length > 0;

/**
 * Whether `user` holds one of `perms` on `ap`: their own entry, one of their groups, or `public`,
 * holding the verb or `*`. No "nothing set ⇒ open" — that rule belongs to the judge, where it is
 * written per op (reads on a blank owner pass; edits need a grant).
 */
function holds(user, ap, perms) {
  const want = asList(perms);
  if (!want.length) return true;
  const groups = (ap && ap.groups) || {};
  const users = (ap && ap.users) || {};
  const mine = [...new Set([...((user && user.groups) || []), 'public'])];
  const held = [
    ...asList(user && user.id != null ? users[user.id] : null),
    ...mine.flatMap(g => asList(groups[g])),
  ];
  return held.some(p => p === '*' || want.includes(p));
}

/** Mirrors utils/adminPermissions.js isAppAdmin: membership of the group named `<app> Admin`. */
const isAppAdmin = (user, app) => !!app && ((user && user.groups) || []).some(g => g === `${app} Admin`);

/** `override` on `base`, per principal: `[]` revokes an inherited entry, a non-empty list replaces it. */
function mergeAuthPermissions(base = {}, override) {
  if (!override) return base || {};
  const out = { groups: { ...((base && base.groups) || {}) }, users: { ...((base && base.users) || {}) } };
  for (const key of ['users', 'groups']) {
    for (const [who, perms] of Object.entries((override && override[key]) || {})) {
      if (Array.isArray(perms) && perms.length === 0) delete out[key][who];
      else out[key][who] = perms;
    }
  }
  return out;
}

/** Union of several grants: a verb granted by any wins. */
function unionAuthPermissions(list) {
  const out = { groups: {}, users: {} };
  for (const ap of list) {
    for (const key of ['groups', 'users']) {
      for (const [who, perms] of Object.entries((ap && ap[key]) || {})) {
        out[key][who] = [...new Set([...(out[key][who] || []), ...asList(perms)])];
      }
    }
  }
  return out;
}

module.exports = {
  parseJson, asList, resolveAuthPermissions, scopeOf, hasGrants, holds, isAppAdmin,
  mergeAuthPermissions, unionAuthPermissions,
};
