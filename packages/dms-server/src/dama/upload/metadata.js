/**
 * DAMA source and view creation for external datasets.
 * Creates records in data_manager.sources and data_manager.views.
 */

const { getDb } = require('../../db');
const { nameToSlug } = require('../../db/type-utils');

const DEFAULT_SCHEMA = 'gis_datasets';

// Postgres caps identifiers at 63 chars (NAMEDATALEN-1). Reserve room for the
// `s{source_id}_v{view_id}_` prefix; with worst-case 7-digit IDs that's
// `s9999999_v9999999_` = 18 chars. Cap the source-name slug at 40 to keep
// us comfortably under 63.
const MAX_NAME_SLUG_LEN = 40;

/**
 * Create a new source record.
 * @param {Object} values - { name, display_name, type, description, user_id, ... }
 * @param {string} pgEnv - Database config name
 * @returns {Object} Created source row
 */
async function createDamaSource(values, pgEnv) {
  const db = getDb(pgEnv);
  const table = db.type === 'postgres' ? 'data_manager.sources' : 'sources';

  const { name, display_name, type, description, user_id, metadata, categories } = values;

  // Default auth: if user_id provided, give them full access
  let statistics = values.statistics || null;
  if (!statistics && user_id) {
    statistics = { auth: { users: { [user_id]: '10' }, groups: {} } };
  }

  // JSONB columns need explicit JSON.stringify — node-postgres serializes JS arrays
  // as PostgreSQL array literals ('{{"x"}}'), which isn't valid JSON and fails the
  // jsonb cast. Applies to nested categories like [['Uploaded File']].
  const statisticsJson = statistics ? JSON.stringify(statistics) : null;
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  const categoriesJson = categories ? JSON.stringify(categories) : null;

  // Try insert, on duplicate name append _N suffix
  let sourceName = name;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const { rows } = await db.query(`
        INSERT INTO ${table} (name, display_name, type, description, user_id, statistics, metadata, categories)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [sourceName, display_name || null, type || null, description || null, user_id || null,
          statisticsJson, metadataJson, categoriesJson]);

      return rows[0];
    } catch (err) {
      if (err.code === '23505' || (err.message && err.message.includes('UNIQUE constraint'))) {
        // Duplicate name — append suffix and retry
        attempt++;
        sourceName = `${name}_${attempt + 1}`;
        console.log(`[metadata] Source name "${name}" taken, trying "${sourceName}"`);
      } else {
        throw err;
      }
    }
  }

  throw new Error(`Could not create source — name "${name}" and variants are all taken`);
}

/**
 * Look up the source name so the generated table name can include it.
 * Returns null if the source row doesn't exist or has no name.
 */
async function fetchSourceName(db, source_id) {
  const sourcesTable = db.type === 'postgres' ? 'data_manager.sources' : 'sources';
  const { rows } = await db.query(
    `SELECT name FROM ${sourcesTable} WHERE source_id = $1`,
    [source_id]
  );
  return rows[0]?.name || null;
}

/**
 * Build the per-view physical table name.
 *
 * Convention: `s{source_id}_v{view_id}_{source_name_slug}` — the slug
 * makes per-view tables human-readable when poking around the DB,
 * which is the predominant pattern in older AVAIL datasets. Falls back
 * to `s{source_id}_v{view_id}` when the source has no usable name.
 *
 * Slug is sanitized via `nameToSlug` and length-capped at
 * MAX_NAME_SLUG_LEN to keep the full identifier under Postgres's 63-char
 * limit. If the slug ends up empty after sanitization, omit the suffix.
 */
function buildViewTableName(source_id, view_id, source_name) {
  const base = `s${source_id}_v${view_id}`;
  if (!source_name) return base;
  // nameToSlug strips non-alnum but keeps underscores; trim leading/trailing
  // underscores AND any all-underscore residue ('!!!---' → '___' → '') so a
  // pathological name doesn't produce ugly trailing underscores in the table.
  const slug = nameToSlug(source_name)
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_NAME_SLUG_LEN)
    .replace(/_+$/, ''); // re-trim trailing underscores after slice
  return slug ? `${base}_${slug}` : base;
}

/**
 * Create a new view record with auto-generated table name.
 * Table goes in the gis_datasets schema by default.
 * @param {Object} values - { source_id, user_id, etl_context_id, metadata, view_dependencies }
 * @param {string} pgEnv - Database config name
 * @returns {Object} Created view row with table_schema and table_name set
 */
async function createDamaView(values, pgEnv) {
  const db = getDb(pgEnv);
  const table = db.type === 'postgres' ? 'data_manager.views' : 'views';

  const { source_id, user_id, etl_context_id, metadata, view_dependencies } = values;

  // metadata is JSONB — explicit stringify (see createDamaSource note).
  // view_dependencies is INTEGER[] — pg driver handles arrays → PG array literals natively.
  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  const { rows } = await db.query(`
    INSERT INTO ${table} (source_id, user_id, etl_context_id, metadata, view_dependencies)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [source_id, user_id || null, etl_context_id || null, metadataJson, view_dependencies || null]);

  const view = rows[0];

  // Look up the source name so we can include a slug in the table name —
  // standard AVAIL convention for human-readable per-view tables. Best-effort:
  // if the lookup fails for any reason we fall back to the legacy short shape.
  let sourceName = null;
  try {
    sourceName = await fetchSourceName(db, view.source_id);
  } catch (err) {
    console.warn(`[metadata] Could not fetch source name for source_id=${view.source_id}: ${err.message}`);
  }

  const tableName = buildViewTableName(view.source_id, view.view_id, sourceName);

  await db.query(`
    UPDATE ${table}
    SET table_schema = $1, table_name = $2, data_table = $3
    WHERE view_id = $4
  `, [DEFAULT_SCHEMA, tableName, `${DEFAULT_SCHEMA}.${tableName}`, view.view_id]);

  view.table_schema = DEFAULT_SCHEMA;
  view.table_name = tableName;
  view.data_table = `${DEFAULT_SCHEMA}.${tableName}`;

  return view;
}

/**
 * Ensure a PostgreSQL schema exists. No-op for SQLite.
 */
async function ensureSchema(db, schemaName) {
  if (db.type === 'postgres') {
    await db.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
  }
}

module.exports = {
  createDamaSource,
  createDamaView,
  ensureSchema,
  buildViewTableName,
  DEFAULT_SCHEMA,
};
