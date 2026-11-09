/**
 * Group management handlers.
 * Each function takes (db, body) where body is req.body from Express.
 */

const { verifyAndGetUserData } = require('./auth');
const q = require('../utils/queries');
const {
  AUTH_GROUPS, AUTH_USERS, authority, can, canManageGroup, canManageGroupIn,
  groupProjects, platformAuthority,
} = require('../utils/permissions');

// Task permissions-auth-groups: each check in transition form, `auth-groups` on the auth row the
// request names (permissions.js authority) or today's level rule. While the level fallback exists a
// group's level still grants access, so the permission path never sets one (new and linked groups get
// level 0, and /group/project/adjust takes `*` on the auth row or the level rule). Every level rule follows
// DMS_AUTH_MODE (permissions.js levelsCount / levelRule): logged under log, never passes under enforce.
const groupsAuthority = (db, userData, body, ctx, minLevel, perm = AUTH_GROUPS) =>
  authority(db, userData, body, ctx, { perm, minLevel });

/** Whether `a` (an authority() result) holds `perm` itself, as a member of the project. */
const holds = (a, perm) => a.user.groups.length > 0 && can(a.user, perm, a.scope);

/**
 * A group leaving a site (owner 2026-10-25): its grants on the site's rows are stripped (through the
 * DMS controller, each row keeping its format; malformed ones reported in `skippedGrants`), then it is
 * unlinked from the project, and with `deleteIfLast` deleted with its memberships once no project uses
 * it. Grants first: two databases, and a retry after a partial failure finds the group still linked.
 *
 * Split in two (task destructive-call-plan-routes): `planGroupLeavesSite` only reads, and is all the
 * `/plan` routes reach; `applyGroupLeavesSite` writes. A destructive route never takes a preview flag.
 */
async function planGroupLeavesSite(db, ctx, { app, groupName, deleteIfLast = false }) {
  const projects = await groupProjects(db, groupName);
  if (!projects.includes(app)) throw new Error(`Group "${groupName}" is not in project "${app}".`);
  if (!ctx.siteGrants) throw new Error('Site grants are unavailable.');
  const who = { groups: groupName };
  const { rows: [members] } = await db.query(
    'SELECT count(1) AS count FROM users_in_groups WHERE group_name = $1', [groupName]);
  const otherProjects = projects.filter(p => p !== app);
  const { grants, skipped } = await ctx.siteGrants.listSiteGrants(app, who);
  return {
    group_name: groupName, project: app, otherProjects, members: +(members?.count || 0),
    deletes: deleteIfLast && otherProjects.length === 0,
    siteGrants: grants.map(({ id, type }) => ({ id, type })), skippedGrants: skipped,
  };
}

async function applyGroupLeavesSite(db, ctx, plan, actor) {
  const { group_name: groupName, project: app } = plan;
  const skippedGrants = (await ctx.siteGrants.stripSiteGrants(app, { groups: groupName }, actor)).skipped;
  await db.withTransaction(async (tx) => {
    await q.removeGroupFromProject(tx, groupName, app);
    if (plan.deletes) {
      await tx.query('DELETE FROM users_in_groups WHERE group_name = $1', [groupName]);
      await tx.query('DELETE FROM groups WHERE name = $1', [groupName]);
    }
  });
  return {
    ...plan, skippedGrants,
    message: plan.deletes ? `Group ${groupName} was deleted.` : `Group "${groupName}" was removed from project "${app}".`,
  };
}

async function groupLeavesSite(db, ctx, { actor, ...opts }) {
  return applyGroupLeavesSite(db, ctx, await planGroupLeavesSite(db, ctx, opts), actor);
}

