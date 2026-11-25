/**
 * The plugin contract, server side (src/plugins/index.js) and its use by the data-type registry.
 * Task: src/dms/planning/tasks/current/dms-plugin-system.md (P1)
 *
 * Covers:
 *   1. satisfies: the version ranges manifests use.
 *   2. validateManifest: a package.json `dms` key and a release index.json; unsafe paths, missing digests, files not
 *      listed, an API this server doesn't provide.
 *   2b. settings: the manifest's settings schema, an activation's config against it, and the permission list.
 *   3. definitionOf: a plugin module's register(host) gives the definition; the old shape passes through; another
 *      API is refused.
 *   4. registerDatatype takes a plugin module: its workers register (now_playing, converted in P1, when its
 *      dependencies load).
 * No database.
 */
const path = require('path');
const fs = require('fs');
const { PLUGIN_API_VERSION, satisfies, validateManifest, validateSettingsSchema, checkConfig, permissionList, definitionOf, listServerPlugins } = require('../src/plugins');

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
};

const sha = 'a'.repeat(128);
const release = (over = {}) => ({
  name: 'now_playing', version: '1.4.0', api: '^1.0', activation: 'opt-in',
  contributes: { dataTypes: ['now_playing'] },
  entries: { client: 'dist/client/index.js', server: 'dist/server/index.cjs' },
  permissions: { egress: ['api-v2.acrcloud.com'] },
  files: [
    { path: 'package.json', size: 812, sha512: sha },
    { path: 'dist/client/index.js', size: 48213, sha512: sha },
    { path: 'dist/server/index.cjs', size: 9000, sha512: sha },
  ],
  ...over,
});

console.log('\n1. satisfies');
check(`^1.0 accepts this server's ${PLUGIN_API_VERSION}`, satisfies(PLUGIN_API_VERSION, '^1.0'));
check('^2.0 does not', !satisfies(PLUGIN_API_VERSION, '^2.0'));
check('ranges', satisfies('1.2.9', '~1.2.3') && !satisfies('1.3.0', '~1.2.3') && satisfies('1.7.0', '>=1.0 <2') && !satisfies('0.4.0', '^0.3') && satisfies('1.7.0', '1.x'));

console.log('\n2. validateManifest');
// the app's plugin folders (dms-template src/plugins/), each checked when present
const appPlugins = path.resolve(__dirname, '../../../../../src/plugins');
for (const p of ['wcdb', 'mapeditor', 'qa', 'chat', 'weather_analytics']) {
  const file = path.join(appPlugins, p, 'package.json');
  if (!fs.existsSync(file)) { console.log(`  (no src/plugins/${p}; skipping)`); continue; }
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  check(`${p}'s package.json is valid`, validateManifest(m).length === 0, JSON.stringify(validateManifest(m)));
}
check('a release index.json is valid', validateManifest(release(), { release: true }).length === 0, JSON.stringify(validateManifest(release(), { release: true })));
check('no dms key', validateManifest({ name: 'x', version: '1.0.0' })[0] === 'package.json has no `dms` key');
const bad = (over) => validateManifest(release(over), { release: true }).join(' | ');
check('an API this server lacks', /does not accept/.test(bad({ api: '^2.0' })));
check('a path outside the package', /not a path inside/.test(bad({ entries: { server: '../../etc/passwd' } })));
check('an absolute path', /not a path inside/.test(bad({ files: [{ path: '/etc/passwd', size: 1, sha512: sha }] })));
check('a URL as a path', /not a path inside/.test(bad({ files: [...release().files, { path: 'http://example.invalid/x.js', size: 1, sha512: sha }] })));
check('a missing digest', /no sha512/.test(bad({ files: [{ path: 'dist/server/index.cjs', size: 1 }] })));
check('an entry not among the files', /not among the files/.test(bad({ files: [{ path: 'package.json', size: 1, sha512: sha }] })));
check('a file listed twice', /listed twice/.test(bad({ files: [...release().files, { path: './package.json', size: 1, sha512: sha }] })));
check('a bad name and version', /name/.test(bad({ name: 'Now-Playing' })) && /version/.test(bad({ version: 'one' })));
check('contributes nothing', /contributes nothing/.test(bad({ contributes: {} })));
check('an unknown permission', /unknown permission/.test(bad({ permissions: { root: ['yes'] } })));

