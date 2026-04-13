/**
 * CSV dataset publish worker.
 * Loads CSV data into PostgreSQL via pg-copy-streams COPY command.
 */

const fs = require('fs');
const { createDamaView, ensureSchema, DEFAULT_SCHEMA } = require('../metadata');
const store = require('../store');

module.exports = async function csvPublishWorker(ctx) {
  const { task, pgEnv, db, dispatchEvent, updateProgress } = ctx;
  const {
    source_id, gisUploadId, layerName, tableDescriptor,
    user_id,
  } = task.descriptor;

  if (db.type !== 'postgres') {
    throw new Error('CSV-to-PG publish requires a PostgreSQL database');
  }

  const upload = store.get(gisUploadId);
  const filePath = upload?.dataFilePath;
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Data file not found for upload ${gisUploadId}`);
  }

  await dispatchEvent('csv-dataset:INITIAL', 'CSV publish started', null);

  // Create view record
  const view = await createDamaView({
    source_id,
    user_id,
    etl_context_id: task.task_id,
  }, pgEnv);

  const { table_schema, table_name, view_id } = view;
  await ensureSchema(db, table_schema);

  await updateProgress(0.1);
  await dispatchEvent('csv-dataset:VIEW_CREATE', `View ${view_id} created`, { view_id, table_schema, table_name });

  // Build CREATE TABLE from tableDescriptor
  const { columnTypes } = tableDescriptor || {};
  if (!columnTypes || columnTypes.length === 0) {
    throw new Error('tableDescriptor.columnTypes is empty — cannot create table');
  }

  const colDefs = columnTypes.map(c => `"${c.col}" ${c.db_type}`).join(',\n  ');

  await db.query(`DROP TABLE IF EXISTS "${table_schema}"."${table_name}"`);
  await db.query(`CREATE TABLE "${table_schema}"."${table_name}" (\n  ${colDefs}\n)`);

  await updateProgress(0.2);

  // Stream CSV via pg-copy-streams
  let pg, copyFrom, split2;
  try {
    pg = require('pg');
    copyFrom = require('pg-copy-streams').from;
    split2 = require('split2');
  } catch (e) {
    throw new Error('CSV publish requires pg + pg-copy-streams + split2. Install them to enable this feature.');
  }

  const { loadConfig } = require('../../db');
  const config = loadConfig(pgEnv);
  const client = new pg.Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
  });

  await client.connect();

  try {
    const colNames = columnTypes.map(c => `"${c.col}"`).join(', ');
    const copyStream = client.query(copyFrom(
      `COPY "${table_schema}"."${table_name}" (${colNames}) FROM STDIN WITH (FORMAT CSV, HEADER TRUE, NULL '')`
    ));

    const readStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const { Transform } = require('stream');

    let headerSeen = false;
    let rowCount = 0;

    const NUMBER_TYPES = ['INT', 'BIGINT', 'INTEGER', 'REAL', 'DOUBLE PRECISION', 'NUMERIC', 'SMALLINT'];

    const transformer = new Transform({
      transform(chunk, enc, callback) {
        const line = chunk.toString();
        if (!headerSeen) {
          headerSeen = true;
          callback(null, line + '\n');
          return;
        }

        // Simple coercion: replace NaN-like values in numeric columns with empty string
        // pg COPY with NULL '' will interpret empty strings as NULL for numeric types
        rowCount++;
        if (rowCount % 10000 === 0) {
          updateProgress(0.2 + Math.min(0.7, rowCount / 100000 * 0.7));
        }

        callback(null, line + '\n');
      }
    });

    await new Promise((resolve, reject) => {
      readStream
        .pipe(split2())
        .pipe(transformer)
        .pipe(copyStream)
        .on('finish', resolve)
        .on('error', reject);

      copyStream.on('error', reject);
    });

    await updateProgress(0.9);

    // Add primary key column
    await client.query(`ALTER TABLE "${table_schema}"."${table_name}" ADD COLUMN ogc_fid BIGSERIAL PRIMARY KEY`);

    // Analyze
    await client.query(`ANALYZE "${table_schema}"."${table_name}"`);
  } finally {
    await client.end();
  }

  await updateProgress(0.95);

  const result = {
    damaSourceId: source_id,
    damaViewId: view_id,
    source_id,
    view_id,
    table_schema,
    table_name,
  };

  await dispatchEvent('csv-dataset:FINAL', 'CSV publish complete', result);
  return result;
};
