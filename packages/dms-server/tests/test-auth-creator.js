/**
 * `creator` in the rule language, and named rule variants (planning/tasks/current/auth-rule-creator.md).
 *
 *   - `{ perms, creator: true }`: the verb, held by the row's CREATOR — its server-stamped `created_by`
 *     (on a create, the caller). A client can't supply it: `created_by` is a column the server writes
 *     from the verified user, never a key of `data`.
 *   - `fieldsFrom: 'rule'` on an edit spec: its byKey / default decide every key, ahead of a
 *     vocabulary's field claims.
 *   - `<kind>@<name>` rules in a format are VARIANTS, chosen for the rows beneath a row naming them
 *     (`data.ruleVariants: { <kind>: <name> }`). Unregistered → the kind's own rule (today).
 *     Changing `ruleVariants` on a stored row takes site `*`.
 *   - Rows under an env that names no variant are judged exactly as before.
 *
 * Generic: no pattern is named. Chat's use of it is checked in src/patterns/chat/tests/messageAuthor.server.mjs.
 *
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-auth-creator.js
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
process.env.DMS_DB_ENV = DMS_DB;
process.env.DMS_AUTH_MODE = 'enforce';
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { createTestGraph } = require('./graph');
const AUTH = require('../src/routes/auth');
const owners = require('../src/routes/auth/owners');
const formats = require('../src/routes/auth/formats');
const { judge } = require('../src/routes/auth/judge');
const { resolveTable } = require('../src/db/table-resolver');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 4).join('\n      ')}`); }
};
const refused = async (fn) => { try { await fn(); return false; } catch { return true; } };

const POST = ['edit-source-data'];
const AUTHOR = { perms: POST, creator: true };
// a variant of the `data` rule: the author edits and deletes; anyone who may post may react
const VARIANT = {
  owner: ['ancestor:dmsenv', 'ancestor:source'],
  appliesWhen: 'split',
  noChange: POST,
  ops: { create: POST, delete: AUTHOR, edit: { fieldsFrom: 'rule', byKey: { reactions: POST }, default: AUTHOR } },
};

async function run() {
  console.log('the judge:');
  const env = (holdsIt, creator) => ({
    user: { id: 5, authed: true }, grants: { o: { users: { 5: holdsIt ? POST : [] } } },
    holds: (ap, perms) => !!ap && perms.some(p => ((ap.users || {})[5] || []).includes(p)), isBlank: () => false, creator,
  });
  const rule = { owner: 'o', ops: { edit: { byKey: { reactions: POST }, default: AUTHOR }, delete: AUTHOR } };
  await t('creator: true needs the verb AND the creator; the reason says which', async () => {
    assert.strictEqual(judge(rule, env(true, true), { op: 'edit', keys: ['body'] }).allow, true);
    const d = judge(rule, env(true, false), { op: 'edit', keys: ['body'] });
    assert.strictEqual(d.allow, false);
    assert.match(d.reason, /as the row's creator/);
    assert.strictEqual(judge(rule, env(false, true), { op: 'edit', keys: ['body'] }).allow, false, 'the creator still needs the verb');
    assert.strictEqual(judge(rule, env(true, false), { op: 'edit', keys: ['reactions'] }).allow, true, 'byKey without creator');
    assert.strictEqual(judge(rule, env(true, false), { op: 'edit', keys: ['reactions', 'body'] }).allow, false, 'each key is judged');
    assert.strictEqual(judge(rule, env(true, false), { op: 'delete' }).allow, false);
  });
  await t('creator inside anyOf: either alternative', async () => {
    const r = { owner: 'o', ops: { edit: { default: { anyOf: [{ perms: POST, creator: true }, { perms: ['moderate'] }] } } } };
    assert.strictEqual(judge(r, env(true, true), { op: 'edit', keys: ['body'] }).allow, true);
    assert.strictEqual(judge(r, env(true, false), { op: 'edit', keys: ['body'] }).allow, false);
  });
  await t('no creator clause → `creator` is never read (every existing rule)', async () => {
    const r = { owner: 'o', ops: { '*': POST } };
    assert.strictEqual(judge(r, env(true, false), { op: 'edit', keys: ['body'] }).allow, true);
    assert.strictEqual(judge(r, { ...env(true, false), creator: undefined }, { op: 'delete' }).allow, true);
  });
  await t('fieldsFrom: rule → the vocabulary\'s claims are not read; without it they win (as before)', async () => {
    const maps = require('../src/routes/auth/vocabulary').fieldMaps({ descendants: [{ value: 'update-source', fields: ['*'] }, { value: 'edit-source-data' }] });
    const r = (extra) => ({ owner: 'o', ops: { edit: { byKey: { reactions: POST }, default: POST, ...extra } } });
    const opts = { op: 'edit', keys: ['reactions'], maps, scope: 'descendants' };
    assert.strictEqual(judge(r({}), env(true, true), opts).allow, false, 'the * claim asks update-source');
    assert.strictEqual(judge(r({ fieldsFrom: 'rule' }), env(true, true), opts).allow, true);
  });

  const { getDb, awaitReady } = require('../src/db');
  getDb(DMS_DB);
  await awaitReady();

  const APP = `creator_${Date.now()}`;
  const root = createTestGraph(DMS_DB, { user: { id: 1, authed: true, groups: [`${APP} Admin`] } });
  await root.ready;
  const insert = async (type, data) => +(await root.controller.createData([APP, type, data], null))[0].id;

  const A = { authed: true, id: 101, email: 'a@x', groups: ['Staff'] };
  const B = { authed: true, id: 102, email: 'b@x', groups: ['Staff'] };
  const admin = { authed: true, id: 190, email: 'admin@x', groups: [`${APP} Admin`] };
  const star = { authed: true, id: 191, email: 'star@x', groups: ['Stars'] };
  const g = Object.fromEntries(Object.entries({ A, B, admin, star }).map(([k, u]) => [k, createTestGraph(DMS_DB, { user: u })]));
  const call = (who, p, args) => g[who].callAsync(p, args);
  const newId = (r) => +Object.keys(r.jsonGraph.dms.data.byId).find(k => k !== '$__path');
  const create = async (who, type, data) => newId(await call(who, ['dms', 'data', 'create'], [APP, type, data]));
  const edit = (who, id, data, type) => call(who, ['dms', 'data', 'edit'], [APP, id, data, type]);
  const del = (who, type, id) => call(who, ['dms', 'data', 'delete'], [APP, type, id]);
  // a split row as stored: its data and its `created_by` column (the split table, by the source id)
  const sourceIds = new Map();
  const read = async (type, id) => {
    const db = getDb(DMS_DB);
    const { fullName } = resolveTable(APP, type, db.type, 'per-app', sourceIds.get(type));
    const { rows } = await db.query(`SELECT data, created_by FROM ${fullName} WHERE id = $1`, [id]);
    const r = rows[0];
    return { created_by: r ? r.created_by : undefined, data: r && (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) };
  };

  // a site, two envs granting Staff the same verbs; one names the variant for its data rows
  const staff = { groups: { Staff: ['view-source', 'create-source', 'edit-source-data'], Stars: ['*'] }, users: {} };
  await insert('prod:site', { site_name: 'creator test', authPermissions: { groups: { Stars: ['*'] }, users: {} } });
  const teamEnv = await insert('prod|team_env:dmsenv', { name: 'team', authPermissions: staff, ruleVariants: { data: 'author_only' } });
  await insert('prod|plain_env:dmsenv', { name: 'plain', authPermissions: staff });
  const source = async (envSlug, slug, extra = {}) => {
    const sid = await insert(`${envSlug}|${slug}:source`, { name: slug, auth_permissions: {}, ...extra });
    const vid = await insert(`${slug}|v1:view`, { name: 'v1', source_id: sid });
    sourceIds.set(`${slug}|${vid}:data`, sid);
    return { sid, type: `${slug}|${vid}:data` };
  };
  const team = await source('team_env', 'notes');
  const plain = await source('plain_env', 'table');
  owners.clearSnapshots(); formats.clearFormats();

  console.log('\nbefore the variant is registered: today\'s rule everywhere');
  let a1;
  await t('B edits A\'s row under the opting-in env (the variant is unknown, so the shared `data` rule answers)', async () => {
    a1 = await create('A', team.type, { body: 'hello' });
    await edit('B', a1, { body: 'rewritten by B' }, team.type);
    assert.strictEqual((await read(team.type, a1)).data.body, 'rewritten by B');
  });

  console.log('\nregistered: the built-in declarations plus a format declaring `data@author_only`');
  await t('register the formats (emit-formats.mjs + one extra row)', async () => {
    const emitted = JSON.parse(execFileSync('node', [path.resolve(__dirname, '../../dms/scripts/emit-formats.mjs')], { encoding: 'utf8' }));
    const rows = [...emitted, { type: 'test+notes', attributes: null, authVocabulary: null, authRules: { 'data@author_only': VARIANT }, childRefs: null }];
    const r = await formats.upsertFormats(APP, rows);
    assert.ok(r.written.includes('test+notes') && r.written.includes('admin+dmsenv'));
    const snap = await formats.formatsFor(APP, { fresh: true });
    assert.ok(snap.rules['data@author_only'] && snap.rules.data, 'both declared, under their own keys');
    assert.ok(snap.byKind.get('dmsenv').vocabulary, 'the env vocabulary is registered (its * claim is what fieldsFrom answers)');
  });

  let a2, b1;
  await t('A posts, edits and soft-deletes their own row', async () => {
    a2 = await create('A', team.type, { body: 'mine', reactions: [] });
    await edit('A', a2, { body: 'mine, edited', edited_at: 1 }, team.type);
    assert.strictEqual((await read(team.type, a2)).data.body, 'mine, edited');
    await edit('A', a2, { deleted_at: 2, body: '' }, team.type);
    assert.strictEqual((await read(team.type, a2)).data.deleted_at, 2);
  });
  await t('created_by is the server\'s: A is the creator of what A posted', async () => {
    assert.strictEqual(String((await read(team.type, a2)).created_by), String(A.id));
  });
  await t('B is refused A\'s body, deleted_at and author; and a hard delete', async () => {
    a2 = await create('A', team.type, { body: 'A again', author: { user_id: A.id } });
    assert.ok(await refused(() => edit('B', a2, { body: 'nope' }, team.type)), 'body');
    assert.ok(await refused(() => edit('B', a2, { deleted_at: 3, body: '' }, team.type)), 'soft delete');
    assert.ok(await refused(() => edit('B', a2, { author: { user_id: B.id } }, team.type)), 'author');
    assert.ok(await refused(() => edit('B', a2, { body: 'x', reactions: [] }, team.type)), 'body beside a reaction');
    assert.ok(await refused(() => del('B', team.type, a2)), 'hard delete');
    assert.strictEqual((await read(team.type, a2)).data.body, 'A again');
  });
  await t('B may react on A\'s row (byKey, no creator)', async () => {
    await edit('B', a2, { reactions: [{ emoji: '👍', users: ['u:102'], count: 1 }] }, team.type);
    assert.strictEqual((await read(team.type, a2)).data.reactions[0].count, 1);
  });
  await t('an empty edit still needs the verb (noChange)', async () => {
    const outsider = createTestGraph(DMS_DB, { user: { id: 300, authed: true, groups: ['Nobody'] } });
    assert.ok(await refused(() => outsider.callAsync(['dms', 'data', 'edit'], [APP, a2, {}, team.type])));
  });
  await t('a client can\'t claim to be the creator: `created_by` in the payload is data, not the column', async () => {
    b1 = await create('B', team.type, { body: 'B says', created_by: A.id });
    assert.strictEqual(String((await read(team.type, b1)).created_by), String(B.id));
    assert.ok(await refused(() => edit('A', b1, { body: 'A rewrites B' }, team.type)));
    await edit('B', b1, { body: 'B edits B' }, team.type);
  });
  await t('A hard-deletes their own row', async () => {
    const id = await create('A', team.type, { body: 'gone' });
    await del('A', team.type, id);
    assert.strictEqual((await read(team.type, id)).created_by, undefined);
  });
  await t('<app> Admin follows the admin rule (allowed); a site/env `*` holder is not the creator (refused)', async () => {
    await edit('admin', b1, { body: 'admin edits' }, team.type);
    assert.ok(await refused(() => edit('star', b1, { body: 'star edits' }, team.type)));
  });

  console.log('\nevery other dataset: unchanged');
  await t('under the env naming no variant, B still edits and deletes A\'s row', async () => {
    const id = await create('A', plain.type, { body: 'plain' });
    await edit('B', id, { body: 'B edits A' }, plain.type);
    assert.strictEqual((await read(plain.type, id)).data.body, 'B edits A');
    await del('B', plain.type, id);
  });
  await t('ruleFor: the variant only under the opting-in env; the kind\'s rule elsewhere', async () => {
    const snap = await owners.appSnapshot(APP, { fresh: true });
    const under = owners.wrap({ id: 1, type: team.type, data: {} }, APP);
    const other = owners.wrap({ id: 2, type: plain.type, data: {} }, APP);
    assert.strictEqual(owners.ruleFor(snap, under).variant, 'author_only');
    assert.deepStrictEqual(owners.ruleFor(snap, other).rule, snap.formats.rules.data);
    // the row itself naming a variant changes nothing: only ancestors are read
    const self = owners.wrap({ id: 3, type: plain.type, data: { ruleVariants: { data: 'author_only' } } }, APP);
    assert.strictEqual(owners.ruleFor(snap, self).variant, undefined);
  });

  console.log('\nwho may name a variant');
  await t('changing an env\'s ruleVariants: refused for a create-source holder, allowed for site * and <app> Admin', async () => {
    assert.ok(await refused(() => edit('A', teamEnv, { ruleVariants: {} })), 'Staff clears it');
    assert.ok(await refused(() => edit('A', teamEnv, { ruleVariants: { data: 'other' } })), 'Staff changes it');
    await edit('star', teamEnv, { ruleVariants: { data: 'author_only', view: 'x' } });
    await edit('admin', teamEnv, { ruleVariants: { data: 'author_only' } });
    await edit('A', teamEnv, { name: 'team, renamed' });    // the env's other fields: as before
  });
  await t('a source naming an unknown variant beneath the env does not shadow it', async () => {
    const odd = await source('team_env', 'odd', { ruleVariants: { data: 'nothing_declared' } });
    owners.clearSnapshots();
    const id = await create('A', odd.type, { body: 'odd' });
    assert.ok(await refused(() => edit('B', id, { body: 'B' }, odd.type)));
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
