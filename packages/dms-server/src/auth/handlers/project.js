/**
 * Project management handlers.
 * Each function takes (db, body) where body is req.body from Express.
 */

const { verifyAndGetUserData } = require('./auth');
const q = require('../utils/queries');
const { isPlatformAdmin, platformAuthority, PLATFORM_GROUP } = require('../utils/permissions');

/**
 * POST /projects — list projects: a platform admin (AVAIL member, or avail_auth level 10) sees all; avail_auth
 * level ≥ 1 sees their own (level rule, until levels are removed)
 */
async function getProjects(db, { token }) {
  const userData = await verifyAndGetUserData(db, token);
  const authLevel = await q.getUserAuthLevel(db, userData.email, 'avail_auth');

  if (authLevel >= 10 || await isPlatformAdmin(db, userData.email)) {
    const { rows } = await q.getProjects(db);
    return rows;
  }

  if (authLevel >= 1) {
    const { rows } = await db.query(
      `SELECT DISTINCT p.*
       FROM projects AS p
       INNER JOIN groups_in_projects AS gip ON p.name = gip.project_name
       INNER JOIN users_in_groups AS uig ON gip.group_name = uig.group_name
       WHERE uig.user_email = $1`,
      [userData.email]
    );
    return rows;
  }

  throw new Error('You do not have the required authority to look at projects.');
}

/** POST /project/create — create project (platform admin: AVAIL member, or avail_auth level 10) */
async function createProject(db, { token, name }) {
  const userData = await verifyAndGetUserData(db, token);

  if (!(await platformAuthority(db, userData.email, 10))) throw new Error('You do not have the required authority to create projects.');

  await q.createProject(db, name, userData.email);
  // Auto-assign AVAIL group with auth 10 (matches reference behavior)
  await q.assignGroupToProject(db, PLATFORM_GROUP, name, 10, userData.email);
  return { message: `Project ${name} was created.` };
}

/** POST /project/delete — delete project (platform admin: AVAIL member, or avail_auth level 10) */
async function deleteProject(db, { token, name }) {
  const userData = await verifyAndGetUserData(db, token);

  if (!(await platformAuthority(db, userData.email, 10))) throw new Error('You do not have the required authority to delete projects.');

  await q.deleteProject(db, name);
  return { message: `Project ${name} was deleted.` };
}

module.exports = {
  getProjects,
  createProject,
  deleteProject,
};
