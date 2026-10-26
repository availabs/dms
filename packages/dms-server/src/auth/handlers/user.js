/**
 * User management handlers.
 * Each function takes (db, body) where body is req.body from Express.
 */

const { verifyAndGetUserData } = require('./auth');
const q = require('../utils/queries');
const { hashPassword } = require('../utils/crypto');
const {
  AUTH_USERS, authority, canManageGroupIn, groupProjects, levelCoversGroup, levelOutranks,
} = require('../utils/permissions');

// Task permissions-auth-users-and-signup: each check runs in transition form, `auth-users` on the
// auth row the request names (permissions.js authority) or today's level rule.
const usersAuthority = (db, userData, body, ctx, minLevel) =>
  authority(db, userData, body, ctx, { perm: AUTH_USERS, minLevel });

/** Whether `email` belongs to a group of `project`. */
async function inProject(db, email, project) {
  const { rows } = await db.query(
    `SELECT count(1) AS count FROM users_in_groups AS uig
     INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     WHERE uig.user_email = $1 AND gip.project_name = $2`,
    [email, project]
  );
  return +(rows[0]?.count || 0) > 0;
}

/** POST /users — list users visible to authenticated user (filtered by authority) */
async function getUsers(db, body, ctx) {
  const userData = await verifyAndGetUserData(db, body.token);
  const a = await usersAuthority(db, userData, body, ctx, 5);

  // Get the requesting user's max auth level per project
  const { rows: userProjects } = await db.query(
    `SELECT project_name, MAX(auth_level) AS auth_level
     FROM users_in_groups AS uig
     INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     WHERE user_email = $1
     GROUP BY 1`,
    [userData.email]
  );
  const projectAuth = {};
  for (const { project_name, auth_level } of userProjects) {
    projectAuth[project_name] = auth_level;
  }

  // Get all users with their groups
  const { rows: allUsers } = await db.query(
    'SELECT email, id, created_at FROM users ORDER BY email'
  );

  // Filter: exclude users who belong to a group in a project where
  // that group's auth_level exceeds the requesting user's auth level
  const visible = [];
  for (const user of allUsers) {
    const { rows: userGroupProjects } = await db.query(
      `SELECT gip.project_name, gip.auth_level
       FROM users_in_groups AS uig
       INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
       WHERE uig.user_email = $1`,
      [user.email]
    );
    const canSee = userGroupProjects.every(({ project_name, auth_level }) => {
      const myLevel = projectAuth[project_name];
      return myLevel !== undefined && myLevel >= auth_level;
    }) || (a.byPermission && userGroupProjects.some(({ project_name }) => project_name === a.project));
    if (canSee) {
      // Get groups and projects for this user
      const { rows: groups } = await db.query(
        'SELECT DISTINCT group_name FROM users_in_groups WHERE user_email = $1',
        [user.email]
      );
      const { rows: projects } = await db.query(
        `SELECT gip.project_name, uig.group_name, gip.auth_level
         FROM users_in_groups AS uig
         INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
         WHERE uig.user_email = $1`,
        [user.email]
      );
      visible.push({
        ...user,
        groups: groups.map(g => g.group_name),
        projects: projects.map(p => ({ project_name: p.project_name, group_name: p.group_name, auth_level: p.auth_level })),
      });
    }
  }

  return visible;
}

/** POST /users/bygroup — users in specified groups (filtered by authority) */
async function getUsersByGroup(db, body, ctx) {
  const { token, groups } = body;
  const userData = await verifyAndGetUserData(db, token);
  const a = await usersAuthority(db, userData, body, ctx, 5);

  // Get requesting user's auth levels
  const { rows: userProjects } = await db.query(
    `SELECT project_name, MAX(auth_level) AS auth_level
     FROM users_in_groups AS uig
     INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     WHERE user_email = $1
     GROUP BY 1`,
    [userData.email]
  );
  const projectAuth = {};
  for (const { project_name, auth_level } of userProjects) {
    projectAuth[project_name] = auth_level;
  }

  // Get users in specified groups
  const result = await q.getUsersByGroup(db, groups);

  // Filter by authority: only show users in groups whose auth_level <=  user's level
  const filtered = [];
  for (const row of result.rows) {
    const { rows: gipRows } = await db.query(
      'SELECT project_name, auth_level FROM groups_in_projects WHERE group_name = $1',
      [row.group_name]
    );
    const canSee = gipRows.every(({ project_name, auth_level }) => {
      const myLevel = projectAuth[project_name];
      return myLevel !== undefined && myLevel >= auth_level;
    }) || (a.byPermission && gipRows.some(({ project_name }) => project_name === a.project));
    if (canSee) filtered.push(row);
  }

  return filtered;
}

/**
 * POST /users/byProject — all users in project (`auth-users`, or level ≥ 10). Each user carries
 * `manageable`: whether the caller may change every group the user is in here. The Users page shows
 * the others read-only; the write routes check again.
 */
