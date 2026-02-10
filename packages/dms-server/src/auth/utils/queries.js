/**
 * Auth database query functions.
 * All functions take a database adapter as the first argument.
 * Queries use $N parameter style (SQLite adapter auto-converts to ?).
 * All return { rows, rowCount } from db.query().
 */

// --- Users ---

const getUserByEmail = (db, email) =>
  db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);

const createUser = (db, email, passwordHash) =>
  db.query('INSERT INTO users (email, password) VALUES ($1, $2)', [email.toLowerCase(), passwordHash]);

const deleteUser = async (db, email) => {
  email = email.toLowerCase();
  // Delete from dependent tables first (SQLite FK cascade may not cover all cases)
  await db.query('DELETE FROM users_in_groups WHERE user_email = $1', [email]);
  await db.query('DELETE FROM signup_requests WHERE user_email = $1', [email]);
  await db.query('DELETE FROM logins WHERE user_email = $1', [email]);
  await db.query('DELETE FROM user_preferences WHERE user_email = $1', [email]);
  await db.query('DELETE FROM messages WHERE user_email = $1 OR created_by = $1', [email]);
  await db.query('DELETE FROM messages_new WHERE sent_by = $1 OR sent_to = $1', [email]);
  return db.query('DELETE FROM users WHERE email = $1', [email]);
};

const updateUserPassword = (db, email, passwordHash) =>
  db.query('UPDATE users SET password = $1 WHERE email = $2', [passwordHash, email.toLowerCase()]);

const getUsers = (db) =>
  db.query('SELECT email, id, created_at FROM users ORDER BY email');

// --- User Groups ---

const getUserGroups = (db, email, project) =>
  db.query(
    `SELECT uig.group_name AS name, g.meta, gip.auth_level
     FROM users_in_groups AS uig
     INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     INNER JOIN groups AS g ON g.name = gip.group_name
     WHERE uig.user_email = $1 AND gip.project_name = $2`,
    [email.toLowerCase(), project]
  );

const getUserAuthLevel = async (db, email, project) => {
  const { rows } = await db.query(
    `SELECT MAX(auth_level) AS auth_level
     FROM groups_in_projects AS gip
     INNER JOIN users_in_groups AS uig ON gip.group_name = uig.group_name
     WHERE uig.user_email = $1 AND gip.project_name = $2`,
    [email.toLowerCase(), project]
  );
  return rows[0]?.auth_level || 0;
};

const hasProjectAccess = async (db, email, project) => {
  const { rows } = await db.query(
    `SELECT DISTINCT project_name
     FROM users_in_groups AS uig
     INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     WHERE uig.user_email = $1`,
    [email.toLowerCase()]
  );
  return rows.some(r => r.project_name === project);
};

const getUsersByGroup = (db, groupNames) => {
  // groupNames is an array — use IN with positional params
  if (!Array.isArray(groupNames) || !groupNames.length) {
    return Promise.resolve({ rows: [], rowCount: 0 });
  }
  const placeholders = groupNames.map((_, i) => `$${i + 1}`).join(', ');
  return db.query(
    `SELECT DISTINCT u.email, u.id, u.created_at, uig.group_name
     FROM users AS u
     INNER JOIN users_in_groups AS uig ON u.email = uig.user_email
     WHERE uig.group_name IN (${placeholders})
     ORDER BY u.email`,
    groupNames
  );
};

const getUsersByProject = (db, project) =>
  db.query(
    `SELECT DISTINCT u.email, u.id, u.created_at
     FROM users AS u
     INNER JOIN users_in_groups AS uig ON u.email = uig.user_email
     INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     WHERE gip.project_name = $1
     ORDER BY u.email`,
    [project]
  );

const assignUserToGroup = (db, email, groupName, createdBy) =>
  db.query(
    'INSERT INTO users_in_groups (user_email, group_name, created_by) VALUES ($1, $2, $3)',
    [email.toLowerCase(), groupName, createdBy]
  );

const removeUserFromGroup = (db, email, groupName) =>
  db.query(
    'DELETE FROM users_in_groups WHERE user_email = $1 AND group_name = $2',
    [email.toLowerCase(), groupName]
  );

// --- Groups ---

const getGroups = (db) =>
  db.query('SELECT name, meta, id, created_by, created_at FROM groups ORDER BY name');

