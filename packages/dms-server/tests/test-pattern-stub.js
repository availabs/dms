/**
 * Regression tests for the no-access pattern stub
 * (planning/tasks/current/no-access-stub-default-theme.md).
 *
 * When a byId GET for a restricted pattern fails the server-side auth check,
 * the route returns a minimal stub so the client can still build the route and
 * redirect to login. That stub MUST include `theme` — omitting it made every
 * transient auth failure render the site with the default theme (and the
 * login redirect unbranded). `config` stays out (schema info, not needed for
 * routing/branding).
 *
 * Run: node tests/test-pattern-stub.js
 */
const assert = require('assert');
const { createTestGraph } = require('./graph');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';
const TEST_APP = 'stub-test-' + Date.now();
const PATTERN_TYPE = 'prod|dash:pattern';

const THEME = {
  selectedTheme: 'brand',
  layout: { options: { topNav: { size: 'compact' } } },
};
const AUTH = { groups: { 'Site Admin': ['*'], public: [] }, users: {} };

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

  // Seed a restricted, themed pattern row
  const createResult = await admin.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, PATTERN_TYPE, {
      name: 'Dash',
      base_url: '/',
      pattern_type: 'page',
      subdomain: '*',
      theme: THEME,
      config: { attributes: [{ key: 'secret-schema' }] },
      authPermissions: AUTH,
    }]
  );
  const id = Object.keys(createResult.jsonGraph?.dms?.data?.byId || {})[0];
  assert(id, 'pattern row created');

  const reqPaths = [['dms', 'data', TEST_APP, 'byId', id, ['data', 'type']]];
  const readData = (res) =>
    res.jsonGraph?.dms?.data?.[TEST_APP]?.byId?.[id]?.data?.value;

  // --- Anonymous request → stub ---
  const anon = createTestGraph(DB_NAME, { user: null });
  await anon.ready;
  const anonData = readData(await anon.getAsync(reqPaths));

  console.log('anonymous request for a restricted pattern:');
  t('returns the no-access stub', () =>
    assert.strictEqual(anonData?.id, 'no-access'));
  t('stub keeps routing info (base_url, pattern_type)', () => {
    assert.strictEqual(anonData?.base_url, '/');
    assert.strictEqual(anonData?.pattern_type, 'page');
  });
  t('stub includes theme (branded login redirect, no default-theme flash)', () =>
    assert.deepStrictEqual(anonData?.theme, THEME));
  t('stub still omits config', () =>
    assert.strictEqual(anonData?.config, undefined));

  // --- Anonymous request for ONLY `data` (no `type`) → still the stub ---
  // The auth check keys off row.type; when the caller doesn't request `type`
  // the row used to come back without it, skipping the check entirely and
  // leaking full restricted data to anonymous callers.
  const dataOnly = readData(
    await anon.getAsync([['dms', 'data', TEST_APP, 'byId', id, 'data']]));
  console.log('anonymous request for only [data] (auth-check bypass probe):');
  t('still returns the stub, not full data', () => {
    assert.strictEqual(dataOnly?.id, 'no-access');
    assert.strictEqual(dataOnly?.config, undefined);
    assert.deepStrictEqual(dataOnly?.theme, THEME);
  });

  // --- Logged-in but unauthorized user → same stub shape ---
  const stranger = createTestGraph(DB_NAME, {
    user: { id: 99, email: 'rando@test.com', groups: ['Rando'], authed: true },
  });
  await stranger.ready;
  const strangerData = readData(await stranger.getAsync(reqPaths));

  console.log('logged-in but unauthorized user:');
  t('returns the stub with theme', () => {
    assert.strictEqual(strangerData?.id, 'no-access');
    assert.deepStrictEqual(strangerData?.theme, THEME);
  });

  // --- Permitted user → full data (control) ---
  const permittedData = readData(await admin.getAsync(reqPaths));
  console.log('permitted user (control):');
  t('gets full pattern data with theme and config', () => {
    assert.notStrictEqual(permittedData?.id, 'no-access');
    assert.deepStrictEqual(permittedData?.theme, THEME);
    assert.deepStrictEqual(permittedData?.config, { attributes: [{ key: 'secret-schema' }] });
  });

  // Cleanup
  await admin.callAsync(['dms', 'data', 'delete'], [TEST_APP, PATTERN_TYPE, id]);

  console.log(`\npattern-stub tests: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
