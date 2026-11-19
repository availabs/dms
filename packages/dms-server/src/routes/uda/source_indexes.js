/**
 * Source indexes an author manages from the datasets admin (setindex-composite-covering-indexes.md).
 *
 *   listSourceIndexes(env, sourceId)               every index on the source's tables, the ones DMS
 *                                                  manages with their state, and the ones made outside it
 *   createSourceIndex(env, sourceId, spec, user)   validate, record and build (in the background) one index
 *   dropSourceIndex(env, sourceId, key)            forget and drop (in the background) one managed index
 *   queueIndexBuild(ess, env, sourceId, op, spec)  the background build; setIndexColumn's toggle uses it too
 *
 * An index spec is one of:
 *   { columns: ['state', 'region_name'], include?: ['x'], where?: "<predicate>" }    composite / covering / partial
 *   { expression: "CASE WHEN owner_type IN ('2') THEN 1 ELSE 0 END", where?: … }   expression
 * A single plain column is the per-column toggle (`isIndex` on the column) — the same index, named
 * `idx_<table>_<col>` as it always was. Everything else is kept in `metadata.indexes` (DAMA:
 * data_manager.sources.metadata; DMS: the source row's data.metadata), a server-owned key that a
 * generic metadata save never changes (uda.controller.js SERVER_OWNED_METADATA_KEYS).
 *
 * Expressions are author-written SQL that ends up in DDL. Before anything runs they must pass
 * scanSqlExpression (one expression, no statement separators, comments, parameters or subqueries,
 * the UDA's own banned words), a volatility check on every function they call, and a read-only
 * EXPLAIN against each table (which also proves they only reference that table's columns).
 *
 * Postgres builds run as `CREATE INDEX CONCURRENTLY` in a DAMA (or DMS) task, because a large table
 * takes minutes. State is read from the catalog every time: ready = pg_index.indisvalid; an invalid
 * index with a pg_stat_progress_create_index row is building; one without is a failed build, which a
 * rebuild drops first. SQLite builds a plain index inline, columns only.
 */
const crypto = require('crypto');
const { getEssentials, sanitizeName, dmsMainTable } = require('./utils');
const { resolveTable, sanitize } = require('#db/table-resolver.js');
const { getInstance } = require('#db/type-utils.js');
const { parseJsonish } = require('./authority');

const WORKER_PATH = 'uda/source_index';
const PG_MAX_IDENT = 63;
const MAX_EXPRESSION_LENGTH = 2000;
const MAX_INDEX_COLUMNS = 32; // INDEX_MAX_KEYS, key and INCLUDE columns together
const PROBE_TIMEOUT = '10s';

const asObject = (value) => {
  const parsed = parseJsonish(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
};
const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

// ------------------------------------------------ authored SQL ------------------------------------------------

// A calculated column is `<expression> AS <alias>`; the query builder sends only the expression to
// WHERE / GROUP BY (dataWrapper buildUdaConfig.js refName), so the index must use it alone.
// The alias is the TRAILING `as <identifier>`, as in utils.js getResponseColumnName.
function stripAlias(text) {
  const m = String(text).match(/^([\s\S]+)\s+as\s+("[^"]+"|[A-Za-z_]\w*)\s*$/i);
  return m ? m[1] : String(text);
}

/**
 * Check that `text` is one SQL expression and nothing else, and return it with runs of whitespace
 * (outside quotes) collapsed to one space. Throws an author-readable Error.
 *
 * Refused: `;`, comments, `$` (parameters, dollar quotes), backslashes (E'' escapes), a comma or a
 * `)` outside parentheses (a second expression, or a way out of the one we wrap it in), unclosed
 * quotes, and the words the UDA already refuses in a query's columns (utils.js sanitizeName:
 * select, drop, union, …) plus `values` (a subquery without select).
 */
function scanSqlExpression(text, what = 'Expression') {
  if (typeof text !== 'string') throw new Error(`${what} must be text`);
  const s = text.trim();
  if (!s) throw new Error(`${what} is empty`);
  if (s.length > MAX_EXPRESSION_LENGTH) throw new Error(`${what} is longer than ${MAX_EXPRESSION_LENGTH} characters`);
  // Anywhere, quotes included: in an E'' string a backslash escapes the quote, which this scan
  // (standard strings only) would read differently from Postgres.
  if (s.includes('\\')) throw new Error(`${what} can't contain a backslash`);

  let out = '';
  let depth = 0;
  let unquoted = '';
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      for (;;) {
        if (j >= s.length) throw new Error(`${what} has an unclosed ${c === "'" ? 'quote' : 'quoted name'}`);
        if (s[j] === c) {
          if (s[j + 1] === c) { j += 2; continue; }
          break;
        }
        j++;
      }
      out += s.slice(i, j + 1);
      if (c === '"') unquoted += ' ';
      i = j + 1;
      continue;
    }
    if ((c === '-' && s[i + 1] === '-') || (c === '/' && s[i + 1] === '*')) throw new Error(`${what} can't contain comments`);
    if (c === ';') throw new Error(`${what} must be one expression (remove the ;)`);
    if (c === '$') throw new Error(`${what} can't contain $`);
    if (c === '(') depth++;
    if (c === ')' && --depth < 0) throw new Error(`${what} has an unmatched )`);
    if (c === ',' && depth === 0) throw new Error(`${what} must be one expression (found a comma outside parentheses)`);
    if (/\s/.test(c)) {
      if (!out.endsWith(' ')) out += ' ';
      unquoted += ' ';
      i++;
      continue;
    }
    out += c;
    unquoted += c;
    i++;
  }
  if (depth !== 0) throw new Error(`${what} has an unmatched (`);
  if (!sanitizeName(s)) throw new Error(`${what} uses a word queries can't use (select, drop, union, cast, …)`);
  if (/\bvalues\b/i.test(unquoted)) throw new Error(`${what} can't contain a subquery`);
  return out.trim();
}

