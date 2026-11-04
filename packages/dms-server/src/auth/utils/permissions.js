/**
 * Auth-handler permissions: which auth row governs a request, what it grants, and the anti-escalation
 * rule (task permissions-auth-server-permission-source, owner decisions 2026-10-24).
 *
 * - The client names the row: `app` + `authPatternId` in the body (patterns/auth/api.js). It counts only
 *   when that row is an auth pattern of `app` and the request's `project` is `app` (sites don't set
 *   PROJECT_NAME, and a tenant's project is its subdomain = its app). Anything else → no scope, and the
 *   handler falls back to today's level check.
 * - The rule is the blank-row rule (routes/dms/auth.js isUserAuthed, owner 2026-11-02 "no grants = only
 *   admins can edit"), behind `DMS_AUTH_MODE`, like every other guard:
 *     - `log` (default): the old answer (an auth row that sets no grant besides `public` lets any signed-in
 *       user through, and the level fallback counts); what the new rule would refuse is logged
 *       (`[auth-row] would deny`) and recorded in the access log (guard `auth`).
 *     - `enforce`: on a row with no grants only `${app} Admin` passes (every auth-row verb is an edit), and
 *       the level fallback doesn't count. A row with grants is judged by its grants; levels still count there.
 *   `${app} Admin` passes everything (mirrors the client's utils/adminPermissions.js isAppAdmin).
 * - Protected groups (decision (b)): a group holding `*`, `auth-groups` or `edit-pattern-permissions` on
 *   the auth row or the site's admin row, and `${app} Admin` itself, may be changed (or have its members
 *   changed) only by `${app} Admin` members and explicit `*` holders on the auth row.
 */

// Under `enforce` wcdb's and avail's auth rows (no grants, task 13's prod check) leave user management to
// `${app} Admin` only: check their would-deny lines before the switch.
const { resolveAuthPermissions, isUserAuthed, isUserAuthedOpen } = require('../../routes/auth/auth');
const { holdsExplicitly, isAppAdmin, unionAuthPermissions } = require('../../routes/auth/kindAuth/sourceAuth');
const accessLog = require('../../access-log');
const q = require('./queries');

// `DMS_AUTH_MODE` — the one mode, shared with every surface and both implementations.
// It was `DMS_AUTH_ROW_MODE` until 2026-11-03, and `legacy` ("the old answer, no log") went with
// it: `log` gives the same answer and additionally says what it would have refused.
const { authMode: authRowMode } = require('../../routes/auth/settings');

const BLANK_REASON = 'blank auth row (no grants: only admins can edit)';
// owner 2026-11-03 (task 18): levels count under log (and legacy) only, on every auth row
const LEVEL_REASON = 'allowed by auth level only (levels stop counting under enforce: grant the permission)';

// One would-deny line per (user, app, what) per ten minutes; every call still counts in the access log.
const seen = new Map();
function logWouldDeny(user, scope, what, outcome = 'would-deny', reason = BLANK_REASON) {
  accessLog.record({
    app: scope.app, guard: 'auth', outcome, kind: 'auth row', target: scope.app, perms: what, user, reason,
  });
  if (outcome !== 'would-deny') return;
  const key = `${user && user.email}|${scope.app}|${what}`;
  const now = Date.now();
  if (now - (seen.get(key) || 0) < 10 * 60 * 1000) return;
  seen.set(key, now);
  console.warn(`[auth-row] would deny ${user && user.email} ${what} on ${scope.app}'s auth row: ${reason}`);
}

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
  // `authLevel` is DEPRECATED and on its way out: nothing decides by it under `enforce`
  // (`levelsCount`). It is still read here so the level rules can run under `log` and report what
  // they let through. What someone may do comes from the DMS auth object `scope` carries.
  return {
    user: authUser(userData, rows.map(r => r.name)),
    authLevel: rows.reduce((max, r) => Math.max(max, +r.auth_level || 0), 0),
    scope,
  };
}

/** Whether `user` holds `perm` on the scope's auth row (`${app} Admin` always), under `DMS_AUTH_MODE`. */
function can(user, perm, scope) {
  if (!scope || scope.error) return false;
  if (isAppAdmin(user, scope.app)) return true;
  const opts = { user, reqPermissions: [perm], authPermissions: scope.grants };
  const mode = authRowMode();
  if (mode === 'enforce') return isUserAuthed(opts);
  const old = isUserAuthedOpen(opts);
  if (mode === 'log' && old && !isUserAuthed(opts)) logWouldDeny(user, scope, perm);
  return old;
}

/**
 * Whether today's level threshold counts for `user` on this scope: not on an auth row with no grants under
 * `enforce` (only admins edit such a row). `${app} Admin` passes through can() anyway.
 */
// Whether today's level threshold still lets `user` through. Owner 2026-11-03 (task 18): levels count
// under `log` and `legacy` only, on every auth row (blank or granted); under `enforce` only the permission
// does. `log` records each level-only pass (`quiet`: the permission passed anyway), so grants can be added
// before the switch. No usable scope (no DMS context) keeps the level alone: there is nothing to judge.
function levelCounts(user, perm, minLevel, scope, authLevel = 0, { quiet = false } = {}) {
  if (!((+authLevel || 0) >= minLevel)) return false;
  if (!scope || scope.error || isAppAdmin(user, scope.app)) return true;
  const mode = authRowMode();
  if (mode === 'enforce') return false;
  if (mode === 'log' && !quiet) {
    logWouldDeny(user, scope, `${[].concat(perm).join(' or ')} (by level ${authLevel})`, 'would-deny',
      scope.open ? BLANK_REASON : LEVEL_REASON);
  }
  return true;
}

