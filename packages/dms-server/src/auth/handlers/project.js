/**
 * Project management handlers.
 * Each function takes (db, body) where body is req.body from Express.
 */

const { verifyAndGetUserData } = require('./auth');
const q = require('../utils/queries');
const { isPlatformAdmin, platformAuthority, PLATFORM_GROUP } = require('../utils/permissions');

/**
 * POST /projects — list projects: a platform admin (AVAIL member, owner 2026-11-03: membership only) sees
 * all; anyone else sees the projects they belong to (the `avail_auth` level used to gate that).
 */
async function getProjects(db, { token }) {
  const userData = await verifyAndGetUserData(db, token);

  if (await isPlatformAdmin(db, userData.email)) {
    const { rows } = await q.getProjects(db);
    return rows;
  }

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

/** POST /project/create — create project (platform admin: AVAIL member) */
async function createProject(db, { token, name }) {
  const userData = await verifyAndGetUserData(db, token);

  if (!(await platformAuthority(db, userData.email, 10))) throw new Error('You do not have the required authority to create projects.');

  await q.createProject(db, name, userData.email);
  // Auto-assign AVAIL group with auth 10 (matches reference behavior)
  await q.assignGroupToProject(db, PLATFORM_GROUP, name, 10, userData.email);
  return { message: `Project ${name} was created.` };
}

/** POST /project/delete — delete project (platform admin: AVAIL member) */
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
