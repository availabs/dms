/**
 * Table Resolver — routes app+type pairs to the correct database table.
 *
 * Split modes:
 *   'legacy'  — single data_items table; only dataset row types get split tables
 *   'per-app' — each app gets its own data_items__{app} table;
 *               dataset row types further split into data_items__{app}__{type}
 *
 * Split type detection:
 *   Dataset row data has type pattern: {doc_type}-{view_id} or {doc_type}-{view_id}-invalid-entry
 *   where doc_type is either a UUID (8-4-4-4-12 hex) or a sanitized name ([a-z][a-z0-9_]*),
 *   and view_id is numeric.
 */

const { typeCast, currentTimestamp } = require('./query-utils.js');

// UUID-viewId pattern for dataset row data (e.g., 550e8400-e29b-41d4-a716-446655440000-42)
const UUID_SPLIT_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+(-invalid-entry)?$/;

// Name-viewId pattern for named dataset types (e.g., traffic_counts-1)
// Starts with a letter to avoid overlap with UUID patterns (which start with hex digits).
// Safe because DMS structural types always contain | or + characters.
const NAME_SPLIT_REGEX = /^[a-z][a-z0-9_]*-\d+(-invalid-entry)?$/;

// In-memory cache of tables known to exist (set of "schema.table" strings)
const _tableCache = new Set();

// In-memory cache of sequences known to exist (set of sequence key strings)
const _seqCache = new Set();

/**
 * Detect whether a type string represents dataset row data eligible for splitting.
 */
function isSplitType(type) {
  return typeof type === 'string' && (UUID_SPLIT_REGEX.test(type) || NAME_SPLIT_REGEX.test(type));
}

/**
 * Sanitize a name for use in a SQL table/sequence identifier.
 * Replaces hyphens with underscores, lowercases, strips non-alphanumeric/underscore chars.
 */
