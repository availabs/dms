/**
 * PMTiles datatype plugin.
 * Generates PMTiles (vector tiles) from a PostGIS view using Tippecanoe.
 * Requires: tippecanoe on PATH, PostgreSQL with PostGIS.
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { createGzip } = require('zlib');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

// Default MapBox GL styles by geometry type
const DEFAULT_STYLES = {
  Point: {
    type: 'circle',
    paint: { 'circle-color': '#8ac', 'circle-radius': 4, 'circle-opacity': 0.8 },
  },
  MultiPoint: {
    type: 'circle',
    paint: { 'circle-color': '#8ac', 'circle-radius': 4, 'circle-opacity': 0.8 },
  },
  LineString: {
    type: 'line',
    paint: { 'line-color': '#8ac', 'line-width': 2, 'line-opacity': 0.8 },
  },
  MultiLineString: {
    type: 'line',
    paint: { 'line-color': '#8ac', 'line-width': 2, 'line-opacity': 0.8 },
  },
  Polygon: {
    type: 'fill',
    paint: { 'fill-color': '#8ac', 'fill-opacity': 0.3 },
  },
  MultiPolygon: {
    type: 'fill',
    paint: { 'fill-color': '#8ac', 'fill-opacity': 0.3 },
  },
};

function tippecanoeAvailable() {
  try {
    execSync('which tippecanoe', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * PMTiles generation worker.
 * Streams view data as GeoJSON → Tippecanoe → PMTiles file → storage.
 */
