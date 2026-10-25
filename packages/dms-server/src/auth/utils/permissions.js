/**
 * Auth-handler permissions: which auth row governs a request, what it grants, and the anti-escalation
 * rule (task permissions-auth-server-permission-source, owner decisions 2026-10-24).
 *
 * - The client names the row: `app` + `authPatternId` in the body (patterns/auth/api.js). It counts only
 *   when that row is an auth pattern of `app` and the request's `project` is `app` (sites don't set
 *   PROJECT_NAME, and a tenant's project is its subdomain = its app). Anything else → no scope, and the
 *   handler falls back to today's level check.
 * - The rule is the repo's lenient one (routes/dms/auth.js isUserAuthed, owner 2026-10-23/24): an auth
 *   row that sets no grant besides `public` lets any signed-in user through. `${app} Admin` passes
 *   everything (mirrors the client's utils/adminPermissions.js isAppAdmin).
 * - Protected groups (decision (b)): a group holding `*`, `auth-groups` or `edit-pattern-permissions` on
 *   the auth row or the site's admin row, and `${app} Admin` itself, may be changed (or have its members
 *   changed) only by `${app} Admin` members and explicit `*` holders on the auth row.
 */

const { resolveAuthPermissions, isUserAuthed: lenientAuthed } = require('../../routes/dms/auth');
const { holdsExplicitly, isAppAdmin, unionAuthPermissions } = require('../../routes/uda/sourceAuth');
const q = require('./queries');

const AUTH_USERS = 'auth-users';
const AUTH_GROUPS = 'auth-groups';
const VIEW_AS = 'view-as';
const PROTECTED_PERMISSIONS = ['*', AUTH_GROUPS, 'edit-pattern-permissions'];

const parseJson = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
};

const normalize = (ap) => ({ groups: (ap && ap.groups) || {}, users: (ap && ap.users) || {} });

// Grants besides the `public` group. Mirrors the client's utils/auth.js hasAuthGrants.
const hasGrants = (ap) =>
  Object.keys((ap && ap.groups) || {}).some(g => g !== 'public') || Object.keys((ap && ap.users) || {}).length > 0;

const asList = (p) => (Array.isArray(p) ? p : p ? [p] : []);

/**
 * @param {object} opts
 * @param {(app: string) => Promise<Array<{id, type, data}>>} opts.loadPatternRows - the app's pattern rows
 *   (dms controller getPatternRows); injected so tests don't need a DMS database
 * @param {number} [opts.ttlMs=30000] - how long a resolved row is reused (auth-row edits show up after this)
 */
