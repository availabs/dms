/**
 * GIS dataset publish worker.
 * Loads spatial data into PostgreSQL via ogr2ogr with controlled column names and types.
 *
 * Strategy:
 *   1. Create temp table (all TEXT columns + geometry) via direct SQL
 *   2. ogr2ogr loads data into the temp table (-append, no -overwrite)
 *   3. Create final table with exact column names/types from tableDescriptor
 *   4. INSERT INTO final SELECT with type casts from temp
 *   5. Drop temp, create spatial index, analyze
 *   6. Update source metadata (columns) and view metadata (tiles)
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { createDamaView, ensureSchema, DEFAULT_SCHEMA } = require('../metadata');

module.exports = async function gisPublishWorker(ctx) {
  const { task, pgEnv, db, dispatchEvent, updateProgress } = ctx;
  const {
    source_id, gisUploadId, layerName, tableDescriptor,
    user_id, email, dataFilePath,
  } = task.descriptor;

  if (db.type !== 'postgres') {
    throw new Error('GIS publish requires a PostgreSQL database');
  }

  const filePath = dataFilePath;
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Data file not found: ${filePath || 'no path in descriptor'} (upload: ${gisUploadId})`);
  }

  await dispatchEvent('gis-dataset:INITIAL', 'GIS publish started', null);

  // Create view record
  const viewMetadata = {
    ...(task.descriptor.customViewAttributes || {}),
    task_id: task.task_id,
  };
  const view = await createDamaView({
    source_id,
    user_id,
    metadata: viewMetadata,
  }, pgEnv);

  const { table_schema, table_name, view_id } = view;
  await ensureSchema(db, table_schema);

  await updateProgress(0.05);
  await dispatchEvent('gis-dataset:VIEW_CREATE', `View ${view_id} created`, { view_id, table_schema, table_name });

  const { columnTypes, promoteToMulti, postGisGeometryType } = tableDescriptor || {};
  // hasGeom may be updated after ogr2ogr loads — if the file has geometry
  // but the tableDescriptor didn't declare it, we detect it from the temp table.
  let hasGeom = !!postGisGeometryType;
  let geomType = promoteToMulti ? `Multi${postGisGeometryType}` : postGisGeometryType;

  // Build PG connection string
  const { loadConfig } = require('../../../db');
  const config = loadConfig(pgEnv);
  const pgStr = `PG:host=${config.host} port=${config.port} dbname=${config.database} user=${config.user} password=${config.password}`;

  const tempTable = `_tmp_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

  console.log(`[gis-publish] Task ${task.task_id}: view=${view_id}, table=${table_schema}.${table_name}, temp=${tempTable}, columns=${(columnTypes||[]).length}, geom=${postGisGeometryType || 'none'}`);

  // -----------------------------------------------------------------------
  // Step 1: Let ogr2ogr create and populate the temp table directly.
  // Don't pre-create it — ogr2ogr needs to choose its own column names
  // for the geometry (could be 'geom', 'wkb_geometry', 'the_geom', etc.)
  // We'll rename everything in the copy step.
  // -----------------------------------------------------------------------
  await db.query(`DROP TABLE IF EXISTS "${table_schema}"."${tempTable}"`);

  // Build a SELECT that maps original field names (key) to temp column names (col).
  // Use CAST to CHARACTER(0) to force text output for data columns.
  // Geometry is passed through as-is (ogr2ogr handles reprojection via -t_srs).
  const selectFields = (columnTypes || [])
    .map(c => `CAST("${c.key}" AS CHARACTER(0)) AS "${c.col}"`);

  // If no column renaming needed, use SELECT * which automatically includes geometry.
  // If we have explicit columns, we must NOT use -sql (geometry gets excluded).
  // Instead, use -select for column renaming and let ogr2ogr handle geometry natively.
  // However, -select doesn't support CAST/AS renaming.
  //
  // Solution: don't use -sql at all. Let ogr2ogr load ALL columns (including geometry),
  // then the copy step (Step 4) picks only the columns we want with the names we want.
  const loadSql = `SELECT * FROM "${layerName}"`;

  const sqlFile = path.join(os.tmpdir(), `ogr2ogr_${randomUUID()}.sql`);
  fs.writeFileSync(sqlFile, loadSql);

  console.log(`[gis-publish] Load SQL: ${loadSql.slice(0, 200)}...`);
  await updateProgress(0.1);

  // -----------------------------------------------------------------------
  // Step 2: ogr2ogr creates temp table and loads data
  // -----------------------------------------------------------------------
  const args = [
    '-F', 'PostgreSQL', pgStr,
    '-preserve_fid',
    '-skipfailures',
    '-overwrite',
    '-t_srs', 'EPSG:4326',
    '--config', 'PG_USE_COPY', 'YES',
    ...(promoteToMulti ? ['-nlt', 'PROMOTE_TO_MULTI'] : []),
    '-lco', `SCHEMA=${table_schema}`,
    '-nln', tempTable,
    '-sql', `@${sqlFile}`,
    filePath,
  ];

  await dispatchEvent('gis-dataset:ogr2ogr_start', 'Loading data via ogr2ogr', null);
  console.log(`[gis-publish] Running ogr2ogr (sync, ${args.length} args)...`);

  try {
    execFileSync('ogr2ogr', args, {
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(`[gis-publish] ogr2ogr completed`);
  } catch (err) {
    const stderr = err.stderr?.toString()?.slice(0, 500) || '';
    console.error(`[gis-publish] ogr2ogr failed (code ${err.status}): ${stderr || err.message}`);
    // Clean up temp table
    try { await db.query(`DROP TABLE IF EXISTS "${table_schema}"."${tempTable}"`); } catch (e) {}
    throw new Error(`ogr2ogr failed: ${stderr || err.message}`);
  } finally {
    try { fs.unlinkSync(sqlFile); } catch (e) {}
  }

  await updateProgress(0.7);
  await dispatchEvent('gis-dataset:ogr2ogr_end', 'Data loaded, creating final table', null);

  // -----------------------------------------------------------------------
  // Step 3a: Discover temp table columns — must happen before final table creation
  // so we can detect geometry even when tableDescriptor didn't declare it.
  // -----------------------------------------------------------------------
  let tempGeomCol = null;
  let tempFidCol = null;

  const { rows: tempCols } = await db.query(`
    SELECT column_name, udt_name FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `, [table_schema, tempTable]);

  for (const c of tempCols) {
    if (c.udt_name === 'geometry') tempGeomCol = c.column_name;
    if (['ogc_fid', 'fid'].includes(c.column_name) && !tempFidCol) tempFidCol = c.column_name;
  }
  console.log(`[gis-publish] Temp table: fid="${tempFidCol}", geom="${tempGeomCol}"`);

  // If the temp table has geometry but tableDescriptor didn't declare it,
  // detect the geometry type and update hasGeom so the final table includes it.
  if (tempGeomCol && !hasGeom) {
    hasGeom = true;
    try {
      const { rows: gtRows } = await db.query(`
        SELECT DISTINCT GeometryType("${tempGeomCol}") AS gt
        FROM "${table_schema}"."${tempTable}" WHERE "${tempGeomCol}" IS NOT NULL LIMIT 1
      `);
      geomType = gtRows[0]?.gt || 'Geometry';
    } catch (e) {
      geomType = 'Geometry';
    }
    console.log(`[gis-publish] Geometry found in temp table but not in tableDescriptor — detected type: ${geomType}`);
  }

  // -----------------------------------------------------------------------
  // Step 3b: Create final table with exact types from tableDescriptor
  // -----------------------------------------------------------------------
  const finalColDefs = (columnTypes || []).map(c => `"${c.col}" ${c.db_type}`).join(', ');
  const finalGeomDef = hasGeom ? `, wkb_geometry public.geometry(${geomType}, 4326)` : '';

  await db.query(`DROP TABLE IF EXISTS "${table_schema}"."${table_name}"`);
  await db.query(`CREATE TABLE "${table_schema}"."${table_name}" (ogc_fid INTEGER PRIMARY KEY${finalColDefs ? ', ' + finalColDefs : ''}${finalGeomDef})`);

  console.log(`[gis-publish] Final table created: ${table_schema}.${table_name} (hasGeom: ${hasGeom}, geomType: ${geomType || 'none'})`);

  // -----------------------------------------------------------------------
  // Step 4: Copy from temp to final with type casts.
  // -----------------------------------------------------------------------

  // Build a map of lowercased temp column names for matching.
  // ogr2ogr lowercases all column names when creating the PG table,
  // but tableDescriptor.key has the original mixed-case names.
  const tempColNames = new Set(tempCols.map(c => c.column_name));
  const findTempCol = (key) => {
    // Try exact match first, then lowercase
    if (tempColNames.has(key)) return key;
    const lower = key.toLowerCase();
    if (tempColNames.has(lower)) return lower;
    return key; // fallback — will error if truly not found
  };

  // Temp table has lowercased column names. Cast and rename to final names.
  const castCols = (columnTypes || []).map(c => {
    const tempName = findTempCol(c.key);
    const src = `"${tempName}"`;
    const dst = `"${c.col}"`;
    if (c.db_type === 'TEXT' && tempName === c.col) return src;
    if (c.db_type === 'TEXT') return `${src} AS ${dst}`;
    return `CAST(NULLIF(TRIM(${src}::TEXT), '') AS ${c.db_type}) AS ${dst}`;
  });
  // Map temp fid → ogc_fid, temp geometry → wkb_geometry
  const fidExpr = tempFidCol ? `"${tempFidCol}" AS ogc_fid` : 'NULL::INTEGER AS ogc_fid';
  const geomSelectExpr = tempGeomCol ? [`"${tempGeomCol}" AS wkb_geometry`] : [];
  const selectCols = [fidExpr, ...castCols, ...geomSelectExpr].join(', ');
  const insertCols = ['ogc_fid', ...(columnTypes || []).map(c => `"${c.col}"`), ...(tempGeomCol ? ['wkb_geometry'] : [])].join(', ');

  await db.query(`INSERT INTO "${table_schema}"."${table_name}" (${insertCols}) SELECT ${selectCols} FROM "${table_schema}"."${tempTable}"`);

  const { rows: countRows } = await db.query(`SELECT COUNT(*) AS cnt FROM "${table_schema}"."${table_name}"`);
  console.log(`[gis-publish] Copied ${countRows[0]?.cnt} rows to final table`);

  await updateProgress(0.85);

  // -----------------------------------------------------------------------
  // Step 5: Cleanup temp, create spatial index, analyze
  // -----------------------------------------------------------------------
  await db.query(`DROP TABLE IF EXISTS "${table_schema}"."${tempTable}"`);

  if (hasGeom) {
    try {
      await db.query(`CREATE INDEX "${table_name}_gix" ON "${table_schema}"."${table_name}" USING GIST(wkb_geometry)`);
    } catch (e) {
      console.log(`[gis-publish] Spatial index note: ${e.message}`);
    }
  }

  await db.query(`ANALYZE "${table_schema}"."${table_name}"`);
  console.log(`[gis-publish] Index + analyze complete`);
  await updateProgress(0.9);

  // -----------------------------------------------------------------------
  // Step 6: Source metadata (columns from tableDescriptor)
  // -----------------------------------------------------------------------
  console.log(`[gis-publish] Setting source metadata...`);
  try {
    const columns = (columnTypes || [])
      .map(c => ({ name: c.col, display_name: c.key || c.col, type: c.db_type, desc: null }));

    await db.query(`
      UPDATE data_manager.sources
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
      WHERE source_id = $2 AND (metadata IS NULL OR NOT (metadata ? 'columns'))
    `, [JSON.stringify({ columns }), source_id]);

    console.log(`[gis-publish] Source metadata: ${columns.length} columns`);
  } catch (e) {
    console.error(`[gis-publish] Source metadata error (non-fatal): ${e.message}`);
  }

  // -----------------------------------------------------------------------
  // Step 7: View tile metadata
  // -----------------------------------------------------------------------
  if (hasGeom) {
    let geojsonType = null;
    try {
      const { rows: geomRows } = await db.query(`
        SELECT DISTINCT ST_GeometryType(wkb_geometry) AS geom_type
        FROM "${table_schema}"."${table_name}"
        WHERE wkb_geometry IS NOT NULL LIMIT 1
      `);
      geojsonType = geomRows[0]?.geom_type?.replace('ST_', '') || null;
      console.log(`[gis-publish] ST_GeometryType query result: ${JSON.stringify(geomRows[0])}`);
    } catch (e) {
      console.error(`[gis-publish] Geometry type detection failed: ${e.message}`);
      // Fall back to using the tableDescriptor's geometry type
      geojsonType = geomType || postGisGeometryType;
      console.log(`[gis-publish] Using tableDescriptor geometry type: ${geojsonType}`);
    }

    if (geojsonType) {
      console.log(`[gis-publish] Geometry type: ${geojsonType}`);

      const STYLES = {
        Point:           { type: 'circle', paint: { 'circle-color': '#8ac', 'circle-radius': 4, 'circle-opacity': 0.8 } },
        MultiPoint:      { type: 'circle', paint: { 'circle-color': '#8ac', 'circle-radius': 4, 'circle-opacity': 0.8 } },
        LineString:      { type: 'line',   paint: { 'line-color': '#8ac', 'line-width': 2, 'line-opacity': 0.8 } },
        MultiLineString: { type: 'line',   paint: { 'line-color': '#8ac', 'line-width': 2, 'line-opacity': 0.8 } },
        Polygon:         { type: 'fill',   paint: { 'fill-color': '#8ac', 'fill-opacity': 0.3 } },
        MultiPolygon:    { type: 'fill',   paint: { 'fill-color': '#8ac', 'fill-opacity': 0.3 } },
      };

      const style = STYLES[geojsonType] || STYLES.Polygon;
      const timestamp = Date.now();
      const tilesetName = `${pgEnv}_s${source_id}_v${view_id}_${timestamp}`;
      const tileLayerName = `s${source_id}_v${view_id}`;

      const tilesMeta = {
        tiles: {
          sources: [{
            id: tilesetName,
            source: {
              tiles: [`${process.env.DAMA_SERVER_URL || ''}/dama-admin/${pgEnv}/tiles/${view_id}/{z}/{x}/{y}/t.pbf`],
              format: 'pbf',
              type: 'vector',
            },
          }],
          layers: [{
            id: `${tileLayerName}_${style.type}`,
            ...style,
            source: tilesetName,
            'source-layer': `view_${view_id}`,
          }],
        },
      };

      try {
        await db.query(`
          UPDATE data_manager.views
          SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
          WHERE view_id = $2
        `, [JSON.stringify(tilesMeta), view_id]);
        console.log(`[gis-publish] View tile metadata set`);
      } catch (e) {
        console.error(`[gis-publish] Tile metadata error (non-fatal): ${e.message}`);
      }
    }
  }

  await updateProgress(1);

  const result = {
    damaSourceId: source_id,
    damaViewId: view_id,
    source_id,
    view_id,
    table_schema,
    table_name,
  };

  await dispatchEvent('gis-dataset:FINAL', 'GIS publish complete', result);
  console.log(`[gis-publish] Done: source=${source_id}, view=${view_id}, table=${table_schema}.${table_name}`);
  return result;
};