/** POST /groups — list groups visible to authenticated user (filtered by authority) */
async function getGroups(db, body, ctx) {
  const userData = await verifyAndGetUserData(db, body.token);
  // auth-groups / auth-users on the named auth row: that project's groups, besides the level-visible ones
  const a = await groupsAuthority(db, userData, body, ctx, Infinity, [AUTH_GROUPS, AUTH_USERS]);

  // Get all groups with member count and project assignments
  const { rows: allGroups } = await db.query(
    `SELECT g.name, g.meta, g.created_at, g.created_by
     FROM groups AS g
     ORDER BY g.name`
  );

  const visible = [];
  for (const group of allGroups) {
    const { rows: gipRows } = await db.query(
      'SELECT project_name, group_name, auth_level FROM groups_in_projects WHERE group_name = $1',
      [group.name]
    );
    if (!(a.byPermission && gipRows.some(({ project_name }) => project_name === a.project))) continue;

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
  const managesGroups = holds(a, AUTH_GROUPS);
  const managesUsers = holds(a, AUTH_USERS);

  const { rows: groups } = await db.query(
    `SELECT g.name, g.meta, g.created_at, g.created_by, gip.auth_level
     FROM groups AS g
     INNER JOIN groups_in_projects AS gip ON g.name = gip.group_name
     WHERE gip.project_name = $1
     ORDER BY g.name`,
    [project]
  );

  const visible = [];
  for (const group of groups) {
    if (!a.byPermission) continue;

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
      manageable: managesGroups && await canManageGroupIn(db, a.user, group.name, a.scope),
      // whether the caller may add members to it or remove them (user handlers' checkGroupAuthority, the
      // rule of /user/group/assign and /remove): the Users page's group picker
      assignable: managesUsers && await canManageGroupIn(db, a.user, group.name, a.scope),
    });
  }

  return { groups: [{ name: 'public' }, ...visible] };
}

/**
 * POST /groups/linkable — groups that exist but aren't in the calling project, for "Add external group"
 * (owner 2026-10-26: a searchable list of every group). auth-groups on the project's auth row, or level
 * 5 there (the level rule of /group/project/assign). Names and member counts only: not which projects
 * use them.
 */
async function linkableGroups(db, body, ctx) {
  const userData = await verifyAndGetUserData(db, body.token);
  const a = await groupsAuthority(db, userData, body, ctx, 5);
  if (!a.byPermission) throw new Error(`You do not have the authority to add groups to ${a.project}.`);
  const { rows } = await db.query(
    `SELECT g.name, (SELECT count(1) FROM users_in_groups AS uig WHERE uig.group_name = g.name) AS num_members
     FROM groups AS g
     WHERE g.name NOT IN (SELECT group_name FROM groups_in_projects WHERE project_name = $1)
     ORDER BY g.name`,
    [a.project]
  );
  return { groups: rows.map(r => ({ name: r.name, num_members: +r.num_members })) };
}

/** POST /group/create — create a group in no project (platform admin: AVAIL member) */
async function createGroup(db, { token, name, meta }) {
  const userData = await verifyAndGetUserData(db, token);

  if (!(await platformAuthority(db, userData.email, 5))) throw new Error('You do not have the required authority level to create groups.');

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

  throw new Error(`You do not have the authority to create groups in project "${project_name}".`);
}

/**
 * Who may delete group `name`, and how (reads only): `site` — `auth-groups` + the group manageable from
 * this site; `orphan` — a group no project uses, platform only (as /group/create; it used to be
 * deletable by anyone signed in); `level` — the level rule, which unlinks it from every project where
 * the caller is ≥ 5 and ≥ its level there. Throws when none passes.
 */
async function resolveDeleteGroup(db, body, ctx) {
  const { token, name } = body;
  const userData = await verifyAndGetUserData(db, token);
  const actor = { id: userData.id, email: userData.email };
  const a = await groupsAuthority(db, userData, body, ctx, Infinity);

  if (a.byPermission && await canManageGroupIn(db, a.user, name, a.scope)) {
    return { how: 'site', actor, app: a.project };
  }
  if (!(await groupProjects(db, name)).length) {
    const { rows: [g] } = await db.query('SELECT count(1) AS count FROM groups WHERE name = $1', [name]);
    if (!+(g?.count || 0)) throw new Error(`Group "${name}" does not exist.`);
    if (!(await platformAuthority(db, userData.email, 5))) {
      throw new Error(`You do not have the authority to delete group ${name}: it is in no project (platform only).`);
    }
    return { how: 'orphan', actor };
  }
  throw new Error(`You do not have the authority to delete group ${name}.`);
}

/** POST /group/delete/plan — what /group/delete would do, for the confirm dialog. Never writes. */
async function planDeleteGroup(db, body, ctx = {}) {
  const { name } = body;
  const r = await resolveDeleteGroup(db, body, ctx);
  if (r.how === 'site') return planGroupLeavesSite(db, ctx, { app: r.app, groupName: name, deleteIfLast: true });
  return { group_name: name, projects: [], deletes: true };
}

/**
 * POST /group/delete — a site deletes a group (owner 2026-10-25): unlink it from the calling project,
 * and delete it once no project uses it (groupLeavesSite); see resolveDeleteGroup for who may. An error
 * when nothing was removed (it used to report success). Its preview is /group/delete/plan.
 */
