/**
 * Schema drift guard.
 *
 * The `create_*.sql` scripts sit behind a `tablesExist` check, so they only
 * ever run against a brand-new database. Anything added to one of them after
 * its table already existed somewhere reaches new databases and no other.
 * `migrate_*.sql` is the mechanism for closing that gap — this test is what
 * makes using it non-optional.
 *
 * Three checks:
 *
 *   1. COMPLETENESS (static)  every table/column in a create script that is not
 *      in tests/fixtures/schema-baseline.json must have a matching statement in
 *      the sibling migrate file. This is the check that would have caught
 *      a8a68808 adding `auth_permissions` to both create scripts and neither
 *      migrate file.
 *
 *   2. APPLICABILITY (live SQLite)  take a real database, strip it back to its
 *      pre-migration shape, run the migrations, and assert it ends up column-
 *      for-column identical to a freshly created one. Running twice must be a
 *      no-op.
 *
 *   3. SELF-CHECK  feed the completeness checker a synthetic drifted pair and
 *      assert it actually reports a violation. A guard nobody has watched fail
 *      is not a guard.
 *
 * Regenerate the baseline with `node tests/test-schema-drift.js --update`, and
 * only ever in the same commit as the migrations that go with it — the point of
 * the fixture is that defeating it shows up as a reviewable diff.
 *
 * Index and constraint drift are out of scope; this tracks tables and columns.
 */

const { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync, mkdtempSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const SQL_ROOT = join(__dirname, '..', 'src', 'db', 'sql');
const BASELINE = join(__dirname, 'fixtures', 'schema-baseline.json');

/**
 * sqlDir → the migrate base name init passes to runMigrationFile, plus the
 * create scripts in the order init actually runs them. The order is load-
 * bearing and not alphabetical: create_dama_schedule_tables indexes `tasks`,
 * so initDamaTasks has to come first. Listing them explicitly also means a new
 * create script has to be added here to be covered — see the completeness test
 * below, which fails if this list and the directory disagree.
 */
const SUBSYSTEMS = [
  {
    dir: 'dama',
    migrateBase: 'migrate_dama_core',
    creates: [
      'create_dama_core_tables',      // initDama
      'create_dama_task_tables',      // initDamaTasks
      'create_dama_schedule_tables',  // initDamaSchedules
    ],
    // Covered by the inline retrofit at the top of initDamaSchedules rather
    // than by migrate_dama_core.sql. create_dama_schedule_tables indexes
    // tasks(schedule_id), so these have to exist BEFORE that create script
    // runs, and migrations run after it. Anything listed here is exempt from
    // the completeness check — keep the list short and justified.
    retrofitted: [
      'data_manager.tasks.attempt', 'tasks.attempt',
      'data_manager.tasks.max_attempts', 'tasks.max_attempts',
      'data_manager.tasks.schedule_id', 'tasks.schedule_id',
    ],
  },
  {
    dir: 'dms',
    migrateBase: 'migrate_dms_core',
    creates: [
      'dms',         // initDms
      'change_log',  // initSync
      'dms_tasks',   // initDmsTasks
    ],
  },
  {
    dir: 'auth',
    migrateBase: 'migrate_auth_core',
    creates: ['auth_tables'], // initAuth
  },
];

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

// ── SQL parsing ─────────────────────────────────────────────────────────────

/** Strip `--` line comments. Everything below is comment-insensitive. */
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');

/**
 * Table/column map for every CREATE TABLE in a script.
 * Returns { 'data_manager.sources': ['source_id', 'name', ...], ... }
 */
function parseCreateTables(sql) {
  const out = {};
  const text = stripComments(sql);
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.".]+)\s*\(/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const table = m[1].replace(/"/g, '').toLowerCase();
    // Walk to the balanced close paren so nested type/constraint parens
    // (NUMERIC(10,2), CHECK (x IN (…))) don't end the body early.
    let depth = 1;
    let i = re.lastIndex;
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') depth--;
      i++;
    }
    const body = text.slice(re.lastIndex, i - 1);

    // Split on top-level commas only.
    const parts = [];
    let buf = '';
    depth = 0;
    for (const ch of body) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(buf); buf = ''; continue; }
      buf += ch;
    }
    parts.push(buf);

    const CONSTRAINT = /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT|EXCLUDE)\b/i;
    out[table] = parts
      .map((p) => p.trim())
      .filter((p) => p && !CONSTRAINT.test(p))
      .map((p) => p.split(/\s+/)[0].replace(/"/g, '').toLowerCase());
  }
  return out;
}

