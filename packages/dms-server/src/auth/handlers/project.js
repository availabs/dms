/**
 * Project management handlers.
 * Each function takes (db, body) where body is req.body from Express.
 */

const { verifyAndGetUserData } = require('./auth');
const q = require('../utils/queries');

/** POST /projects — list projects (auth 10 sees all, auth ≥ 1 sees own) */
async function getProjects(db, { token }) {
  const userData = await verifyAndGetUserData(db, token);
  const authLevel = await q.getUserAuthLevel(db, userData.email, 'avail_auth');

  if (authLevel >= 10) {
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

/** POST /project/create — create project (avail_auth auth 10 only) */
async function createProject(db, { token, name }) {
  const userData = await verifyAndGetUserData(db, token);
  const authLevel = await q.getUserAuthLevel(db, userData.email, 'avail_auth');

  if (authLevel < 10) throw new Error('You do not have the required authority to create projects.');

  await q.createProject(db, name, userData.email);
  // Auto-assign AVAIL group with auth 10 (matches reference behavior)
  await q.assignGroupToProject(db, 'AVAIL', name, 10, userData.email);
  return { message: `Project ${name} was created.` };
}

/** POST /project/delete — delete project (avail_auth auth 10 only) */
async function deleteProject(db, { token, name }) {
  const userData = await verifyAndGetUserData(db, token);
  const authLevel = await q.getUserAuthLevel(db, userData.email, 'avail_auth');

  if (authLevel < 10) throw new Error('You do not have the required authority to delete projects.');

  await q.deleteProject(db, name);
  return { message: `Project ${name} was deleted.` };
}

module.exports = {
  getProjects,
  createProject,
  deleteProject,
};