console.log('\n2b. settings and permissions');
const SETTINGS = {
  properties: {
    station: { type: 'string', enum: ['wamc', 'wnyc'], default: 'wamc' },
    key: { type: 'string', minLength: 4 },
    volume: { type: 'integer', minimum: 0, maximum: 10 },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 2 },
    map: { type: 'object' },
  },
  required: ['station', 'key'],
};
check('a release with a settings schema is valid', validateManifest(release({ settings: SETTINGS }), { release: true }).length === 0,
  JSON.stringify(validateManifest(release({ settings: SETTINGS }), { release: true })));
const sbad = (schema) => validateSettingsSchema(schema).join(' | ');
check('a schema: an unknown type, an array with no item type, a default that breaks its own rule, a required name not declared',
  /type: one of/.test(sbad({ properties: { a: { type: 'date' } } }))
  && /items/.test(sbad({ properties: { a: { type: 'array' } } }))
  && /default: should be one of/.test(sbad({ properties: { a: { type: 'string', enum: ['x'], default: 'y' } } }))
  && /"b" is not among/.test(sbad({ properties: { a: { type: 'string' } }, required: ['b'] })));
check('a schema: unknown keys are refused (no `pattern`: no regex from a manifest)', /pattern: unknown key/.test(sbad({ properties: { a: { type: 'string', pattern: '.*' } } })));
check('config fits', checkConfig(SETTINGS, { station: 'wnyc', key: 'abcd', volume: 3, tags: ['a'], map: { z: 1 } }).length === 0);
check('config: a required setting with a default may be left out; one without may not',
  checkConfig(SETTINGS, { key: 'abcd' }).length === 0 && /config\.key: required/.test(checkConfig(SETTINGS, {}).join()));
const cbad = (config) => checkConfig(SETTINGS, { key: 'abcd', ...config }).join(' | ');
check('config: wrong type, outside the enum, out of range, too short, a bad array item, an unknown key',
  /volume: should be a whole number/.test(cbad({ volume: 2.5 })) && /station: should be one of/.test(cbad({ station: 'kexp' }))
  && /volume: at most 10/.test(cbad({ volume: 11 })) && /key: at least 4/.test(cbad({ key: 'ab' }))
  && /tags: item 2 should be a string/.test(cbad({ tags: ['a', 1] })) && /nope: not a setting/.test(cbad({ nope: 1 })));
check('config: additionalProperties true lets unknown keys through', checkConfig({ ...SETTINGS, additionalProperties: true }, { key: 'abcd', nope: 1 }).length === 0);
check('config: a plugin with no schema takes only an empty config',
  checkConfig(undefined, {}).length === 0 && checkConfig(undefined, null).length === 0 && /takes no settings/.test(checkConfig(undefined, { a: 1 }).join()));
check('permissionList: "kind:value", sorted, unique',
  JSON.stringify(permissionList({ schemas: ['np', 'np'], egress: ['x.com'] })) === JSON.stringify(['egress:x.com', 'schemas:np']) && permissionList(undefined).length === 0);

console.log('\n3. definitionOf');
const old = { workers: { 'x/y': async () => {} } };
check('the old shape passes through', definitionOf('x', old) === old);
let seenHost = null;
const def = definitionOf('t_dt', { name: 't_dt', version: '1.0.0', api: '^1', register(host) { seenHost = host; return { routes: () => {} }; } });
check('register(host) gives the definition', typeof def.routes === 'function');
check('the host carries the API version and the plugin', seenHost.apiVersion === PLUGIN_API_VERSION && seenHost.plugin === 't_dt');
check('the plugin is listed', listServerPlugins().some(p => p.name === 't_dt' && p.activation === 'opt-in'));
let refused = '';
try { definitionOf('t_api', { name: 't_api', version: '1.0.0', api: '^2.0', register: () => ({}) }); } catch (e) { refused = e.message; }
check('another API is refused', /needs plugin API/.test(refused));

console.log('\n4. registerDatatype with a plugin module');
let np = null;
// the wcdb plugin's server entry: the now_playing data type, registered under that name
try { np = require('../../../../../src/plugins/wcdb/server.js'); } catch (e) { console.log(`  (the wcdb plugin did not load here: ${e.message.split('\n')[0]}; skipping)`); }
if (np) {
  const { registerDatatype, getDatatypes } = require('../src/dama/datatypes');
  registerDatatype('now_playing', np);
  const stored = getDatatypes().now_playing;
  check('now_playing registers as the wcdb plugin', typeof np.register === 'function' && np.dataType === 'now_playing'
    && listServerPlugins().some(p => p.name === 'wcdb' && p.dataType === 'now_playing'));
  check('the registry holds its definition, not the module', !!stored && typeof stored.register !== 'function'
    && typeof stored.workers?.['now_playing/backfill'] === 'function' && typeof stored.routes === 'function'
    && (stored.openRoutes || []).includes('POST /streams/:sourceId/webhook'));
}