async function getUsersByProject(db, body, ctx) {
  const { token, project } = body;
  const userData = await verifyAndGetUserData(db, token);
  const a = await usersAuthority(db, userData, body, ctx, 10);

  if (!a.byPermission && !a.byLevel) throw new Error(`You do not have the authority to list users for project ${project}.`);

  const { rows } = await db.query(
    `SELECT u.id, uig.user_email AS email, uig.group_name, u.created_at,
            (SELECT MAX(l.created_at) FROM logins l
             WHERE l.user_email = uig.user_email AND l.project_name = $1) AS last_login
     FROM users_in_groups AS uig
     INNER JOIN users AS u ON uig.user_email = u.email
     INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     WHERE gip.project_name = $1
     ORDER BY uig.user_email`,
    [project]
  );

  // Group by user, aggregate groups
  const userMap = {};
  for (const row of rows) {
    if (!userMap[row.email]) {
      userMap[row.email] = { id: row.id, email: row.email, groups: [], created_at: row.created_at, last_login: row.last_login };
    }
    userMap[row.email].groups.push(row.group_name);
  }

  const groupOk = {};
  for (const g of new Set(rows.map(r => r.group_name))) {
    groupOk[g] = (a.byPermission && await canManageGroupIn(db, a.user, g, a.scope))
      || (a.byLevel && await levelCoversGroup(db, userData.email, g));
  }
  const users = Object.values(userMap).map(u => ({ ...u, manageable: u.groups.every(g => groupOk[g]) }));
  return { users };
}

/** POST /user/group/assign — add user to group (authority check) */
async function assignToGroup(db, body, ctx) {
  const { token, user_email, group_name } = body;
  const userData = await verifyAndGetUserData(db, token);

  await checkGroupAuthority(db, userData, group_name, body, ctx);

  await q.assignUserToGroup(db, user_email, group_name, userData.email);
  return `Assigned user ${user_email} to group ${group_name}.`;
}

/** POST /user/group/remove — remove user from group (authority check) */
async function removeFromGroup(db, body, ctx) {
  const { token, user_email, group_name } = body;
  const userData = await verifyAndGetUserData(db, token);

  await checkGroupAuthority(db, userData, group_name, body, ctx);

  await q.removeUserFromGroup(db, user_email, group_name);
  return `Removed user ${user_email} from group ${group_name}.`;
}

/** POST /user/delete — delete user (must have authority in all user's projects) */
async function deleteUser(db, body, ctx) {
  const { token, user_email } = body;
  const userData = await verifyAndGetUserData(db, token);

  // auth-users: the target belongs to this project and every group they're in (any project) is
  // manageable from this auth row, so a member of another project's group is out of reach.
  const a = await usersAuthority(db, userData, body, ctx, Infinity);
  if (a.byPermission && await inProject(db, user_email, a.project)) {
    const { rows: targetGroups } = await db.query(
      'SELECT DISTINCT group_name FROM users_in_groups WHERE user_email = $1', [user_email]);
    let all = true;
    for (const { group_name } of targetGroups) {
      if (!await canManageGroupIn(db, a.user, group_name, a.scope)) { all = false; break; }
    }
    if (all) {
      await q.deleteUser(db, user_email);
      return `Deleted user ${user_email}.`;
    }
  }

  // Level rule: ≥ the target's level in every project they're in. A user in no project is left to the
  // platform (an empty list used to let any signed-in user delete them).
  const { rows: [targetHasProject] } = await db.query(
    `SELECT count(1) AS count FROM users_in_groups AS uig
     INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     WHERE uig.user_email = $1`,
    [user_email]
  );
  if (!+(targetHasProject?.count || 0) || !await levelOutranks(db, userData.email, user_email)) {
    throw new Error(`You do not have the authority to delete user ${user_email}.`);
  }

  await q.deleteUser(db, user_email);
  return `Deleted user ${user_email}.`;
}

/**
 * POST /user/project/remove — "Remove from site" (owner 2026-10-25): what a site does instead of deleting
 * an account other sites may use. Strips the user's own grants from every row of the site (patterns,
 * pages, internal sources; through the DMS controller, so they're logged and synced), then removes them
 * from every group linked to the project, shared groups included (the plan names the other projects
 * those serve, for the confirm dialog). External-source grants are listed, not changed (`pgEnvs`: the
 * site's DAMA envs, a client setting). The account stays. `dryRun` returns the plan only.
 *
 * Grants first, memberships last: two databases, no shared transaction, and a retry after a partial
 * failure finds the user still a member and finishes the job.
 */