function sanitize(name) {
  if (typeof name !== 'string' || !name) return '';
  return name
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

// PostgreSQL max identifier length
const PG_MAX_IDENT = 63;

/**
 * Truncate a PostgreSQL identifier to fit within the 63-char limit.
 * Returns the name unchanged if it's short enough.
 */
function pgIdent(name) {
  return name.length <= PG_MAX_IDENT ? name : name.slice(0, PG_MAX_IDENT);
}

/**
 * Resolve which table an (app, type) pair should use.
 *
 * @param {string} app
 * @param {string} type
 * @param {string} dbType - 'postgres' or 'sqlite'
 * @param {string} splitMode - 'legacy' or 'per-app'
 * @returns {{ schema: string, table: string, fullName: string }}
 */
function resolveTable(app, type, dbType, splitMode = 'legacy') {
  const schema = dbType === 'postgres' ? 'dms' : 'main';
  const isPg = dbType === 'postgres';

  const result = (table) => {
    // PostgreSQL identifiers are capped at 63 chars
    const t = isPg ? pgIdent(table) : table;
    return { schema, table: t, fullName: isPg ? `${schema}.${t}` : t };
  };

  if (splitMode === 'legacy') {
    if (isSplitType(type)) return result(`data_items__${sanitize(type)}`);
    return result('data_items');
  }

  // per-app mode
  const appKey = sanitize(app);
  if (isSplitType(type)) return result(`data_items__${appKey}__${sanitize(type)}`);
  return result(`data_items__${appKey}`);
}

/**
 * Build the CREATE TABLE DDL for a split/per-app table.
 * Mirrors the data_items schema exactly.
 *
 * @param {string} schema
 * @param {string} table
 * @param {string} dbType
 * @param {string} seqName - PostgreSQL sequence name to use for DEFAULT
 * @returns {string} SQL DDL
 */
function buildCreateTableSQL(schema, table, dbType, seqName) {
  const fullName = dbType === 'postgres' ? `${schema}.${table}` : table;

  if (dbType === 'postgres') {
    // PostgreSQL identifiers are capped at 63 chars. Table names, constraint
    // names, and index names all share the pg_class namespace, so each must
    // be unique after truncation. We use different prefixes to avoid collisions.
    const tbl = pgIdent(table);
    const idxName = pgIdent(`ix_${table}`);
    const fqn = `${schema}.${tbl}`;
    return `
      CREATE TABLE IF NOT EXISTS ${fqn} (
        id bigint NOT NULL DEFAULT nextval('${seqName}'::regclass) PRIMARY KEY,
        app text NOT NULL,
        type text NOT NULL,
        data jsonb NOT NULL,
        created_at timestamp with time zone DEFAULT now(),
        created_by integer,
        updated_at timestamp with time zone DEFAULT now(),
        updated_by integer
      );
      CREATE INDEX IF NOT EXISTS ${idxName}
        ON ${fqn} (app, type);
    `;
  }

  // SQLite: no AUTOINCREMENT — IDs are allocated from a shared sequence table
  return `
    CREATE TABLE IF NOT EXISTS ${table} (
      id INTEGER PRIMARY KEY,
      app TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      created_by INTEGER,
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_${table}_app_type
      ON ${table} (app, type);
  `;
}

/**
 * Get the sequence name for an app (or the global sequence for legacy mode).
 *
 * @param {string} app
 * @param {string} dbType
 * @param {string} splitMode
 * @returns {string} sequence name/table identifier
 */
function getSequenceName(app, dbType, splitMode) {
  if (splitMode === 'legacy') {
    if (dbType === 'postgres') return 'dms.data_items_id_seq';
    return 'dms_id_seq';
  }
  // per-app mode
  const appKey = sanitize(app);
  if (dbType === 'postgres') return `dms.seq__${appKey}`;
  return `seq__${appKey}`;
}

/**
 * Ensure a per-app (or global legacy) sequence exists.
 * PostgreSQL: CREATE SEQUENCE IF NOT EXISTS
 * SQLite: CREATE TABLE IF NOT EXISTS (simulated sequence)
 *
 * @param {Object} db - Database adapter
 * @param {string} app
 * @param {string} dbType
 * @param {string} splitMode
 */
async function ensureSequence(db, app, dbType, splitMode) {
  const seqName = getSequenceName(app, dbType, splitMode);
  const cacheKey = `seq:${seqName}`;
  if (_seqCache.has(cacheKey)) return seqName;

  if (dbType === 'postgres') {
    await db.query(`CREATE SEQUENCE IF NOT EXISTS ${seqName} INCREMENT 1 START 1 MINVALUE 1 CACHE 1;`);
  } else {
    // SQLite: create a table with AUTOINCREMENT to simulate a sequence
    await db.query(`CREATE TABLE IF NOT EXISTS ${seqName} (id INTEGER PRIMARY KEY AUTOINCREMENT);`);
  }

  _seqCache.add(cacheKey);
  return seqName;
}

/**
 * Ensure a split/per-app table exists, creating it if needed.
 * No-ops for the default data_items table.
 *
 * @param {Object} db - Database adapter
 * @param {string} schema
 * @param {string} table
 * @param {string} dbType
 * @param {string} seqName - Sequence name for PostgreSQL DEFAULT
 */
async function ensureTable(db, schema, table, dbType, seqName) {
  // Don't auto-create the base data_items — that's handled by schema init
  if (table === 'data_items') return;

  const cacheKey = `${schema}.${table}`;
  if (_tableCache.has(cacheKey)) return;

  const ddl = buildCreateTableSQL(schema, table, dbType, seqName);

  if (dbType === 'sqlite') {
    // SQLite can't run multiple statements in one query; split on semicolons
    const stmts = ddl.split(';').filter(s => s.trim());
    for (const stmt of stmts) {
      await db.query(stmt + ';');
    }
  } else {
    await db.query(ddl);
  }

  _tableCache.add(cacheKey);
}

/**
 * Allocate a globally-unique ID from the appropriate sequence.
 *
 * @param {Object} db - Database adapter
 * @param {string} app
 * @param {string} dbType
 * @param {string} splitMode
 * @returns {Promise<number>} The allocated ID
 */
async function allocateId(db, app, dbType, splitMode) {
  const seqName = await ensureSequence(db, app, dbType, splitMode);

  if (dbType === 'postgres') {
    const { rows } = await db.query(`SELECT nextval('${seqName}') AS id`);
    return Number(rows[0].id);
  }

  // SQLite: insert into sequence table, get last_insert_rowid via RETURNING
  const { rows } = await db.query(`INSERT INTO ${seqName} DEFAULT VALUES RETURNING id;`);
  return rows[0].id;
}

/**
 * Clear the internal caches. Useful for testing.
 */
function clearCaches() {
  _tableCache.clear();
  _seqCache.clear();
}

module.exports = {
  isSplitType,
  sanitize,
  resolveTable,
  getSequenceName,
  ensureSequence,
  ensureTable,
  allocateId,
  buildCreateTableSQL,
  clearCaches,
  // Expose for testing
  UUID_SPLIT_REGEX,
  NAME_SPLIT_REGEX,
  // Backward compat alias
  SPLIT_TYPE_REGEX: UUID_SPLIT_REGEX
};
