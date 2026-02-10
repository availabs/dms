/**
 * Group management handlers.
 * Each function takes (db, body) where body is req.body from Express.
 */

const { verifyAndGetUserData } = require('./auth');
const q = require('../utils/queries');

/** POST /groups — list groups visible to authenticated user (filtered by authority) */
async function getGroups(db, { token }) {
  const userData = await verifyAndGetUserData(db, token);

  // Get requesting user's max auth level per project
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

  // Get all groups with member count and project assignments
  const { rows: allGroups } = await db.query(
    `SELECT g.name, g.meta, g.created_at, g.created_by
     FROM groups AS g
     ORDER BY g.name`
  );

  const visible = [];
  for (const group of allGroups) {
    // Get group's project assignments
    const { rows: gipRows } = await db.query(
      'SELECT project_name, group_name, auth_level FROM groups_in_projects WHERE group_name = $1',
      [group.name]
    );

    // Filter: exclude groups that have an auth_level > user's level in any project
    const canSee = gipRows.every(({ project_name, auth_level }) => {
      const myLevel = projectAuth[project_name];
      return myLevel !== undefined && myLevel >= auth_level;
    });
    if (!canSee) continue;

    // Get member count
    const { rows: memberRows } = await db.query(
      'SELECT count(1) AS count FROM users_in_groups WHERE group_name = $1',
      [group.name]
    );

    visible.push({
      ...group,
      num_members: +(memberRows[0]?.count || 0),
      projects: gipRows,
    });
  }

  return visible;
}

/** POST /groups/byproject — groups in a specific project (filtered by authority) */
async function groupsForProject(db, { token, project }) {
  const userData = await verifyAndGetUserData(db, token);
  const myAuthLevel = await q.getUserAuthLevel(db, userData.email, project);

  const { rows: groups } = await db.query(
    `SELECT g.name, g.meta, g.created_at, g.created_by, gip.auth_level
     FROM groups AS g
     INNER JOIN groups_in_projects AS gip ON g.name = gip.group_name
     WHERE gip.project_name = $1
     ORDER BY g.name`,
    [project]
  );

  // Filter by authority and add member counts + project assignments
  const visible = [];
  for (const group of groups) {
    if (group.auth_level > myAuthLevel) continue;

    const { rows: memberRows } = await db.query(
      'SELECT count(1) AS count FROM users_in_groups WHERE group_name = $1',
      [group.name]
    );
    const { rows: projRows } = await db.query(
      'SELECT project_name, group_name, auth_level FROM groups_in_projects WHERE group_name = $1',
      [group.name]
    );

    visible.push({
      name: group.name,
      meta: group.meta,
      created_at: group.created_at,
      created_by: group.created_by,
      num_members: +(memberRows[0]?.count || 0),
      projects: projRows,
    });
  }

  return visible;
}

/** POST /group/create — create group (auth ≥ 5 in avail_auth) */
async function createGroup(db, { token, name, meta }) {
  const userData = await verifyAndGetUserData(db, token);
  const authLevel = await q.getUserAuthLevel(db, userData.email, 'avail_auth');

  if (authLevel < 5) throw new Error('You do not have the required authority level to create groups.');

  await q.createGroup(db, name, meta, userData.email);
  return { message: `Group ${name} was successfully created.` };
}

/** POST /group/create/project/assign — create group and assign to project */
async function createAndAssign(db, { token, group_name, meta, project_name, auth_level }) {
  const userData = await verifyAndGetUserData(db, token);
  const myAuthLevel = await q.getUserAuthLevel(db, userData.email, project_name);

  if (myAuthLevel < 5) {
    throw new Error('You do not have the required authority level to create groups.');
  }
  if (myAuthLevel < auth_level) {
    throw new Error(`You do not have the required authority level to create and assign group "${group_name}" to project "${project_name}" at authority level "${auth_level}".`);
  }
  if (auth_level < 0 || auth_level > 10) {
    throw new Error('Authority Level must be in the range 0 to 10 inclusive.');
  }

  await q.createGroup(db, group_name, meta, userData.email);
  await q.assignGroupToProject(db, group_name, project_name, auth_level, userData.email);
  return { message: `Group ${group_name} was successfully created and assigned to project ${project_name} at authority level ${auth_level}.` };
}

