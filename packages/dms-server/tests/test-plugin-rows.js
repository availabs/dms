/**
 * The plugin row kinds (dms-plugin-system.md, P1 step 4), through the dms.data write routes:
 *   - `plugin` (an install record) is server-only: every caller of the general write path is refused, the app
 *     admin included, under `log` as under `enforce` (rules.js `serverOnly`, routes/auth/index.js);
 *   - `plugin_activation` needs `activate-plugins` on the site row under `enforce`; reads stay open;
 *   - the site row's `plugin_activations` list is governed by `activate-plugins` (its `fields`).
 *
 * Database: DMS_TEST_DB=dms-sqlite-test (default) or dms-postgres-test.
 */
const DMS_DB = process.env.DMS_TEST_DB || 'dms-sqlite-test';
process.env.DMS_DB_ENV = DMS_DB;
const assert = require('assert');
const { createTestGraph } = require('./graph');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};
async function withMode(mode, fn) {
  const prev = process.env.DMS_AUTH_MODE;
  const warn = console.warn;
  process.env.DMS_AUTH_MODE = mode;
  console.warn = (...a) => { const s = a.join(' '); if (!s.includes('would-deny')) warn(...a); };
  try { return await fn(); }
  finally { console.warn = warn; if (prev === undefined) delete process.env.DMS_AUTH_MODE; else process.env.DMS_AUTH_MODE = prev; }
}
async function outcome(promise) {
  try {
    const res = await promise;
    const s = JSON.stringify(res || {});
    return s.includes('"$type":"error"') ? s : null;
  } catch (e) { return (e && (e.message || JSON.stringify(e))) || 'error'; }
}
const refused = async (p) => { const m = await outcome(p); assert(m !== null, 'expected a refusal, the write went through'); };
const allowed = async (p) => { const m = await outcome(p); assert(m === null, `expected success, got: ${m && m.slice(0, 300)}`); };

