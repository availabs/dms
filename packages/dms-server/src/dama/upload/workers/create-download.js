/**
 * Download creation worker.
 * Exports GIS view data to downloadable files (CSV, Shapefile, GeoJSON, GPKG)
 * via ogr2ogr, then stores results via the storage service.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const storage = require('../../storage');
const { loadConfig } = require('../../../db');

const OUTPUT_TYPES = {
  CSV: { ogr: 'CSV', ext: 'csv' },
  'ESRI Shapefile': { ogr: 'ESRI Shapefile', ext: '' },
  GeoJSON: { ogr: 'GeoJSON', ext: 'geojson' },
  GPKG: { ogr: 'GPKG', ext: 'gpkg' },
};

module.exports = async function createDownloadWorker(ctx) {
  const { task, pgEnv, db, dispatchEvent, updateProgress } = ctx;
  const {
    source_id, view_id, fileTypes, columns,
    groupedByColumn, user_id,
  } = task.descriptor;

  if (db.type !== 'postgres') {
    throw new Error('Download creation requires a PostgreSQL database');
  }

  await dispatchEvent('create-download:INITIAL', 'Download creation started', null);

  // Fetch view info
  const { rows: viewRows } = await db.query(`
    SELECT a.name AS source_name, b.version, b.data_table, b.table_schema, b.table_name
    FROM data_manager.sources AS a
    INNER JOIN data_manager.views AS b USING (source_id)
    WHERE b.view_id = $1
  `, [view_id]);

  if (!viewRows[0]) throw new Error(`View ${view_id} not found`);
  const { source_name, version, data_table, table_schema, table_name } = viewRows[0];

  const config = loadConfig(pgEnv);
  const connStr = `host=${config.host} port=${config.port} dbname=${config.database} user=${config.user} password=${config.password}`;

  const fileNameBase = `${(source_name || 'export').replace(/\//g, '-')}_${view_id}${version ? '_' + version : ''}`;
  const outputDir = `${pgEnv}_${view_id}`;
  const tempDir = path.join(os.tmpdir(), `dms-download-${randomUUID()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const downloadMeta = {};
  const totalTypes = fileTypes.length;
  let completed = 0;

  try {
    for (const fileType of fileTypes) {
      const typeInfo = OUTPUT_TYPES[fileType];
      if (!typeInfo) {
        await dispatchEvent('create-download:WARN', `Unknown file type: ${fileType}`, null);
        continue;
      }

      await dispatchEvent('create-download:PROGRESS', `Creating ${fileType}...`, { fileType });

      const dataSource = data_table || `${table_schema}.${table_name}`;
      const selectCols = columns.join(',');

      if (groupedByColumn) {
        // Grouped: one file per distinct value
        const { rows: distinctRows } = await db.query(
          `SELECT DISTINCT "${groupedByColumn}" AS val FROM ${dataSource} ORDER BY 1`
        );

        const groupDir = path.join(tempDir, `${fileNameBase}_${fileType}`);
        fs.mkdirSync(groupDir, { recursive: true });

        for (const row of distinctRows) {
          const val = row.val || 'null';
          const safeVal = String(val).replace(/[^a-zA-Z0-9_-]/g, '_');
          const groupFile = path.join(groupDir, `${safeVal}.${typeInfo.ext || fileType.toLowerCase()}`);
          const sql = `SELECT ${selectCols} FROM ${dataSource} WHERE "${groupedByColumn}" = '${val}'`;

          await runOgr2ogr(typeInfo.ogr, groupFile, connStr, null, sql);
        }

        // Zip the group directory
        const zipName = `${fileNameBase}_${fileType}.zip`;
        const zipPath = path.join(tempDir, zipName);
        await runZip(zipPath, groupDir);

        const relativePath = `${outputDir}/${zipName}`;
        await storage.write(relativePath, fs.createReadStream(zipPath));
        downloadMeta[fileType] = storage.getUrl(relativePath);
      } else {
        // Single file
        const outFile = path.join(tempDir, `${fileNameBase}.${typeInfo.ext || fileType.toLowerCase()}`);
        await runOgr2ogr(typeInfo.ogr, outFile, connStr, dataSource, null, selectCols);

        // Zip the output
        const zipName = `${fileNameBase}_${fileType}.zip`;
        const zipPath = path.join(tempDir, zipName);
        await runZip(zipPath, outFile);

        const relativePath = `${outputDir}/${zipName}`;
        await storage.write(relativePath, fs.createReadStream(zipPath));
        downloadMeta[fileType] = storage.getUrl(relativePath);
      }

      completed++;
      await updateProgress(completed / totalTypes * 0.9);
    }

    // Update view metadata with download URLs
    const viewTable = 'data_manager.views';
    await db.query(`
      UPDATE ${viewTable}
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
      WHERE view_id = $2
    `, [JSON.stringify({ download: downloadMeta }), view_id]);

    await updateProgress(1);
    await dispatchEvent('create-download:FINAL', 'Downloads created', downloadMeta);

    return { download: downloadMeta, source_id, view_id };
  } finally {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

function runOgr2ogr(format, outputFile, connStr, dataSource, sql, selectCols) {
  const args = [
    '-f', format,
    '-t_srs', 'EPSG:4326',
    '-skipfailures',
  ];

  if (sql) {
    args.push('-sql', sql);
  } else if (selectCols) {
    args.push('-select', selectCols);
  }

  args.push(outputFile, `PG:${connStr}`);

  if (dataSource && !sql) {
    args.push(dataSource);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('ogr2ogr', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) reject(new Error(`ogr2ogr exited with code ${code}: ${stderr.slice(0, 500)}`));
      else resolve();
    });
    proc.on('error', err => reject(new Error(`ogr2ogr failed: ${err.message}`)));
  });
}

function runZip(zipPath, inputPath) {
  const isDir = fs.statSync(inputPath).isDirectory();
  const args = isDir
    ? ['-rj', zipPath, inputPath]
    : ['-j', zipPath, inputPath];

  return new Promise((resolve, reject) => {
    const proc = spawn('zip', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) reject(new Error(`zip exited with code ${code}: ${stderr.slice(0, 500)}`));
      else resolve();
    });
    proc.on('error', err => reject(new Error(`zip failed: ${err.message}`)));
  });
}