/**
 * The same switch as levelCounts, for the handlers' other level rules (levelCoversGroup, levelOutranks, "my
 * level ≥ the group's", the level SQL in signup requests and messages). Owner 2026-11-03: under `enforce`
 * no level rule lets anyone through; only grants decide. `a` is an authority() result.
 * - `levelsCount(a)`: whether level rules may count at all for this request (no log).
 * - `noteLevelPass(a, what)`: under `log`, record that a level rule let `a.user` through (`what` names it).
 * - `levelRule(a, what, check)`: both: runs `check()` only when levels count, records a pass.
 * No usable scope (no DMS context) keeps the level alone, as in levelCounts: there is nothing to judge.
 */
function levelsCount(a) {
  const scope = a && a.scope;
  if (!scope || scope.error || isAppAdmin(a.user, scope.app)) return true;
  return authRowMode() !== 'enforce';
}

function noteLevelPass(a, what) {
  const scope = a && a.scope;
  if (!scope || scope.error || isAppAdmin(a.user, scope.app) || authRowMode() !== 'log') return;
  logWouldDeny(a.user, scope, `${what} (by level ${a.authLevel || 0})`, 'would-deny',
    scope.open ? BLANK_REASON : LEVEL_REASON);
}

async function levelRule(a, what, check) {
  if (!levelsCount(a)) return false;
  const ok = !!(await check());
  if (ok) noteLevelPass(a, what);
  return ok;
}

/** Transition mode: the permission, or today's level threshold (not under enforce). */
function canOrLevel(user, perm, minLevel, scope, authLevel = 0) {
  return can(user, perm, scope) || levelCounts(user, perm, minLevel, scope, authLevel);
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
 * caller holds `perm` (or any of a list) on the named auth row AND belongs to its project (so a token from another project
 * can't use an open row). Handlers check the permission
 * path first and fall back to the level path with today's level checks.
 * @returns {{ user, scope, project, byPermission: boolean }}
 */
async function authority(authDb, userData, { project, app, authPatternId } = {}, ctx = {}, { perm, minLevel } = {}) {
  // Routes that name no project (membership, delete) are governed by the named app's project.
  const proj = project || app;
  const { user, authLevel, scope } = await authScope(authDb, userData, { project: proj, app, authPatternId }, ctx);
  // THE authority: does a grant on the scope's auth object say yes? `byLevel` is the deprecated
  // second answer — `levelCounts` returns false for it under `enforce`, so only the grant decides
  // there, and under `log` each level-only pass is recorded so the grant can be added.
  const byPermission = user.groups.length > 0 && [].concat(perm).some(p => can(user, p, scope));
  return {
    user, authLevel, scope, project: proj,
    byPermission,
    byLevel: levelCounts(user, perm, minLevel, scope, authLevel, { quiet: byPermission }),
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
 * Does the caller hold `perm` in EVERY project named — the GRANT-BASED form of the `levelOutranks` /
 * `levelCoversGroup` rules, and the only form that survives `enforce`.
 *
 * Those compared integers, but the protection they carried is not about integers: you may not act on a
 * user or a group that also belongs to projects you do not administer. Dropping them for a plain
 * `byPermission` lost that, and `test-auth-users.js` caught it — "deletes a plain member; not one also in
 * another project's group" started passing when it should refuse. The handlers now ask this FIRST and fall
 * back to the level rule, which `levelsCount` switches off under `enforce`.
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

// AUTH LEVELS ARE ON THEIR WAY OUT (owner, 2026-11-03: "the new code should never reference them").
// They no longer decide anything under `enforce` — `levelsCount` returns false there, so only grants
// count — and the rules above (`coversProjects`, `can`) are what replaces them. Under `log` the old
// level rules still pass, and each pass is recorded, so an app's grants can be filled in before the
// switch. `scripts/audit-auth-levels.js` is that pre-flight: it converts an app's levels to grants.
// `rowauth-test` was converted on 2026-11-03.

/** Level rule: the caller's level ≥ the group's in every project the group belongs to. */
async function levelCoversGroup(db, requestingEmail, group_name) {
  const { rows: links } = await db.query(
    'SELECT project_name, auth_level FROM groups_in_projects WHERE group_name = $1',
    [group_name]
  );
  const myAuth = await levelsByProject(db, requestingEmail);
  return links.every(({ project_name, auth_level }) =>
    myAuth[project_name] && myAuth[project_name] >= auth_level);
}

/** Level rule: the caller's level ≥ the target's in every project the target belongs to. */
async function levelOutranks(db, requestingEmail, targetEmail) {
  const { rows: targetProjects } = await db.query(
    `SELECT project_name, auth_level
     FROM users_in_groups AS uig
     INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     WHERE uig.user_email = $1`,
    [targetEmail]
  );
  const myAuth = await levelsByProject(db, requestingEmail);
  return targetProjects.every(({ project_name, auth_level }) =>
    myAuth[project_name] && myAuth[project_name] >= auth_level);
}

async function levelsByProject(db, email) {
  const { rows } = await db.query(
    `SELECT project_name, auth_level
     FROM users_in_groups AS uig
     INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     WHERE uig.user_email = $1`,
    [email]
  );
  const myAuth = {};
  for (const { project_name, auth_level } of rows) {
    myAuth[project_name] = Math.max(myAuth[project_name] || 0, auth_level);
  }
  return myAuth;
}

module.exports = {
  AUTH_USERS, AUTH_GROUPS, VIEW_AS, PROTECTED_PERMISSIONS,
  createAuthGrants, authScope, authUser, can, canOrLevel, levelsCount, noteLevelPass, levelRule,
  canManageGroup, isProtectedGroup, hasGrants,
  authority, groupProjects, canManageGroupIn, coversProjects, levelCoversGroup, levelOutranks,
  PLATFORM_GROUP, isPlatformAdmin, platformAuthority,
};
