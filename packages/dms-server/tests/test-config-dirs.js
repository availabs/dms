/**
 * Config folders: DMS_DB_CONFIG_DIRS adds folders searched before the built-in src/db/configs
 * (src/db/config.js configDirs / resolveConfigPath).
 *
 *   node tests/test-config-dirs.js
 *
 * Works in temp folders plus one gitignored file in src/db/configs (deleted at the end).
 *
 * Covers:
 *   1. With no DMS_DB_CONFIG_DIRS only the built-in folder is searched, and its configs still load.
 *   2. A config in an extra folder loads; relative entries resolve against the working directory.
 *   3. Folders are searched in order and the built-in one is always last, without duplicates.
 *   4. A relative SQLite filename resolves against the folder its config is in.
 *   5. The same name in two folders throws, from loadConfig and from findConfigsByRole.
 *   6. A folder in DMS_DB_CONFIG_DIRS that doesn't exist throws.
 *   7. findConfigsByRole looks in every folder.
 *   8. opts.dirs replaces DMS_DB_CONFIG_DIRS.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const { loadConfig, configDir, configDirs, resolveConfigPath, findConfigsByRole } = require('../src/db/config.js');

const STAMP = Date.now();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-config-dirs-'));
const A = path.join(tmp, 'a');
const B = path.join(tmp, 'b');
fs.mkdirSync(A);
fs.mkdirSync(B);
const builtinFile = path.join(configDir, `tmp-dup-${STAMP}.config.json`); // no "-test", so gitignored

const write = (dir, name, c) => fs.writeFileSync(path.join(dir, `${name}.config.json`), JSON.stringify(c));
const sqlite = (role, filename = './x.sqlite') => ({ type: 'sqlite', role, filename });

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const saved = process.env.DMS_DB_CONFIG_DIRS;
try {
  write(A, `only-a-${STAMP}`, sqlite('dama', './data/a.sqlite'));
  write(B, `only-b-${STAMP}`, sqlite('dms'));
  write(A, `both-${STAMP}`, sqlite('dms'));
  write(B, `both-${STAMP}`, sqlite('dms'));

  test('no env: only the built-in folder', () => {
    delete process.env.DMS_DB_CONFIG_DIRS;
    assert.deepStrictEqual(configDirs(), [configDir]);
    assert.strictEqual(resolveConfigPath(`only-a-${STAMP}`), null);
    assert.strictEqual(loadConfig('sqlite.example').type, 'sqlite');
  });

  test('extra folder, relative entry resolved against cwd', () => {
    process.env.DMS_DB_CONFIG_DIRS = path.relative(process.cwd(), A);
    assert.strictEqual(resolveConfigPath(`only-a-${STAMP}`), path.join(A, `only-a-${STAMP}.config.json`));
    assert.strictEqual(loadConfig(`only-a-${STAMP}`).role, 'dama');
  });

  test('order kept, built-in last, duplicates dropped', () => {
    process.env.DMS_DB_CONFIG_DIRS = `${B}:${A}: :${B}:${configDir}`;
    assert.deepStrictEqual(configDirs(), [B, A, configDir]);
  });

  test('relative sqlite filename resolves against its own folder', () => {
    process.env.DMS_DB_CONFIG_DIRS = A;
    assert.strictEqual(loadConfig(`only-a-${STAMP}`).filename, path.join(A, 'data/a.sqlite'));
  });

  test('a name in two folders throws', () => {
    process.env.DMS_DB_CONFIG_DIRS = `${A}:${B}`;
    assert.throws(() => loadConfig(`both-${STAMP}`), /more than one config folder/);
    assert.throws(() => findConfigsByRole('dms'), /more than one config folder/);
    // ...including against the built-in folder
    process.env.DMS_DB_CONFIG_DIRS = A;
    fs.writeFileSync(builtinFile, JSON.stringify(sqlite('dms')));
    write(A, `tmp-dup-${STAMP}`, sqlite('dms'));
    assert.throws(() => loadConfig(`tmp-dup-${STAMP}`), /more than one config folder/);
    fs.unlinkSync(builtinFile);
    fs.unlinkSync(path.join(A, `tmp-dup-${STAMP}.config.json`));
  });

  test('a missing folder throws', () => {
    process.env.DMS_DB_CONFIG_DIRS = path.join(tmp, 'nope');
    assert.throws(() => configDirs(), /doesn't exist/);
    assert.throws(() => loadConfig('sqlite.example'), /doesn't exist/);
  });

  test('findConfigsByRole looks in every folder', () => {
    fs.unlinkSync(path.join(B, `both-${STAMP}.config.json`));
    process.env.DMS_DB_CONFIG_DIRS = `${A}:${B}`;
    const dms = findConfigsByRole('dms');
    assert.ok(dms.includes(`only-b-${STAMP}`));
    assert.ok(dms.includes(`both-${STAMP}`));
    assert.ok(findConfigsByRole('dama').includes(`only-a-${STAMP}`));
  });

  test('opts.dirs replaces the env', () => {
    process.env.DMS_DB_CONFIG_DIRS = A;
    assert.deepStrictEqual(configDirs([B]), [B, configDir]);
    assert.strictEqual(loadConfig(`only-b-${STAMP}`, { dirs: [B] }).role, 'dms');
    assert.strictEqual(resolveConfigPath(`only-a-${STAMP}`, { dirs: [B] }), null);
  });

  console.log(`\n${passed} passed`);
} finally {
  if (saved === undefined) delete process.env.DMS_DB_CONFIG_DIRS; else process.env.DMS_DB_CONFIG_DIRS = saved;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(builtinFile, { force: true });
}
