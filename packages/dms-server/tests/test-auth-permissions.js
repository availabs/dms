/**
 * Auth-handler permissions (planning/tasks/current/permissions-auth-server-permission-source.md):
 * which auth row governs a request, the lenient rule, transition mode and the protected-group rule.
 * No database: the DMS pattern rows and the auth DB are fakes.
 *
 * Run: node tests/test-auth-permissions.js
 */
const assert = require('assert');
const {
  createAuthGrants, authScope, can, canOrLevel, canManageGroup, isProtectedGroup,
} = require('../src/auth/utils/permissions');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`); }
};

const ap = (groups = {}, users = {}) => JSON.stringify({ groups, users });

// app → pattern rows (as controller.getPatternRows returns them)
const ROWS = {
  siteA: [
    { id: 10, type: 'prod|auth:pattern', data: { pattern_type: 'auth', authPermissions: ap({ Managers: ['auth-users'], Leads: ['auth-groups'], Owners: ['*'], public: [] }, { 7: ['*'] }) } },
    { id: 11, type: 'prod|admin:pattern', data: JSON.stringify({ pattern_type: 'admin', authPermissions: ap({ Keepers: ['edit-pattern-permissions'] }) }) },
    { id: 12, type: 'prod|docs:pattern', data: { pattern_type: 'page', authPermissions: ap({ Writers: ['*'] }) } },
  ],
  openApp: [
    { id: 20, type: 'site|auth:pattern', data: { pattern_type: 'auth' } },
  ],
  // the malformed shape old create-site code wrote (wcdb): no groups/users wrapper → sets nothing
  oldApp: [
    { id: 30, type: 'prod|auth:pattern', data: { pattern_type: 'auth', authPermissions: JSON.stringify({ 'undefined Admin': ['*'] }) } },
  ],
  subApp: [
    { id: 40, type: 'prod|auth:pattern', data: { pattern_type: 'auth', authPermissions: JSON.stringify({
      '*': ap({ Main: ['auth-users'] }),
      songs: ap({ SongStaff: ['auth-users'] }),
    }) } },
  ],
};

const makeGrants = (opts = {}) => {
  const calls = [];
  const grants = createAuthGrants({
    loadPatternRows: async (app) => { calls.push(app); return ROWS[app] || []; },
    ...opts,
  });
  return { grants, calls };
};

const user = (groups = [], id = 1) => ({ id, email: `u${id}@test`, groups, authed: true });

async function main() {
  console.log('auth row resolution:');

  await t('names a row of the app → its grants, not open', async () => {
    const { grants } = makeGrants();
    const s = await grants.loadAuthGrants({ app: 'siteA', authPatternId: '10', project: 'siteA' });
    assert.ok(!s.error, s.error);
    assert.deepStrictEqual(s.grants.groups.Managers, ['auth-users']);
    assert.strictEqual(s.open, false);
  });

  await t('no auth pattern named → error (level decides)', async () => {
    const { grants } = makeGrants();
    assert.ok((await grants.loadAuthGrants({ app: 'siteA', project: 'siteA' })).error);
    assert.ok((await grants.loadAuthGrants({ authPatternId: 10, project: 'siteA' })).error);
  });

  await t('tampered id: another app\'s auth row → error', async () => {
    const { grants } = makeGrants();
    const s = await grants.loadAuthGrants({ app: 'siteA', authPatternId: 20, project: 'siteA' });
    assert.ok(/not an auth pattern of siteA/.test(s.error), s.error);
  });

  await t('a non-auth pattern of the app → error', async () => {
    const { grants } = makeGrants();
    assert.ok((await grants.loadAuthGrants({ app: 'siteA', authPatternId: 12, project: 'siteA' })).error);
    assert.ok((await grants.loadAuthGrants({ app: 'siteA', authPatternId: 11, project: 'siteA' })).error);
  });

  await t('project other than the app → error (another project\'s row can\'t govern it)', async () => {
    const { grants } = makeGrants();
    const s = await grants.loadAuthGrants({ app: 'siteA', authPatternId: 10, project: 'otherProject' });
    assert.ok(/does not govern project otherProject/.test(s.error), s.error);
  });

  await t('subdomain format: tenant entry, else `*`', async () => {
    const { grants } = makeGrants();
    const songs = await grants.loadAuthGrants({ app: 'subApp', authPatternId: 40, project: 'subApp', subdomain: 'songs' });
    assert.deepStrictEqual(Object.keys(songs.grants.groups), ['SongStaff']);
    const other = await grants.loadAuthGrants({ app: 'subApp', authPatternId: 40, project: 'subApp', subdomain: 'x' });
    assert.deepStrictEqual(Object.keys(other.grants.groups), ['Main']);
  });

  await t('no grants / the old `undefined Admin` shape → open', async () => {
    const { grants } = makeGrants();
    assert.strictEqual((await grants.loadAuthGrants({ app: 'openApp', authPatternId: 20, project: 'openApp' })).open, true);
    assert.strictEqual((await grants.loadAuthGrants({ app: 'oldApp', authPatternId: 30, project: 'oldApp' })).open, true);
  });

  await t('cached per app/id/subdomain within the TTL; reloaded after', async () => {
    const { grants, calls } = makeGrants();
    await grants.loadAuthGrants({ app: 'siteA', authPatternId: 10, project: 'siteA' });
    await grants.loadAuthGrants({ app: 'siteA', authPatternId: 10, project: 'siteA' });
    assert.strictEqual(calls.length, 1);
    const fresh = makeGrants({ ttlMs: 0 });
    await fresh.grants.loadAuthGrants({ app: 'siteA', authPatternId: 10, project: 'siteA' });
    await fresh.grants.loadAuthGrants({ app: 'siteA', authPatternId: 10, project: 'siteA' });
    assert.strictEqual(fresh.calls.length, 2);
  });

  console.log('can (lenient rule):');
  const { grants } = makeGrants();
  const A = await grants.loadAuthGrants({ app: 'siteA', authPatternId: 10, project: 'siteA' });
  const OPEN = await grants.loadAuthGrants({ app: 'openApp', authPatternId: 20, project: 'openApp' });

  await t('restricted row: holder passes, others don\'t', async () => {
    assert.strictEqual(can(user(['Managers']), 'auth-users', A), true);
    assert.strictEqual(can(user(['Managers']), 'auth-groups', A), false);
    assert.strictEqual(can(user(['Viewers']), 'auth-users', A), false);
    assert.strictEqual(can(user([]), 'view-as', A), false);
  });

  await t('`*` (group or user) holds everything', async () => {
    assert.strictEqual(can(user(['Owners']), 'auth-groups', A), true);
    assert.strictEqual(can(user([], 7), 'view-as', A), true);
  });

  await t('`${app} Admin` passes with no grant on the row', async () => {
    assert.strictEqual(can(user(['siteA Admin']), 'auth-groups', A), true);
  });

  await t('open row: any signed-in user passes (owner 2026-10-24)', async () => {
    assert.strictEqual(can(user(['Viewers']), 'auth-users', OPEN), true);
    assert.strictEqual(can(user([]), 'auth-groups', OPEN), true);
  });

  await t('no usable scope → can() is false', async () => {
    assert.strictEqual(can(user(['siteA Admin']), 'auth-users', { error: 'x' }), false);
    assert.strictEqual(can(user([]), 'auth-users', null), false);
  });

  console.log('canOrLevel (transition mode):');

  await t('permission or level', async () => {
    assert.strictEqual(canOrLevel(user(['Managers']), 'auth-users', 10, A, 1), true);
    assert.strictEqual(canOrLevel(user(['Viewers']), 'auth-users', 10, A, 10), true);
    assert.strictEqual(canOrLevel(user(['Viewers']), 'auth-users', 10, A, 5), false);
  });

  await t('no scope → today\'s level alone', async () => {
    assert.strictEqual(canOrLevel(user([]), 'auth-users', 10, { error: 'x' }, 10), true);
    assert.strictEqual(canOrLevel(user([]), 'auth-users', 10, { error: 'x' }, 9), false);
  });

  console.log('protected groups (decision (b)):');

  await t('protected: holds `*` / auth-groups on the auth row, edit-pattern-permissions on the admin row, or is `${app} Admin`', async () => {
    assert.strictEqual(isProtectedGroup('Owners', A), true);
    assert.strictEqual(isProtectedGroup('Leads', A), true);
    assert.strictEqual(isProtectedGroup('Keepers', A), true);
    assert.strictEqual(isProtectedGroup('siteA Admin', A), true);
    assert.strictEqual(isProtectedGroup('Managers', A), false);
    // a page pattern's `*` doesn't make Writers protected (auth and admin rows only)
    assert.strictEqual(isProtectedGroup('Writers', A), false);
  });

  await t('an auth-groups holder can\'t touch a protected group (no self-promotion)', async () => {
    assert.strictEqual(canManageGroup(user(['Leads']), 'Owners', A), false);
    assert.strictEqual(canManageGroup(user(['Leads']), 'Leads', A), false);
    assert.strictEqual(canManageGroup(user(['Leads']), 'siteA Admin', A), false);
    assert.strictEqual(canManageGroup(user(['Leads']), 'Managers', A), true);
  });

  await t('`*` holders and `${app} Admin` may touch protected groups', async () => {
    assert.strictEqual(canManageGroup(user(['Owners']), 'Leads', A), true);
    assert.strictEqual(canManageGroup(user([], 7), 'Owners', A), true);
    assert.strictEqual(canManageGroup(user(['siteA Admin']), 'siteA Admin', A), true);
  });

  await t('open row: `${app} Admin` stays protected (lenient doesn\'t make everyone a `*` holder)', async () => {
    assert.strictEqual(canManageGroup(user(['Viewers']), 'openApp Admin', OPEN), false);
    assert.strictEqual(canManageGroup(user(['Viewers']), 'Viewers', OPEN), true);
    assert.strictEqual(canManageGroup(user(['openApp Admin']), 'openApp Admin', OPEN), true);
  });

  console.log('authScope:');

  await t('groups and level from the auth DB, scope from the named row', async () => {
    const authDb = { query: async (sql, params) => {
      assert.ok(/FROM users_in_groups/.test(sql));
      assert.deepStrictEqual(params, ['u3@test', 'siteA']);
      return { rows: [{ name: 'Managers', auth_level: 5 }, { name: 'Viewers', auth_level: 1 }] };
    } };
    const r = await authScope(authDb, { id: 3, email: 'u3@test' },
      { project: 'siteA', app: 'siteA', authPatternId: 10 }, { authGrants: grants, subdomain: '' });
    assert.deepStrictEqual(r.user.groups, ['Managers', 'Viewers']);
    assert.strictEqual(r.authLevel, 5);
    assert.strictEqual(can(r.user, 'auth-users', r.scope), true);
  });

  await t('no ctx → scope error, level still known', async () => {
    const authDb = { query: async () => ({ rows: [{ name: 'X', auth_level: 10 }] }) };
    const r = await authScope(authDb, { id: 3, email: 'u3@test' }, { project: 'siteA' });
    assert.ok(r.scope.error);
    assert.strictEqual(canOrLevel(r.user, 'auth-users', 10, r.scope, r.authLevel), true);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main();
