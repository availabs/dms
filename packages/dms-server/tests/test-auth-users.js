/**
 * Users, signup requests and invites by permission (planning/tasks/current/permissions-auth-users-and-signup.md):
 * each handler passes by `auth-users` on the named auth row, by level (transition), or not at all; the
 * protected-group rule and the group's project bound the permission path; /signup/assign/group is closed
 * to anonymous callers beyond self-signup into `${project} Public`.
 * Real SQLite auth database (temp file); the DMS pattern rows are injected.
 *
 * Run: node tests/test-auth-users.js
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

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`); }
};
const refused = async (p, re = /authority|cannot|can only|Self-signup|does not/) => {
  let err;
  try { await p; } catch (e) { err = e; }
  assert.ok(err, 'expected a refusal');
  assert.ok(re.test(err.message), err.message);
};

const ap = (groups = {}, users = {}) => ({ groups, users });
const ROWS = {
  siteA: [
    { id: 10, data: { pattern_type: 'auth', authPermissions: ap({ Managers: ['auth-users'], Owners: ['*'], public: [] }) } },
    { id: 11, data: { pattern_type: 'admin', authPermissions: ap({ Keepers: ['edit-pattern-permissions'] }) } },
  ],
  openApp: [{ id: 20, data: { pattern_type: 'auth' } }],
};
// Site grants (siteGrants.js) faked: records strip calls with what the auth DB held at that moment.
const calls = [];
let db;
const siteGrants = {
  listSiteGrants: async (app, who) => ({ grants: [{ id: 100, type: 'docs|page', app, who }], skipped: [] }),
  listExternalGrants: async (pgEnvs, who) => (pgEnvs || []).map(pgEnv => ({ pgEnv, source_id: 5, name: 'ext', who })),
  stripSiteGrants: async (app, who) => {
    const { rows } = who.users != null
      ? await db.query('SELECT group_name FROM users_in_groups uig INNER JOIN users u ON u.email = uig.user_email WHERE u.id = $1', [who.users])
      : await db.query('SELECT project_name AS group_name FROM groups_in_projects WHERE group_name = $1', [who.groups]);
    calls.push({ app, who, userId: who.users, groupsAtStrip: rows.map(r => r.group_name) });
    return { written: [{ id: 100 }], skipped: [] };
  },
};
const ctx = { subdomain: '', authGrants: createAuthGrants({ loadPatternRows: async (app) => ROWS[app] || [] }), siteGrants };
const A = { app: 'siteA', authPatternId: 10 };
const OPEN = { app: 'openApp', authPatternId: 20 };

// group → [project, level][]
const GROUPS = {
  'siteA Admin': [['siteA', 10]], 'siteA Public': [['siteA', 0]], Managers: [['siteA', 0]], Viewers: [['siteA', 0]],
  Owners: [['siteA', 0]], Keepers: [['siteA', 0]], Editors: [['siteA', 5]], Shared: [['siteA', 0], ['siteB', 0]],
  'siteB Admin': [['siteB', 10]], 'openApp Public': [['openApp', 0]], OpenViewers: [['openApp', 0]],
};
// user → groups
const USERS = {
  'mgr@t': ['Managers'], 'lvl5@t': ['Editors'], 'admin@t': ['siteA Admin'], 'viewer@t': ['Viewers'],
  'victim@t': ['Viewers'], 'victim2@t': ['Viewers'], 'owner@t': ['Owners'], 'keeper@t': ['Keepers'],
  'shared@t': ['Shared', 'Viewers'], 'multi@t': ['Viewers', 'siteB Admin'],
  'leaver@t': ['Viewers', 'Shared', 'siteB Admin'], 'leaver2@t': ['Viewers'], 'outsider@t': ['siteB Admin'], 'orphan@t': [], 'openuser@t': ['OpenViewers'],
};

let tmp;
const tok = {};

async function setup() {
  tmp = mkdtempSync(join(os.tmpdir(), 'auth-users-'));
  db = new SqliteAdapter({ filename: join(tmp, 'auth.sqlite') });
  const sql = readFileSync(join(__dirname, '../src/db/sql/auth/auth_tables.sqlite.sql'), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  for (const stmt of sql.split(';').filter(s => s.trim())) await db.query(stmt + ';');

  for (const p of ['siteA', 'siteB', 'openApp']) await q.createProject(db, p, 'test');
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

const groupsOf = async (email) =>
  (await db.query('SELECT group_name FROM users_in_groups WHERE user_email = $1', [email])).rows.map(r => r.group_name);

async function main() {
  await setup();

  console.log('/users/byProject:');
  await t('auth-users (level 0) lists the project, with manageable flags', async () => {
    const { users } = await userH.getUsersByProject(db, { token: tok['mgr@t'], project: 'siteA', ...A }, ctx);
    const m = Object.fromEntries(users.map(u => [u.email, u.manageable]));
    assert.strictEqual(m['victim@t'], true);
    assert.strictEqual(m['admin@t'], false, 'siteA Admin is protected');
    assert.strictEqual(m['owner@t'], false, '* holder group is protected');
    assert.strictEqual(m['keeper@t'], false, 'edit-pattern-permissions on the admin row is protected');
    assert.strictEqual(m['shared@t'], true, 'a shared group is judged by the calling site\'s grants alone');
    assert.strictEqual(m['multi@t'], true, 'only this project\'s groups are listed and judged');
  });
  await t('no permission, level < 10 → refused', async () => {
    await refused(userH.getUsersByProject(db, { token: tok['viewer@t'], project: 'siteA', ...A }, ctx));
    await refused(userH.getUsersByProject(db, { token: tok['lvl5@t'], project: 'siteA', ...A }, ctx));
  });
  await t('auth-users without naming the auth row → level decides → refused', async () => {
    await refused(userH.getUsersByProject(db, { token: tok['mgr@t'], project: 'siteA' }, ctx));
  });
  await t('level 10 alone (transition) passes; everything manageable', async () => {
    const { users } = await userH.getUsersByProject(db, { token: tok['admin@t'], project: 'siteA' }, ctx);
    assert.ok(users.find(u => u.email === 'admin@t').manageable);
    assert.ok(users.find(u => u.email === 'victim@t').manageable);
  });
  await t('open auth row: a project member passes, a member of another project does not', async () => {
    const { users } = await userH.getUsersByProject(db, { token: tok['openuser@t'], project: 'openApp', ...OPEN }, ctx);
    assert.ok(users.length >= 1);
    await refused(userH.getUsersByProject(db, { token: tok['outsider@t'], project: 'openApp', ...OPEN }, ctx));
  });

  console.log('/user/group/assign, /user/group/remove:');
  await t('auth-users adds to a plain group', async () => {
    await userH.assignToGroup(db, { token: tok['mgr@t'], user_email: 'victim@t', group_name: 'Managers', ...A }, ctx);
    assert.ok((await groupsOf('victim@t')).includes('Managers'));
    await userH.removeFromGroup(db, { token: tok['mgr@t'], user_email: 'victim@t', group_name: 'Managers', ...A }, ctx);
    assert.ok(!(await groupsOf('victim@t')).includes('Managers'));
  });
  await t('auth-users can\'t add to protected / other-project groups', async () => {
    for (const g of ['siteA Admin', 'Owners', 'Keepers', 'siteB Admin']) {
      await refused(userH.assignToGroup(db, { token: tok['mgr@t'], user_email: 'victim@t', group_name: g, ...A }, ctx));
    }
    await refused(userH.removeFromGroup(db, { token: tok['mgr@t'], user_email: 'admin@t', group_name: 'siteA Admin', ...A }, ctx));
  });
  await t('no permission, level 0 → refused; level 5 (transition) → plain group ok, Admin refused', async () => {
    await refused(userH.assignToGroup(db, { token: tok['viewer@t'], user_email: 'victim@t', group_name: 'Viewers', ...A }, ctx));
    await userH.assignToGroup(db, { token: tok['lvl5@t'], user_email: 'victim@t', group_name: 'Managers', ...A }, ctx);
    await userH.removeFromGroup(db, { token: tok['lvl5@t'], user_email: 'victim@t', group_name: 'Managers', ...A }, ctx);
    await refused(userH.assignToGroup(db, { token: tok['lvl5@t'], user_email: 'victim@t', group_name: 'siteA Admin', ...A }, ctx));
  });
  await t('a group shared with siteB: siteA\'s grants alone decide', async () => {
    await userH.assignToGroup(db, { token: tok['mgr@t'], user_email: 'victim@t', group_name: 'Shared', ...A }, ctx);
    await userH.removeFromGroup(db, { token: tok['mgr@t'], user_email: 'victim@t', group_name: 'Shared', ...A }, ctx);
  });
  await t('siteA Admin may add to protected groups of its own project', async () => {
    await userH.assignToGroup(db, { token: tok['admin@t'], user_email: 'victim@t', group_name: 'Owners', ...A }, ctx);
    await userH.removeFromGroup(db, { token: tok['admin@t'], user_email: 'victim@t', group_name: 'Owners', ...A }, ctx);
  });

  console.log('/user/delete:');
  await t('auth-users deletes a plain member; not one also in another project\'s group, a protected or a project-less one', async () => {
    await refused(userH.deleteUser(db, { token: tok['mgr@t'], user_email: 'multi@t', ...A }, ctx));
    await refused(userH.deleteUser(db, { token: tok['mgr@t'], user_email: 'owner@t', ...A }, ctx));
    await refused(userH.deleteUser(db, { token: tok['mgr@t'], user_email: 'orphan@t', ...A }, ctx));
    await userH.deleteUser(db, { token: tok['mgr@t'], user_email: 'victim2@t', ...A }, ctx);
    assert.strictEqual((await q.getUserByEmail(db, 'victim2@t')).rows.length, 0);
  });
  await t('a user in no project is no longer deletable by any signed-in user', async () => {
    await refused(userH.deleteUser(db, { token: tok['viewer@t'], user_email: 'orphan@t' }, ctx));
  });

  console.log('/user/project/remove:');
  await t('dry run: groups here (shared ones named with their other projects), grants, external sources', async () => {
    const plan = await userH.removeFromProject(db, { token: tok['mgr@t'], user_email: 'leaver@t', dryRun: true, pgEnvs: ['envA'], ...A }, ctx);
    assert.deepStrictEqual(plan.groups.sort(), ['Shared', 'Viewers']);
    assert.deepStrictEqual(plan.sharedGroups, [{ group: 'Shared', otherProjects: ['siteB'] }]);
    assert.strictEqual(plan.siteGrants.length, 1);
    assert.deepStrictEqual(plan.externalSources.map(e => e.pgEnv), ['envA']);
    assert.strictEqual(calls.length, 0, 'a dry run writes nothing');
    assert.deepStrictEqual((await groupsOf('leaver@t')).sort(), ['Shared', 'Viewers', 'siteB Admin']);
  });
  await t('remove: grants stripped first, then this project\'s groups (shared too); other projects\' stay; account stays', async () => {
    await userH.removeFromProject(db, { token: tok['mgr@t'], user_email: 'leaver@t', ...A }, ctx);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].app, 'siteA');
    assert.ok(calls[0].groupsAtStrip.includes('Viewers'), 'still a member while grants are stripped');
    assert.deepStrictEqual(await groupsOf('leaver@t'), ['siteB Admin']);
    assert.strictEqual((await q.getUserByEmail(db, 'leaver@t')).rows.length, 1);
  });
  await t('refused: protected member, not a member, no authority, no named site', async () => {
    await refused(userH.removeFromProject(db, { token: tok['mgr@t'], user_email: 'owner@t', ...A }, ctx));
    await refused(userH.removeFromProject(db, { token: tok['mgr@t'], user_email: 'outsider@t', ...A }, ctx), /not a member/);
    await refused(userH.removeFromProject(db, { token: tok['viewer@t'], user_email: 'leaver2@t', ...A }, ctx));
    await refused(userH.removeFromProject(db, { token: tok['mgr@t'], user_email: 'leaver2@t' }, ctx), /Name the site/);
    assert.strictEqual(calls.length, 1, 'nothing stripped on a refusal');
  });
  await t('siteA Admin removes a protected member', async () => {
    await userH.removeFromProject(db, { token: tok['admin@t'], user_email: 'keeper@t', ...A }, ctx);
    assert.deepStrictEqual(await groupsOf('keeper@t'), []);
  });

  console.log('/signup/assign/group:');
  await t('anonymous: no password, or a group other than Public → refused', async () => {
    await refused(authH.signupAssignGroup(db, { email: 'new1@t', project: 'siteA' }, ctx));
    await refused(authH.signupAssignGroup(db, { email: 'new1@t', password: 'x', project: 'siteA', group: 'siteA Admin' }, ctx));
    await refused(authH.signupAssignGroup(db, { email: 'admin@t', password: 'pw', project: 'siteA', group: 'siteA Admin' }, ctx));
  });
  await t('anonymous self-signup into Public still works', async () => {
    await authH.signupAssignGroup(db, { email: 'new1@t', password: 'x', project: 'siteA' }, ctx);
    assert.deepStrictEqual(await groupsOf('new1@t'), ['siteA Public']);
  });
  await t('with a token: auth-users adds to Public / plain groups; not to Admin', async () => {
    await authH.signupAssignGroup(db, { token: tok['mgr@t'], email: 'new2@t', project: 'siteA', ...A }, ctx);
    assert.deepStrictEqual(await groupsOf('new2@t'), ['siteA Public']);
    await refused(authH.signupAssignGroup(db, { token: tok['mgr@t'], email: 'new3@t', project: 'siteA', group: 'siteA Admin', ...A }, ctx));
    await refused(authH.signupAssignGroup(db, { token: tok['viewer@t'], email: 'new3@t', project: 'siteA', ...A }, ctx));
  });
  await t('with a token: a missing non-public group isn\'t created', async () => {
    await refused(authH.signupAssignGroup(db, { token: tok['admin@t'], email: 'new4@t', project: 'siteA', group: 'Nope', ...A }, ctx));
  });

  console.log('/signup/request, /invite, accept / reject / delete, requests:');
  await t('self-signup addToGroup: only the project\'s Public', async () => {
    await refused(authH.signupRequest(db, { email: 'req1@t', project: 'siteA', addToGroup: 'Viewers', sendEmail: false }, ctx));
    const r = await authH.signupRequest(db, { email: 'req1@t', project: 'siteA', addToGroup: 'siteA Public', sendEmail: false }, ctx);
    assert.ok(r.token);
  });
  await t('invite: auth-users into a plain group; protected refused; level 5 into Admin now refused', async () => {
    const r = await authH.sendInvite(db, { token: tok['mgr@t'], user_email: 'inv1@t', group_name: 'Viewers', project_name: 'siteA', ...A }, ctx);
    assert.ok(r.token);
    await refused(authH.sendInvite(db, { token: tok['mgr@t'], user_email: 'inv2@t', group_name: 'Owners', project_name: 'siteA', ...A }, ctx));
    await refused(authH.sendInvite(db, { token: tok['lvl5@t'], user_email: 'inv2@t', group_name: 'siteA Admin', project_name: 'siteA', ...A }, ctx));
    await refused(authH.sendInvite(db, { token: tok['viewer@t'], user_email: 'inv2@t', group_name: 'Viewers', project_name: 'siteA', ...A }, ctx));
  });
  await t('accept / reject / delete a request by permission; viewer refused', async () => {
    await q.createSignupRequest(db, 'pend1@t', 'siteA', 'pending');
    await q.createSignupRequest(db, 'pend2@t', 'siteA', 'pending');
    await refused(authH.signupAccept(db, { token: tok['viewer@t'], user_email: 'pend1@t', group_name: 'Viewers', project_name: 'siteA', ...A }, ctx));
    await refused(authH.signupAccept(db, { token: tok['mgr@t'], user_email: 'pend1@t', group_name: 'siteA Admin', project_name: 'siteA', ...A }, ctx));
    await authH.signupAccept(db, { token: tok['mgr@t'], user_email: 'pend1@t', group_name: 'Viewers', project_name: 'siteA', ...A }, ctx);
    assert.deepStrictEqual(await groupsOf('pend1@t'), ['Viewers']);
    await refused(authH.signupReject(db, { token: tok['viewer@t'], user_email: 'pend2@t', project_name: 'siteA', ...A }, ctx));
    await authH.signupReject(db, { token: tok['mgr@t'], user_email: 'pend2@t', project_name: 'siteA', ...A }, ctx);
    await refused(authH.deleteSignup(db, { token: tok['viewer@t'], user_email: 'pend2@t', project_name: 'siteA', ...A }, ctx));
    await authH.deleteSignup(db, { token: tok['mgr@t'], user_email: 'pend2@t', project_name: 'siteA', ...A }, ctx);
  });
  await t('requests/byProject: auth-users sees them; viewer sees none', async () => {
    const r = await authH.getRequestsForProject(db, { token: tok['mgr@t'], project_name: 'siteA', ...A }, ctx);
    assert.ok(r.requests.some(x => x.user_email === 'inv1@t'));
    const v = await authH.getRequestsForProject(db, { token: tok['viewer@t'], project_name: 'siteA', ...A }, ctx);
    assert.strictEqual(v.requests.length, 0);
    const all = await authH.getRequests(db, { token: tok['mgr@t'], ...A }, ctx);
    assert.ok(all.requests.some(x => x.user_email === 'inv1@t'));
  });

  console.log('/users, /users/preferences:');
  await t('/users: auth-users sees the project\'s users; level-0 viewer only ranks below', async () => {
    const m = await userH.getUsers(db, { token: tok['mgr@t'], ...A }, ctx);
    assert.ok(m.some(u => u.email === 'admin@t'));
    const v = await userH.getUsers(db, { token: tok['viewer@t'], ...A }, ctx);
    assert.ok(!v.some(u => u.email === 'admin@t'));
  });
  await t('preferences: own always; others need auth-users or rank', async () => {
    await db.query("INSERT INTO user_preferences (user_email, preferences) VALUES ('victim@t', '{\"a\":1}'), ('viewer@t', '{\"b\":2}')");
    const v = await userH.getUsersPreferences(db, { token: tok['viewer@t'], userEmails: ['viewer@t', 'victim@t'], ...A }, ctx);
    assert.deepStrictEqual(v.map(r => r.user_email), ['viewer@t'], 'level 0 outranks no one: own only');
    const o = await userH.getUsersPreferences(db, { token: tok['outsider@t'], userEmails: ['victim@t'], ...A }, ctx);
    assert.strictEqual(o.length, 0, 'another project\'s user sees nothing');
    const m = await userH.getUsersPreferences(db, { token: tok['mgr@t'], userEmails: ['victim@t'], ...A }, ctx);
    assert.strictEqual(m.length, 1);
  });

  rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
