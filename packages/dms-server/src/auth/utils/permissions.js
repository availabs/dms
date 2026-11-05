/**
 * Auth-handler permissions: the site row governs a request, what it grants, and the anti-escalation rule.
 *
 * A verb whose subject is not a DMS row — users and groups — is a SITE verb, granted on the site row
 * (rule 3, planning/tasks/current/auth-grants-on-the-owner-row.md). The request names the site (`app`,
 * `project`); nothing else is named. Until 2026-11-05 the client named an auth pattern row
 * (`authPatternId`) and these verbs were judged there; that argument is now ignored.
 *
 * - The rule is the blank-row rule (routes/auth): a grant on the site row, `${app} Admin` always. Under
 *   `DMS_AUTH_MODE=log` a site row with no grants lets a signed-in user through with a would-deny line; a
 *   row with grants is judged by them whatever the mode (it always was).
 * - Protected groups (decision (b)): a group holding `*`, `auth-groups` or `edit-pattern-permissions` on
 *   the site row, and `${app} Admin` itself, may be changed (or have its members changed) only by
 *   `${app} Admin` members and explicit `*` holders on the site row.
 *
 * AUTH LEVELS DECIDE NOTHING (owner 2026-11-03: "the new code should never reference them"). The level
 * rules that used to run beside the grants went on 2026-11-04; `scripts/audit-auth-levels.js` converts
 * an app's levels to grants. Levels stay in the auth DB and stay settable (`/group/project/adjust`)
 * because older servers read them.
 */
const { holds, hasGrants, isAppAdmin } = require('../../routes/auth/grants');
const accessLog = require('../../access-log');
const q = require('./queries');
// `DMS_AUTH_MODE` — the one mode, shared with every surface and both implementations.
const { authMode: authRowMode } = require('../../routes/auth/settings');

const BLANK_REASON = 'blank site row (no grants: only admins can edit)';

// One would-deny line per (user, app, what) per ten minutes; every call still counts in the access log.
const seen = new Map();
function logWouldDeny(user, scope, what, outcome = 'would-deny', reason = BLANK_REASON) {
  accessLog.record({
    app: scope.app, guard: 'auth', outcome, kind: 'site row', target: scope.app, perms: what, user, reason,
  });
  if (outcome !== 'would-deny') return;
  const key = `${user && user.email}|${scope.app}|${what}`;
  const now = Date.now();
  if (now - (seen.get(key) || 0) < 10 * 60 * 1000) return;
  seen.set(key, now);
  console.warn(`[auth-row] would deny ${user && user.email} ${what} on ${scope.app}'s site row: ${reason}`);
}

const AUTH_USERS = 'auth-users';
const AUTH_GROUPS = 'auth-groups';
const VIEW_AS = 'view-as';
const PROTECTED_PERMISSIONS = ['*', AUTH_GROUPS, 'edit-pattern-permissions'];

const normalize = (ap) => ({ groups: (ap && ap.groups) || {}, users: (ap && ap.users) || {} });
const asList = (p) => (Array.isArray(p) ? p : p ? [p] : []);

/**
 * @param {object} opts
 * @param {(app: string, subdomain: string) => Promise<object|null>} opts.loadSiteGrants - the site row's
 *   own grants, resolved for the subdomain (routes/auth/owners.js `grantsAt(snap, snap.site, 'site')`), or
 *   null when the app has no site row; injected so tests don't need a DMS database
 */
function createSiteAuth({ loadSiteGrants } = {}) {
  /**
   * The scope a request is judged in. Returns `{ app, grants, open }` or `{ error }` when the request
   * names no site or a project the site does not govern.
   */
  async function siteScope({ app, project, subdomain = '' } = {}) {
    if (!app) return { error: 'no site named' };
    if (project && project !== app) return { error: `site ${app} does not govern project ${project}` };
    const grants = normalize(await loadSiteGrants(app, subdomain));
    return { app, grants, open: !hasGrants(grants) };
  }
  return { siteScope };
}

/**
 * The user as the permission checks see it: auth-DB id, group names in the request's project.
 * @param {{ id, email }} userData - verifyAndGetUserData's result
 * @param {string[]} groups - group names in the project (queries.getUserGroups)
 */
const authUser = (userData, groups = []) => ({ id: userData.id, email: userData.email, groups, authed: true });

/**
 * Everything a handler's check needs, for a verified user: `{ user, scope }`. `scope` is `{ error }`
 * when the request names no usable site (then nothing passes).
 */
