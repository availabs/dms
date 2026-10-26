/**
 * Platform-admin operations by `AVAIL` membership (planning/tasks/current/permissions-auth-platform-admin.md):
 * projects, /password/force, /create/user, fake users, groups in no project, message-all go by membership in
 * `AVAIL` (by name, no level), or by today's `avail_auth` level (transition). Messages to a group or a project
 * go by `auth-users` / `auth-groups` on the project's auth row, or by level.
 * Real SQLite auth database (temp file); the DMS pattern rows are injected.
 *
 * Run: node tests/test-auth-platform.js
 */
const assert = require('assert');
const { join } = require('path');
const { readFileSync, mkdtempSync, rmSync } = require('fs');
const os = require('os');
const { SqliteAdapter } = require('../src/db/adapters/sqlite');
const { createAuthGrants, isPlatformAdmin } = require('../src/auth/utils/permissions');
const { hashPassword, createUserToken } = require('../src/auth/utils/crypto');
const q = require('../src/auth/utils/queries');
const projectH = require('../src/auth/handlers/project');
const authH = require('../src/auth/handlers/auth');
const userH = require('../src/auth/handlers/user');
const groupH = require('../src/auth/handlers/group');
const messageH = require('../src/auth/handlers/message');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`); }
};
const refused = async (p, re = /authority/) => {
  let err;
  try { await p; } catch (e) { err = e; }
  assert.ok(err, 'expected a refusal');
  assert.ok(re.test(err.message), err.message);
};

const ROWS = {
  siteA: [{ id: 10, data: { pattern_type: 'auth', authPermissions: { groups: { UserMgrs: ['auth-users'], GroupMgrs: ['auth-groups'], public: [] }, users: {} } } }],
};
const A = { app: 'siteA', authPatternId: 10 };
const ctx = { subdomain: '', authGrants: createAuthGrants({ loadPatternRows: async (app) => ROWS[app] || [] }) };

// group → [project, level][]. AVAIL is seeded by the schema (avail_auth, level 10); setup unlinks it so
// membership is tested on its own, and `Old Platform` keeps the level path.
const GROUPS = {
  'siteA Admin': [['siteA', 10]], UserMgrs: [['siteA', 0]], GroupMgrs: [['siteA', 0]], Viewers: [['siteA', 1]],
  Editors: [['siteA', 5]], BGroup: [['siteB', 0]], C0: [['siteC', 0]],
  'Old Platform': [['avail_auth', 10]], 'Platform Ops': [['avail_auth', 5]], Loose: [],
};
const USERS = {
  'plat@t': ['AVAIL'], 'old10@t': ['Old Platform'], 'ops5@t': ['Platform Ops'], 'siteadmin@t': ['siteA Admin'],
  'umgr@t': ['UserMgrs'], 'gmgr@t': ['GroupMgrs'], 'viewer@t': ['Viewers'], 'c0@t': ['C0'], 'target@t': ['Viewers'],
};
let db, tmp;
const tok = {};

async function setup() {
  tmp = mkdtempSync(join(os.tmpdir(), 'auth-platform-'));
  db = new SqliteAdapter({ filename: join(tmp, 'auth.sqlite') });
  const sql = readFileSync(join(__dirname, '../src/db/sql/auth/auth_tables.sqlite.sql'), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  for (const stmt of sql.split(';').filter(s => s.trim())) await db.query(stmt + ';');
  await db.query("DELETE FROM groups_in_projects WHERE group_name = 'AVAIL'");
  for (const p of ['siteA', 'siteB', 'siteC']) await q.createProject(db, p, 'test');
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

const groupLinks = async (g) => (await db.query('SELECT project_name FROM groups_in_projects WHERE group_name = $1', [g])).rows.map(r => r.project_name);
const inbox = async (email) => (await db.query('SELECT heading FROM messages_new WHERE sent_to = $1', [email])).rows.map(r => r.heading);

async function main() {
  await setup();

  console.log('isPlatformAdmin:');
  await t('AVAIL membership, by name, with no project link or level', async () => {
    assert.strictEqual(await q.getUserAuthLevel(db, 'plat@t', 'avail_auth'), 0);
    assert.strictEqual(await isPlatformAdmin(db, 'plat@t'), true);
    assert.strictEqual(await isPlatformAdmin(db, 'PLAT@t'), true, 'email case');
    assert.strictEqual(await isPlatformAdmin(db, 'old10@t'), false);
    assert.strictEqual(await isPlatformAdmin(db, 'siteadmin@t'), false);
  });

  console.log('projects:');
  await t('/projects: an AVAIL member sees every project; avail_auth 10 too; a site admin is refused', async () => {
    const names = (await projectH.getProjects(db, { token: tok['plat@t'] })).map(p => p.name);
    for (const p of ['avail_auth', 'siteA', 'siteB', 'siteC']) assert.ok(names.includes(p), p);
    assert.ok((await projectH.getProjects(db, { token: tok['old10@t'] })).length >= 4);
    await refused(projectH.getProjects(db, { token: tok['siteadmin@t'] }));
  });
  await t('/project/create and /project/delete: AVAIL member or avail_auth 10; not 5, not a site admin', async () => {
    await projectH.createProject(db, { token: tok['plat@t'], name: 'newA' });
    assert.deepStrictEqual(await groupLinks('AVAIL'), ['newA'], 'AVAIL linked to the new project');
    await projectH.createProject(db, { token: tok['old10@t'], name: 'newB' });
    await refused(projectH.createProject(db, { token: tok['ops5@t'], name: 'newC' }));
    await refused(projectH.createProject(db, { token: tok['siteadmin@t'], name: 'newC' }));
    await refused(projectH.deleteProject(db, { token: tok['siteadmin@t'], name: 'newA' }));
    await projectH.deleteProject(db, { token: tok['plat@t'], name: 'newA' });
    await projectH.deleteProject(db, { token: tok['old10@t'], name: 'newB' });
  });

  console.log('users:');
  await t('/password/force: AVAIL member yes; a site admin no', async () => {
    await refused(authH.passwordForce(db, { token: tok['siteadmin@t'], userEmail: 'target@t', password: 'x1' }));
    const r = await authH.passwordForce(db, { token: tok['plat@t'], userEmail: 'target@t', password: 'x2' });
    assert.ok(/successfully/.test(r.message));
  });
  await t('/create/user: AVAIL member, into an existing group of the named project', async () => {
    await refused(authH.createUser(db, { token: tok['siteadmin@t'], email: 'n1@t', password: 'p', project: 'siteA', group: 'Viewers' }));
    await refused(authH.createUser(db, { token: tok['plat@t'], email: 'n1@t', password: 'p', project: 'siteA', group: 'Nope' }), /does not exist/);
    await refused(authH.createUser(db, { token: tok['plat@t'], email: 'n1@t', password: 'p', project: 'siteA', group: 'BGroup' }), /not in project siteA/);
    await authH.createUser(db, { token: tok['plat@t'], email: 'n1@t', password: 'p', project: 'siteA', group: 'Viewers' });
    assert.deepStrictEqual((await q.getUserGroups(db, 'n1@t', 'siteA')).rows.map(r => r.name), ['Viewers']);
  });
  await t('/user/create/fake: AVAIL member yes; avail_auth 5 no', async () => {
    await refused(userH.createFake(db, { token: tok['ops5@t'] }));
    await userH.createFake(db, { token: tok['plat@t'] });
    const { rows } = await db.query("SELECT count(1) AS c FROM users WHERE email LIKE 'fake.user.%'");
    assert.strictEqual(+rows[0].c, 1);
  });

  console.log('groups in no project:');
  await t('/group/create: AVAIL member or avail_auth 5; a site admin no', async () => {
    await groupH.createGroup(db, { token: tok['plat@t'], name: 'G1' });
    await groupH.createGroup(db, { token: tok['ops5@t'], name: 'G2' });
    await refused(groupH.createGroup(db, { token: tok['siteadmin@t'], name: 'G3' }));
  });
  await t('/group/meta/update: AVAIL member for any group; auth-groups only for its site\'s groups', async () => {
    await groupH.updateGroup(db, { token: tok['plat@t'], group_name: 'BGroup', meta: { d: 1 } }, ctx);
    await refused(groupH.updateGroup(db, { token: tok['gmgr@t'], group_name: 'BGroup', meta: { d: 2 }, ...A }, ctx));
    await groupH.updateGroup(db, { token: tok['gmgr@t'], group_name: 'Viewers', meta: { d: 3 }, ...A }, ctx);
  });
  await t('/group/delete of a group in no project: AVAIL member yes; a site admin no', async () => {
    await refused(groupH.deleteGroup(db, { token: tok['siteadmin@t'], name: 'Loose' }, ctx));
    await groupH.deleteGroup(db, { token: tok['plat@t'], name: 'Loose' }, ctx);
    const { rows } = await db.query("SELECT count(1) AS c FROM groups WHERE name = 'Loose'");
    assert.strictEqual(+rows[0].c, 0);
  });

  console.log('messages:');
  const post = (email, body) => messageH.postMessage(db, { token: tok[email], heading: body.heading, message: 'm', ...body }, ctx);
  await t('to a group: auth-users on the project\'s auth row, for a group it may manage (not a protected one)', async () => {
    await post('umgr@t', { type: 'group', target: 'Viewers', project: 'siteA', heading: 'g1', ...A });
    assert.ok((await inbox('viewer@t')).includes('g1'));
    await refused(post('umgr@t', { type: 'group', target: 'siteA Admin', project: 'siteA', heading: 'g2', ...A }));
    await refused(post('umgr@t', { type: 'group', target: 'Viewers', project: 'siteA', heading: 'g3' }), /authority/); // no auth row named
  });
  await t('to a group: the level rule still applies (transition)', async () => {
    await post('viewer@t', { type: 'group', target: 'Viewers', project: 'siteA', heading: 'g4' });
    await refused(post('viewer@t', { type: 'group', target: 'Editors', project: 'siteA', heading: 'g5' }));
  });
  await t('to a project: auth-users on its auth row, or the highest level in it', async () => {
    await post('umgr@t', { type: 'project', project: 'siteA', heading: 'p1', ...A });
    assert.ok((await inbox('target@t')).includes('p1'));
    await refused(post('gmgr@t', { type: 'project', project: 'siteA', heading: 'p2', ...A }));
    await refused(post('viewer@t', { type: 'project', project: 'siteA', heading: 'p3' }));
  });
  await t('to a project whose groups are all level 0: found (was "not found")', async () => {
    await post('c0@t', { type: 'project', project: 'siteC', heading: 'p4' });
  });
  await t('to all: AVAIL members only', async () => {
    await refused(post('old10@t', { type: 'all', heading: 'a1' }));
    await post('plat@t', { type: 'all', heading: 'a2' });
    assert.ok((await inbox('siteadmin@t')).includes('a2'));
  });

  rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