/**
 * What a migrate file supplies: columns it ADDs, and tables it CREATEs.
 * Returns { added: Set('table.column'), created: Set('table') }
 */
function parseMigrations(sql) {
  const added = new Set();
  const created = new Set();
  const text = stripComments(sql);

  for (const table of Object.keys(parseCreateTables(text))) created.add(table);

  // One ALTER TABLE may carry several comma-separated ADD COLUMN clauses.
  const re = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w.".]+)([\s\S]*?);/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const table = m[1].replace(/"/g, '').toLowerCase();
    const colRe = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w"]+)/gi;
    let c;
    while ((c = colRe.exec(m[2])) !== null) {
      added.add(`${table}.${c[1].replace(/"/g, '').toLowerCase()}`);
    }
  }
  return { added, created };
}

/** The subsystem's create scripts, in init order, for one dialect. */
function createScripts({ dir, creates }, dialect) {
  return creates
    .map((base) => (dialect === 'sqlite' ? `${base}.sqlite.sql` : `${base}.sql`))
    .filter((f) => existsSync(join(SQL_ROOT, dir, f)));
}

/** Every .sql in a sqlDir that is neither a migrate file nor the other dialect. */
function createScriptsOnDisk(dir, dialect) {
  return readdirSync(join(SQL_ROOT, dir)).filter((f) => {
    if (!f.endsWith('.sql') || f.startsWith('migrate_')) return false;
    return dialect === 'sqlite' ? f.endsWith('.sqlite.sql') : !f.endsWith('.sqlite.sql');
  });
}

/** Merged table→columns across every create script for one dir+dialect. */
function currentSchema(sub, dialect) {
  const schema = {};
  for (const f of createScripts(sub, dialect)) {
    Object.assign(schema, parseCreateTables(readFileSync(join(SQL_ROOT, sub.dir, f), 'utf8')));
  }
  return schema;
}

function readMigrate(dir, base, dialect) {
  const f = join(SQL_ROOT, dir, dialect === 'sqlite' ? `${base}.sqlite.sql` : `${base}.sql`);
  return existsSync(f) ? readFileSync(f, 'utf8') : '';
}

// ── check 1: completeness ───────────────────────────────────────────────────

/**
 * Anything in `schema` but not in `baseline` has to be reachable by an existing
 * database, i.e. present in the migrate file. Pure function so the self-check
 * can drive it with synthetic input.
 */
function findDrift(schema, baseline, migrateSql, retrofitted = []) {
  const { added, created } = parseMigrations(migrateSql);
  for (const key of retrofitted) added.add(key.toLowerCase());
  const drift = [];
  for (const [table, cols] of Object.entries(schema)) {
    if (!baseline[table]) {
      if (!created.has(table)) {
        drift.push({ table, kind: 'table', fix: `CREATE TABLE IF NOT EXISTS ${table} (…)` });
      }
      continue; // a new table's columns come with the table
    }
    for (const col of cols) {
      if (baseline[table].includes(col)) continue;
      if (added.has(`${table}.${col}`)) continue;
      drift.push({
        table,
        column: col,
        kind: 'column',
        fix: `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} …;`,
      });
    }
  }
  return drift;
}

function loadBaseline() {
  if (!existsSync(BASELINE)) return {};
  return JSON.parse(readFileSync(BASELINE, 'utf8'));
}

/**
 * The baseline is what a database that predates every migration is assumed to
 * have: the create-script schema MINUS everything the migrate file (or a
 * documented JS retrofit) supplies.
 *
 * Subtracting matters. If the baseline were simply the current create scripts,
 * then a column would fall out of scope the moment its migration was written —
 * and deleting that migration later would go unnoticed. Defined this way, a
 * migrated column stays outside the baseline permanently, so its migration is
 * permanently required. `auth_permissions` is exactly this case.
 */
function buildBaseline() {
  const out = {};
  for (const sub of SUBSYSTEMS) {
    for (const dialect of ['postgres', 'sqlite']) {
      const schema = currentSchema(sub, dialect);
      if (!Object.keys(schema).length) continue;

      const { added, created } = parseMigrations(readMigrate(sub.dir, sub.migrateBase, dialect));
      for (const key of sub.retrofitted || []) added.add(key.toLowerCase());

      const pruned = {};
      for (const [table, cols] of Object.entries(schema)) {
        if (created.has(table)) continue; // the migrate file creates it outright
        pruned[table] = cols.filter((c) => !added.has(`${table}.${c}`));
      }
      out[`${sub.dir}/${dialect}`] = pruned;
    }
  }
  return out;
}