async function authScope(authDb, userData, { project, app } = {}, ctx = {}) {
  const { rows } = project ? await q.getUserGroups(authDb, userData.email, project) : { rows: [] };
  const scope = ctx.siteAuth
    ? await ctx.siteAuth.siteScope({ app, project, subdomain: ctx.subdomain || '' })
    : { error: 'no site auth loader' };
  return { user: authUser(userData, rows.map(r => r.name)), scope };
}

/** Whether `user` holds `perm` on the scope's site row (`${app} Admin` always), under `DMS_AUTH_MODE`. */
function can(user, perm, scope) {
  if (!scope || scope.error) return false;
  if (isAppAdmin(user, scope.app)) return true;
  if (holds(user, scope.grants, [perm])) return true;
  // the row enforced its grants before the mode existed: under `log` only a blank row is let through
  if (authRowMode() === 'enforce' || !scope.open) return false;
  logWouldDeny(user, scope, perm, 'would-deny', BLANK_REASON);
  return true;
}

/** Whether `groupName` is protected on this scope (decision (b)). */
function isProtectedGroup(groupName, scope) {
  if (!scope || scope.error) return false;
  if (groupName === `${scope.app} Admin`) return true;
  return asList(scope.grants.groups[groupName]).some(p => PROTECTED_PERMISSIONS.includes(p));
}

/**
 * Whether `user` may change `groupName` or its members. Only the escalation rule: the caller still needs
 * `auth-groups` / `auth-users` through can(). Explicit `*`, so an open site row doesn't make everyone a
 * `*` holder.
 */
function canManageGroup(user, groupName, scope) {
  if (!scope || scope.error) return false;
  if (!isProtectedGroup(groupName, scope)) return true;
  return isAppAdmin(user, scope.app)
    || holds(user, scope.grants, ['*']);
}

/**
 * A handler's authority: `byPermission` when the caller holds `perm` (or any of a list) on the site row
 * AND belongs to its project (so a token from another project can't use an open row).
 * @returns {{ user, scope, project, byPermission: boolean }}
 */
async function authority(authDb, userData, { project, app } = {}, ctx = {}, { perm } = {}) {
  // Routes that name no project (membership, delete) are governed by the named app's project.
  const proj = project || app;
  const { user, scope } = await authScope(authDb, userData, { project: proj, app }, ctx);
  const byPermission = user.groups.length > 0 && [].concat(perm).some(p => can(user, p, scope));
  return { user, scope, project: proj, byPermission };
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

// ---- Platform admin (task permissions-auth-platform-admin, owner 2026-10-24: membership in `AVAIL`)

const PLATFORM_GROUP = 'AVAIL';

/** Whether `email` belongs to the platform group, by name (no project, no level). */
async function isPlatformAdmin(authDb, email) {
  const { rows } = await authDb.query(
    'SELECT count(1) AS count FROM users_in_groups WHERE group_name = $1 AND user_email = $2',
    [PLATFORM_GROUP, String(email || '').toLowerCase()]);
  return +(rows[0]?.count || 0) > 0;
}

/**
 * Operations on the auth DB as a whole: `AVAIL` membership only (owner 2026-11-03; the `avail_auth` project
 * level no longer counts). `minLevel` is kept for the callers' signatures and ignored.
 */
// eslint-disable-next-line no-unused-vars
async function platformAuthority(authDb, email, minLevel) {
  return isPlatformAdmin(authDb, email);
}

/**
 * Does the caller hold `perm` in EVERY project named.
 *
 * The protection: you may not act on a user or a group that also belongs to projects you do not
 * administer (`test-auth-users.js`: "deletes a plain member; not one also in another project's group").
 *
 * One `authority()` per project, which is a query each. The sets are small (a user's projects, a group's
 * projects) and these are administrative routes, not read paths.
 */
async function coversProjects(authDb, userData, ctx, projects, perm) {
  const names = [...new Set((projects || []).filter(Boolean))];
  if (!names.length) return false;
  for (const project of names) {
    const a = await authority(authDb, userData, { project }, ctx, { perm });
    if (!a.byPermission) return false;
  }
  return true;
}

module.exports = {
  AUTH_USERS, AUTH_GROUPS, VIEW_AS, PROTECTED_PERMISSIONS,
  createSiteAuth, authScope, authUser, can,
  canManageGroup, isProtectedGroup, hasGrants,
  authority, groupProjects, canManageGroupIn, coversProjects,
  PLATFORM_GROUP, isPlatformAdmin, platformAuthority,
};