async function removeFromProject(db, body, ctx = {}) {
  const { token, user_email, dryRun = false, pgEnvs = [] } = body;
  const userData = await verifyAndGetUserData(db, token);
  const a = await usersAuthority(db, userData, body, ctx, Infinity);
  if (!a.project) throw new Error('Name the site (app) to remove the user from.');

  const { rows: groupRows } = await db.query(
    `SELECT DISTINCT uig.group_name FROM users_in_groups AS uig
     INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     WHERE uig.user_email = $1 AND gip.project_name = $2`,
    [user_email, a.project]
  );
  if (!groupRows.length) throw new Error(`${user_email} is not a member of ${a.project}.`);
  const groups = groupRows.map(r => r.group_name);
  for (const g of groups) {
    const ok = (a.byPermission && await canManageGroupIn(db, a.user, g, a.scope))
      || await levelCoversGroup(db, userData.email, g);
    if (!ok) throw new Error(`You do not have the authority to remove ${user_email} from ${a.project}.`);
  }

  const sharedGroups = [];
  for (const g of groups) {
    const otherProjects = (await groupProjects(db, g)).filter(p => p !== a.project);
    if (otherProjects.length) sharedGroups.push({ group: g, otherProjects });
  }
  const { rows: [target] } = await q.getUserByEmail(db, user_email);
  if (!ctx.siteGrants) throw new Error('Site grants are unavailable.');
  const who = { users: target.id };
  const { grants, skipped } = await ctx.siteGrants.listSiteGrants(a.project, who);
  const externalSources = await ctx.siteGrants.listExternalGrants(pgEnvs, who);
  const plan = {
    user_email, project: a.project, groups, sharedGroups,
    siteGrants: grants.map(({ id, type }) => ({ id, type })), skippedGrants: skipped, externalSources,
  };
  if (dryRun) return plan;

  const stripped = await ctx.siteGrants.stripSiteGrants(a.project, who, { id: userData.id, email: userData.email });
  plan.skippedGrants = stripped.skipped;
  await db.withTransaction(async (tx) => {
    for (const g of groups) await q.removeUserFromGroup(tx, user_email, g);
  });
  return { ...plan, message: `Removed ${user_email} from ${a.project}.` };
}

/** POST /user/create/fake — create test user (avail_auth auth 10 only) */
async function createFake(db, { token }) {
  const userData = await verifyAndGetUserData(db, token);
  const authLevel = await q.getUserAuthLevel(db, userData.email, 'avail_auth');

  if (authLevel < 10) throw new Error('You do not have the authority to create fake users.');

  const { rows: fakeUsers } = await db.query(
    "SELECT email FROM users WHERE email LIKE 'fake.user.%@fake.email.com'"
  );

  const regex = /fake\.user\.(\d+)@fake\.email\.com/;
  let num = 0;
  for (const { email } of fakeUsers) {
    const match = regex.exec(email);
    if (match) num = Math.max(num, +match[1]);
  }

  const fakeEmail = `fake.user.${++num}@fake.email.com`;
  const fakePassword = 'Jedi21fake';
  const passwordHash = hashPassword(fakePassword);
  await db.query('INSERT INTO users (email, password) VALUES ($1, $2)', [fakeEmail, passwordHash]);

  return `New fake user created with email ${fakeEmail} and password ${fakePassword}.`;
}

/** POST /users/preferences — get preferences for specified users */
async function getUsersPreferences(db, body, ctx) {
  const { token, userEmails, preferenceKey } = body;
  const userData = await verifyAndGetUserData(db, token);
  const a = await usersAuthority(db, userData, body, ctx, Infinity);

  // Own preferences always; another user's with auth-users (they're in the project) or today's rank
  // rule (the caller's level ≥ theirs in every project they're in).
  const results = [];
  for (const email of (userEmails || [])) {
    const visible = email === userData.email
      || (a.byPermission && await inProject(db, email, a.project))
      || await levelOutranks(db, userData.email, email);
    if (!visible) continue;
    const { rows } = await db.query(
      'SELECT user_email, preferences FROM user_preferences WHERE user_email = $1',
      [email]
    );
    if (rows[0]) {
      const prefs = rows[0].preferences;
      results.push({
        user_email: email,
        [preferenceKey || 'preferences']: preferenceKey && prefs ? prefs[preferenceKey] : prefs,
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Helpers: authority over a group / a user
// ---------------------------------------------------------------------------

/**
 * Membership changes (owner 2026-10-25: `auth-users` only): `auth-users` on the named auth row + the
 * group manageable from it, or the level rule. Throws when neither passes.
 */
async function checkGroupAuthority(db, userData, group_name, body, ctx) {
  const a = await usersAuthority(db, userData, body, ctx, Infinity);
  if (a.byPermission && await canManageGroupIn(db, a.user, group_name, a.scope)) return;
  if (await levelCoversGroup(db, userData.email, group_name)) return;
  throw new Error(`You do not have the authority to manage group ${group_name}.`);
}

module.exports = {
  getUsers,
  getUsersByGroup,
  getUsersByProject,
  assignToGroup,
  removeFromGroup,
  deleteUser,
  removeFromProject,
  createFake,
  getUsersPreferences,
};
