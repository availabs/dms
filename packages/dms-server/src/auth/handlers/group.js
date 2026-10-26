/**
 * Group management handlers.
 * Each function takes (db, body) where body is req.body from Express.
 */

const { verifyAndGetUserData } = require('./auth');
const q = require('../utils/queries');
const {
  AUTH_GROUPS, AUTH_USERS, authority, can, canManageGroup, canManageGroupIn, groupProjects, levelCoversGroup,
} = require('../utils/permissions');

// Task permissions-auth-groups: each check in transition form, `auth-groups` on the auth row the
// request names (permissions.js authority) or today's level rule. While the level fallback exists a
// group's level still grants access, so the permission path never sets one (new and linked groups get
// level 0, and /group/project/adjust is level-only).
const groupsAuthority = (db, userData, body, ctx, minLevel, perm = AUTH_GROUPS) =>
  authority(db, userData, body, ctx, { perm, minLevel });

/** Whether `a` (an authority() result) holds `perm` itself, as a member of the project. */
const holds = (a, perm) => a.user.groups.length > 0 && can(a.user, perm, a.scope);

/**
 * A group leaving a site (owner 2026-10-25): its grants on the site's rows are stripped (through the
 * DMS controller, each row keeping its format; malformed ones reported in `skippedGrants`), then it is
 * unlinked from the project, and with `deleteIfLast` deleted with its memberships once no project uses
 * it. Grants first: two databases, and a retry after a partial failure finds the group still linked.
 * External-source grants (`pgEnvs`, the site's DAMA envs) are listed, not changed. `dryRun`: the plan.
 */
async function groupLeavesSite(db, ctx, { app, groupName, actor, deleteIfLast = false, dryRun = false, pgEnvs = [] }) {
  const projects = await groupProjects(db, groupName);
  if (!projects.includes(app)) throw new Error(`Group "${groupName}" is not in project "${app}".`);
  if (!ctx.siteGrants) throw new Error('Site grants are unavailable.');
  const who = { groups: groupName };
  const { rows: [members] } = await db.query(
    'SELECT count(1) AS count FROM users_in_groups WHERE group_name = $1', [groupName]);
  const otherProjects = projects.filter(p => p !== app);
  const { grants, skipped } = await ctx.siteGrants.listSiteGrants(app, who);
  const plan = {
    group_name: groupName, project: app, otherProjects, members: +(members?.count || 0),
    deletes: deleteIfLast && otherProjects.length === 0,
    siteGrants: grants.map(({ id, type }) => ({ id, type })), skippedGrants: skipped,
    externalSources: await ctx.siteGrants.listExternalGrants(pgEnvs, who),
  };
  if (dryRun) return plan;

  plan.skippedGrants = (await ctx.siteGrants.stripSiteGrants(app, who, actor)).skipped;
  await db.withTransaction(async (tx) => {
    await q.removeGroupFromProject(tx, groupName, app);
    if (plan.deletes) {
      await tx.query('DELETE FROM users_in_groups WHERE group_name = $1', [groupName]);
      await tx.query('DELETE FROM groups WHERE name = $1', [groupName]);
    }
  });
  return {
    ...plan,
    message: plan.deletes ? `Group ${groupName} was deleted.` : `Group "${groupName}" was removed from project "${app}".`,
  };
}

/** POST /groups — list groups visible to authenticated user (filtered by authority) */
async function getGroups(db, body, ctx) {
  const userData = await verifyAndGetUserData(db, body.token);
  // auth-groups / auth-users on the named auth row: that project's groups, besides the level-visible ones
  const a = await groupsAuthority(db, userData, body, ctx, Infinity, [AUTH_GROUPS, AUTH_USERS]);

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
    }) || (a.byPermission && gipRows.some(({ project_name }) => project_name === a.project));
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

/**
 * POST /groups/byproject — groups in a specific project. `auth-groups` or `auth-users` (the Users page's
 * membership picker needs the list) sees them all; otherwise the level rule hides groups above the
 * caller. Each group carries `manageable`: whether the caller may change it (auth-groups + the
 * protected-group rule, or the level rule).
 */
