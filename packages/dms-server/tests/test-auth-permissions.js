/**
 * Auth-handler permissions (planning/tasks/current/auth-grants-on-the-owner-row.md, rule 3): the SITE ROW
 * governs a request — `auth-users`, `auth-groups` and `view-as` are site verbs — the blank site row under
 * DMS_AUTH_MODE, and the protected-group rule. No database: the site grants and the auth DB are fakes.
 *
 * Run: node tests/test-auth-permissions.js
 */
const assert = require('assert');
const {
  createSiteAuth, authScope, can, canManageGroup, isProtectedGroup,
} = require('../src/auth/utils/permissions');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`); }
};

const ap = (groups = {}, users = {}) => ({ groups, users });

// app → what the site-row loader returns (owners.js `grantsAt(snap, snap.site, 'site')`, already resolved
// for the subdomain). `null` is an app with no site row.
const GRANTS = {
  siteA: ap({ Managers: ['auth-users'], Leads: ['auth-groups'], Owners: ['*'], Keepers: ['edit-pattern-permissions'], public: [] }, { 7: ['*'] }),
  openApp: ap(),
  noSite: null,
  subApp: { songs: ap({ SongStaff: ['auth-users'] }), '': ap({ Main: ['auth-users'] }) },
};
const makeAuth = () => {
  const calls = [];
  const auth = createSiteAuth({
    loadSiteGrants: async (app, subdomain) => {
      calls.push([app, subdomain]);
      const g = GRANTS[app];
      return g && g.songs ? (g[subdomain] || g['']) : g;
    },
  });
  return { auth, calls };
};
const user = (groups = [], id = 1) => ({ id, email: `u${id}@test`, groups, authed: true });

async function main() {
  console.log('site scope:');

  await t('names a site → its grants, not open', async () => {
    const { auth } = makeAuth();
    const s = await auth.siteScope({ app: 'siteA', project: 'siteA' });
    assert.ok(!s.error, s.error);
    assert.deepStrictEqual(s.grants.groups.Managers, ['auth-users']);
    assert.strictEqual(s.open, false);
  });

  await t('no site named → error (nothing passes)', async () => {
    const { auth } = makeAuth();
    assert.ok((await auth.siteScope({ project: 'siteA' })).error);
  });

  await t('project other than the app → error (another site cannot govern it)', async () => {
    const { auth } = makeAuth();
    const s = await auth.siteScope({ app: 'siteA', project: 'otherProject' });
    assert.ok(/does not govern project otherProject/.test(s.error), s.error);
  });

  await t('the loader is asked for the subdomain', async () => {
    const { auth, calls } = makeAuth();
    const songs = await auth.siteScope({ app: 'subApp', project: 'subApp', subdomain: 'songs' });
    assert.deepStrictEqual(Object.keys(songs.grants.groups), ['SongStaff']);
    const other = await auth.siteScope({ app: 'subApp', project: 'subApp', subdomain: 'x' });
    assert.deepStrictEqual(Object.keys(other.grants.groups), ['Main']);
    assert.deepStrictEqual(calls, [['subApp', 'songs'], ['subApp', 'x']]);
  });

  await t('no grants, or no site row at all → open', async () => {
    const { auth } = makeAuth();
    assert.strictEqual((await auth.siteScope({ app: 'openApp', project: 'openApp' })).open, true);
    assert.strictEqual((await auth.siteScope({ app: 'noSite', project: 'noSite' })).open, true);
  });

  console.log('can:');
  const { auth } = makeAuth();
  const A = await auth.siteScope({ app: 'siteA', project: 'siteA' });
  const OPEN = await auth.siteScope({ app: 'openApp', project: 'openApp' });

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

  const inMode = async (mode, fn) => {
    const prev = process.env.DMS_AUTH_MODE, warn = console.warn;
    const lines = [];
    process.env.DMS_AUTH_MODE = mode; console.warn = (m) => lines.push(String(m));
    try { await fn(lines); } finally {
      console.warn = warn;
      if (prev === undefined) delete process.env.DMS_AUTH_MODE; else process.env.DMS_AUTH_MODE = prev;
    }
  };

  await t('open row, log: still passes, with an `[auth-row] would deny` line', async () =>
    inMode('log', async (lines) => {
      assert.strictEqual(can(user(['Viewers'], 41), 'auth-users', OPEN), true);
      assert.strictEqual(can(user([]), 'auth-groups', OPEN), true);
      assert.ok(lines.some(l => /\[auth-row\] would deny .*auth-users.*blank site row/.test(l)), lines.join('\n'));
    }));

  await t('open row, enforce: only `${app} Admin` edits (no grants = only admins)', async () =>
    inMode('enforce', async () => {
      assert.strictEqual(can(user(['Viewers']), 'auth-users', OPEN), false);
      assert.strictEqual(can(user([]), 'auth-groups', OPEN), false);
      assert.strictEqual(can(user(['openApp Admin']), 'auth-groups', OPEN), true);
      // a row with grants is judged by them, as before
      assert.strictEqual(can(user(['Managers']), 'auth-users', A), true);
      assert.strictEqual(can(user(['Viewers']), 'auth-users', A), false);
    }));

  await t('no usable scope → can() is false', async () => {
    assert.strictEqual(can(user(['siteA Admin']), 'auth-users', { error: 'x' }), false);
    assert.strictEqual(can(user([]), 'auth-users', null), false);
  });

  console.log('protected groups (decision (b)):');

  await t('protected: holds `*`, auth-groups or edit-pattern-permissions on the site row, or is `${app} Admin`', async () => {
    assert.strictEqual(isProtectedGroup('Owners', A), true);
    assert.strictEqual(isProtectedGroup('Leads', A), true);
    assert.strictEqual(isProtectedGroup('Keepers', A), true);
    assert.strictEqual(isProtectedGroup('siteA Admin', A), true);
    assert.strictEqual(isProtectedGroup('Managers', A), false);
    // a group granted on some pattern row is not protected: only the site row counts
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

  await t('groups from the auth DB, scope from the site; no level; authPatternId ignored', async () => {
    const authDb = { query: async (sql, params) => {
      assert.ok(/FROM users_in_groups/.test(sql));
      assert.deepStrictEqual(params, ['u3@test', 'siteA']);
      return { rows: [{ name: 'Managers', auth_level: 5 }, { name: 'Viewers', auth_level: 1 }] };
    } };
    const r = await authScope(authDb, { id: 3, email: 'u3@test' },
      { project: 'siteA', app: 'siteA', authPatternId: 999 }, { siteAuth: auth, subdomain: '' });
    assert.deepStrictEqual(r.user.groups, ['Managers', 'Viewers']);
    assert.strictEqual(r.authLevel, undefined, 'levels are not read');
    assert.strictEqual(can(r.user, 'auth-users', r.scope), true);
  });

  await t('no ctx → scope error; nothing passes', async () => {
    const authDb = { query: async () => ({ rows: [{ name: 'X', auth_level: 10 }] }) };
    const r = await authScope(authDb, { id: 3, email: 'u3@test' }, { project: 'siteA', app: 'siteA' });
    assert.ok(r.scope.error);
    assert.strictEqual(can(r.user, 'auth-users', r.scope), false);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main();