console.log('\n5. long routes are data (P0: the core names no data type)');
{
  const { registerDatatype, isLongRoute } = require('../src/dama/datatypes');
  registerDatatype('t_long', { longRoutes: ['POST /search', 'POST /item/:id/rebuild'], routes() {} });
  check('a declared route keeps no timeout', isLongRoute('POST', '/dama-admin/env1/t_long/search') && isLongRoute('POST', '/dama-admin/env1/t_long/item/42/rebuild'));
  check('another method, route or data type does', !isLongRoute('GET', '/dama-admin/env1/t_long/search') && !isLongRoute('POST', '/dama-admin/env1/t_long/searches') && !isLongRoute('POST', '/dama-admin/env1/other/search') && !isLongRoute('POST', '/graph'));
  const core = fs.readFileSync(path.resolve(__dirname, '../src/index.js'), 'utf8');
  check('the server entry names no data-type route', !/trsp-memory/.test(core));
  const routing = require('../../../../../data-types/routing');
  check('routing declares its searches', Array.isArray(routing.longRoutes) && routing.longRoutes.includes('POST /trsp-memory'));
}

(async () => {
  console.log('\n6. start / stop');
  const { registerDatatype, mountDatatypeRoutes, stopDatatypes } = require('../src/dama/datatypes');
  let started = null, stopped = 0;
  registerDatatype('t_life', { start: (helpers) => { started = helpers; }, stop: () => { stopped++; }, routes() {} });
  registerDatatype('t_badstart', { start: () => { throw new Error('boom'); } });
  const express = require('express');
  const err = console.error; console.error = () => {};
  mountDatatypeRoutes(express(), { marker: 1 });
  await new Promise(r => setTimeout(r, 20));
  console.error = err;
  check('start runs once routes are mounted, with the helpers', started && started.marker === 1);
  await stopDatatypes();
  check('stopDatatypes calls stop', stopped === 1);

  console.log('\n7. a data type registered with authMode enforce (P0 finding 1: run-time plugins never ship under log)');
  {
    const http = require('http');
    const { authMode } = require('../src/routes/auth/settings');
    const prevMode = process.env.DMS_AUTH_MODE; process.env.DMS_AUTH_MODE = 'log';
    const seen = {};
    const routes = (tag) => (router) => router.post('/write', async (req, res) => {
      await new Promise(r => setTimeout(r, 5));   // the scope survives an await
      seen[tag] = authMode();
      res.json({ ok: true });
    });
    registerDatatype('t_enf', { routes: routes('enf') }, { authMode: 'enforce' });
    registerDatatype('t_plain', { routes: routes('plain') });
    const app = express();
    const log = console.log; const warn = console.warn; console.log = () => {}; console.warn = () => {}; console.error = () => {};
    mountDatatypeRoutes(app, {});
    console.log = log; console.warn = warn; console.error = err;
    const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const post = (p) => new Promise((res, rej) => {
      const req = http.request({ host: '127.0.0.1', port: server.address().port, path: p, method: 'POST' }, r => { r.resume(); r.on('end', () => res(r.statusCode)); });
      req.on('error', rej); req.end();
    });
    const quiet = console.log; console.log = () => {};
    const enfStatus = await post('/dama-admin/env1/t_enf/write');
    const plainStatus = await post('/dama-admin/env1/t_plain/write');
    console.log = quiet;
    check('under DMS_AUTH_MODE=log an anonymous write to the enforced data type is refused', enfStatus === 401);
    check('the same write to a data type without it goes through (log)', plainStatus === 200 && seen.plain === 'log');
    check('outside the enforced routes the server mode is unchanged', authMode() === 'log');
    // the scope itself: decisions inside it are enforced, across awaits
    const { withEnforcedAuth } = require('../src/routes/auth/settings');
    await withEnforcedAuth(async () => { await new Promise(r => setTimeout(r, 5)); seen.scoped = authMode(); });
    check('inside the scope every decision is enforced, across awaits', seen.scoped === 'enforce');
    server.close();
    if (prevMode === undefined) delete process.env.DMS_AUTH_MODE; else process.env.DMS_AUTH_MODE = prevMode;
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