// Names called as functions in an expression (outside quotes): `lower(`, `pg_catalog.lower (`.
// Keywords that take parentheses (IN, ANY, COALESCE, …) aren't in pg_proc and are ignored by the check.
function calledFunctionNames(expr) {
  const bare = expr.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
  const names = new Set();
  for (const m of bare.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) names.add(m[1].toLowerCase());
  return [...names];
}

// ------------------------------------------------ specs ------------------------------------------------

function cleanColumnName(name, { isDms }) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Column names must be text');
  const n = name.trim();
  if (n.length > PG_MAX_IDENT) throw new Error(`Column name "${n.slice(0, 20)}…" is too long`);
  if (/["\u0000]/.test(n) || (isDms && /'/.test(n))) throw new Error(`Column "${n}" has a character an index can't use`);
  return n;
}

/**
 * The canonical spec, or an Error naming what's wrong. A bare string is one column (the old
 * setIndex argument). `ctx.isDms`: columns are keys of the row's data, and INCLUDE is not available.
 */
function normalizeSpec(raw, { isDms = false } = {}) {
  const input = typeof raw === 'string' ? { columns: [raw] } : (raw && typeof raw === 'object' ? raw : null);
  if (!input) throw new Error('An index needs columns or an expression');

  const columns = (Array.isArray(input.columns) ? input.columns : input.columns ? [input.columns] : [])
    .filter(c => c !== '' && c != null).map(c => cleanColumnName(c, { isDms }));
  const include = (Array.isArray(input.include) ? input.include : input.include ? [input.include] : [])
    .filter(c => c !== '' && c != null).map(c => cleanColumnName(c, { isDms }));
  const hasExpression = typeof input.expression === 'string' && input.expression.trim() !== '';

  if (hasExpression && columns.length) throw new Error('Index either columns or an expression, not both');
  if (!hasExpression && !columns.length) throw new Error('Pick at least one column, or enter an expression');
  if (new Set(columns).size !== columns.length) throw new Error('A column is listed twice');
  if (include.some(c => columns.includes(c))) throw new Error('A column is both indexed and included');
  if (columns.length + include.length + (hasExpression ? 1 : 0) > MAX_INDEX_COLUMNS) {
    throw new Error(`An index can hold at most ${MAX_INDEX_COLUMNS} columns`);
  }
  if (isDms && include.length) throw new Error('Included columns are only available for DataManager sources');

  const expression = hasExpression ? scanSqlExpression(stripAlias(input.expression), 'Expression') : null;
  const where = typeof input.where === 'string' && input.where.trim() ? scanSqlExpression(input.where, 'Condition') : null;
  const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 80) : null;

  return { columns, include, where, expression, label };
}

const isSingleColumn = (spec) =>
  spec.columns.length === 1 && !spec.include.length && !spec.where && !spec.expression;

// Deterministic and table-independent: the same spec always has the same key.
function specKey(spec) {
  if (isSingleColumn(spec)) return `col:${spec.columns[0]}`;
  const canonical = JSON.stringify([spec.columns, spec.include, spec.where, spec.expression]);
  return `ix_${crypto.createHash('sha1').update(canonical).digest('hex').slice(0, 10)}`;
}

