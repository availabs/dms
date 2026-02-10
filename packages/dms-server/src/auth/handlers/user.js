/**
 * User management handlers.
 * Each function takes (db, body) where body is req.body from Express.
 */

const { verifyAndGetUserData } = require('./auth');
const q = require('../utils/queries');
const { hashPassword } = require('../utils/crypto');

/** POST /users — list users visible to authenticated user (filtered by authority) */
async function getUsers(db, { token }) {
  const userData = await verifyAndGetUserData(db, token);

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
    });
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
async function getUsersByGroup(db, { token, groups }) {
  const userData = await verifyAndGetUserData(db, token);

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
    });
    if (canSee) filtered.push(row);
  }

  return filtered;
}

/** POST /users/byProject — all users in project (auth ≥ 10 in that project) */
async function getUsersByProject(db, { token, project }) {
  const userData = await verifyAndGetUserData(db, token);
  const authLevel = await q.getUserAuthLevel(db, userData.email, project);

  if (authLevel < 10) throw new Error(`You do not have the authority to list users for project ${project}.`);

  const { rows } = await db.query(
    `SELECT u.id, uig.user_email AS email, uig.group_name
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
      userMap[row.email] = { id: row.id, email: row.email, groups: [] };
    }
    userMap[row.email].groups.push(row.group_name);
  }
  return Object.values(userMap);
}

/** POST /user/group/assign — add user to group (authority check) */
async function assignToGroup(db, { token, user_email, group_name }) {
  const userData = await verifyAndGetUserData(db, token);

  // Check: requesting user must have >= auth_level in every project the group belongs to
  await checkGroupAuthority(db, userData.email, group_name);

  await q.assignUserToGroup(db, user_email, group_name, userData.email);
  return `Assigned user ${user_email} to group ${group_name}.`;
}

/** POST /user/group/remove — remove user from group (authority check) */
async function removeFromGroup(db, { token, user_email, group_name }) {
  const userData = await verifyAndGetUserData(db, token);

  await checkGroupAuthority(db, userData.email, group_name);

  await q.removeUserFromGroup(db, user_email, group_name);
  return `Removed user ${user_email} from group ${group_name}.`;
}

/** POST /user/delete — delete user (must have authority in all user's projects) */
async function deleteUser(db, { token, user_email }) {
  const userData = await verifyAndGetUserData(db, token);

  // Get target user's project-level auth
  const { rows: targetProjects } = await db.query(
    `SELECT project_name, auth_level
     FROM users_in_groups AS uig
     INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     WHERE uig.user_email = $1`,
    [user_email]
  );

  // Get requesting user's project-level auth
  const { rows: myProjects } = await db.query(
    `SELECT project_name, auth_level
     FROM users_in_groups AS uig
     INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     WHERE uig.user_email = $1`,
    [userData.email]
  );
  const myAuth = {};
  for (const { project_name, auth_level } of myProjects) {
    myAuth[project_name] = Math.max(myAuth[project_name] || 0, auth_level);
  }

  // Must have >= auth_level in every project the target user belongs to
  for (const { project_name, auth_level } of targetProjects) {
    if (!myAuth[project_name] || myAuth[project_name] < auth_level) {
      throw new Error(`You do not have the authority to delete user ${user_email}.`);
    }
  }

  await q.deleteUser(db, user_email);
  return `Deleted user ${user_email}.`;
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
async function getUsersPreferences(db, { token, userEmails, preferenceKey }) {
  const userData = await verifyAndGetUserData(db, token);

  // Simple version: get preferences for requested users
  // (authority filtering would match getUsers pattern but is complex;
  //  for now, return preferences for any specified users)
  const results = [];
  for (const email of (userEmails || [])) {
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
// Helper: check requesting user has authority over a group
// ---------------------------------------------------------------------------

async function checkGroupAuthority(db, requestingEmail, group_name) {
  // Get group's project-level auth
  const { rows: groupProjects } = await db.query(
    'SELECT project_name, auth_level FROM groups_in_projects WHERE group_name = $1',
    [group_name]
  );

  // Get requesting user's project-level auth
  const { rows: myProjects } = await db.query(
    `SELECT project_name, auth_level
     FROM users_in_groups AS uig
     INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     WHERE uig.user_email = $1`,
    [requestingEmail]
  );
  const myAuth = {};
  for (const { project_name, auth_level } of myProjects) {
    myAuth[project_name] = Math.max(myAuth[project_name] || 0, auth_level);
  }

  // Must have >= auth_level in every project the group belongs to
  for (const { project_name, auth_level } of groupProjects) {
    if (!myAuth[project_name] || myAuth[project_name] < auth_level) {
      throw new Error(`You do not have the authority to manage group ${group_name}.`);
    }
  }
}

module.exports = {
  getUsers,
  getUsersByGroup,
  getUsersByProject,
  assignToGroup,
  removeFromGroup,
  deleteUser,
  createFake,
  getUsersPreferences,
};
