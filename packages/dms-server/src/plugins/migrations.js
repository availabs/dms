/**
 * Per-plugin migrations, with a ledger (dms-plugin-system.md, P1).
 *
 * A plugin's `entries.migrations` folder holds numbered SQL files, applied once per database in name order:
 *
 *   001_create_streams.sql          Postgres (and SQLite, when there is no SQLite variant)
 *   001_create_streams.sqlite.sql   SQLite's variant, as the core's sql/ tree does it
 *
 * Each migration runs in its own transaction together with its ledger row (`dms_plugin_migrations`: plugin, name,
 * sha256 of the file), so it lands whole or not at all. Migrations are append-only: an applied one whose file has
 * since changed stops the run, and so does one that sorts before an applied one (renumbering is a mistake to stop,
 * not a migration to run). DDL is not confined to the plugin's schemas here: in v1 plugins are ours and reviewed
 * (D1); an isolated tier would run these under the plugin's own Postgres role.
 *
 * SQLite runs one statement per call, so its file is split on ";" after whole-line `--` comments are dropped (the
 * core's rule): don't put a ";" inside a string literal or an inline comment in a SQLite migration.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LEDGER = 'dms_plugin_migrations';
const NAME = /^(\d+)_[\w-]+$/;

/** The migrations in `dir` for a database type: [{ name, file, sql, sha256 }] in order. */
function listMigrations(dir, dbType) {
  if (!dir || !fs.existsSync(dir)) return [];
  const bases = new Map();   // name -> { pg, sqlite }
  for (const f of fs.readdirSync(dir)) {
    const m = /^(.*?)(\.sqlite)?\.sql$/.exec(f);
    if (!m || !NAME.test(m[1])) continue;
    const b = bases.get(m[1]) || {};
    b[m[2] ? 'sqlite' : 'pg'] = f;
    bases.set(m[1], b);
  }
  return [...bases.keys()].sort((a, b) => {
    const na = Number(NAME.exec(a)[1]), nb = Number(NAME.exec(b)[1]);
    return na - nb || a.localeCompare(b);
  }).map((name) => {
    const b = bases.get(name);
    const file = dbType === 'sqlite' ? (b.sqlite || b.pg) : b.pg;
    if (!file) return null;   // a SQLite-only migration has nothing to do on Postgres
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    return { name, file, sql, sha256: crypto.createHash('sha256').update(sql).digest('hex') };
  }).filter(Boolean);
}

const statementsOf = (sql) => sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').split(';').map(s => s.trim()).filter(Boolean);

async function ensureLedger(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS ${LEDGER} (
    plugin TEXT NOT NULL,
    name TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    applied_at ${db.type === 'postgres' ? 'TIMESTAMPTZ DEFAULT now()' : "TEXT DEFAULT (datetime('now'))"},
    PRIMARY KEY (plugin, name)
  )`);
}

/**
 * Applies a plugin's pending migrations to `db` (an adapter from src/db).
 * @param {{ plugin: string, dir: string, db: object, dryRun?: boolean }} o
 * @returns {Promise<{ applied: string[], already: string[], pending: string[] }>} pending: what a dry run would apply
 */
async function runPluginMigrations({ plugin, dir, db, dryRun = false }) {
  if (!/^[a-z][a-z0-9_]*$/.test(plugin || '')) throw new Error(`migrations: plugin "${plugin}" is not a plugin name`);
  await ensureLedger(db);
  const migrations = listMigrations(dir, db.type);
  const { rows } = await db.query(`SELECT name, sha256 FROM ${LEDGER} WHERE plugin = $1`, [plugin]);
  const done = new Map(rows.map(r => [r.name, r.sha256]));
  const applied = [], already = [], pending = [];
  const lastDone = [...done.keys()].sort((a, b) => Number(NAME.exec(a)?.[1]) - Number(NAME.exec(b)?.[1])).pop();
  for (const m of migrations) {
    if (done.has(m.name)) {
      if (done.get(m.name) !== m.sha256) throw new Error(`migrations: ${plugin} ${m.name} has changed since it was applied (migrations are append-only: add a new one)`);
      already.push(m.name);
      continue;
    }
    if (lastDone && Number(NAME.exec(m.name)[1]) < Number(NAME.exec(lastDone)[1])) {
      throw new Error(`migrations: ${plugin} ${m.name} sorts before the applied ${lastDone} (renumbered?)`);
    }
    pending.push(m.name);
    if (dryRun) continue;
    await db.withTransaction(async (tx) => {
      if (db.type === 'sqlite') for (const stmt of statementsOf(m.sql)) await tx.query(stmt);
      else await tx.query(m.sql);
      await tx.query(`INSERT INTO ${LEDGER} (plugin, name, sha256) VALUES ($1, $2, $3)`, [plugin, m.name, m.sha256]);
    });
    applied.push(m.name);
  }
  return { applied, already, pending: dryRun ? pending : [] };
}

module.exports = { runPluginMigrations, listMigrations, LEDGER };
