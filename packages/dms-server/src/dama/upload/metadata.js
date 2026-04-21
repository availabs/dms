/**
 * DAMA source and view creation for external datasets.
 * Creates records in data_manager.sources and data_manager.views.
 */

const { getDb } = require('../../db');

const DEFAULT_SCHEMA = 'gis_datasets';

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

  // Generate table name and set it
  const tableName = `s${view.source_id}_v${view.view_id}`;

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

module.exports = { createDamaSource, createDamaView, ensureSchema, DEFAULT_SCHEMA };