// ── check 2: applicability, against real SQLite ─────────────────────────────

/**
 * Rewind a database to its pre-migration shape using the migrate file itself as
 * the description of what is new, then let the migrations put it back. Uses real
 * DDL rather than text-munging the create scripts, so what is exercised is the
 * migration SQL as written.
 */
async function rewind(adapter, migrateSql) {
  const { added, created } = parseMigrations(migrateSql);
  for (const table of created) {
    await adapter.query(`DROP TABLE IF EXISTS ${table};`);
  }
  for (const key of added) {
    const idx = key.lastIndexOf('.');
    const table = key.slice(0, idx);
    const column = key.slice(idx + 1);
    if (created.has(table)) continue; // table is gone entirely
    await adapter.query(`ALTER TABLE ${table} DROP COLUMN ${column};`);
  }
}

async function columnsOf(adapter, table) {
  const r = await adapter.query(`PRAGMA table_info(${table});`);
  return (r.rows || r).map((row) => row.name).sort();
}

async function tablesOf(adapter) {
  const r = await adapter.query(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`
  );
  return (r.rows || r).map((row) => row.name).sort();
}

const { SqliteAdapter } = require('../src/db/adapters/sqlite');
const { runMigrationFile } = require('../src/db');

async function buildSqliteDb(sub, tmp, label) {
  const file = join(tmp, `${sub.dir}-${label}.sqlite`);
  if (existsSync(file)) unlinkSync(file);
  const adapter = new SqliteAdapter({ filename: file });
  for (const f of createScripts(sub, 'sqlite')) {
    const sql = stripComments(readFileSync(join(SQL_ROOT, sub.dir, f), 'utf8'));
    for (const stmt of sql.split(';').filter((s) => s.trim())) {
      await adapter.query(stmt + ';');
    }
  }
  return adapter;
}

// ── run ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n=== Schema Drift Guard ===\n');

  if (process.argv.includes('--update')) {
    writeFileSync(BASELINE, JSON.stringify(buildBaseline(), null, 2) + '\n');
    console.log(`baseline written: ${BASELINE}`);
    console.log('Commit this together with the migrations it accounts for.');
    return;
  }

  const baseline = loadBaseline();
  assert(Object.keys(baseline).length > 0,
    `no baseline at ${BASELINE} — run with --update`);

  console.log('Coverage: every create script on disk is accounted for\n');
  for (const sub of SUBSYSTEMS) {
    for (const dialect of ['postgres', 'sqlite']) {
      await test(`${sub.dir}/${dialect} SUBSYSTEMS list matches the directory`, async () => {
        const listed = createScripts(sub, dialect).sort();
        const onDisk = createScriptsOnDisk(sub.dir, dialect).sort();
        const missing = onDisk.filter((f) => !listed.includes(f));
        assert(missing.length === 0,
          `sql/${sub.dir} contains ${missing.join(', ')}, which this test does not check. ` +
          `Add the base name to SUBSYSTEMS in the position init runs it.`);
      });
    }
  }

  console.log('\nCompleteness: every post-baseline column has a migration\n');
  for (const sub of SUBSYSTEMS) {
    const { dir, migrateBase } = sub;
    for (const dialect of ['postgres', 'sqlite']) {
      const schema = currentSchema(sub, dialect);
      if (!Object.keys(schema).length) continue;
      await test(`${dir}/${dialect}`, async () => {
        const base = baseline[`${dir}/${dialect}`];
        assert(base, `no baseline entry for ${dir}/${dialect} — run with --update`);
        const drift = findDrift(
          schema, base, readMigrate(dir, migrateBase, dialect), sub.retrofitted);
        assert(drift.length === 0,
          `${drift.length} unmigrated change(s) in sql/${dir} (${dialect}). ` +
          `Existing databases will never get:\n` +
          drift.map((d) => `        ${d.fix}`).join('\n') +
          `\n      Add them to ${migrateBase}${dialect === 'sqlite' ? '.sqlite' : ''}.sql, ` +
          `then re-run with --update.`);
      });
    }
  }

  console.log('\nApplicability: an out-of-date database catches up\n');
  const tmp = mkdtempSync(join(tmpdir(), 'dms-schema-drift-'));
  for (const sub of SUBSYSTEMS) {
    const { dir, migrateBase } = sub;
    const migrateSql = readMigrate(dir, migrateBase, 'sqlite');
    if (!migrateSql.trim()) continue;

    await test(`${dir}: rewound database ends up identical to a fresh one`, async () => {
      const fresh = await buildSqliteDb(sub, tmp, 'fresh');
      await runMigrationFile(fresh, `sql/${dir}`, migrateBase);

      const old = await buildSqliteDb(sub, tmp, 'old');
      await rewind(old, migrateSql);

      // The rewind has to actually remove something, or this proves nothing.
      const { added, created } = parseMigrations(migrateSql);
      assert(added.size + created.size > 0, 'migrate file adds nothing to verify');

      await runMigrationFile(old, `sql/${dir}`, migrateBase);

      const freshTables = await tablesOf(fresh);
      assert(JSON.stringify(await tablesOf(old)) === JSON.stringify(freshTables),
        `table list differs after migration`);
      for (const t of freshTables) {
        const want = await columnsOf(fresh, t);
        const got = await columnsOf(old, t);
        assert(JSON.stringify(got) === JSON.stringify(want),
          `${t}: after migrating, columns are [${got}] but a fresh database has [${want}]`);
      }
    });

    await test(`${dir}: re-running the migration is a no-op`, async () => {
      const db = await buildSqliteDb(sub, tmp, 'twice');
      await rewind(db, migrateSql);
      await runMigrationFile(db, `sql/${dir}`, migrateBase);
      const first = {};
      for (const t of await tablesOf(db)) first[t] = await columnsOf(db, t);
      await runMigrationFile(db, `sql/${dir}`, migrateBase); // must not throw
      const second = {};
      for (const t of await tablesOf(db)) second[t] = await columnsOf(db, t);
      assert(JSON.stringify(first) === JSON.stringify(second), 'schema changed on second run');
    });
  }

  console.log('\nSelf-check: the guard fails when it should\n');

  await test('an unmigrated new column is reported', async () => {
    const drift = findDrift(
      { 'data_manager.sources': ['source_id', 'auth_permissions'] },
      { 'data_manager.sources': ['source_id'] },
      '-- nothing here\n'
    );
    assert(drift.length === 1, `expected 1 violation, got ${drift.length}`);
    assert(drift[0].column === 'auth_permissions', `wrong column: ${drift[0].column}`);
  });

  await test('the same column WITH a migration is not reported', async () => {
    const drift = findDrift(
      { 'data_manager.sources': ['source_id', 'auth_permissions'] },
      { 'data_manager.sources': ['source_id'] },
      `ALTER TABLE data_manager.sources
           ADD COLUMN IF NOT EXISTS auth_permissions JSONB DEFAULT '{}'::jsonb;`
    );
    assert(drift.length === 0, `expected no violations, got ${JSON.stringify(drift)}`);
  });

  await test('a multi-clause ALTER covers every column it names', async () => {
    const drift = findDrift(
      { 'data_manager.tasks': ['task_id', 'attempt', 'max_attempts', 'schedule_id'] },
      { 'data_manager.tasks': ['task_id'] },
      `ALTER TABLE data_manager.tasks
           ADD COLUMN IF NOT EXISTS attempt      INTEGER NOT NULL DEFAULT 1,
           ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 1,
           ADD COLUMN IF NOT EXISTS schedule_id  INTEGER;`
    );
    assert(drift.length === 0, `expected no violations, got ${JSON.stringify(drift)}`);
  });

  await test('an unmigrated new table is reported', async () => {
    const drift = findDrift({ 'dms.page_visits': ['id'] }, {}, '-- nothing here\n');
    assert(drift.length === 1 && drift[0].kind === 'table', 'new table not reported');
  });

  await test('a column added only inside a comment does not count as migrated', async () => {
    const drift = findDrift(
      { 'data_manager.sources': ['source_id', 'auth_permissions'] },
      { 'data_manager.sources': ['source_id'] },
      `-- ALTER TABLE data_manager.sources ADD COLUMN IF NOT EXISTS auth_permissions JSONB;`
    );
    assert(drift.length === 1, 'a commented-out migration was accepted');
  });

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