const getGroupsForProject = (db, project) =>
  db.query(
    `SELECT g.name, g.meta, g.id, gip.auth_level
     FROM groups AS g
     INNER JOIN groups_in_projects AS gip ON g.name = gip.group_name
     WHERE gip.project_name = $1
     ORDER BY g.name`,
    [project]
  );

const createGroup = (db, name, meta, createdBy) =>
  db.query(
    'INSERT INTO groups (name, meta, created_by) VALUES ($1, $2, $3)',
    [name, meta ? JSON.stringify(meta) : null, createdBy]
  );

const deleteGroup = async (db, name) => {
  await db.query('DELETE FROM users_in_groups WHERE group_name = $1', [name]);
  await db.query('DELETE FROM groups_in_projects WHERE group_name = $1', [name]);
  return db.query('DELETE FROM groups WHERE name = $1', [name]);
};

const updateGroupMeta = (db, name, meta) =>
  db.query('UPDATE groups SET meta = $1 WHERE name = $2', [JSON.stringify(meta), name]);

const assignGroupToProject = (db, groupName, projectName, authLevel, createdBy) =>
  db.query(
    'INSERT INTO groups_in_projects (project_name, group_name, auth_level, created_by) VALUES ($1, $2, $3, $4)',
    [projectName, groupName, authLevel || 0, createdBy]
  );

const removeGroupFromProject = (db, groupName, projectName) =>
  db.query(
    'DELETE FROM groups_in_projects WHERE project_name = $1 AND group_name = $2',
    [projectName, groupName]
  );

const adjustAuthLevel = (db, groupName, projectName, authLevel) =>
  db.query(
    'UPDATE groups_in_projects SET auth_level = $1 WHERE project_name = $2 AND group_name = $3',
    [authLevel, projectName, groupName]
  );

// --- Projects ---

const getProjects = (db) =>
  db.query('SELECT name, created_by, created_at FROM projects ORDER BY name');

const createProject = (db, name, createdBy) =>
  db.query('INSERT INTO projects (name, created_by) VALUES ($1, $2)', [name, createdBy]);

const deleteProject = async (db, name) => {
  await db.query('DELETE FROM groups_in_projects WHERE project_name = $1', [name]);
  await db.query('DELETE FROM signup_requests WHERE project_name = $1', [name]);
  return db.query('DELETE FROM projects WHERE name = $1', [name]);
};

// --- Signup Requests ---

const createSignupRequest = (db, email, project, state = 'pending') =>
  db.query(
    'INSERT INTO signup_requests (user_email, project_name, state) VALUES ($1, $2, $3)',
    [email.toLowerCase(), project, state]
  );

const updateSignupRequest = (db, email, project, state, resolvedBy) =>
  db.query(
    `UPDATE signup_requests SET state = $1, resolved_at = $2, resolved_by = $3
     WHERE user_email = $4 AND project_name = $5`,
    [state, new Date().toISOString(), resolvedBy, email.toLowerCase(), project]
  );

const getSignupRequests = (db, project) =>
  db.query(
    'SELECT user_email, project_name, state, created_at, resolved_at, resolved_by FROM signup_requests WHERE project_name = $1 ORDER BY created_at DESC',
    [project]
  );

const getAllSignupRequests = (db) =>
  db.query('SELECT user_email, project_name, state, created_at, resolved_at, resolved_by FROM signup_requests ORDER BY created_at DESC');

const deleteSignupRequest = (db, email, project) =>
  db.query(
    'DELETE FROM signup_requests WHERE user_email = $1 AND project_name = $2',
    [email.toLowerCase(), project]
  );

const getSignupRequestByEmail = (db, email, project) =>
  db.query(
    'SELECT * FROM signup_requests WHERE user_email = $1 AND project_name = $2',
    [email.toLowerCase(), project]
  );

const getPendingSignupCount = async (db, email, project) => {
  const { rows } = await db.query(
    `SELECT count(1) AS count FROM signup_requests
     WHERE user_email = $1 AND project_name = $2 AND state = 'pending'`,
    [email.toLowerCase(), project]
  );
  return +(rows[0]?.count || 0);
};

// --- Logins ---

const logLogin = (db, email, project) =>
  db.query(
    'INSERT INTO logins (user_email, project_name) VALUES ($1, $2)',
    [email.toLowerCase(), project]
  );

