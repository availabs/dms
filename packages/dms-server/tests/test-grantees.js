#!/usr/bin/env node
/**
 * GET /dms/:app/rows/:id/grantees (src/routes/auth/grantees.js): the users a row's own grants name,
 * directly or through a group, for anyone who may read the row. Temp SQLite auth db; DMS rows in the
 * cli-test db.
 *
 *   DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-grantees.js
 */
'use strict';
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
process.env.DMS_DB_ENV = process.env.DMS_DB_ENV || DMS_DB;

const assert = require('assert');
const { join } = require('path');
const { readFileSync, mkdtempSync } = require('fs');
const os = require('os');
const { SqliteAdapter } = require('../src/db/adapters/sqlite');
const { registerGranteeRoutes, namedIn } = require('../src/routes/auth/grantees');
const AUTH = require('../src/routes/auth');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 4).join('\n      ')}`); }
};
const runSql = async (db, file) => {
  for (const stmt of readFileSync(file, 'utf8').split(';').filter(s => s.trim())) await db.query(stmt + ';');
};

(async () => {
  console.log('namedIn:');
  await t('users and groups granted something; `public`, empty lists, reach and other keys skipped', async () => {
    const g = { groups: { Staff: ['view-page'], public: ['view-page'], Empty: [] }, users: { 7: ['*'], 8: [] }, reach: { inherit: false } };
    assert.deepStrictEqual(namedIn(g), { groups: ['Staff'], users: ['7'] });
  });
  await t('subdomain-keyed and scoped grants', async () => {
    assert.deepStrictEqual(namedIn({ '*': { groups: { A: ['x'] } }, sub: { groups: { B: ['x'] } } }, 'sub'), { groups: ['B'], users: [] });
    assert.deepStrictEqual(namedIn({ self: { users: { 1: ['x'] } }, descendants: { groups: { G: ['x'] } } }), { groups: ['G'], users: ['1'] });
    assert.deepStrictEqual(namedIn(null), { groups: [], users: [] });
  });

  const { getDb, awaitReady } = require('../src/db');
  getDb(DMS_DB);
  await awaitReady();
  const controller = require('../src/routes/dms/dms.controller').createController(DMS_DB);
  const APP = `grantees_${Date.now()}`;
  const insert = async (type, data) => +(await controller.createData([APP, type, data], null))[0].id;

  const dir = mkdtempSync(join(os.tmpdir(), 'grantees-'));
  const authDb = new SqliteAdapter({ filename: join(dir, 'auth.sqlite') });
  await runSql(authDb, join(__dirname, '../src/db/sql/auth/auth_tables.sqlite.sql'));
  for (const email of ['ann@x', 'bob@x', 'cat@x', 'dan@x']) await authDb.query('INSERT INTO users (email, password) VALUES ($1, $2)', [email, 'x']);
  const idOf = async (email) => +(await authDb.query('SELECT id FROM users WHERE email = $1', [email])).rows[0].id;
  for (const g of ['Staff', 'Chiefs', 'Others']) await authDb.query('INSERT INTO groups (name, created_by) VALUES ($1, $2)', [g, 'test']);
  for (const [email, group] of [['ann@x', 'Staff'], ['bob@x', 'Staff'], ['bob@x', 'Chiefs'], ['dan@x', 'Others']]) {
    await authDb.query('INSERT INTO users_in_groups (user_email, group_name, created_by) VALUES ($1, $2, $3)', [email, group, 'test']);
  }
  const cat = await idOf('cat@x');

  await insert('prod:site', { site_name: 'grantees' });
  const patternId = await insert('prod|team:pattern', { name: 'team', pattern_type: 'page', base_url: '/team',
    authPermissions: { groups: { Staff: ['view-page'], Chiefs: ['*'], public: [] }, users: { [cat]: ['view-page'] } } });
  const privateId = await insert('team|page', { title: 'private',
    authPermissions: { groups: {}, users: { [cat]: ['view-page'] }, reach: { inherit: false, override: false } } });
  AUTH.clearSnapshots();

  const routes = {};
  registerGranteeRoutes({ get: (p, h) => { routes[p] = h; } }, { authDb, controller });
  const handler = routes['/dms/:app/rows/:id/grantees'];
  const call = async (user, id, app = APP) => {
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    await handler({ params: { app, id: String(id) }, headers: { host: 'localhost' }, availAuthContext: { user } }, res);
    return res;
  };
  const ann = { authed: true, id: await idOf('ann@x'), email: 'ann@x', groups: ['Staff'] };
  const dan = { authed: true, id: await idOf('dan@x'), email: 'dan@x', groups: ['Others'] };
  const admin = { authed: true, id: 900, email: 'admin@x', groups: [`${APP} Admin`] };
  const catUser = { authed: true, id: cat, email: 'cat@x', groups: [] };

  console.log('\nthe route:');
  await t('a reader of the pattern gets its grantees: group members and users named, id + email only', async () => {
    const res = await call(ann, patternId);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body.users.map(u => u.email), ['ann@x', 'bob@x', 'cat@x']);
    for (const u of res.body.users) assert.deepStrictEqual(Object.keys(u).sort(), ['email', 'id']);
  });
  await t('someone the row does not let read it is refused (403); signed out, 401', async () => {
    assert.strictEqual((await call(dan, patternId)).statusCode, 403);
    assert.strictEqual((await call(null, patternId)).statusCode, 401);
  });
  await t('a reach-limited row: its named user reads it; the site admin is refused like anyone', async () => {
    const res = await call(catUser, privateId);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.users.map(u => u.email), ['cat@x']);
    assert.strictEqual((await call(admin, privateId)).statusCode, 403);
    assert.strictEqual((await call(ann, privateId)).statusCode, 403);
  });
  await t('bad input and a missing row', async () => {
    assert.strictEqual((await call(ann, 'x')).statusCode, 400);
    assert.strictEqual((await call(ann, patternId, 'bad app!')).statusCode, 400);
    assert.strictEqual((await call(ann, 99999999)).statusCode, 404);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