/**
 * The index name on one table. A single column keeps the name the per-column toggle always used,
 * `idx_<table>_<col>` (cut at 63), so existing indexes stay managed. Anything else is
 * `idx_<table, cut to fit>_<key hash>`: the hash survives the cut, so two specs never share a name.
 */
function indexNameFor(table, spec) {
  if (isSingleColumn(spec)) return `idx_${sanitize(table)}_${sanitize(spec.columns[0])}`.slice(0, PG_MAX_IDENT);
  const hash = specKey(spec).replace(/^ix_/, '');
  return `idx_${sanitize(table).slice(0, PG_MAX_IDENT - 5 - hash.length)}_${hash}`;
}

function keyParts(spec, { isDms, dbType }) {
  if (spec.expression) return [`(${spec.expression})`];
  return spec.columns.map(c => {
    if (!isDms) return quoteIdent(c);
    return dbType === 'postgres' ? `(data->>'${c}')` : `(json_extract(data, '$.${c}'))`;
  });
}

/** The CREATE INDEX statement for one table. Every value in it has been validated or quoted. */
function buildCreateIndexSql({ schema, table, name, spec, isDms = false, dbType = 'postgres', concurrently = false }) {
  const parts = keyParts(spec, { isDms, dbType }).join(', ');
  if (dbType !== 'postgres') {
    return `CREATE INDEX IF NOT EXISTS ${quoteIdent(name)} ON ${quoteIdent(table)} (${parts})`;
  }
  const include = spec.include.length ? ` INCLUDE (${spec.include.map(quoteIdent).join(', ')})` : '';
  const where = spec.where ? ` WHERE (${spec.where})` : '';
  return `CREATE INDEX ${concurrently ? 'CONCURRENTLY ' : ''}IF NOT EXISTS ${quoteIdent(name)} ` +
    `ON ${quoteIdent(schema)}.${quoteIdent(table)} (${parts})${include}${where}`;
}

function buildDropIndexSql({ schema, name, dbType = 'postgres', concurrently = false }) {
  if (dbType !== 'postgres') return `DROP INDEX IF EXISTS ${quoteIdent(name)}`;
  return `DROP INDEX ${concurrently ? 'CONCURRENTLY ' : ''}IF EXISTS ${quoteIdent(schema)}.${quoteIdent(name)}`;
}

// ------------------------------------------------ the source ------------------------------------------------

// The DMS source row: its config (columns live in config.attributes) and data.
async function dmsSourceRow(ess, sourceId) {
  const tbl = await dmsMainTable(ess.db, ess.app, ess.splitMode);
  const { rows } = await ess.db.query(`SELECT data, type FROM ${tbl} WHERE id = $1`, [+sourceId]);
  if (!rows.length) throw new Error(`Source ${sourceId} not found`);
  const data = asObject(rows[0].data);
  return { data, type: rows[0].type, config: asObject(data.config) };
}