const getLogins = (db, project, limit = 100) =>
  db.query(
    'SELECT user_email, project_name, created_at FROM logins WHERE project_name = $1 ORDER BY created_at DESC LIMIT $2',
    [project, limit]
  );

// --- Messages (messages_new table) ---

const getMessages = (db, email, project) =>
  db.query(
    `SELECT id, heading, message, sent_by, sent_at, project_name, viewed
     FROM messages_new
     WHERE sent_to = $1 AND deleted = FALSE
     ${project ? 'AND project_name = $2' : ''}
     ORDER BY sent_at DESC`,
    project ? [email.toLowerCase(), project] : [email.toLowerCase()]
  );

const sendMessage = (db, { heading, message, sentBy, sentTo, project }) =>
  db.query(
    'INSERT INTO messages_new (heading, message, sent_by, sent_to, project_name) VALUES ($1, $2, $3, $4, $5)',
    [heading, message, sentBy, sentTo.toLowerCase(), project || null]
  );

const viewMessages = (db, ids) => {
  if (!Array.isArray(ids) || !ids.length) return Promise.resolve({ rows: [], rowCount: 0 });
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  return db.query(
    `UPDATE messages_new SET viewed = TRUE WHERE id IN (${placeholders})`,
    ids
  );
};

const deleteMessages = (db, ids) => {
  if (!Array.isArray(ids) || !ids.length) return Promise.resolve({ rows: [], rowCount: 0 });
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  return db.query(
    `UPDATE messages_new SET deleted = TRUE WHERE id IN (${placeholders})`,
    ids
  );
};

// --- Preferences ---

const getPreferences = (db, email, project) =>
  db.query(
    'SELECT preferences FROM user_preferences WHERE user_email = $1 AND project_name = $2',
    [email.toLowerCase(), project]
  );

const updatePreferences = async (db, email, project, preferences) => {
  email = email.toLowerCase();
  const prefsJson = typeof preferences === 'string' ? preferences : JSON.stringify(preferences);

  // Upsert: try update first, insert if no rows affected
  const result = await db.query(
    'UPDATE user_preferences SET preferences = $1 WHERE user_email = $2 AND project_name = $3',
    [prefsJson, email, project]
  );
  if (result.rowCount === 0) {
    return db.query(
      'INSERT INTO user_preferences (user_email, project_name, preferences) VALUES ($1, $2, $3)',
      [email, project, prefsJson]
    );
  }
  return result;
};

// --- Utility queries used by JWT middleware ---

const getProjectCount = async (db, project) => {
  const { rows } = await db.query(
    'SELECT count(1) AS count FROM projects WHERE name = $1',
    [project]
  );
  return +(rows[0]?.count || 0);
};

const isPublicGroup = async (db, groupName, project) => {
  const { rows } = await db.query(
    `SELECT count(1) AS count FROM groups_in_projects
     WHERE group_name = $1 AND project_name = $2
     AND group_name NOT IN (
       SELECT DISTINCT group_name FROM groups_in_projects WHERE auth_level > 0
     )`,
    [groupName, project]
  );
  return +(rows[0]?.count || 0) === 1;
};

module.exports = {
  // Users
  getUserByEmail,
  createUser,
  deleteUser,
  updateUserPassword,
  getUsers,

  // User Groups
  getUserGroups,
  getUserAuthLevel,
  hasProjectAccess,
  getUsersByGroup,
  getUsersByProject,
  assignUserToGroup,
  removeUserFromGroup,

  // Groups
  getGroups,
  getGroupsForProject,
  createGroup,
  deleteGroup,
  updateGroupMeta,
  assignGroupToProject,
  removeGroupFromProject,
  adjustAuthLevel,

  // Projects
  getProjects,
  createProject,
  deleteProject,

  // Signup Requests
  createSignupRequest,
  updateSignupRequest,
  getSignupRequests,
  getAllSignupRequests,
  deleteSignupRequest,
  getSignupRequestByEmail,
  getPendingSignupCount,

  // Logins
  logLogin,
  getLogins,

  // Messages
  getMessages,
  sendMessage,
  viewMessages,
  deleteMessages,

  // Preferences
  getPreferences,
  updatePreferences,

  // Utilities
  getProjectCount,
  isPublicGroup,
};
