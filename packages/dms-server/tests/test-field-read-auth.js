/**
 * Field-level reads are judged on the stored row, not the reply's projection
 * (planning/tasks/current/auth-field-read-row-shape.md).
 *
 * A by-id read of single fields (`data ->> 'title'`, `data ->> 'parent'`) used to hand `authorize()` the
 * projected row: a page's nav `data.parent` arrived as a top-level `parent`, which the walk took for the
 * loaded row above it and crashed on (a denial), and the row's own grants were never seen. Logged out,
 * only top-level pages of a public pattern were readable, and a page narrowing itself was readable field
 * by field.
 *
 * Run: node tests/test-field-read-auth.js
 */
const assert = require('assert');
const { createTestGraph } = require('./graph');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';
const TEST_APP = 'fieldread-test-' + Date.now();
const INSTANCE = 'docs';
const PATTERN_TYPE = `prod|${INSTANCE}:pattern`;
const PAGE_TYPE = `${INSTANCE}|page`;

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

async function main() {
  const admin = createTestGraph(DB_NAME, {
    user: { id: 1, email: 'admin@test.com', groups: ['Site Admin'], authed: true },
  });
  await admin.ready;
  console.log(`Database: ${DB_NAME} (${admin.dbType})  app: ${TEST_APP}\n`);

  const create = async (type, data) => {
    const res = await admin.callAsync(['dms', 'data', 'create'], [TEST_APP, type, data]);
    const id = Object.keys(res.jsonGraph?.dms?.data?.byId || {})[0];
    assert(id, `${type} row created`);
    return id;
  };

  // A public pattern: everyone may view its pages
  await create(PATTERN_TYPE, {
    name: 'Docs', base_url: '/', pattern_type: 'page', subdomain: '*',
    authPermissions: { groups: { 'Site Admin': ['*'], public: ['view-page'] }, users: {} },
  });
  const topId = await create(PAGE_TYPE, { title: 'Top', url_slug: 'top', parent: '', index: 0 });
  const childId = await create(PAGE_TYPE, { title: 'Child', url_slug: 'top/child', parent: topId, index: 0 });
  // A page narrowing itself to its own grantees (`view: false`)
  const privateId = await create(PAGE_TYPE, {
    title: 'Private', url_slug: 'private', parent: '', index: 1,
    authPermissions: { view: false, groups: { 'Site Admin': ['*'] }, users: {} },
  });

  const anon = createTestGraph(DB_NAME, { user: null });
  await anon.ready;
  const FIELDS = ["data ->> 'title'", "data ->> 'parent'"];
  const read = async (id, atts) => {
    const res = await anon.getAsync([['dms', 'data', TEST_APP, 'byId', id, atts]]);
    return res.jsonGraph?.dms?.data?.[TEST_APP]?.byId?.[id] || {};
  };

  const top = await read(topId, FIELDS);
  const child = await read(childId, FIELDS);
  const childData = await read(childId, ['data', 'type']);
  const priv = await read(privateId, FIELDS);
  const privData = await read(privateId, ['data', 'type']);

  console.log('logged out, public pattern:');
  t('a top-level page reads field by field', () =>
    assert.strictEqual(top["data ->> 'title'"], 'Top'));
  t('a child page reads field by field (its nav parent is not a position on the walk)', () =>
    assert.strictEqual(child["data ->> 'title'"], 'Child'));
  t('the child page\'s nav parent comes back as data', () =>
    assert.strictEqual(String(child["data ->> 'parent'"]), String(topId)));
  t('the child page reads as whole data', () =>
    assert.notStrictEqual(childData.data, 'no-access'));

  console.log('\nlogged out, a page narrowing itself (view: false):');
  t('refused field by field (its own grants are judged)', () =>
    assert.strictEqual(priv["data ->> 'title'"], 'no-access'));
  t('refused as whole data, the same answer', () =>
    assert.strictEqual(privData.data, 'no-access'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