async function generatePmtiles(ctx) {
  const { task, pgEnv, db, dispatchEvent, updateProgress } = ctx;
  const { source_id, view_id, columns } = task.descriptor;

  if (db.type !== 'postgres') {
    throw new Error('PMTiles generation requires PostgreSQL with PostGIS');
  }

  if (!tippecanoeAvailable()) {
    throw new Error('tippecanoe is not installed. Install it from https://github.com/felt/tippecanoe');
  }

  await dispatchEvent('cache-pmtiles:INITIAL', 'PMTiles generation started', null);

  // Fetch view table info
  const { rows: viewRows } = await db.query(`
    SELECT a.name AS source_name, b.table_schema, b.table_name, b.source_id
    FROM data_manager.sources AS a
    INNER JOIN data_manager.views AS b USING (source_id)
    WHERE b.view_id = $1
  `, [view_id]);

  if (!viewRows[0]) throw new Error(`View ${view_id} not found`);
  const { source_name, table_schema, table_name } = viewRows[0];

  const dataTable = `"${table_schema}"."${table_name}"`;
  const layerName = `s${source_id}_v${view_id}`;
  const tilesetName = `${pgEnv}_${layerName}_${Date.now()}`;

  await updateProgress(0.1);

  // Detect geometry type
  const { rows: geomRows } = await db.query(`
    SELECT DISTINCT ST_GeometryType(wkb_geometry) AS geom_type
    FROM ${dataTable}
    WHERE wkb_geometry IS NOT NULL
    LIMIT 10
  `);
  const geomType = geomRows[0]?.geom_type?.replace('ST_', '') || 'Point';

  // Build column selection for properties
  const propCols = (columns || []).filter(c => c !== 'wkb_geometry');
  const propsExpr = propCols.length > 0
    ? `jsonb_build_object(${propCols.map(c => `'${c}', "${c}"`).join(', ')})`
    : `'{}'::jsonb`;

  // Stream GeoJSON features from PG → gzip → temp file
  const tempDir = path.join(os.tmpdir(), `dms-pmtiles-${randomUUID()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const geojsonPath = path.join(tempDir, 'features.geojson.gz');
  const pmtilesPath = path.join(tempDir, `${tilesetName}.pmtiles`);

  await dispatchEvent('cache-pmtiles:PROGRESS', 'Streaming features from database', null);

  // Use a cursor-based approach: fetch features in batches
  const batchSize = 5000;
  const { rows: countRows } = await db.query(`SELECT COUNT(*) AS cnt FROM ${dataTable} WHERE wkb_geometry IS NOT NULL`);
  const totalFeatures = +countRows[0].cnt;

  const gzip = createGzip({ level: 6 });
  const ws = fs.createWriteStream(geojsonPath);
  const gzipPipeline = pipeline(gzip, ws);

  let written = 0;
  let offset = 0;

  while (offset < totalFeatures) {
    const { rows: features } = await db.query(`
      SELECT jsonb_build_object(
        'type', 'Feature',
        'id', ogc_fid,
        'geometry', ST_AsGeoJSON(ST_Transform(wkb_geometry, 4326))::jsonb,
        'properties', ${propsExpr}
      )::text AS feature
      FROM ${dataTable}
      WHERE wkb_geometry IS NOT NULL
      ORDER BY ogc_fid
      LIMIT ${batchSize} OFFSET ${offset}
    `);

    for (const row of features) {
      gzip.write(row.feature + '\n');
      written++;
    }

    offset += batchSize;
    await updateProgress(0.1 + (written / totalFeatures) * 0.4);
  }

  gzip.end();
  await gzipPipeline;

  await dispatchEvent('cache-pmtiles:PROGRESS', `Streamed ${written} features, running tippecanoe`, null);
  await updateProgress(0.5);

  // Run tippecanoe
  await new Promise((resolve, reject) => {
    const args = [
      '--no-progress-indicator',
      '--read-parallel',
      '--no-feature-limit',
      '--no-tile-size-limit',
      '--generate-ids',
      '-r1',
      '--force',
      '--name', tilesetName,
      '-l', layerName,
      '-o', pmtilesPath,
      geojsonPath,
    ];

    const proc = spawn('tippecanoe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.stdout.on('data', d => { /* tippecanoe progress output */ });

    proc.on('close', code => {
      if (code !== 0) reject(new Error(`tippecanoe exited with code ${code}: ${stderr.slice(0, 500)}`));
      else resolve();
    });
    proc.on('error', err => reject(new Error(`tippecanoe failed: ${err.message}`)));
  });

  await updateProgress(0.85);
  await dispatchEvent('cache-pmtiles:PROGRESS', 'Tippecanoe complete, storing PMTiles', null);

  // Store PMTiles via storage service
  const storage = require('../storage');
  const relativePath = `tiles/${tilesetName}.pmtiles`;
  await storage.write(relativePath, fs.createReadStream(pmtilesPath));

  const tilesUrl = storage.getUrl(relativePath);

  // Build MapBox GL tiles metadata
  const style = DEFAULT_STYLES[geomType] || DEFAULT_STYLES.Polygon;
  const tilesMeta = {
    tiles: {
      sources: [{
        id: tilesetName,
        protocol: 'pmtiles',
        source: { url: `pmtiles://${tilesUrl}`, type: 'vector' },
      }],
      layers: [{
        id: `${layerName}_${style.type}`,
        ...style,
        source: tilesetName,
        'source-layer': layerName,
      }],
    },
  };

  // Update view metadata
  await db.query(`
    UPDATE data_manager.views
    SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
    WHERE view_id = $2
  `, [JSON.stringify(tilesMeta), view_id]);

  await updateProgress(1);

  // Cleanup temp
  fs.rmSync(tempDir, { recursive: true, force: true });

  const result = { tilesetName, tilesUrl, geomType, features: written };
  await dispatchEvent('cache-pmtiles:FINAL', 'PMTiles generation complete', result);
  return result;
}

/**
 * PMTiles route: POST /cache-pmtiles
 * (Mounted at /dama-admin/:pgEnv/pmtiles/cache-pmtiles by the plugin system)
 */
function routes(router, helpers) {
  router.post('/cache-pmtiles', async (req, res) => {
    const { pgEnv } = req.params;
    const { source_id, view_id, columns } = req.body;

    if (!view_id) {
      return res.status(400).json({ error: 'view_id is required' });
    }

    try {
      const taskId = await helpers.queueTask({
        workerPath: 'pmtiles/generate',
        sourceId: source_id,
        pgEnv,
        source_id,
        view_id,
        columns: columns || [],
      }, pgEnv);

      res.json({ etl_context_id: taskId, source_id });
    } catch (err) {
      console.error('[pmtiles] queue failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = {
  workers: { 'pmtiles/generate': generatePmtiles },
  routes,
};