async function run() {
  const { getDb, awaitReady } = require('../src/db');
  getDb(DMS_DB);
  await awaitReady();

  const APP = `pluginrows_${Date.now()}`;
  const u = (id, groups) => ({ authed: true, id, email: `${id}@x`, groups });
  const stranger = u(10, []);
  const activator = u(11, ['Activators']);
  const installer = u(12, ['Installers']);
  const admin = u(18, [`${APP} Admin`]);
  const graphs = {};
  const as = (user) => graphs[user ? user.id : 'anon'] || (graphs[user ? user.id : 'anon'] = createTestGraph(DMS_DB, { user }));
  const call = (user, path, args) => as(user).callAsync(path, args);
  const create = (user, type, data = {}) => call(user, ['dms', 'data', 'create'], [APP, type, data]);
  const edit = (user, id, data) => call(user, ['dms', 'data', 'edit'], [APP, id, data]);
  const idOf = (res) => +Object.keys(res.jsonGraph.dms.data.byId)[0];

  // the site row with its own verbs (as emit-auth-vocabulary derives them) and grants
  const SITE_SELF = [
    { value: 'install-plugins', implies: [] },
    { value: 'activate-plugins', implies: ['read', 'edit'], fields: ['plugin_activations'] },
  ];
  const siteRow = await withMode('log', async () => idOf(await create(admin, 'site:site', {
    site_name: 'Site', patterns: [],
    authPermissions: { groups: { Activators: ['activate-plugins'], Installers: ['install-plugins'] } },
    authVocabulary: { self: SITE_SELF, descendants: [] },
  })));
  for (const user of [stranger, activator, installer, admin]) await as(user).ready;

  console.log('\nplugin (install record): server-only');
  for (const mode of ['log', 'enforce']) {
    await t(`${mode}: refused to the app admin`, () => withMode(mode, () => refused(create(admin, 'site|now_playing:plugin', { name: 'now_playing' }))));
    await t(`${mode}: refused to a holder of install-plugins`, () => withMode(mode, () => refused(create(installer, 'site|now_playing:plugin', { name: 'now_playing' }))));
    await t(`${mode}: refused to a stranger`, () => withMode(mode, () => refused(create(stranger, 'site|now_playing:plugin', { name: 'now_playing' }))));
  }

  console.log('\nplugin_activation: activate-plugins on the site row');
  let activation = null;
  await t('enforce: refused without the verb', () => withMode('enforce', () => refused(create(stranger, 'site|now_playing:plugin_activation', { plugin: 'now_playing', enabled: true }))));
  await t('enforce: allowed with activate-plugins', () => withMode('enforce', async () => {
    const res = await create(activator, 'site|now_playing:plugin_activation', { plugin: 'now_playing', enabled: true });
    activation = idOf(res);
    assert(activation > 0, 'no id');
  }));
  await t('enforce: switching it off needs the verb too', () => withMode('enforce', async () => {
    await refused(edit(stranger, activation, { enabled: false }));
    await allowed(edit(activator, activation, { enabled: false }));
  }));
  await t('enforce: the site\'s plugin_activations list is governed by activate-plugins', () => withMode('enforce', async () => {
    await refused(edit(stranger, siteRow, { plugin_activations: [{ id: activation }] }));
    await allowed(edit(activator, siteRow, { plugin_activations: [{ id: activation }] }));
  }));
  await t('reads of an activation stay open (every page of the site reads them)', async () => {
    const res = await as(null).getAsync([['dms', 'data', APP, 'byId', activation, 'data']]);
    const data = res.jsonGraph.dms.data[APP].byId[activation].data;
    const d = typeof data === 'string' ? JSON.parse(data) : (data && data.value) || data;
    assert(d && d.plugin === 'now_playing', `got ${JSON.stringify(data).slice(0, 200)}`);
  });

  // P2 step 5: the activation write check (routes/dms/write-checks.js, plugins/store.js activationWriteCheck),
  // through the real create / edit / massedit routes, against a plugins folder holding hello 1.0.0
  console.log('\nplugin_activation: the version must be installed (write check)');
  const fs = require('fs'), os = require('os'), path = require('path');
  const pdir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-rows-'));
  fs.mkdirSync(path.join(pdir, 'hello', '1.0.0'), { recursive: true });
  // hello 1.0.0 uses its schema and takes no settings; 2.0.0 (installed, not current) adds an egress host and settings
  fs.writeFileSync(path.join(pdir, 'hello', '1.0.0', 'index.json'), JSON.stringify({ name: 'hello', version: '1.0.0', permissions: { schemas: ['hello'] }, files: [] }));
  fs.writeFileSync(path.join(pdir, 'hello', '1.0.0', '.dms-release.json'), '{}');
  fs.mkdirSync(path.join(pdir, 'hello', '2.0.0'), { recursive: true });
  fs.writeFileSync(path.join(pdir, 'hello', '2.0.0', 'index.json'), JSON.stringify({
    name: 'hello', version: '2.0.0', permissions: { schemas: ['hello'], egress: ['api.example.com'] },
    settings: { properties: { station: { type: 'string', enum: ['wamc', 'wnyc'] } } }, files: [] }));
  fs.writeFileSync(path.join(pdir, 'hello', '2.0.0', '.dms-release.json'), '{}');
  fs.writeFileSync(path.join(pdir, 'hello', 'current.json'), JSON.stringify({ version: '1.0.0' }));
  require('../src/routes/dms/write-checks').registerWriteCheck('plugin_activation', require('../src/plugins/store').activationWriteCheck({ dir: pdir }));
  const rowData = async (id) => {
    const res = await as(admin).getAsync([['dms', 'data', APP, 'byId', id, 'data']]);
    const raw = res.jsonGraph.dms.data[APP].byId[id].data;
    return typeof raw === 'string' ? JSON.parse(raw) : (raw && raw.value) || raw;
  };
  const versionOf = async (id) => (await rowData(id))?.version;
  let hello = null;
  await t('a version not installed is refused, whoever writes it (the app admin)', () => refused(create(admin, 'site|hello:plugin_activation', { plugin: 'hello', enabled: true, version: '9.9.9' })));
  await t('no version: the current installed one is written', async () => {
    hello = idOf(await create(admin, 'site|hello:plugin_activation', { plugin: 'hello', enabled: true }));
    assert.strictEqual(await versionOf(hello), '1.0.0');
  });
  await t('an edit to a version not installed is refused; the stored one stays', async () => {
    await refused(edit(admin, hello, { version: '9.9.9' }));
    assert.strictEqual(await versionOf(hello), '1.0.0');
    await allowed(edit(admin, hello, { enabled: false }));
  });
  await t('a mass edit of version is refused', () => refused(call(admin, ['dms', 'data', 'massedit'], [APP, 'site|hello:plugin_activation', 'version', [{ id: hello, value: '9.9.9' }]])));
  await t('a plugin not installed (compiled into the app) needs no version', async () => {
    const id = idOf(await create(admin, 'site|mapeditor:plugin_activation', { plugin: 'mapeditor', enabled: true }));
    assert.strictEqual(await versionOf(id), undefined);
  });

  // the hub admin's writer (plugins/activations.js, behind /tenants/:tenant/plugins): the same check, and a new
  // activation is created under the site row and listed on it
  console.log('\nplugins/activations.js: the hub admin\'s writer');
  process.env.DMS_DB_ENV = DMS_DB;
  const activations = require('../src/plugins/activations');
  const siteData = async () => {
    const res = await as(admin).getAsync([['dms', 'data', APP, 'byId', siteRow, 'data']]);
    const raw = res.jsonGraph.dms.data[APP].byId[siteRow].data;
    return typeof raw === 'string' ? JSON.parse(raw) : (raw && raw.value) || raw;
  };
  await t('describe: the installed plugins and the site\'s activation rows', async () => {
    const d = await activations.describe(APP, { dir: pdir });
    assert.deepStrictEqual(d.installed.map(p => [p.name, p.current]), [['hello', '1.0.0']]);
    assert.deepStrictEqual(d.installed[0].permissions, { '1.0.0': ['schemas:hello'], '2.0.0': ['egress:api.example.com', 'schemas:hello'] });
    const h = d.activations.find(a => a.plugin === 'hello');
    assert(h && h.enabled === false && h.version === '1.0.0', JSON.stringify(h));
  });
  await t('set: an existing activation is updated in place; a version not installed is refused', async () => {
    const before = (await activations.describe(APP)).activations.length;
    const { id } = await activations.setActivation({ app: APP, plugin: 'hello', enabled: true, user: admin });
    assert.strictEqual(id, hello);
    assert.strictEqual((await activations.describe(APP)).activations.length, before);
    await assert.rejects(activations.setActivation({ app: APP, plugin: 'hello', version: '3.0.0', user: admin }), (e) => e.status === 400);
    assert.strictEqual(await versionOf(hello), '1.0.0');
  });
  await t('set: a new activation is created under the site row and listed on it', async () => {
    const { id } = await activations.setActivation({ app: APP, plugin: 'chat', enabled: false, user: admin });
    const listed = (await siteData()).plugin_activations || [];
    assert(listed.some(e => `${e && e.id}` === `${id}` && /\|chat:plugin_activation$/.test(e.ref)), JSON.stringify(listed));
    const a = (await activations.describe(APP)).activations.find(x => x.plugin === 'chat');
    assert(a && a.enabled === false && a.version === '', JSON.stringify(a));
    await assert.rejects(activations.setActivation({ app: APP, plugin: 'Bad Name', user: admin }), (e) => e.status === 400);
  });

  // the config against the version's settings schema, and no permission the site hasn't accepted (Forge's rule)
  console.log('\nplugin_activation: settings and permissions');
  await t('a create accepts the version\'s permissions; they are stored on the row', async () => {
    assert.deepStrictEqual((await rowData(hello)).permissions, ['schemas:hello']);
  });
  await t('switching to a version that asks for more is refused; the row stays', async () => {
    await refused(edit(admin, hello, { version: '2.0.0' }));
    assert.strictEqual(await versionOf(hello), '1.0.0');
  });
  await t('the same switch sending the new permissions (a fresh activation) goes through, and stores them', async () => {
    await allowed(edit(admin, hello, { version: '2.0.0', permissions: ['egress:api.example.com', 'schemas:hello'] }));
    const d = await rowData(hello);
    assert.deepStrictEqual([d.version, d.permissions], ['2.0.0', ['egress:api.example.com', 'schemas:hello']]);
  });
  await t('config must fit the version\'s settings: a value outside the enum and an unknown key refused, a good one kept', async () => {
    await refused(edit(admin, hello, { config: { station: 'kexp' } }));
    await refused(edit(admin, hello, { config: { nope: 1 } }));
    await allowed(edit(admin, hello, { config: { station: 'wnyc' } }));
    assert.deepStrictEqual((await rowData(hello)).config, { station: 'wnyc' });
  });
  await t('a version the stored config no longer fits is refused (1.0.0 takes no settings)', async () => {
    await refused(edit(admin, hello, { version: '1.0.0' }));
    await allowed(edit(admin, hello, { version: '1.0.0', config: {} }));
    assert.deepStrictEqual((await rowData(hello)).permissions, ['schemas:hello']);
  });
  await t('a create naming a version without accepting all it asks for is refused', () =>
    refused(create(admin, 'site|hello:plugin_activation', { plugin: 'hello', version: '2.0.0', permissions: ['schemas:hello'] })));
  await t('a mass edit of config or permissions is refused', async () => {
    await refused(call(admin, ['dms', 'data', 'massedit'], [APP, 'site|hello:plugin_activation', 'config', [{ id: hello, value: {} }]]));
    await refused(call(admin, ['dms', 'data', 'massedit'], [APP, 'site|hello:plugin_activation', 'permissions', [{ id: hello, value: [] }]]));
  });
  await t('the hub writer: 409 with newPermissions, then acceptPermissions switches', async () => {
    await assert.rejects(activations.setActivation({ app: APP, plugin: 'hello', version: '2.0.0', user: admin }),
      (e) => e.status === 409 && JSON.stringify(e.newPermissions) === JSON.stringify(['egress:api.example.com']));
    await activations.setActivation({ app: APP, plugin: 'hello', version: '2.0.0', acceptPermissions: true, user: admin, dir: pdir });
    const a = (await activations.describe(APP)).activations.find(x => x.plugin === 'hello');
    assert.deepStrictEqual([a.version, a.permissions], ['2.0.0', ['egress:api.example.com', 'schemas:hello']]);
  });
  fs.rmSync(pdir, { recursive: true, force: true });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