/** POST /group/delete — delete group (removes from projects user has authority over) */
async function deleteGroup(db, { token, name }) {
  const userData = await verifyAndGetUserData(db, token);

  // Get projects where user has auth ≥ 5
  const { rows: myProjects } = await db.query(
    `SELECT project_name, auth_level
     FROM users_in_groups AS uig
     INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
     WHERE user_email = $1 AND gip.auth_level >= 5`,
    [userData.email]
  );

  // Remove group from projects where user has sufficient authority
  for (const { project_name, auth_level } of myProjects) {
    await db.query(
      'DELETE FROM groups_in_projects WHERE group_name = $1 AND project_name = $2 AND auth_level <= $3',
      [name, project_name, auth_level]
    );
  }

  // Check if group still belongs to any projects
  const { rows: remaining } = await db.query(
    'SELECT project_name FROM groups_in_projects WHERE group_name = $1',
    [name]
  );

  if (remaining.length === 0) {
    // Fully remove the group
    await db.query('DELETE FROM users_in_groups WHERE group_name = $1', [name]);
    await db.query('DELETE FROM groups WHERE name = $1', [name]);
    return `Group ${name} was deleted.`;
  }

  return `Group "${name}" was removed from all projects for which you have authority.`;
}

/** POST /group/project/assign — assign group to project */
async function assignToProject(db, { token, group_name, project_name, auth_level }) {
  const userData = await verifyAndGetUserData(db, token);
  const myAuthLevel = await q.getUserAuthLevel(db, userData.email, project_name);

  if (auth_level < 0 || auth_level > 10) {
    throw new Error('Authority Level must be in the range 0 to 10 inclusive.');
  }
  if (myAuthLevel < 5 || myAuthLevel < auth_level) {
    throw new Error(`You do not have the required authority level to assign group "${group_name}" to project "${project_name}" at authority level "${auth_level}".`);
  }

  await q.assignGroupToProject(db, group_name, project_name, auth_level, userData.email);
  return { message: `Group "${group_name}" was assigned to project "${project_name}".` };
}

/** POST /group/project/remove — remove group from project */
async function removeFromProject(db, { token, group_name, project_name }) {
  const userData = await verifyAndGetUserData(db, token);
  const myAuthLevel = await q.getUserAuthLevel(db, userData.email, project_name);

  // Check group's auth level in this project
  const { rows } = await db.query(
    'SELECT auth_level FROM groups_in_projects WHERE group_name = $1 AND project_name = $2',
    [group_name, project_name]
  );
  if (!rows.length) throw new Error(`Group "${group_name}" is not in project "${project_name}".`);
  const groupAuthLevel = rows[0].auth_level;

  if (myAuthLevel < 5 || myAuthLevel < groupAuthLevel) {
    throw new Error(`You do not have the required authority level to remove group "${group_name}" from project "${project_name}".`);
  }

  await q.removeGroupFromProject(db, group_name, project_name);
  return { message: `Group "${group_name}" was removed from project "${project_name}".` };
}

/** POST /group/project/adjust — adjust group's auth level in project */
async function adjustAuthLevel(db, { token, group_name, project_name, auth_level }) {
  const userData = await verifyAndGetUserData(db, token);
  const myAuthLevel = await q.getUserAuthLevel(db, userData.email, project_name);

  if (auth_level < 0 || auth_level > 10) {
    throw new Error('Authority Level must be in the range 0 to 10 inclusive.');
  }
  if (myAuthLevel < 5 || myAuthLevel < auth_level) {
    throw new Error('You do not have the required authority level.');
  }

  await q.adjustAuthLevel(db, group_name, project_name, auth_level);
  return `Successfully adjusted group ${group_name} authority level for project ${project_name} to ${auth_level}.`;
}

/** POST /group/meta/update — update group metadata (auth ≥ 5 in avail_auth) */
async function updateGroup(db, { token, group_name, meta }) {
  const userData = await verifyAndGetUserData(db, token);
  const authLevel = await q.getUserAuthLevel(db, userData.email, 'avail_auth');

  if (authLevel < 5) throw new Error('You do not have the required authority level to edit groups.');

  // Merge with existing meta
  const { rows } = await db.query('SELECT meta FROM groups WHERE name = $1', [group_name]);
  const currentMeta = rows[0]?.meta || {};
  const parsedCurrent = typeof currentMeta === 'string' ? JSON.parse(currentMeta) : currentMeta;
  const newMeta = { ...parsedCurrent, ...meta };

  await q.updateGroupMeta(db, group_name, newMeta);
  return newMeta;
}

module.exports = {
  getGroups,
  groupsForProject,
  createGroup,
  createAndAssign,
  deleteGroup,
  assignToProject,
  removeFromProject,
  adjustAuthLevel,
  updateGroup,
};
