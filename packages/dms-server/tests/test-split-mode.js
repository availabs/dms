/**
 * Split mode defaults to per-app; legacy has to be configured.
 *
 * `loadConfig` resolves the mode once (config.splitMode > DMS_SPLIT_MODE > 'per-app') and stamps it
 * on the config it returns; any other value throws at load, like a missing `type` or `role`.
 * Task: planning/tasks/current/split-mode-per-app-default.md.
 */
const assert = require('assert');
const { writeFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const { loadConfig, configDir } = require('../src/db/config');
const { resolveSplitMode, resolveTable, resolveFormatsTable, DEFAULT_SPLIT_MODE, SPLIT_MODES } = require('../src/db/table-resolver');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n      ${err.message}`); }
}
function withEnv(value, fn) {
  const before = process.env.DMS_SPLIT_MODE;
  if (value === undefined) delete process.env.DMS_SPLIT_MODE; else process.env.DMS_SPLIT_MODE = value;
  try { return fn(); }
  finally { if (before === undefined) delete process.env.DMS_SPLIT_MODE; else process.env.DMS_SPLIT_MODE = before; }
}

console.log('\n--- resolveSplitMode ---');
test('vocabulary is legacy and per-app, default per-app', () => {
  assert.deepStrictEqual(SPLIT_MODES, ['legacy', 'per-app']);
  assert.strictEqual(DEFAULT_SPLIT_MODE, 'per-app');
});
test('a silent config with no env var is per-app', () => withEnv(undefined, () => {
  assert.strictEqual(resolveSplitMode({}), 'per-app');
  assert.strictEqual(resolveSplitMode(), 'per-app');
}));
test('a config that says legacy is legacy', () => withEnv(undefined, () => {
  assert.strictEqual(resolveSplitMode({ splitMode: 'legacy' }), 'legacy');
}));
test('DMS_SPLIT_MODE applies when the config is silent', () => withEnv('legacy', () => {
  assert.strictEqual(resolveSplitMode({}), 'legacy');
}));
test('the config beats DMS_SPLIT_MODE', () => withEnv('legacy', () => {
  assert.strictEqual(resolveSplitMode({ splitMode: 'per-app' }), 'per-app');
}));
test('an unknown config value throws, naming the config', () => withEnv(undefined, () => {
  assert.throws(() => resolveSplitMode({ splitMode: 'per-site' }, 'my-db'), /Config "my-db": "splitMode" must be "legacy" or "per-app"/);
}));
test('an unknown DMS_SPLIT_MODE throws', () => withEnv('split', () => {
  assert.throws(() => resolveSplitMode({}), /must be "legacy" or "per-app"/);
}));

console.log('\n--- loadConfig stamps the resolved mode ---');
const TMP = 'split-mode-default-test';
const tmpPath = join(configDir, `${TMP}.config.json`);
test('a config file with no splitMode loads as per-app', () => withEnv(undefined, () => {
  writeFileSync(tmpPath, JSON.stringify({ type: 'sqlite', role: 'dms', filename: '../data/split-mode-default-test.sqlite' }));
  try { assert.strictEqual(loadConfig(TMP).splitMode, 'per-app'); }
  finally { unlinkSync(tmpPath); }
}));
test('a config file with no splitMode takes DMS_SPLIT_MODE=legacy', () => withEnv('legacy', () => {
  writeFileSync(tmpPath, JSON.stringify({ type: 'sqlite', role: 'dms', filename: '../data/split-mode-default-test.sqlite' }));
  try { assert.strictEqual(loadConfig(TMP).splitMode, 'legacy'); }
  finally { unlinkSync(tmpPath); }
}));
test('a config file with an invalid splitMode fails to load', () => withEnv(undefined, () => {
  writeFileSync(tmpPath, JSON.stringify({ type: 'sqlite', role: 'dms', filename: '../data/x.sqlite', splitMode: 'shared' }));
  try { assert.throws(() => loadConfig(TMP), /must be "legacy" or "per-app"/); }
  finally { unlinkSync(tmpPath); }
}));
test('migrate-test-src is the explicit legacy config; cli-test is per-app', () => withEnv(undefined, () => {
  assert.strictEqual(loadConfig('migrate-test-src').splitMode, 'legacy');
  assert.strictEqual(loadConfig('cli-test').splitMode, 'per-app');
}));

console.log('\n--- resolver defaults ---');
test('resolveTable with no mode lands in the per-app schema', () => {
  assert.strictEqual(resolveTable('myapp', 'prod:site', 'postgres').fullName, 'dms_myapp.data_items');
  assert.strictEqual(resolveTable('myapp', 'prod:site', 'sqlite').fullName, 'data_items__myapp');
});
test('resolveFormatsTable with no mode lands in the per-app schema', () => {
  assert.strictEqual(resolveFormatsTable('myapp', 'postgres').fullName, 'dms_myapp.formats');
});
test('legacy still resolves to the shared table when asked for', () => {
  assert.strictEqual(resolveTable('myapp', 'prod:site', 'postgres', 'legacy').fullName, 'dms.data_items');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
