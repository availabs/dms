/**
 * Grant stripping when a user or a group leaves a site (auth/utils/siteGrants.js; tasks
 * permissions-auth-users-and-signup and permissions-auth-groups): the entry leaves every well-formed
 * grant shape (object / string, plain / per-subdomain, `authPermissions` and an internal source's
 * `auth_permissions`) in the representation it was stored in; other entries stay; malformed grants and
 * grants under a key the row's kind doesn't read are reported, never rewritten; each write lands in
 * change_log and reaches the notify hook; a row edited between read and write is re-read.
 *
 * Run: DMS_TEST_DB=cli-test node tests/test-site-grants.js   (SQLite; the controller's real write path)
 */
const assert = require('assert');
const { createController } = require('../src/routes/dms/dms.controller');
const { createSiteGrants, stripEntry, readGrants } = require('../src/auth/utils/siteGrants');

const DB_NAME = process.env.DMS_TEST_DB || 'cli-test';
const APP = 'sitegrants' + Date.now();

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`); }
};
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const U7 = { users: 7 };
const ED = { groups: 'Editors' };

async function main() {
  console.log('stripEntry / readGrants:');
  await t('plain object: full value, or a null-deleting merge patch; users and groups', async () => {
    const ap = { groups: { Editors: ['edit-page'], G: ['*'] }, users: { 7: ['edit-page'], 8: ['*'] } };
    assert.deepStrictEqual(stripEntry(ap, U7), { groups: ap.groups, users: { 8: ['*'] } });
    assert.deepStrictEqual(stripEntry(ap, U7, { mergePatch: true }), { users: { 7: null } });
    assert.deepStrictEqual(stripEntry(ap, ED), { groups: { G: ['*'] }, users: ap.users });
    assert.deepStrictEqual(stripEntry(ap, ED, { mergePatch: true }), { groups: { Editors: null } });
    assert.strictEqual(stripEntry(ap, { users: 9 }), null);
  });
  await t('string value: stays a string, replaced whole in both modes', async () => {
    const ap = JSON.stringify({ groups: { Editors: ['x'] }, users: { 7: ['x'] } });
    const out = stripEntry(ap, U7, { mergePatch: true });
    assert.strictEqual(typeof out, 'string');
    assert.deepStrictEqual(JSON.parse(out), { groups: { Editors: ['x'] }, users: {} });
  });
  await t('per-subdomain: only the entries naming them, each in its own representation', async () => {
    const ap = { '*': { users: { 7: ['x'] } }, songs: JSON.stringify({ users: { 7: ['y'], 8: ['z'] } }), other: { users: { 8: ['z'] } } };
    const full = stripEntry(ap, U7);
    assert.deepStrictEqual(full['*'], { users: {} });
    assert.strictEqual(typeof full.songs, 'string');
    assert.deepStrictEqual(JSON.parse(full.songs), { users: { 8: ['z'] } });
    assert.deepStrictEqual(full.other, { users: { 8: ['z'] } });
    const patch = stripEntry(ap, U7, { mergePatch: true });
    assert.deepStrictEqual(patch['*'], { users: { 7: null } });
    assert.ok(!('other' in patch));
  });
  await t('readGrants: empty defaults vs malformed shapes', async () => {
    for (const v of [null, '', [], '[]']) assert.ok(readGrants(v).empty, JSON.stringify(v));
    for (const v of ['{bad', { 'undefined Admin': ['*'] }, { groups: { G: '*' } }, { groups: [] }, 5,
                     { '*': { groups: { G: 'x' } } }]) {
      assert.ok(readGrants(v).malformed, JSON.stringify(v));
    }
    assert.ok(!readGrants({ groups: {}, users: {} }).malformed);
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
  const pattern = await make('main|docs:pattern', { pattern_type: 'page', authPermissions: JSON.stringify({ groups: { Editors: ['edit-page'], Keep: ['x'] }, users: { 7: ['*'], 8: ['edit-page'] } }) });
  const page = await make('docs|page', { title: 'P', authPermissions: { groups: { Editors: ['edit-page'] }, users: { 7: ['edit-page'], 9: ['edit-page'] } } });
  const subPage = await make('docs|page', { title: 'S', authPermissions: { '*': { users: { 7: ['x'] } }, songs: { users: { 8: ['y'] } } } });
  const source = await make('env|data_src:source', { name: 'src', auth_permissions: { groups: { Editors: ['update-source'] }, users: { 7: ['update-source'] } } });
  const untouched = await make('docs|page', { title: 'U', authPermissions: { users: { 8: ['edit-page'] } } });
  const malformed = await make('docs|page', { title: 'M', authPermissions: { 'undefined Admin': ['*'], 7: ['x'] } });
  const wrongKey = await make('docs|page', { title: 'W', auth_permissions: { users: { 7: ['x'] } } });
  const emptyDefault = await make('docs|page', { title: 'E', authPermissions: [] });

  const rowData = async (id) => parse((await ctrl.getRowsForWrite([id], APP))[0].data);
  const rowText = async (id) => (await ctrl.getRowsForWrite([id], APP))[0].data_text;

  await t('lists the rows naming the user; reports malformed and wrong-key rows instead', async () => {
    const { grants, skipped } = await sg.listSiteGrants(APP, U7);
    assert.deepStrictEqual(grants.map(g => g.id).sort((a, b) => a - b), [pattern, page, subPage, source].sort((a, b) => a - b));
    const sk = Object.fromEntries(skipped.map(s => [s.id, s.reason]));
    assert.ok(/not \{ groups, users \}/.test(sk[malformed]), sk[malformed]);
    assert.ok(/auth_permissions is not read on a page/.test(sk[wrongKey]), sk[wrongKey]);
    assert.ok(!(emptyDefault in sk));
  });

  await t('strips a user from every shape, each row keeping its representation; logged and notified', async () => {
    const before = { malformed: await rowText(malformed), wrongKey: await rowText(wrongKey), empty: await rowText(emptyDefault) };
    notified.length = 0;
    const { written, skipped } = await sg.stripSiteGrants(APP, U7, { id: 1 });
    assert.strictEqual(written.length, 4);
    assert.strictEqual(skipped.length, 2);
    const p = await rowData(pattern);
    assert.strictEqual(typeof p.authPermissions, 'string', 'a string stays a string');
    assert.deepStrictEqual(JSON.parse(p.authPermissions), { groups: { Editors: ['edit-page'], Keep: ['x'] }, users: { 8: ['edit-page'] } });
    assert.deepStrictEqual((await rowData(page)).authPermissions, { groups: { Editors: ['edit-page'] }, users: { 9: ['edit-page'] } });
    const sub = (await rowData(subPage)).authPermissions;
    assert.deepStrictEqual(sub['*'], { users: {} });
    assert.deepStrictEqual(sub.songs, { users: { 8: ['y'] } });
    assert.deepStrictEqual((await rowData(source)).auth_permissions, { groups: { Editors: ['update-source'] }, users: {} });
    assert.deepStrictEqual((await rowData(untouched)).authPermissions.users, { 8: ['edit-page'] });
    assert.strictEqual(await rowText(malformed), before.malformed, 'malformed row untouched');
    assert.strictEqual(await rowText(wrongKey), before.wrongKey, 'wrong-key row untouched');
    assert.strictEqual(await rowText(emptyDefault), before.empty, 'empty default untouched');
    assert.strictEqual(notified.filter(n => n.app === APP && n.msg.action === 'U').length, 4);
    assert.strictEqual((await sg.listSiteGrants(APP, U7)).grants.length, 0, 'nothing left to strip');
  });

  await t('strips a group by name; other groups and users stay', async () => {
    const { written } = await sg.stripSiteGrants(APP, ED, { id: 1 });
    assert.deepStrictEqual(written.map(w => w.id).sort((a, b) => a - b), [pattern, page, source].sort((a, b) => a - b));
    assert.deepStrictEqual(JSON.parse((await rowData(pattern)).authPermissions).groups, { Keep: ['x'] });
    assert.deepStrictEqual((await rowData(page)).authPermissions, { groups: {}, users: { 9: ['edit-page'] } });
    assert.deepStrictEqual((await rowData(source)).auth_permissions.groups, {});
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
    try { await sg.stripSiteGrants(APP, U7, { id: 1 }); } finally { ctrl.setDataById = real; }
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