async function tableExists(db, schema, table) {
  if (db.type === 'postgres') {
    const { rows: [r] } = await db.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`${quoteIdent(schema)}.${quoteIdent(table)}`]);
    return !!r?.ok;
  }
  const { rows } = await db.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $1`, [table]);
  return rows.length > 0;
}

/** Every table behind the source, in view order: [{ view_id, schema, table, exists }]. */
async function sourceTables(ess, sourceId) {
  const { isDms, db, app, splitMode } = ess;
  let tables;
  if (isDms) {
    const { data, type } = await dmsSourceRow(ess, sourceId);
    const slug = getInstance(type);
    const viewIds = (Array.isArray(data.views) ? data.views : [])
      .map(v => (v && typeof v === 'object' ? v.id : v)).filter(Boolean);
    tables = viewIds.map(viewId => {
      const { schema, table } = resolveTable(app, `${slug}|${viewId}:data`, db.type, splitMode, +sourceId);
      return { view_id: +viewId, schema, table };
    });
  } else {
    const viewsTbl = db.type === 'postgres' ? 'data_manager.views' : 'views';
    const { rows } = await db.query(
      `SELECT view_id, table_schema, table_name FROM ${viewsTbl}
       WHERE source_id = $1 AND table_name IS NOT NULL ORDER BY view_id`, [+sourceId]);
    tables = rows.map(r => ({ view_id: +r.view_id, schema: r.table_schema, table: r.table_name }));
  }
  for (const t of tables) t.exists = await tableExists(db, t.schema, t.table);
  return tables;
}

async function liveColumns(db, schema, table) {
  if (db.type === 'postgres') {
    const { rows } = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
      [schema, table]);
    return rows.map(r => r.column_name);
  }
  const { rows } = await db.query(`SELECT name FROM pragma_table_info($1)`, [table]);
  return rows.map(r => r.name);
}

/**
 * The indexes DMS manages on the source: one per column flagged `isIndex` (the toggle), then
 * metadata.indexes. Each: { key, spec, legacy, label, addedBy, addedAt }.
 */
async function managedIndexes(ess, sourceId) {
  const { readSourceMetadata } = require('./uda.controller');
  let columns;
  if (ess.isDms) {
    columns = (await dmsSourceRow(ess, sourceId)).config.attributes || [];
  } else {
    const srcTbl = ess.db.type === 'postgres' ? 'data_manager.sources' : 'sources';
    const { rows } = await ess.db.query(`SELECT metadata FROM ${srcTbl} WHERE source_id = $1`, [+sourceId]);
    if (!rows.length) throw new Error(`Source ${sourceId} not found`);
    columns = asObject(rows[0].metadata).columns || [];
  }
  const { meta } = await readSourceMetadata(ess, sourceId);

  const out = [];
  const seen = new Set();
  for (const c of Array.isArray(columns) ? columns : []) {
    if (!c || !c.isIndex || typeof c.name !== 'string') continue;
    try {
      const spec = normalizeSpec({ columns: [c.name] }, { isDms: ess.isDms });
      const key = specKey(spec);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, spec, legacy: true, label: null });
    } catch (e) { /* a column name an index can't use: never built, nothing to manage */ }
  }
  for (const entry of Array.isArray(meta.indexes) ? meta.indexes : []) {
    try {
      const spec = normalizeSpec(entry, { isDms: ess.isDms });
      const key = specKey(spec);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, spec, legacy: false, label: spec.label, addedBy: entry.addedBy || null, addedAt: entry.addedAt || null });
    } catch (e) { /* a stored entry that no longer validates is ignored, never built */ }
  }
  return out;
}

// ------------------------------------------------ validation against the tables ------------------------------------------------

// Postgres: the functions an expression calls must all be IMMUTABLE, as CREATE INDEX requires.
// Checked up front so the author sees it now, not when a background build fails.
async function assertImmutableFunctions(db, text, what) {
  for (const fn of calledFunctionNames(text)) {
    const { rows: [r] } = await db.query(
      `SELECT count(*)::int AS n, bool_or(provolatile = 'i') AS immutable FROM pg_proc WHERE proname = $1`, [fn]);
    if (r && r.n > 0 && !r.immutable) {
      throw new Error(`${what} calls ${fn}(), which can return different results over time, so it can't be indexed`);
    }
  }
}

// Postgres: run the expression and condition read-only against the table without reading a row.
// EXPLAIN plans the statement and runs nothing; the transaction is READ ONLY with a timeout as well.
// In WHERE, so aggregates, window and set-returning functions are refused as an index refuses them;
// FROM names only this table, so any other column or table reference fails here.
async function probeOnTable(db, t, spec) {
  const fqt = `${quoteIdent(t.schema)}.${quoteIdent(t.table)}`;
  const label = `${t.schema}.${t.table}`;
  await db.withTransaction(async (tx) => {
    await tx.query('SET TRANSACTION READ ONLY');
    await tx.query(`SET LOCAL statement_timeout = '${PROBE_TIMEOUT}'`);
    if (spec.expression) {
      try {
        await tx.query(`EXPLAIN SELECT 1 FROM ${fqt} WHERE ((${spec.expression})) IS NOT NULL LIMIT 0`);
      } catch (e) {
        throw new Error(`Expression doesn't work on ${label}: ${e.message}`);
      }
    }
    if (spec.where) {
      try {
        await tx.query(`EXPLAIN SELECT 1 FROM ${fqt} WHERE (${spec.where}) LIMIT 0`);
      } catch (e) {
        throw new Error(`Condition doesn't work on ${label}: ${e.message}`);
      }
    }
  });
}

