/**
 * "Remove from site" grant stripping (auth/utils/siteGrants.js, task permissions-auth-users-and-signup):
 * a user's own entry leaves every grant shape (object / string, plain / per-subdomain, `authPermissions`
 * and an internal source's `auth_permissions`), other entries stay, each write lands in change_log and
 * reaches the notify hook, and a row edited between read and write is re-read.
 *
 * Run: DMS_TEST_DB=cli-test node tests/test-site-grants.js   (SQLite; the controller's real write path)
 */
const assert = require('assert');
const { createController } = require('../src/routes/dms/dms.controller');
const { createSiteGrants, stripUser } = require('../src/auth/utils/siteGrants');

const DB_NAME = process.env.DMS_TEST_DB || 'cli-test';
const APP = 'sitegrants' + Date.now();

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`); }
};
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

async function main() {
  console.log('stripUser:');
  await t('plain object: full value, or a null-deleting merge patch', async () => {
    const ap = { groups: { G: ['*'] }, users: { 7: ['edit-page'], 8: ['*'] } };
    assert.deepStrictEqual(stripUser(ap, 7), { groups: { G: ['*'] }, users: { 8: ['*'] } });
    assert.deepStrictEqual(stripUser(ap, 7, { mergePatch: true }), { users: { 7: null } });
    assert.strictEqual(stripUser(ap, 9), null);
  });
  await t('string value: replaced whole in both modes', async () => {
    const ap = JSON.stringify({ users: { 7: ['x'] } });
    assert.deepStrictEqual(JSON.parse(stripUser(ap, 7, { mergePatch: true })), { users: {} });
  });
  await t('per-subdomain: only the entries naming the user', async () => {
    const ap = { '*': { users: { 7: ['x'] } }, songs: JSON.stringify({ users: { 7: ['y'], 8: ['z'] } }), other: { users: { 8: ['z'] } } };
    const full = stripUser(ap, 7);
    assert.deepStrictEqual(full['*'], { users: {} });
    assert.deepStrictEqual(JSON.parse(full.songs), { users: { 8: ['z'] } });
    assert.deepStrictEqual(full.other, { users: { 8: ['z'] } });
    const patch = stripUser(ap, 7, { mergePatch: true });
    assert.deepStrictEqual(patch['*'], { users: { 7: null } });
    assert.ok(!('other' in patch));
  });

  console.log(`controller (${DB_NAME}):`);
  const ctrl = createController(DB_NAME);
  const notified = [];
  ctrl.setNotifyChange((app, msg) => notified.push({ app, msg }));
  const sg = createSiteGrants({ getController: () => ctrl });

  const make = async (type, data) => {
    const [row] = await ctrl.createData([APP, type, data], { id: 1 });
    return row.id;
  };
  const pattern = await make('main|docs:pattern', { pattern_type: 'page', authPermissions: JSON.stringify({ groups: { Ed: ['edit-page'] }, users: { 7: ['*'], 8: ['edit-page'] } }) });
  const page = await make('docs|page', { title: 'P', authPermissions: { groups: {}, users: { 7: ['edit-page'], 9: ['edit-page'] } } });
  const subPage = await make('docs|page', { title: 'S', authPermissions: { '*': { users: { 7: ['x'] } }, songs: { users: { 8: ['y'] } } } });
  const source = await make('env|data_src:source', { name: 'src', auth_permissions: { users: { 7: ['update-source'] } } });
  const untouched = await make('docs|page', { title: 'U', authPermissions: { users: { 8: ['edit-page'] } } });

  const rowData = async (id) => parse((await ctrl.getRowsForWrite([id], APP))[0].data);

  await t('lists exactly the rows that name the user', async () => {
    const ids = (await sg.listSiteGrants(APP, 7)).map(g => g.id).sort((a, b) => a - b);
    assert.deepStrictEqual(ids, [pattern, page, subPage, source].sort((a, b) => a - b));
  });

  await t('strips every shape; other users and groups stay; logged and notified', async () => {
    notified.length = 0;
    const written = await sg.stripSiteGrants(APP, 7, { id: 1 });
    assert.strictEqual(written.length, 4);
    assert.deepStrictEqual(parse((await rowData(pattern)).authPermissions), { groups: { Ed: ['edit-page'] }, users: { 8: ['edit-page'] } });
    assert.deepStrictEqual((await rowData(page)).authPermissions.users, { 9: ['edit-page'] });
    const sub = (await rowData(subPage)).authPermissions;
    assert.deepStrictEqual(sub['*'].users, {});
    assert.deepStrictEqual(sub.songs.users, { 8: ['y'] });
    assert.deepStrictEqual((await rowData(source)).auth_permissions.users, {});
    assert.deepStrictEqual((await rowData(untouched)).authPermissions.users, { 8: ['edit-page'] });
    assert.strictEqual(notified.filter(n => n.app === APP && n.msg.action === 'U').length, 4);
    assert.strictEqual((await sg.listSiteGrants(APP, 7)).length, 0, 'nothing left to strip');
  });

  await t('a row changed between read and write is re-read, the change kept', async () => {
    const id = await make('docs|page', { title: 'R', authPermissions: { users: { 7: ['x'], 8: ['y'] } } });
    const real = ctrl.setDataById;
    let first = true;
    ctrl.setDataById = async (...args) => {
      if (first) {
        first = false;
        await real(id, { title: 'R2' }, { id: 2 }, APP); // someone else's edit lands first
      }
      return real(...args);
    };
    try { await sg.stripSiteGrants(APP, 7, { id: 1 }); } finally { ctrl.setDataById = real; }
    const d = await rowData(id);
    assert.strictEqual(d.title, 'R2');
    assert.deepStrictEqual(d.authPermissions.users, { 8: ['y'] });
  });

  const all = (await ctrl.getRowsWithGrants(APP)).map(r => r.id);
  await ctrl.deleteData(APP, 'docs|page', all, { id: 1 }).catch(() => {});
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