async function groupsForProject(db, body, ctx) {
  const { token, project } = body;
  const userData = await verifyAndGetUserData(db, token);
  const a = await groupsAuthority(db, userData, body, ctx, Infinity, [AUTH_GROUPS, AUTH_USERS]);
  const myAuthLevel = a.authLevel;
  const managesGroups = holds(a, AUTH_GROUPS);

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
    if (!a.byPermission && group.auth_level > myAuthLevel) continue;

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
      manageable: (managesGroups && await canManageGroupIn(db, a.user, group.name, a.scope))
        || (myAuthLevel >= 5 && await levelCoversGroup(db, userData.email, group.name)),
    });
  }

  return { groups: [{ name: 'public' }, ...visible] };
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
async function createAndAssign(db, body, ctx) {
  const { token, group_name, meta, project_name, auth_level } = body;
  const userData = await verifyAndGetUserData(db, token);
  const a = await groupsAuthority(db, userData, { ...body, project: project_name }, ctx, 5);

  // auth-groups: a new group at level 0; it gets access through the site's Access editor
  if (a.byPermission) {
    await db.withTransaction(async (tx) => {
      await q.createGroup(tx, group_name, meta, userData.email);
      await q.assignGroupToProject(tx, group_name, project_name, 0, userData.email);
    });
    return { message: `Group ${group_name} was successfully created and added to project ${project_name}.` };
  }

  const myAuthLevel = a.authLevel;
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

/**
 * POST /group/delete — a site deletes a group (owner 2026-10-25): unlink it from the calling project,
 * and delete it once no project uses it (groupLeavesSite). `auth-groups` + the group manageable from
 * this site; or the level rule, which unlinks it from every project where the caller is ≥ 5 and ≥ its
 * level there. An error when nothing was removed (it used to report success).
 */
async function deleteGroup(db, body, ctx = {}) {
  const { token, name, dryRun = false, pgEnvs = [] } = body;
  const userData = await verifyAndGetUserData(db, token);
  const actor = { id: userData.id, email: userData.email };
  const a = await groupsAuthority(db, userData, body, ctx, Infinity);

  if (a.byPermission && await canManageGroupIn(db, a.user, name, a.scope)) {
    return groupLeavesSite(db, ctx, { app: a.project, groupName: name, actor, deleteIfLast: true, dryRun, pgEnvs });
  }

  // A group no project uses belongs to no site: platform only (as /group/create; AVAIL membership in
  // task permissions-auth-platform-admin). It used to be deletable by anyone signed in.
  if (!(await groupProjects(db, name)).length) {
    const { rows: [g] } = await db.query('SELECT count(1) AS count FROM groups WHERE name = $1', [name]);
    if (!+(g?.count || 0)) throw new Error(`Group "${name}" does not exist.`);
    if (await q.getUserAuthLevel(db, userData.email, 'avail_auth') < 5) {
      throw new Error(`You do not have the authority to delete group ${name}: it is in no project (platform only).`);
    }
    if (dryRun) return { group_name: name, projects: [], deletes: true };
    await db.withTransaction(async (tx) => {
      await tx.query('DELETE FROM users_in_groups WHERE group_name = $1', [name]);
      await tx.query('DELETE FROM groups WHERE name = $1', [name]);
    });
    return { group_name: name, deletes: true, message: `Group ${name} was deleted.` };
  }

  // Level rule: projects where the caller is ≥ 5 and ≥ the group's level
  const { rows: removable } = await db.query(
    `SELECT gip.project_name FROM groups_in_projects AS gip
     WHERE gip.group_name = $1 AND gip.auth_level <= (
       SELECT MAX(mine.auth_level) FROM users_in_groups AS uig
       INNER JOIN groups_in_projects AS mine ON uig.group_name = mine.group_name
       WHERE uig.user_email = $2 AND mine.project_name = gip.project_name AND mine.auth_level >= 5
     )`,
    [name, userData.email]
  );
  if (!removable.length) throw new Error(`You do not have the authority to delete group ${name}.`);
  if (dryRun) return { group_name: name, projects: removable.map(r => r.project_name) };
  let result;
  for (const { project_name } of removable) {
    result = await groupLeavesSite(db, ctx, { app: project_name, groupName: name, actor, deleteIfLast: true, pgEnvs });
  }
  return result.deletes ? result : { ...result, message: `Group "${name}" was removed from all projects for which you have authority.` };
}

/** POST /group/project/assign — assign group to project */
async function assignToProject(db, body, ctx) {
  const { token, group_name, project_name, auth_level } = body;
  const userData = await verifyAndGetUserData(db, token);
  const a = await groupsAuthority(db, userData, { ...body, project: project_name }, ctx, 5);

  // auth-groups links an existing group (another project's, say: "Add external group") at level 0:
  // only this site's grants count for it, and they're set in its Access editor. The protected-group
  // rule applies to what this site already grants that name.
  if (a.byPermission) {
    const { rows: [exists] } = await db.query('SELECT count(1) AS count FROM groups WHERE name = $1', [group_name]);
    if (!+(exists?.count || 0)) throw new Error(`Group "${group_name}" does not exist.`);
    if (!canManageGroup(a.user, group_name, a.scope)) {
      throw new Error(`You do not have the authority to add group "${group_name}" to project "${project_name}".`);
    }
    await q.assignGroupToProject(db, group_name, project_name, 0, userData.email);
    return { message: `Group "${group_name}" was assigned to project "${project_name}".` };
  }

  const myAuthLevel = a.authLevel;

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
async function removeFromProject(db, body, ctx = {}) {
  const { token, group_name, project_name, dryRun = false, pgEnvs = [] } = body;
  const userData = await verifyAndGetUserData(db, token);
  const actor = { id: userData.id, email: userData.email };
  const a = await groupsAuthority(db, userData, { ...body, project: project_name }, ctx, 5);

  if (a.byPermission && await canManageGroupIn(db, a.user, group_name, a.scope)) {
    return groupLeavesSite(db, ctx, { app: project_name, groupName: group_name, actor, dryRun, pgEnvs });
  }

  const myAuthLevel = a.authLevel;

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

  return groupLeavesSite(db, ctx, { app: project_name, groupName: group_name, actor, dryRun, pgEnvs });
}

/** POST /group/project/adjust — adjust group's auth level in project */
async function adjustAuthLevel(db, { token, group_name, project_name, auth_level }) {
  const userData = await verifyAndGetUserData(db, token);
  const myAuthLevel = await q.getUserAuthLevel(db, userData.email, project_name);

  if (auth_level < 0 || auth_level > 10) {
    throw new Error('Authority Level must be in the range 0 to 10 inclusive.');
  }
  // Level-only (task permissions-auth-groups): a level grants access while the fallback exists. The
  // caller must also outrank the group's CURRENT level, or a level-5 user could demote an Admin group.
  const { rows: current } = await db.query(
    'SELECT auth_level FROM groups_in_projects WHERE group_name = $1 AND project_name = $2',
    [group_name, project_name]
  );
  if (!current.length) throw new Error(`Group "${group_name}" is not in project "${project_name}".`);
  if (myAuthLevel < 5 || myAuthLevel < auth_level || myAuthLevel < +current[0].auth_level) {
    throw new Error('You do not have the required authority level.');
  }

  await q.adjustAuthLevel(db, group_name, project_name, auth_level);
  return `Successfully adjusted group ${group_name} authority level for project ${project_name} to ${auth_level}.`;
}

/** POST /group/meta/update — update group metadata (auth ≥ 5 in avail_auth) */
async function updateGroup(db, body, ctx) {
  const { token, group_name, meta } = body;
  const userData = await verifyAndGetUserData(db, token);
  // auth-groups on the calling site, for a group of that site (only its grants count, owner); or the
  // platform level rule
  const a = await groupsAuthority(db, userData, body, ctx, Infinity);
  const bySite = a.byPermission && await canManageGroupIn(db, a.user, group_name, a.scope);
  const authLevel = bySite ? Infinity : await q.getUserAuthLevel(db, userData.email, 'avail_auth');

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
