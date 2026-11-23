/**
 * Per-plugin migrations and their ledger (src/plugins/migrations.js; dms-plugin-system.md, P1).
 *
 * Covers: applied once, in order, idempotently; the SQLite variant is chosen on SQLite; a failing migration leaves
 * neither its changes nor its ledger row; a changed applied migration, or one numbered before an applied one, stops
 * the run; a dry run applies nothing; two plugins' ledgers don't mix.
 *
 * Database: DMS_TEST_DB=dms-sqlite-test (default) or dms-postgres-test.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite-test';
process.env.DMS_DB_ENV = DB_NAME;

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

async function run() {
  const { getDb, awaitReady } = require('../src/db');
  const db = getDb(DB_NAME);
  await awaitReady();
  const { runPluginMigrations, LEDGER } = require('../src/plugins/migrations');

  const stamp = Date.now();
  const P = `t_mig_${stamp}`;
  const T = `t_mig_items_${stamp}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-mig-'));
  const write = (f, sql) => fs.writeFileSync(path.join(dir, f), sql);
  const count = async (table) => Number((await db.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
  const exists = async (table) => {
    const sql = db.type === 'postgres'
      ? `SELECT 1 FROM information_schema.tables WHERE table_name = $1`
      : `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $1`;
    return (await db.query(sql, [table])).rows.length > 0;
  };
  const silence = async (fn) => { const e = console.error, l = console.log; console.error = () => {}; console.log = (...a) => { if (!String(a[0]).includes('Query error') && !String(a[0]).includes('Original SQL')) l(...a); }; try { return await fn(); } finally { console.error = e; console.log = l; } };

  write('001_create.sql', `-- the plugin's table\nCREATE TABLE ${T} (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO ${T} (id, name) VALUES (1, 'pg');`);
  write('001_create.sqlite.sql', `CREATE TABLE ${T} (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO ${T} (id, name) VALUES (1, 'sqlite');`);
  write('002_more.sql', `INSERT INTO ${T} (id, name) VALUES (2, 'two');`);
  write('notes.txt', 'not a migration');

  console.log(`\nplugin migrations (${db.type})`);
  await t('a dry run applies nothing and lists what it would', async () => {
    const r = await runPluginMigrations({ plugin: P, dir, db, dryRun: true });
    assert.deepStrictEqual([r.applied, r.pending], [[], ['001_create', '002_more']]);
    assert.strictEqual(await exists(T), false);
  });
  await t('applied in order, once', async () => {
    const r = await runPluginMigrations({ plugin: P, dir, db });
    assert.deepStrictEqual(r.applied, ['001_create', '002_more']);
    assert.strictEqual(await count(T), 2);
    const again = await runPluginMigrations({ plugin: P, dir, db });
    assert.deepStrictEqual([again.applied, again.already], [[], ['001_create', '002_more']]);
    assert.strictEqual(await count(T), 2);
  });
  await t('the dialect\'s own variant ran', async () => {
    const { rows } = await db.query(`SELECT name FROM ${T} WHERE id = 1`);
    assert.strictEqual(rows[0].name, db.type === 'sqlite' ? 'sqlite' : 'pg');
  });
  await t('a failing migration leaves neither its changes nor its ledger row', async () => {
    write('003_bad.sql', `INSERT INTO ${T} (id, name) VALUES (3, 'three');\nINSERT INTO no_such_table_${stamp} VALUES (1);`);
    let err = null;
    await silence(async () => { try { await runPluginMigrations({ plugin: P, dir, db }); } catch (e) { err = e; } });
    assert(err, 'expected the run to fail');
    assert.strictEqual(await count(T), 2, 'row 3 rolled back');
    const { rows } = await db.query(`SELECT name FROM ${LEDGER} WHERE plugin = $1 ORDER BY name`, [P]);
    assert.deepStrictEqual(rows.map(r => r.name), ['001_create', '002_more']);
    fs.unlinkSync(path.join(dir, '003_bad.sql'));
  });
  await t('an applied migration that changed stops the run', async () => {
    write('002_more.sql', `INSERT INTO ${T} (id, name) VALUES (2, 'changed');`);
    await assert.rejects(() => runPluginMigrations({ plugin: P, dir, db }), /append-only/);
    write('002_more.sql', `INSERT INTO ${T} (id, name) VALUES (2, 'two');`);
  });
  await t('a migration numbered before an applied one stops the run', async () => {
    write('000_early.sql', `SELECT 1;`);
    await assert.rejects(() => runPluginMigrations({ plugin: P, dir, db }), /sorts before/);
    fs.unlinkSync(path.join(dir, '000_early.sql'));
  });
  await t('another plugin has its own ledger', async () => {
    const r = await runPluginMigrations({ plugin: `${P}_b`, dir, db, dryRun: true });
    assert.deepStrictEqual(r.pending, ['001_create', '002_more']);
  });
  await t('a bad plugin name is refused', async () => {
    await assert.rejects(() => runPluginMigrations({ plugin: 'Bad-Name', dir, db }), /not a plugin name/);
  });

  await db.query(`DROP TABLE IF EXISTS ${T}`);
  await db.query(`DELETE FROM ${LEDGER} WHERE plugin = $1`, [P]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