function createAuthGrants({ loadPatternRows, ttlMs = 30000 } = {}) {
  const cache = new Map();

  /**
   * Resolve the auth row a request names. Returns `{ app, grants, protectedGrants, open }` or
   * `{ error }` when the request names no row or a row that can't govern it.
   */
  async function loadAuthGrants({ app, authPatternId, project, subdomain = '' } = {}) {
    if (!app || authPatternId == null || authPatternId === '') return { error: 'no auth pattern named' };
    if (project && project !== app) return { error: `auth pattern of ${app} does not govern project ${project}` };

    const key = `${app}|${authPatternId}|${subdomain}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.time < ttlMs) return hit.value;

    const rows = (await loadPatternRows(app)).map(r => ({ id: r.id, type: r.type, data: parseJson(r.data) || {} }));
    const row = rows.find(r => String(r.id) === String(authPatternId));
    let value;
    if (!row || row.data.pattern_type !== 'auth') {
      value = { error: `${authPatternId} is not an auth pattern of ${app}` };
    } else {
      const grants = normalize(resolveAuthPermissions(row.data.authPermissions, subdomain));
      const adminGrants = rows
        .filter(r => r.data.pattern_type === 'admin')
        .map(r => normalize(resolveAuthPermissions(r.data.authPermissions, subdomain)));
      value = {
        app,
        grants,
        protectedGrants: normalize(unionAuthPermissions([grants, ...adminGrants])),
        open: !hasGrants(grants),
      };
    }
    cache.set(key, { time: Date.now(), value });
    return value;
  }

  return { loadAuthGrants, clear: () => cache.clear() };
}

/**
 * The user as the permission checks see it: auth-DB id, group names in the request's project.
 * @param {{ id, email }} userData - verifyAndGetUserData's result
 * @param {string[]} groups - group names in the project (queries.getUserGroups)
 */
const authUser = (userData, groups = []) => ({ id: userData.id, email: userData.email, groups, authed: true });

/**
 * Everything a handler's check needs, for a verified user: `{ user, authLevel, scope }`.
 * `scope` is `{ error }` when the request names no usable auth row (then only the level decides).
 * @param {Object} authDb
 * @param {{ id, email }} userData - verifyAndGetUserData's result
 * @param {{ project, app, authPatternId }} body
 * @param {{ subdomain, authGrants }} [ctx] - the handler's third argument (auth/index.js)
 */
async function authScope(authDb, userData, { project, app, authPatternId } = {}, ctx = {}) {
  const { rows } = project ? await q.getUserGroups(authDb, userData.email, project) : { rows: [] };
  const scope = ctx.authGrants
    ? await ctx.authGrants.loadAuthGrants({ app, authPatternId, project, subdomain: ctx.subdomain || '' })
    : { error: 'no auth grants loader' };
  return {
    user: authUser(userData, rows.map(r => r.name)),
    authLevel: rows.reduce((max, r) => Math.max(max, +r.auth_level || 0), 0),
    scope,
  };
}

/** Whether `user` holds `perm` on the scope's auth row (lenient; `${app} Admin` always). */
function can(user, perm, scope) {
  if (!scope || scope.error) return false;
  if (isAppAdmin(user, scope.app)) return true;
  return lenientAuthed({ user, reqPermissions: [perm], authPermissions: scope.grants });
}

/** Transition mode: the permission, or today's level threshold (until the grant migration runs). */
function canOrLevel(user, perm, minLevel, scope, authLevel = 0) {
  return can(user, perm, scope) || (+authLevel || 0) >= minLevel;
}

/** Whether `groupName` is protected on this scope (decision (b)). */
function isProtectedGroup(groupName, scope) {
  if (!scope || scope.error) return false;
  if (groupName === `${scope.app} Admin`) return true;
  return asList(scope.protectedGrants.groups[groupName]).some(p => PROTECTED_PERMISSIONS.includes(p));
}

/**
 * Whether `user` may change `groupName` or its members. Only the escalation rule: the caller still needs
 * `auth-groups` / `auth-users` through can(). Explicit `*`, so an open auth row doesn't make everyone a
 * `*` holder.
 */
function canManageGroup(user, groupName, scope) {
  if (!scope || scope.error) return false;
  if (!isProtectedGroup(groupName, scope)) return true;
  return isAppAdmin(user, scope.app)
    || holdsExplicitly({ user, reqPermissions: ['*'], authPermissions: scope.grants });
}

/**
 * Transition-mode authority for a handler (task permissions-auth-users-and-signup): `byPermission` when the
 * caller holds `perm` on the named auth row AND belongs to its project (so a token from another project
 * can't use an open row), `byLevel` when today's level threshold passes. Handlers check the permission
 * path first and fall back to the level path with today's level checks.
 * @returns {{ user, authLevel, scope, project, byPermission: boolean, byLevel: boolean }}
 */
async function authority(authDb, userData, { project, app, authPatternId } = {}, ctx = {}, { perm, minLevel }) {
  // Routes that name no project (membership, delete) are governed by the named app's project.
  const proj = project || app;
  const { user, authLevel, scope } = await authScope(authDb, userData, { project: proj, app, authPatternId }, ctx);
  return {
    user, authLevel, scope, project: proj,
    byPermission: user.groups.length > 0 && can(user, perm, scope),
    byLevel: authLevel >= minLevel,
  };
}

/** The projects a group is linked to. */
async function groupProjects(authDb, groupName) {
  const { rows } = await authDb.query(
    'SELECT project_name FROM groups_in_projects WHERE group_name = $1', [groupName]);
  return rows.map(r => r.project_name);
}

/**
 * canManageGroup for a group of the calling site: it must be linked to the row's project (a group of
 * another project only isn't this site's to manage). Only the calling site's grants count, so a group
 * shared with other projects is judged by this site's grants alone (owner 2026-10-25).
 */
async function canManageGroupIn(authDb, user, groupName, scope) {
  if (!scope || scope.error) return false;
  if (!(await groupProjects(authDb, groupName)).includes(scope.app)) return false;
  return canManageGroup(user, groupName, scope);
}

module.exports = {
  AUTH_USERS, AUTH_GROUPS, VIEW_AS, PROTECTED_PERMISSIONS,
  createAuthGrants, authScope, authUser, can, canOrLevel, canManageGroup, isProtectedGroup, hasGrants,
  authority, groupProjects, canManageGroupIn,
};
