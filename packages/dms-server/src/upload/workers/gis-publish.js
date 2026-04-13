/**
 * GIS dataset publish worker.
 * Loads spatial data into PostgreSQL via ogr2ogr.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { createDamaView, ensureSchema, DEFAULT_SCHEMA } = require('../metadata');
const store = require('../store');

module.exports = async function gisPublishWorker(ctx) {
  const { task, pgEnv, db, dispatchEvent, updateProgress } = ctx;
  const {
    source_id, gisUploadId, layerName, tableDescriptor,
    user_id, email,
  } = task.descriptor;

  if (db.type !== 'postgres') {
    throw new Error('GIS publish requires a PostgreSQL database');
  }

  // Resolve file path
  const upload = store.get(gisUploadId);
  const filePath = upload?.dataFilePath;
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Data file not found for upload ${gisUploadId}`);
  }

  await dispatchEvent('gis-dataset:INITIAL', 'GIS publish started', null);

  // Create view record
  const view = await createDamaView({
    source_id,
    user_id,
    etl_context_id: task.task_id,
    metadata: task.descriptor.customViewAttributes || null,
  }, pgEnv);

  const { table_schema, table_name, view_id } = view;
  await ensureSchema(db, table_schema);

  await updateProgress(0.1);
  await dispatchEvent('gis-dataset:VIEW_CREATE', `View ${view_id} created`, { view_id, table_schema, table_name });

  // Build ogr2ogr SQL and arguments
  const { columnTypes, promoteToMulti, postGisGeometryType } = tableDescriptor || {};

  // Build column list for the final table
  const colDefs = (columnTypes || []).map(c =>
    `"${c.col}" ${c.db_type}`
  ).join(', ');

  // Generate SQL for prelude (create temp table) and closing (type cast + index)
  const tempTable = `_tmp_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const geomCol = postGisGeometryType ? ', wkb_geometry public.geometry' : '';

  const preludeSql = [
    `CREATE SCHEMA IF NOT EXISTS "${table_schema}"`,
    `DROP TABLE IF EXISTS "${table_schema}"."${tempTable}"`,
    `CREATE TABLE "${table_schema}"."${tempTable}" (ogc_fid INTEGER${colDefs ? ', ' + (columnTypes || []).map(c => `"${c.col}" TEXT`).join(', ') : ''}${geomCol})`,
  ].join('; ');

  // Type-cast INSERT from temp to final
  const castCols = (columnTypes || []).map(c => {
    if (c.db_type === 'TEXT') return `"${c.col}"`;
    return `CAST(NULLIF(TRIM("${c.col}"), '') AS ${c.db_type}) AS "${c.col}"`;
  });
  const selectCols = ['ogc_fid', ...castCols, ...(postGisGeometryType ? ['wkb_geometry'] : [])].join(', ');
  const finalColList = ['ogc_fid', ...(columnTypes || []).map(c => `"${c.col}"`), ...(postGisGeometryType ? ['wkb_geometry'] : [])].join(', ');

  const closingSql = [
    `DROP TABLE IF EXISTS "${table_schema}"."${table_name}"`,
    `CREATE TABLE "${table_schema}"."${table_name}" (ogc_fid INTEGER PRIMARY KEY${colDefs ? ', ' + colDefs : ''}${postGisGeometryType ? `, wkb_geometry public.geometry(${promoteToMulti ? 'Multi' : ''}${postGisGeometryType}, 4326)` : ''})`,
    `INSERT INTO "${table_schema}"."${table_name}" (${finalColList}) SELECT ${selectCols} FROM "${table_schema}"."${tempTable}"`,
    `DROP TABLE "${table_schema}"."${tempTable}"`,
    ...(postGisGeometryType ? [
      `CREATE INDEX "${table_name}_gix" ON "${table_schema}"."${table_name}" USING GIST(wkb_geometry)`,
    ] : []),
    `ANALYZE "${table_schema}"."${table_name}"`,
  ].join('; ');

  // Write load SQL to temp file (ogr2ogr -sql @file)
  const loadSql = `SELECT * FROM "${layerName}"`;
  const sqlFile = path.join(os.tmpdir(), `ogr2ogr_${randomUUID()}.sql`);
  fs.writeFileSync(sqlFile, loadSql);

  // Build PG connection string from config
  const { loadConfig } = require('../../db');
  const config = loadConfig(pgEnv);
  const pgStr = `PG:host=${config.host} port=${config.port} dbname=${config.database} user=${config.user} password=${config.password}`;

  // Build ogr2ogr args
  const args = [
    '-F', 'PostgreSQL', pgStr,
    '-progress',
    '--config', 'OGR_FORCE_COUNT', 'ALL',
    '-preserve_fid',
    '-doo', `PRELUDE_STATEMENTS=${preludeSql}`,
    '-doo', `CLOSING_STATEMENTS=${closingSql}`,
    '-skipfailures',
    '-append',
    '-t_srs', 'EPSG:4326',
    '--config', 'PG_USE_COPY', 'YES',
    ...(promoteToMulti ? ['-nlt', 'PROMOTE_TO_MULTI'] : []),
    '-nln', `${table_schema}.${tempTable}`,
    '-sql', `@${sqlFile}`,
    filePath,
  ];

  await dispatchEvent('gis-dataset:ogr2ogr_start', 'Starting ogr2ogr', null);

  // Spawn ogr2ogr and track progress
  await new Promise((resolve, reject) => {
    const proc = spawn('ogr2ogr', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      // ogr2ogr outputs progress as "X.X...X.X..."
      const match = text.match(/(\d+)\.\d+/g);
      if (match) {
        const pct = parseInt(match[match.length - 1], 10);
        updateProgress(0.1 + (pct / 100) * 0.8); // 10-90% range
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      // Clean up temp SQL file
      try { fs.unlinkSync(sqlFile); } catch (e) {}

      if (code !== 0) {
        reject(new Error(`ogr2ogr exited with code ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve();
      }
    });

    proc.on('error', (err) => {
      try { fs.unlinkSync(sqlFile); } catch (e) {}
      reject(new Error(`ogr2ogr spawn failed: ${err.message}`));
    });
  });

  await updateProgress(0.95);
  await dispatchEvent('gis-dataset:ogr2ogr_end', 'ogr2ogr complete', null);

  const result = {
    damaSourceId: source_id,
    damaViewId: view_id,
    source_id,
    view_id,
    table_schema,
    table_name,
  };

  await dispatchEvent('gis-dataset:FINAL', 'GIS publish complete', result);
  return result;
};
