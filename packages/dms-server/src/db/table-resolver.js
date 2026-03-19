/**
 * Table Resolver — routes app+type pairs to the correct database table.
 *
 * Split modes:
 *   'legacy'  — single data_items table; only dataset row types get split tables
 *   'per-app' — each app gets its own isolated storage:
 *               PostgreSQL: per-app schema (dms_{app}.data_items, dms_{app}.data_items__s{id}_v{vid})
 *               SQLite:     per-app table prefix (data_items__{app}, data_items__{app}__s{id}_v{vid})
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
// Case-insensitive: old datasets may have mixed-case doc_types (e.g., Actions_Revised-1074456).
// Safe because DMS structural types always contain | or + characters.
const NAME_SPLIT_REGEX = /^[a-z][a-z0-9_]*-\d+(-invalid-entry)?$/i;

// In-memory cache of tables known to exist (set of "schema.table" strings)
const _tableCache = new Set();

// In-memory cache of sequences known to exist (set of sequence key strings)
const _seqCache = new Set();

/**
 * Detect whether a type string represents dataset row data eligible for splitting.
 * Only name-based types (internal_table) are split into their own tables.
 * UUID-based types (internal_dataset) stay in data_items to match production behavior.
 */
function isSplitType(type) {
  return typeof type === 'string' && NAME_SPLIT_REGEX.test(type);
}

/**
 * Parse a split type string into its components.
 *
 * @param {string} type - e.g., 'actions_6-291' or 'actions_6-291-invalid-entry'
 * @returns {{ docType: string, viewId: string, isInvalid: boolean } | null}
 *   null if the type is not a valid split type
 */
function parseType(type) {
  if (!isSplitType(type)) return null;
  const isInvalid = type.endsWith('-invalid-entry');
  const core = isInvalid ? type.slice(0, -'-invalid-entry'.length) : type;
  const lastDash = core.lastIndexOf('-');
  return {
    docType: core.slice(0, lastDash),
    viewId: core.slice(lastDash + 1),
    isInvalid
  };
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
 * Resolve the PostgreSQL schema for an app in per-app mode.
 * Returns 'dms' for legacy mode or SQLite, 'dms_{appKey}' for per-app PG.
 */
function resolveSchema(app, dbType, splitMode) {
  if (dbType !== 'postgres' || splitMode !== 'per-app') {
    return dbType === 'postgres' ? 'dms' : 'main';
  }
  return pgIdent(`dms_${sanitize(app)}`);
}

/**
 * Resolve which table an (app, type) pair should use.
 *
 * In legacy mode, app isolation is via the shared data_items table (no prefix).
 * In per-app mode:
 *   PostgreSQL: per-app schema (dms_{app}.data_items, dms_{app}.data_items__split)
 *   SQLite:     per-app table prefix (data_items__{app}, data_items__{app}__split)
 *
 * @param {string} app
 * @param {string} type
 * @param {string} dbType - 'postgres' or 'sqlite'
 * @param {string} splitMode - 'legacy' or 'per-app'
 * @param {number|string|null} sourceId - optional source record ID for new naming
 * @returns {{ schema: string, table: string, fullName: string }}
 */
function resolveTable(app, type, dbType, splitMode = 'legacy', sourceId = null) {
  const isPg = dbType === 'postgres';

  if (splitMode === 'legacy') {
    const schema = isPg ? 'dms' : 'main';
    const result = (table) => {
      const t = isPg ? pgIdent(table) : table;
      return { schema, table: t, fullName: isPg ? `${schema}.${t}` : t };
    };

    if (isSplitType(type)) {
      if (sourceId != null) {
        const parsed = parseType(type);
        return result(`data_items__s${sourceId}_v${parsed.viewId}_${sanitize(parsed.docType)}`);
      }
      // Without sourceId, strip -invalid-entry before sanitizing so both
      // valid and invalid rows resolve to the same fallback table.
      const core = type.endsWith('-invalid-entry') ? type.slice(0, -'-invalid-entry'.length) : type;
      return result(`data_items__${sanitize(core)}`);
    }
    return result('data_items');
  }

  // per-app mode
  const appKey = sanitize(app);
  const schema = resolveSchema(app, dbType, splitMode);

  if (isPg) {
    // PostgreSQL: app isolation via schema, table names are clean
    const result = (table) => {
      const t = pgIdent(table);
      return { schema, table: t, fullName: `${schema}.${t}` };
    };

    if (isSplitType(type)) {
      if (sourceId != null) {
        const parsed = parseType(type);
        return result(`data_items__s${sourceId}_v${parsed.viewId}_${sanitize(parsed.docType)}`);
      }
      const core = type.endsWith('-invalid-entry') ? type.slice(0, -'-invalid-entry'.length) : type;
      return result(`data_items__${sanitize(core)}`);
    }
    return result('data_items');
  }

  // SQLite: app isolation via table name prefix (no schema support)
  const result = (table) => ({ schema: 'main', table, fullName: table });

  if (isSplitType(type)) {
    if (sourceId != null) {
      const parsed = parseType(type);
      return result(`data_items__${appKey}__s${sourceId}_v${parsed.viewId}_${sanitize(parsed.docType)}`);
    }
    const core = type.endsWith('-invalid-entry') ? type.slice(0, -'-invalid-entry'.length) : type;
    return result(`data_items__${appKey}__${sanitize(core)}`);
  }
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
  if (dbType === 'postgres') {
    const schema = resolveSchema(app, dbType, splitMode);
    return `${schema}.data_items_id_seq`;
  }
  return `seq__${appKey}`;
}

/**
 * Ensure the per-app PostgreSQL schema exists. No-op for SQLite or legacy mode.
 */
async function ensureSchema(db, app, dbType, splitMode) {
  if (dbType !== 'postgres' || splitMode !== 'per-app') return;
  const schema = resolveSchema(app, dbType, splitMode);
  const cacheKey = `schema:${schema}`;
  if (_seqCache.has(cacheKey)) return;
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  _seqCache.add(cacheKey);
}

/**
 * Ensure a per-app (or global legacy) sequence exists.
 * PostgreSQL: CREATE SEQUENCE IF NOT EXISTS (in the app's schema for per-app mode)
 * SQLite: CREATE TABLE IF NOT EXISTS (simulated sequence)
 *
 * @param {Object} db - Database adapter
 * @param {string} app
 * @param {string} dbType
 * @param {string} splitMode
 */
async function ensureSequence(db, app, dbType, splitMode) {
  await ensureSchema(db, app, dbType, splitMode);

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
  // Don't auto-create the base data_items in the shared 'dms' schema —
  // that's handled by schema init. Per-app schemas need their own data_items.
  if (table === 'data_items' && schema === 'dms') return;

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
  parseType,
  sanitize,
  resolveSchema,
  resolveTable,
  getSequenceName,
  ensureSchema,
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