async function deleteGroup(db, body, ctx = {}) {
  const { name } = body;
  const r = await resolveDeleteGroup(db, body, ctx);
  if (r.how === 'site') {
    return groupLeavesSite(db, ctx, { app: r.app, groupName: name, actor: r.actor, deleteIfLast: true });
  }
  if (r.how === 'orphan') {
    await db.withTransaction(async (tx) => {
      await tx.query('DELETE FROM users_in_groups WHERE group_name = $1', [name]);
      await tx.query('DELETE FROM groups WHERE name = $1', [name]);
    });
    return { group_name: name, deletes: true, message: `Group ${name} was deleted.` };
  }
  let result;
  for (const project_name of r.projects) {
    result = await groupLeavesSite(db, ctx, { app: project_name, groupName: name, actor: r.actor, deleteIfLast: true });
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

  throw new Error(`You do not have the authority to assign group "${group_name}" to project "${project_name}".`);
}

/**
 * Whether the caller may remove `group_name` from `project_name` (reads only): `auth-groups` + the
 * group manageable from this site, or the level rule (≥ 5 and ≥ the group's level there).
 */
async function authorizeRemoveFromProject(db, body, ctx) {
  const { token, group_name, project_name } = body;
  const userData = await verifyAndGetUserData(db, token);
  const actor = { id: userData.id, email: userData.email };
  const a = await groupsAuthority(db, userData, { ...body, project: project_name }, ctx, 5);
  if (a.byPermission && await canManageGroupIn(db, a.user, group_name, a.scope)) return actor;

  const { rows } = await db.query(
    'SELECT 1 FROM groups_in_projects WHERE group_name = $1 AND project_name = $2',
    [group_name, project_name]
  );
  if (!rows.length) throw new Error(`Group "${group_name}" is not in project "${project_name}".`);
  throw new Error(`You do not have the authority to remove group "${group_name}" from project "${project_name}".`);
}

/** POST /group/project/remove/plan — what /group/project/remove would do. Never writes. */
async function planRemoveFromProject(db, body, ctx = {}) {
  const { group_name, project_name } = body;
  await authorizeRemoveFromProject(db, body, ctx);
  return planGroupLeavesSite(db, ctx, { app: project_name, groupName: group_name });
}

/** POST /group/project/remove — remove group from project. Its preview is /group/project/remove/plan. */
async function removeFromProject(db, body, ctx = {}) {
  const { group_name, project_name } = body;
  const actor = await authorizeRemoveFromProject(db, body, ctx);
  return groupLeavesSite(db, ctx, { app: project_name, groupName: group_name, actor });
}

/** POST /group/project/adjust — adjust group's auth level in project */
async function adjustAuthLevel(db, body, ctx) {
  const { token, group_name, project_name, auth_level } = body;
  const userData = await verifyAndGetUserData(db, token);

  if (auth_level < 0 || auth_level > 10) {
    throw new Error('Authority Level must be in the range 0 to 10 inclusive.');
  }
  // `*` on the site's auth row (or `${app} Admin`). Levels stay in the auth DB (older servers read them),
  // so they remain settable.
  const a = await authority(db, userData, { ...body, project: project_name }, ctx, { perm: '*' });
  const { rows: current } = await db.query(
    'SELECT auth_level FROM groups_in_projects WHERE group_name = $1 AND project_name = $2',
    [group_name, project_name]
  );
  if (!current.length) throw new Error(`Group "${group_name}" is not in project "${project_name}".`);
  if (!a.byPermission) throw new Error('You do not have the authority to adjust group levels in this project.');

  await q.adjustAuthLevel(db, group_name, project_name, auth_level);
  return `Successfully adjusted group ${group_name} authority level for project ${project_name} to ${auth_level}.`;
}

/** POST /group/meta/update — update group metadata (auth-groups for a site's group; else platform admin) */
async function updateGroup(db, body, ctx) {
  const { token, group_name, meta } = body;
  const userData = await verifyAndGetUserData(db, token);
  // auth-groups on the calling site, for a group of that site (only its grants count, owner); or a
  // platform admin (AVAIL member)
  const a = await groupsAuthority(db, userData, body, ctx, Infinity);
  const bySite = a.byPermission && await canManageGroupIn(db, a.user, group_name, a.scope);

  if (!bySite && !(await platformAuthority(db, userData.email, 5))) throw new Error('You do not have the required authority level to edit groups.');

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
  linkableGroups,
  createGroup,
  createAndAssign,
  deleteGroup,
  planDeleteGroup,
  assignToProject,
  removeFromProject,
  planRemoveFromProject,
  adjustAuthLevel,
  updateGroup,
};