async function validateOnTables(ess, tables, spec, { dmsAttributes = null } = {}) {
  const { db, isDms } = ess;
  if (db.type !== 'postgres' && (spec.expression || spec.where || spec.include.length)) {
    throw new Error('Expression, condition and included columns need a PostgreSQL database');
  }
  if (isDms && dmsAttributes) {
    const names = new Set(dmsAttributes.map(a => a && a.name).filter(Boolean));
    const missing = spec.columns.filter(c => !names.has(c));
    if (missing.length) throw new Error(`Not a column of this source: ${missing.join(', ')}`);
  }
  if (db.type === 'postgres') {
    if (spec.expression) await assertImmutableFunctions(db, spec.expression, 'Expression');
    if (spec.where) await assertImmutableFunctions(db, spec.where, 'Condition');
  }
  for (const t of tables.filter(x => x.exists)) {
    if (!isDms) {
      const cols = new Set(await liveColumns(db, t.schema, t.table));
      const missing = [...spec.columns, ...spec.include].filter(c => !cols.has(c));
      if (missing.length) throw new Error(`${t.schema}.${t.table} has no column ${missing.join(', ')}`);
    }
    if (db.type === 'postgres' && (spec.expression || spec.where)) await probeOnTable(db, t, spec);
  }
}

// ------------------------------------------------ catalog state ------------------------------------------------

// Every index on a Postgres table, with validity and any build in progress.
async function pgTableIndexes(q, schema, table) {
  const { rows } = await q.query(
    `SELECT c.relname AS name, pg_get_indexdef(i.indexrelid) AS definition,
            i.indisvalid AS valid, i.indisprimary AS is_primary, i.indisunique AS is_unique,
            p.phase, p.blocks_total, p.blocks_done
     FROM pg_index i
     JOIN pg_class c ON c.oid = i.indexrelid
     LEFT JOIN pg_stat_progress_create_index p ON p.index_relid = i.indexrelid
     WHERE i.indrelid = to_regclass($1)
     ORDER BY c.relname`,
    [`${quoteIdent(schema)}.${quoteIdent(table)}`]);
  return rows;
}

async function sqliteTableIndexes(db, table) {
  const { rows } = await db.query(
    `SELECT name, sql AS definition FROM sqlite_master WHERE type = 'index' AND tbl_name = $1 ORDER BY name`, [table]);
  return rows.map(r => ({ ...r, valid: true, is_primary: false, is_unique: /\bunique\b/i.test(r.definition || ''), phase: null }));
}

// ------------------------------------------------ background builds ------------------------------------------------

function taskSystem(ess, env) {
  if (ess.isDms) {
    const t = require('../../dms/tasks');
    return {
      table: ess.db.type === 'postgres' ? 'dms.tasks' : 'dms_tasks',
      queue: (d) => t.queueTask(d),
      claim: (id) => t.claimTaskById(id),
      start: (task) => t.startTaskWorker(task),
    };
  }
  const t = require('../../dama/tasks');
  return {
    table: ess.db.type === 'postgres' ? 'data_manager.tasks' : 'tasks',
    queue: (d) => t.queueTask(d, env),
    claim: (id) => t.claimTaskById(id, env),
    start: (task) => t.startTaskWorker(task, env),
  };
}

// The newest index tasks for the source, newest first, with their descriptor parsed.
async function recentIndexTasks(ess, env, sourceId) {
  const { table } = taskSystem(ess, env);
  const appClause = ess.isDms ? ' AND app = $3' : '';
  const params = ess.isDms ? [+sourceId, WORKER_PATH, ess.app] : [+sourceId, WORKER_PATH];
  const { rows } = await ess.db.query(
    `SELECT task_id, status, error, descriptor, progress, queued_at, started_at, completed_at
     FROM ${table} WHERE source_id = $1 AND worker_path = $2${appClause}
     ORDER BY task_id DESC LIMIT 200`, params);
  return rows.map(r => ({ ...r, descriptor: asObject(r.descriptor) }));
}

const isActive = (task) => task && (task.status === 'queued' || task.status === 'running');

/**
 * Queue a build (op 'create') or a drop (op 'drop') of `spec` on every table behind the source, and
 * start it at once on this server. Refused while another task for the same index is queued or running.
 * Postgres only; returns the task id.
 */
async function queueIndexBuild(ess, env, sourceId, op, spec) {
  const key = specKey(spec);
  const active = (await recentIndexTasks(ess, env, sourceId)).find(t => t.descriptor.key === key && isActive(t));
  if (active) {
    throw new Error(active.descriptor.op === 'drop' ? 'This index is being removed; try again when that finishes'
      : 'This index is already being built');
  }
  const ts = taskSystem(ess, env);
  const descriptor = {
    workerPath: WORKER_PATH, sourceId: +sourceId, env, op, key, spec,
    ...(ess.isDms ? { app: ess.app } : {}),
  };
  const taskId = await ts.queue(descriptor);
  // Run it now rather than at the next poll. claim is a conditional UPDATE, so if the poller got
  // there first this is a no-op.
  const task = await ts.claim(taskId);
  if (task) ts.start(task).catch(e => console.error(`[source_index] task ${taskId}:`, e.message));
  return taskId;
}

