/**
 * Groups and project membership by permission (planning/tasks/current/permissions-auth-groups.md): each
 * handler passes by `auth-groups` on the calling site's auth row, by level (transition), or not at all;
 * the permission path never sets a level; a group leaving a site loses its grants there first, and is
 * deleted only once no project uses it; /group/project/adjust can't demote a group above the caller.
 * Real SQLite auth database (temp file); the DMS pattern rows and the site-grant strips are injected.
 *
 * Run: node tests/test-auth-groups.js
 */
const assert = require('assert');
const { join } = require('path');
const { readFileSync, mkdtempSync, rmSync } = require('fs');
const os = require('os');
const { SqliteAdapter } = require('../src/db/adapters/sqlite');
const { createAuthGrants } = require('../src/auth/utils/permissions');
const { hashPassword, createUserToken } = require('../src/auth/utils/crypto');
const q = require('../src/auth/utils/queries');
const groupH = require('../src/auth/handlers/group');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`); }
};
const refused = async (p, re = /authority|not in project|does not exist/) => {
  let err;
  try { await p; } catch (e) { err = e; }
  assert.ok(err, 'expected a refusal');
  assert.ok(re.test(err.message), err.message);
};

const ap = (groups = {}, users = {}) => ({ groups, users });
const ROWS = {
  siteA: [
    { id: 10, data: { pattern_type: 'auth', authPermissions: ap({
      GroupMgrs: ['auth-groups'], UserMgrs: ['auth-users'], Owners: ['*'], Ghost: ['*'], public: [] }) } },
    { id: 11, data: { pattern_type: 'admin', authPermissions: ap({ Keepers: ['edit-pattern-permissions'] }) } },
  ],
};
const A = { app: 'siteA', authPatternId: 10 };

// Site grants faked: records each strip with the group's projects at that moment (grants go first).
let db, tmp;
const strips = [];
const siteGrants = {
  listSiteGrants: async (app, who) => ({ grants: [{ id: 100, type: 'docs|page' }], skipped: [] }),
  listExternalGrants: async (pgEnvs) => (pgEnvs || []).map(pgEnv => ({ pgEnv, source_id: 5, name: 'ext' })),
  stripSiteGrants: async (app, who) => {
    const { rows } = await db.query('SELECT project_name FROM groups_in_projects WHERE group_name = $1', [who.groups]);
    strips.push({ app, group: who.groups, linkedAtStrip: rows.map(r => r.project_name) });
    return { written: [{ id: 100 }], skipped: [] };
  },
};
const ctx = { subdomain: '', authGrants: createAuthGrants({ loadPatternRows: async (app) => ROWS[app] || [] }), siteGrants };

// group → [project, level][]
const GROUPS = {
  'siteA Admin': [['siteA', 10]], 'siteA Public': [['siteA', 0]], GroupMgrs: [['siteA', 0]], UserMgrs: [['siteA', 0]],
  Viewers: [['siteA', 1]], Owners: [['siteA', 0]], Keepers: [['siteA', 0]], Editors: [['siteA', 5]],
  Shared: [['siteA', 0], ['siteB', 0]], Temp: [['siteA', 0]], Temp2: [['siteA', 0]], L0: [['siteA', 0]],
  'siteB Admin': [['siteB', 10]], BGroup: [['siteB', 0]], Ghost: [['siteB', 0]], Orphan: [],
  'Platform Ops': [['avail_auth', 5]],
};
const USERS = {
  'gmgr@t': ['GroupMgrs'], 'umgr@t': ['UserMgrs'], 'admin@t': ['siteA Admin'], 'viewer@t': ['Viewers'],
  'lvl5@t': ['Editors'], 'temp@t': ['Temp'], 'outsider@t': ['siteB Admin'], 'ops@t': ['Platform Ops'],
};
const tok = {};

async function setup() {
  tmp = mkdtempSync(join(os.tmpdir(), 'auth-groups-'));
  db = new SqliteAdapter({ filename: join(tmp, 'auth.sqlite') });
  const sql = readFileSync(join(__dirname, '../src/db/sql/auth/auth_tables.sqlite.sql'), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  for (const stmt of sql.split(';').filter(s => s.trim())) await db.query(stmt + ';');
  for (const p of ['siteA', 'siteB']) await q.createProject(db, p, 'test'); // avail_auth: seeded by the schema
  for (const [g, links] of Object.entries(GROUPS)) {
    await q.createGroup(db, g, null, 'test');
    for (const [p, lvl] of links) await q.assignGroupToProject(db, g, p, lvl, 'test');
  }
  const hash = hashPassword('pw');
  for (const [email, groups] of Object.entries(USERS)) {
    await q.createUser(db, email, hash);
    for (const g of groups) await q.assignUserToGroup(db, email, g, 'test');
    tok[email] = await createUserToken(email, hash, 'siteA');
  }
}

const links = async (g) =>
  Object.fromEntries((await db.query('SELECT project_name, auth_level FROM groups_in_projects WHERE group_name = $1', [g]))
    .rows.map(r => [r.project_name, +r.auth_level]));
const exists = async (g) => +((await db.query('SELECT count(1) AS c FROM groups WHERE name = $1', [g])).rows[0].c) > 0;

async function main() {
  await setup();

  console.log('/groups/byproject, /groups:');
  await t('auth-groups (level 0) sees every group of the project, with manageable flags', async () => {
    const { groups } = await groupH.groupsForProject(db, { token: tok['gmgr@t'], project: 'siteA', ...A }, ctx);
    const m = Object.fromEntries(groups.filter(g => g.name !== 'public').map(g => [g.name, g.manageable]));
    assert.strictEqual(m['siteA Admin'], false, 'siteA Admin is protected');
    assert.strictEqual(m.Owners, false, 'a * group is protected');
    assert.strictEqual(m.Keepers, false, 'edit-pattern-permissions on the admin row is protected');
    assert.strictEqual(m.GroupMgrs, false, 'an auth-groups group is protected');
    assert.strictEqual(m.Viewers, true);
    assert.strictEqual(m.Shared, true, 'shared: this site\'s grants decide');
    assert.ok(!('BGroup' in m), 'only this project\'s groups');
  });
  await t('auth-users sees the list too (the membership picker), but manages none', async () => {
    const { groups } = await groupH.groupsForProject(db, { token: tok['umgr@t'], project: 'siteA', ...A }, ctx);
    assert.ok(groups.some(g => g.name === 'siteA Admin'));
    assert.ok(groups.filter(g => g.name !== 'public').every(g => g.manageable === false));
    const as = Object.fromEntries(groups.map(g => [g.name, g.assignable]));
    assert.strictEqual(as.Viewers, true, 'auth-users may add members to an ordinary group');
    assert.strictEqual(as['siteA Admin'], false, 'not to a protected one');
    assert.strictEqual(as.Owners, false);
  });
  await t('assignable follows /user/group/assign: auth-groups alone may not add members', async () => {
    const { groups } = await groupH.groupsForProject(db, { token: tok['gmgr@t'], project: 'siteA', ...A }, ctx);
    assert.strictEqual(groups.find(g => g.name === 'Viewers').assignable, false);
  });
  await t('no permission: the level rule hides groups above the caller; nothing manageable below 5', async () => {
    const { groups } = await groupH.groupsForProject(db, { token: tok['viewer@t'], project: 'siteA', ...A }, ctx);
    assert.ok(!groups.some(g => g.name === 'siteA Admin' || g.name === 'Editors'));
    assert.ok(groups.filter(g => g.name !== 'public').every(g => g.manageable === false));
  });
  await t('/groups: auth-groups sees the project\'s groups (Admin included)', async () => {
    const all = await groupH.getGroups(db, { token: tok['gmgr@t'], ...A }, ctx);
    assert.ok(all.some(g => g.name === 'siteA Admin'));
    assert.ok(!all.some(g => g.name === 'BGroup'));
  });

  console.log('/group/create/project/assign:');
  await t('auth-groups creates at level 0 whatever level is asked', async () => {
    await groupH.createAndAssign(db, { token: tok['gmgr@t'], group_name: 'NewG', project_name: 'siteA', auth_level: 10, ...A }, ctx);
    assert.deepStrictEqual(await links('NewG'), { siteA: 0 });
  });
  await t('level rule unchanged: level 5 up to 5, not 10; level 1 refused', async () => {
    await groupH.createAndAssign(db, { token: tok['lvl5@t'], group_name: 'NewL', project_name: 'siteA', auth_level: 5 }, ctx);
    assert.deepStrictEqual(await links('NewL'), { siteA: 5 });
    await refused(groupH.createAndAssign(db, { token: tok['lvl5@t'], group_name: 'NewL2', project_name: 'siteA', auth_level: 10 }, ctx));
    await refused(groupH.createAndAssign(db, { token: tok['viewer@t'], group_name: 'NewV', project_name: 'siteA', auth_level: 0, ...A }, ctx));
  });

  console.log('/groups/linkable, /group/project/assign (link an existing group):');
  await t('/groups/linkable: every group not on the site, with member counts, for auth-groups or level 5', async () => {
    const { groups } = await groupH.linkableGroups(db, { token: tok['gmgr@t'], project: 'siteA', ...A }, ctx);
    const names = groups.map(g => g.name);
    for (const g of ['BGroup', 'Ghost', 'Orphan', 'siteB Admin']) assert.ok(names.includes(g), g);
    assert.ok(!names.includes('Viewers') && !names.includes('siteA Admin'), 'groups already on the site are left out');
    assert.deepStrictEqual(names, [...names].sort(), 'by name');
    assert.strictEqual(groups.find(g => g.name === 'siteB Admin').num_members, 1);
    assert.ok(!('projects' in groups[0]), 'which projects use a group is not shown');
    await groupH.linkableGroups(db, { token: tok['lvl5@t'], project: 'siteA' }, ctx);
    await refused(groupH.linkableGroups(db, { token: tok['viewer@t'], project: 'siteA', ...A }, ctx));
    await refused(groupH.linkableGroups(db, { token: tok['umgr@t'], project: 'siteA', ...A }, ctx));
  });
  await t('auth-groups links another project\'s group at level 0', async () => {
    await groupH.assignToProject(db, { token: tok['gmgr@t'], group_name: 'BGroup', project_name: 'siteA', auth_level: 10, ...A }, ctx);
    assert.deepStrictEqual(await links('BGroup'), { siteB: 0, siteA: 0 });
  });
  await t('refused: a missing group; a name this site already grants * (protected); no authority', async () => {
    await refused(groupH.assignToProject(db, { token: tok['gmgr@t'], group_name: 'Nope', project_name: 'siteA', auth_level: 0, ...A }, ctx));
    await refused(groupH.assignToProject(db, { token: tok['gmgr@t'], group_name: 'Ghost', project_name: 'siteA', auth_level: 0, ...A }, ctx));
    await refused(groupH.assignToProject(db, { token: tok['viewer@t'], group_name: 'Ghost', project_name: 'siteA', auth_level: 0, ...A }, ctx));
  });
  await t('siteA Admin links the protected name', async () => {
    await groupH.assignToProject(db, { token: tok['admin@t'], group_name: 'Ghost', project_name: 'siteA', auth_level: 0, ...A }, ctx);
    assert.ok('siteA' in await links('Ghost'));
  });

  console.log('/group/project/remove, /group/delete:');
  await t('remove from project: grants stripped first, then unlinked; the group stays', async () => {
    strips.length = 0;
    await groupH.removeFromProject(db, { token: tok['gmgr@t'], group_name: 'BGroup', project_name: 'siteA', ...A }, ctx);
    assert.deepStrictEqual(strips, [{ app: 'siteA', group: 'BGroup', linkedAtStrip: ['siteB', 'siteA'] }]);
    assert.deepStrictEqual(await links('BGroup'), { siteB: 0 });
  });
  await t('delete dry run: the plan, nothing changed', async () => {
    strips.length = 0;
    const plan = await groupH.deleteGroup(db, { token: tok['gmgr@t'], name: 'Shared', dryRun: true, pgEnvs: ['envA'], ...A }, ctx);
    assert.deepStrictEqual(plan.otherProjects, ['siteB']);
    assert.strictEqual(plan.deletes, false);
    assert.strictEqual(plan.externalSources.length, 1);
    assert.strictEqual(strips.length, 0);
    assert.deepStrictEqual(await links('Shared'), { siteA: 0, siteB: 0 });
  });
  await t('delete a shared group: unlinked from this site only, still exists', async () => {
    await groupH.deleteGroup(db, { token: tok['gmgr@t'], name: 'Shared', ...A }, ctx);
    assert.deepStrictEqual(await links('Shared'), { siteB: 0 });
    assert.ok(await exists('Shared'));
  });
  await t('delete a group only this site uses: unlinked, then deleted with its memberships', async () => {
    strips.length = 0;
    const r = await groupH.deleteGroup(db, { token: tok['gmgr@t'], name: 'Temp', ...A }, ctx);
    assert.strictEqual(r.deletes, true);
    assert.deepStrictEqual(strips.map(s => s.linkedAtStrip), [['siteA']], 'grants stripped while still linked');
    assert.ok(!(await exists('Temp')));
    assert.strictEqual((await db.query("SELECT count(1) AS c FROM users_in_groups WHERE group_name = 'Temp'")).rows[0].c, 0);
  });
  await t('refused: protected groups, no authority, another project\'s group, a group in no project', async () => {
    await refused(groupH.deleteGroup(db, { token: tok['gmgr@t'], name: 'siteA Admin', ...A }, ctx));
    await refused(groupH.deleteGroup(db, { token: tok['gmgr@t'], name: 'Owners', ...A }, ctx));
    await refused(groupH.deleteGroup(db, { token: tok['viewer@t'], name: 'Temp2', ...A }, ctx));
    await refused(groupH.deleteGroup(db, { token: tok['gmgr@t'], name: 'siteB Admin', ...A }, ctx));
    await refused(groupH.deleteGroup(db, { token: tok['viewer@t'], name: 'Orphan' }, ctx));
    assert.ok(await exists('Orphan'), 'it used to be deleted by anyone');
    await refused(groupH.removeFromProject(db, { token: tok['gmgr@t'], group_name: 'siteA Admin', project_name: 'siteA', ...A }, ctx));
  });
  await t('a group in no project: platform only (avail_auth ≥ 5)', async () => {
    await refused(groupH.deleteGroup(db, { token: tok['admin@t'], name: 'Orphan', ...A }, ctx), /platform only/);
    await groupH.deleteGroup(db, { token: tok['ops@t'], name: 'Orphan' }, ctx);
    assert.ok(!(await exists('Orphan')));
  });
  await t('level rule: level 5 deletes a level-0 group, grants stripped too', async () => {
    strips.length = 0;
    await groupH.deleteGroup(db, { token: tok['lvl5@t'], name: 'L0' }, ctx);
    assert.ok(!(await exists('L0')));
    assert.deepStrictEqual(strips.map(s => s.app), ['siteA']);
  });

  console.log('/group/project/adjust (level-only), /group/meta/update:');
  await t('adjust: a level-5 user can\'t demote a level-10 group (the hole); can move a lower one', async () => {
    await refused(groupH.adjustAuthLevel(db, { token: tok['lvl5@t'], group_name: 'siteA Admin', project_name: 'siteA', auth_level: 5 }, ctx), /authority level/);
    assert.deepStrictEqual(await links('siteA Admin'), { siteA: 10 });
    await groupH.adjustAuthLevel(db, { token: tok['lvl5@t'], group_name: 'Viewers', project_name: 'siteA', auth_level: 3 }, ctx);
    assert.deepStrictEqual(await links('Viewers'), { siteA: 3 });
  });
  await t('adjust has no permission path: auth-groups (level 0) refused', async () => {
    await refused(groupH.adjustAuthLevel(db, { token: tok['gmgr@t'], group_name: 'Viewers', project_name: 'siteA', auth_level: 0, ...A }, ctx), /authority level/);
  });
  await t('meta: auth-groups edits a manageable group of the site; not a protected one', async () => {
    const meta = await groupH.updateGroup(db, { token: tok['gmgr@t'], group_name: 'Viewers', meta: { description: 'v' }, ...A }, ctx);
    assert.strictEqual(meta.description, 'v');
    await refused(groupH.updateGroup(db, { token: tok['gmgr@t'], group_name: 'siteA Admin', meta: { x: 1 }, ...A }, ctx), /authority level/);
  });

  rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
