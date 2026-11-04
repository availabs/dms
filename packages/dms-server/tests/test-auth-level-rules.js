/**
 * The auth handlers' level rules follow DMS_AUTH_MODE (owner 2026-11-03): under `enforce` no level rule
 * lets anyone through, only grants decide; under `log` they still pass and each pass is recorded in the
 * access log ("allowed by auth level only"). Before this, levelCoversGroup / levelOutranks / "my level ≥
 * the group's" and the level SQL read the level directly and passed under `enforce` too.
 * Real SQLite auth database (temp file); the DMS pattern rows are injected; the access log stays in memory.
 *
 * Run: node tests/test-auth-level-rules.js
 */
const assert = require('assert');
const { join } = require('path');
const { readFileSync, mkdtempSync, rmSync } = require('fs');
const os = require('os');
const { SqliteAdapter } = require('../src/db/adapters/sqlite');
const { createAuthGrants } = require('../src/auth/utils/permissions');
const { hashPassword, createUserToken } = require('../src/auth/utils/crypto');
const q = require('../src/auth/utils/queries');
const authH = require('../src/auth/handlers/auth');
const userH = require('../src/auth/handlers/user');
const groupH = require('../src/auth/handlers/group');
const messageH = require('../src/auth/handlers/message');
const accessLog = require('../src/access-log');

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

const A = { app: 'siteA', authPatternId: 10 };
const ROWS = {
  siteA: [{ id: 10, data: { pattern_type: 'auth', authPermissions: { groups: { Mgrs: ['auth-users', 'auth-groups'], public: [] }, users: {} } } }],
};
const siteGrants = {
  listSiteGrants: async () => ({ grants: [], skipped: [] }),
  listExternalGrants: async () => [],
  stripSiteGrants: async () => ({ written: [], skipped: [] }),
};
const ctx = { subdomain: '', authGrants: createAuthGrants({ loadPatternRows: async (app) => ROWS[app] || [] }), siteGrants };

// lvl5@t: level 5 in siteA, no grant on the auth row. mgr@t: the grants, level 0. admin@t: siteA Admin.
const GROUPS = {
  'siteA Admin': [['siteA', 10]], Editors: [['siteA', 5]], Mgrs: [['siteA', 0]], Viewers: [['siteA', 0]],
  Loose: [],
};
const USERS = {
  'lvl5@t': ['Editors'], 'mgr@t': ['Mgrs'], 'admin@t': ['siteA Admin'], 'victim@t': ['Viewers'],
  'doomed@t': ['Viewers'], 'joiner@t': [],
};
let db, tmp;
const tok = {};