// Postgres: build one index on one table, CONCURRENTLY, on its own connection with no statement
// timeout. An invalid index of the same name (a failed or interrupted build) is dropped first;
// one that is still being built is left alone.
async function buildOnPgTable(db, t, name, spec, isDms) {
  const client = await db.getConnection();
  try {
    await client.query('SET statement_timeout = 0');
    const before = (await pgTableIndexes(client, t.schema, t.table)).find(i => i.name === name);
    if (before && before.valid) return { status: 'ready', note: 'already built' };
    if (before && before.phase) throw new Error('Another build of this index is still running');
    if (before) await client.query(buildDropIndexSql({ schema: t.schema, name, concurrently: true }));
    await client.query(buildCreateIndexSql({ schema: t.schema, table: t.table, name, spec, isDms, concurrently: true }));
    const after = (await pgTableIndexes(client, t.schema, t.table)).find(i => i.name === name);
    if (!after || !after.valid) throw new Error('The build ended but the index is not valid');
    return { status: 'ready' };
  } finally {
    await client.query('RESET statement_timeout').catch(() => {});
    client.release();
  }
}

async function dropOnPgTable(db, t, name) {
  const client = await db.getConnection();
  try {
    await client.query('SET statement_timeout = 0');
    await client.query(buildDropIndexSql({ schema: t.schema, name, concurrently: true }));
    return { status: 'dropped' };
  } finally {
    await client.query('RESET statement_timeout').catch(() => {});
    client.release();
  }
}

/** The task handler (DAMA and DMS task systems). One table failing doesn't stop the others. */
async function runIndexTask(ctx) {
  const d = asObject(ctx.task.descriptor);
  const ess = await getEssentials({ env: d.env });
  const spec = normalizeSpec(d.spec, { isDms: ess.isDms });
  const tables = (await sourceTables(ess, d.sourceId)).filter(t => t.exists);

  if (d.op === 'create' && !(await managedIndexes(ess, d.sourceId)).some(m => m.key === d.key)) {
    return { skipped: 'the index was removed before the build started', tables: [] };
  }

  const results = [];
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    const name = indexNameFor(t.table, spec);
    const label = `${t.schema}.${t.table}`;
    try {
      if (d.op === 'drop') {
        results.push({ table: label, name, ...(await dropOnPgTable(ess.db, t, name)) });
      } else {
        if (!ess.isDms) {
          const cols = new Set(await liveColumns(ess.db, t.schema, t.table));
          const missing = [...spec.columns, ...spec.include].filter(c => !cols.has(c));
          if (missing.length) { results.push({ table: label, name, status: 'skipped', note: `no column ${missing.join(', ')}` }); continue; }
        }
        results.push({ table: label, name, ...(await buildOnPgTable(ess.db, t, name, spec, ess.isDms)) });
      }
    } catch (e) {
      results.push({ table: label, name, status: 'error', error: e.message });
    }
    await ctx.updateProgress((i + 1) / tables.length).catch(() => {});
  }
  const failed = results.filter(r => r.status === 'error');
  if (failed.length) throw new Error(failed.map(r => `${r.table}: ${r.error}`).join('; '));
  return { tables: results };
}

require('../../dama/tasks').registerHandler(WORKER_PATH, runIndexTask);
require('../../dms/tasks').registerHandler(WORKER_PATH, runIndexTask);

/**
 * Build or drop `spec` on the source's tables: in the background on Postgres, inline on SQLite
 * (a plain index; there are no concurrent builds there). Returns { taskId } or { inline: results }.
 */
async function applyIndex(ess, env, sourceId, op, spec) {
  if (ess.db.type === 'postgres') return { taskId: await queueIndexBuild(ess, env, sourceId, op, spec) };
  const results = [];
  for (const t of (await sourceTables(ess, sourceId)).filter(x => x.exists)) {
    const name = indexNameFor(t.table, spec);
    try {
      if (op === 'drop') {
        await ess.db.query(buildDropIndexSql({ name, dbType: ess.db.type }));
      } else {
        if (!ess.isDms) {
          const cols = new Set(await liveColumns(ess.db, t.schema, t.table));
          if (spec.columns.some(c => !cols.has(c))) continue;
        }
        await ess.db.query(buildCreateIndexSql({ table: t.table, name, spec, isDms: ess.isDms, dbType: ess.db.type }));
      }
      results.push({ table: t.table, name, status: op === 'drop' ? 'dropped' : 'ready' });
    } catch (e) {
      console.warn(`[source_index] ${op} ${name}: ${e.message}`);
      results.push({ table: t.table, name, status: 'error', error: e.message });
    }
  }
  return { inline: results };
}