async function setup() {
  tmp = mkdtempSync(join(os.tmpdir(), 'auth-level-rules-'));
  db = new SqliteAdapter({ filename: join(tmp, 'auth.sqlite') });
  const sql = readFileSync(join(__dirname, '../src/db/sql/auth/auth_tables.sqlite.sql'), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  for (const stmt of sql.split(';').filter(s => s.trim())) await db.query(stmt + ';');
  await q.createProject(db, 'siteA', 'test');
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
  await db.query("INSERT INTO user_preferences (user_email, project_name, preferences) VALUES ('victim@t', 'siteA', '{\"a\":1}')");
  await db.query("INSERT INTO signup_requests (user_email, project_name, state) VALUES ('joiner@t', 'siteA', 'pending')");
}

const withMode = async (mode, fn) => {
  const prev = process.env.DMS_AUTH_MODE, warn = console.warn;
  process.env.DMS_AUTH_MODE = mode; console.warn = () => {};
  try { return await fn(); } finally {
    console.warn = warn;
    if (prev === undefined) delete process.env.DMS_AUTH_MODE; else process.env.DMS_AUTH_MODE = prev;
  }
};
const levelLines = () => [...accessLog._pending().values()]
  .filter(r => r.guard === 'auth' && r.user_email === 'lvl5@t' && /allowed by auth level only/.test(r.reason))
  .map(r => r.perms);
const loggedFor = (re) => assert.ok(levelLines().some(p => re.test(p)), `no level line for ${re}: ${levelLines().join(' | ')}`);
const lvl = (extra = {}) => ({ token: tok['lvl5@t'], ...A, ...extra });
const names = (list) => list.map(x => x.email || x.name || x.user_email);

async function main() {
  await setup();
  accessLog._reset();

  console.log('enforce: a level-5 user with no grant is refused everywhere:');
  await withMode('enforce', async () => {
    await t('members: /user/group/assign, /user/group/remove', async () => {
      await refused(userH.assignToGroup(db, lvl({ user_email: 'joiner@t', group_name: 'Viewers' }), ctx));
      await refused(userH.removeFromGroup(db, lvl({ user_email: 'victim@t', group_name: 'Viewers' }), ctx));
    });
    await t('users: delete, remove from the site, read preferences', async () => {
      await refused(userH.deleteUser(db, lvl({ user_email: 'doomed@t' }), ctx));
      await refused(userH.planRemoveFromProject(db, lvl({ user_email: 'victim@t' }), ctx));
      assert.deepStrictEqual(await userH.getUsersPreferences(db, lvl({ userEmails: ['victim@t'] }), ctx), []);
    });
    await t('lists: /users, /users/bygroup, /groups, /groups/byproject show nothing by level', async () => {
      assert.deepStrictEqual(names(await userH.getUsers(db, lvl(), ctx)), []);
      assert.deepStrictEqual(await userH.getUsersByGroup(db, lvl({ groups: ['Viewers'] }), ctx), []);
      assert.ok(!names(await groupH.getGroups(db, lvl(), ctx)).includes('Viewers'));
      assert.deepStrictEqual(names((await groupH.groupsForProject(db, lvl({ project: 'siteA' }), ctx)).groups), ['public']);
    });
    await t('groups: create + assign, link, unlink, delete, adjust level', async () => {
      await refused(groupH.createAndAssign(db, lvl({ group_name: 'NewG', project_name: 'siteA', auth_level: 0 }), ctx));
      await refused(groupH.assignToProject(db, lvl({ group_name: 'Loose', project_name: 'siteA', auth_level: 0 }), ctx));
      await refused(groupH.planRemoveFromProject(db, lvl({ group_name: 'Viewers', project_name: 'siteA' }), ctx));
      await refused(groupH.planDeleteGroup(db, lvl({ name: 'Viewers' }), ctx));
      await refused(groupH.adjustAuthLevel(db, lvl({ group_name: 'Viewers', project_name: 'siteA', auth_level: 1 }), ctx));
    });
    await t('messages to a group / the project; signup requests', async () => {
      await refused(messageH.postMessage(db, lvl({ heading: 'h', message: 'm', type: 'group', target: 'Viewers', project: 'siteA' }), ctx));
      await refused(messageH.postMessage(db, lvl({ heading: 'h', message: 'm', type: 'project', project: 'siteA' }), ctx));
      assert.deepStrictEqual((await authH.getRequests(db, lvl(), ctx)).requests, []);
      assert.deepStrictEqual((await authH.getRequestsForProject(db, lvl({ project_name: 'siteA' }), ctx)).requests, []);
    });
    await t('nothing was written, nothing logged as a level pass', async () => {
      assert.deepStrictEqual((await q.getUserGroups(db, 'joiner@t', 'siteA')).rows, []);
      assert.ok((await db.query("SELECT 1 FROM users WHERE email = 'doomed@t'")).rows.length);
      assert.deepStrictEqual(levelLines(), []);
    });
    await t('grants still decide: auth-users assigns a member; `*` (siteA Admin) adjusts a level', async () => {
      await userH.assignToGroup(db, { token: tok['mgr@t'], user_email: 'joiner@t', group_name: 'Viewers', ...A }, ctx);
      await userH.removeFromGroup(db, { token: tok['mgr@t'], user_email: 'joiner@t', group_name: 'Viewers', ...A }, ctx);
      await groupH.adjustAuthLevel(db, { token: tok['admin@t'], group_name: 'Viewers', project_name: 'siteA', auth_level: 0, ...A }, ctx);
      const { requests } = await authH.getRequestsForProject(db, { token: tok['mgr@t'], project_name: 'siteA', ...A }, ctx);
      assert.deepStrictEqual(requests.map(r => r.user_email), ['joiner@t']);
    });
    await t('no auth row named: nothing to judge, the level still counts (as levelCounts)', async () => {
      await groupH.adjustAuthLevel(db, { token: tok['lvl5@t'], group_name: 'Viewers', project_name: 'siteA', auth_level: 0 }, ctx);
    });
  });

  console.log('log: the same calls pass by level, and each is recorded:');
  accessLog._reset();
  await withMode('log', async () => {
    await t('members', async () => {
      await userH.assignToGroup(db, lvl({ user_email: 'joiner@t', group_name: 'Viewers' }), ctx);
      await userH.removeFromGroup(db, lvl({ user_email: 'joiner@t', group_name: 'Viewers' }), ctx);
      loggedFor(/auth-users: members of Viewers/);
    });
    await t('users', async () => {
      await userH.planRemoveFromProject(db, lvl({ user_email: 'victim@t' }), ctx);
      loggedFor(/remove victim@t from Viewers/);
      assert.strictEqual((await userH.getUsersPreferences(db, lvl({ userEmails: ['victim@t'] }), ctx)).length, 1);
      loggedFor(/read preferences of victim@t/);
      await userH.deleteUser(db, lvl({ user_email: 'doomed@t' }), ctx);
      loggedFor(/delete doomed@t/);
    });
    await t('lists', async () => {
      assert.ok(names(await userH.getUsers(db, lvl(), ctx)).includes('victim@t'));
      loggedFor(/list users \(/);
      assert.ok((await userH.getUsersByGroup(db, lvl({ groups: ['Viewers'] }), ctx)).length >= 1);
      loggedFor(/list users by group/);
      assert.ok(names(await groupH.getGroups(db, lvl(), ctx)).includes('Viewers'));
      loggedFor(/auth-groups: list groups \(/);
      assert.ok(names((await groupH.groupsForProject(db, lvl({ project: 'siteA' }), ctx)).groups).includes('Viewers'));
      loggedFor(/list groups of siteA/);
    });
    await t('groups', async () => {
      await groupH.createAndAssign(db, lvl({ group_name: 'NewG', project_name: 'siteA', auth_level: 0 }), ctx);
      await groupH.assignToProject(db, lvl({ group_name: 'Loose', project_name: 'siteA', auth_level: 0 }), ctx);
      await groupH.planRemoveFromProject(db, lvl({ group_name: 'Viewers', project_name: 'siteA' }), ctx);
      await groupH.planDeleteGroup(db, lvl({ name: 'Viewers' }), ctx);
      loggedFor(/delete group Viewers/);
      await groupH.adjustAuthLevel(db, lvl({ group_name: 'Viewers', project_name: 'siteA', auth_level: 1 }), ctx);
      assert.ok(levelLines().some(p => /^\* \(by level 5\)/.test(p)), levelLines().join(' | '));
    });
    await t('messages and signup requests', async () => {
      await messageH.postMessage(db, lvl({ heading: 'h', message: 'm', type: 'group', target: 'Viewers', project: 'siteA' }), ctx);
      loggedFor(/message Viewers/);
      // the project rule needs the project's highest level (siteA Admin, 10): level 5 never passed it
      await refused(messageH.postMessage(db, lvl({ heading: 'h', message: 'm', type: 'project', project: 'siteA' }), ctx));
      assert.strictEqual((await authH.getRequests(db, lvl(), ctx)).requests.length, 1);
      loggedFor(/auth-users: signup requests \(/);
      assert.strictEqual((await authH.getRequestsForProject(db, lvl({ project_name: 'siteA' }), ctx)).requests.length, 1);
      loggedFor(/signup requests of siteA/);
    });
  });

  rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