// ------------------------------------------------ the routes' functions ------------------------------------------------

const STATE_ORDER = ['dropping', 'building', 'failed', 'missing', 'ready'];

function tableState({ idx, task }) {
  if (isActive(task) && task.descriptor.op === 'drop') return { state: 'dropping' };
  if (idx && idx.valid) return { state: 'ready' };
  if (idx && idx.phase) {
    const total = Number(idx.blocks_total) || 0;
    return { state: 'building', phase: idx.phase, progress: total ? Math.min(1, Number(idx.blocks_done) / total) : null };
  }
  if (isActive(task)) return { state: 'building', phase: task.status === 'queued' ? 'queued' : 'starting' };
  if (idx) return { state: 'failed', error: (task && task.status === 'error' && task.error) || 'The build stopped before it finished' };
  if (task && task.status === 'error' && task.descriptor.op === 'create') return { state: 'failed', error: task.error };
  return { state: 'missing' };
}

/**
 * What the Indexes panel shows:
 *   { supported, engine, expressions, tables: [{ view_id, table, exists }], columns: [names],
 *     managed: [{ key, kind, columns, include, where, expression, label, legacy, state, tables: [...] }],
 *     other:   [{ table, name, definition, valid, isPrimary, isUnique }] }    (made outside DMS)
 */
async function listSourceIndexes(env, sourceId) {
  const ess = await getEssentials({ env });
  const { db, isDms } = ess;
  const isPg = db.type === 'postgres';
  const tables = await sourceTables(ess, sourceId);
  const managed = await managedIndexes(ess, sourceId);
  const tasks = isPg ? await recentIndexTasks(ess, env, sourceId) : [];
  const latestTask = (key) => tasks.find(t => t.descriptor.key === key) || null;

  const existing = tables.filter(t => t.exists);
  const catalog = new Map();
  for (const t of existing) {
    catalog.set(t, isPg ? await pgTableIndexes(db, t.schema, t.table) : await sqliteTableIndexes(db, t.table));
  }
  const managedNames = new Set();

  const managedOut = managed.map(m => {
    const task = latestTask(m.key);
    const perTable = existing.map(t => {
      const name = indexNameFor(t.table, m.spec);
      managedNames.add(`${t.schema}.${name}`);
      const idx = catalog.get(t).find(i => i.name === name) || null;
      return {
        view_id: t.view_id, table: `${t.schema}.${t.table}`, name,
        definition: idx ? idx.definition : null,
        ...tableState({ idx, task }),
      };
    });
    const state = perTable.length
      ? STATE_ORDER.find(s => perTable.some(p => p.state === s))
      : (isActive(task) ? 'building' : 'missing');
    return {
      key: m.key,
      kind: m.spec.expression ? 'expression' : 'columns',
      ...m.spec,
      legacy: m.legacy,
      addedBy: m.addedBy || null,
      addedAt: m.addedAt || null,
      state,
      readyCount: perTable.filter(p => p.state === 'ready').length,
      tables: perTable,
      task: task ? { task_id: task.task_id, op: task.descriptor.op, status: task.status, error: task.error || null } : null,
    };
  });

  // Indexes DMS doesn't manage (made by an upload, by hand, or the primary key): shown, never changed.
  // A drop still running keeps its index listed as `dropping` under managed, not here.
  const dropping = tasks.filter(t => isActive(t) && t.descriptor.op === 'drop' && !managed.some(m => m.key === t.descriptor.key));
  for (const t of dropping) {
    try {
      const spec = normalizeSpec(t.descriptor.spec, { isDms });
      managedOut.push({
        key: t.descriptor.key, kind: spec.expression ? 'expression' : 'columns', ...spec, legacy: false,
        state: 'dropping', readyCount: 0,
        tables: existing.map(x => ({ view_id: x.view_id, table: `${x.schema}.${x.table}`, name: indexNameFor(x.table, spec), state: 'dropping' })),
        task: { task_id: t.task_id, op: 'drop', status: t.status, error: null },
      });
      for (const x of existing) managedNames.add(`${x.schema}.${indexNameFor(x.table, spec)}`);
    } catch (e) { /* not a spec we can read */ }
  }

  const other = [];
  for (const t of existing) {
    for (const i of catalog.get(t)) {
      if (managedNames.has(`${t.schema}.${i.name}`)) continue;
      other.push({
        table: `${t.schema}.${t.table}`, name: i.name, definition: i.definition,
        valid: !!i.valid, isPrimary: !!i.is_primary, isUnique: !!i.is_unique,
      });
    }
  }

  let columns = [];
  const latest = existing[existing.length - 1];
  if (isDms) {
    columns = ((await dmsSourceRow(ess, sourceId)).config.attributes || []).map(a => a && a.name).filter(Boolean);
  } else if (latest) {
    columns = await liveColumns(db, latest.schema, latest.table);
  }

  return {
    supported: true,
    engine: isPg ? 'postgres' : db.type,
    expressions: isPg,
    tables: tables.map(t => ({ view_id: t.view_id, table: `${t.schema}.${t.table}`, exists: t.exists })),
    columns,
    managed: managedOut,
    other,
  };
}

/**
 * Add an index (or rebuild one already managed: same spec, same key). Validates on every table
 * before anything is written; then records it and queues the build. Returns listSourceIndexes.
 */
async function createSourceIndex(env, sourceId, rawSpec, user = null) {
  const { mutateSourceMetadata, setIndexColumn } = require('./uda.controller');
  const ess = await getEssentials({ env });
  const spec = normalizeSpec(rawSpec, { isDms: ess.isDms });
  const tables = await sourceTables(ess, sourceId);
  if (!tables.some(t => t.exists)) throw new Error('This source has no table yet. Publish a version first');

  let dmsAttributes = null;
  let metaColumns = [];
  if (ess.isDms) {
    dmsAttributes = (await dmsSourceRow(ess, sourceId)).config.attributes || [];
  } else {
    const srcTbl = ess.db.type === 'postgres' ? 'data_manager.sources' : 'sources';
    const { rows } = await ess.db.query(`SELECT metadata FROM ${srcTbl} WHERE source_id = $1`, [+sourceId]);
    metaColumns = asObject(rows[0] && rows[0].metadata).columns || [];
  }
  await validateOnTables(ess, tables, spec, { dmsAttributes });

  const key = specKey(spec);
  const already = (await managedIndexes(ess, sourceId)).some(m => m.key === key);
  const listed = (ess.isDms ? dmsAttributes : metaColumns).some(c => c && c.name === spec.columns[0]);
  if (isSingleColumn(spec) && listed) {
    // The per-column toggle: the same flag, the same index name, the same build.
    await setIndexColumn(env, sourceId, spec.columns[0], true);
  } else {
    if (!already) {
      await mutateSourceMetadata(ess, sourceId, (meta) => {
        const list = (Array.isArray(meta.indexes) ? meta.indexes : []).filter(e => {
          try { return specKey(normalizeSpec(e, { isDms: ess.isDms })) !== key; } catch (err) { return true; }
        });
        list.push({
          key, columns: spec.columns, include: spec.include, where: spec.where, expression: spec.expression,
          ...(spec.label ? { label: spec.label } : {}),
          addedBy: (user && (user.email || user.id)) || null, addedAt: new Date().toISOString(),
        });
        return { ...meta, indexes: list };
      });
    }
    await applyIndex(ess, env, sourceId, 'create', spec);
  }
  return listSourceIndexes(env, sourceId);
}

/** Stop managing an index and drop it from every table. Returns listSourceIndexes. */
async function dropSourceIndex(env, sourceId, key) {
  const { mutateSourceMetadata, setIndexColumn } = require('./uda.controller');
  const ess = await getEssentials({ env });
  const entry = (await managedIndexes(ess, sourceId)).find(m => m.key === key);
  if (!entry) throw new Error('DMS doesn\'t manage this index');
  if (entry.legacy) {
    await setIndexColumn(env, sourceId, entry.spec.columns[0], false);
  } else {
    await mutateSourceMetadata(ess, sourceId, (meta) => ({
      ...meta,
      indexes: (Array.isArray(meta.indexes) ? meta.indexes : []).filter(e => {
        try { return specKey(normalizeSpec(e, { isDms: ess.isDms })) !== key; } catch (err) { return true; }
      }),
    }));
    await applyIndex(ess, env, sourceId, 'drop', entry.spec);
  }
  return listSourceIndexes(env, sourceId);
}

module.exports = {
  WORKER_PATH,
  listSourceIndexes,
  createSourceIndex,
  dropSourceIndex,
  applyIndex,
  // exported for tests
  stripAlias,
  scanSqlExpression,
  normalizeSpec,
  specKey,
  indexNameFor,
  buildCreateIndexSql,
  runIndexTask,
};
