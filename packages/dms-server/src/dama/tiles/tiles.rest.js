/**
 * Dynamic MVT (Mapbox Vector Tile) serving route.
 * Generates vector tiles on the fly from PostGIS tables using ST_AsMVT.
 *
 * Routes:
 *   GET /dama-admin/:pgEnv/tiles/:view_id/:z/:x/:y/t.pbf
 *
 * Query params:
 *   cols   — comma-separated column names to include
 *   filter — SQL WHERE clause filter (use with caution)
 *
 * PostgreSQL only — requires PostGIS.
 */

const { getDb } = require('../../db');

// Cache view_id → data_table mapping in memory
const tableByView = {};

async function resolveTable(pgEnv, viewId) {
  const key = `${pgEnv}:${viewId}`;
  if (tableByView[key]) return tableByView[key];

  const db = getDb(pgEnv);
  if (db.type !== 'postgres') return null;

  const { rows } = await db.query(
    'SELECT table_schema, table_name, data_table FROM data_manager.views WHERE view_id = $1',
    [viewId]
  );

  if (!rows[0]) return null;
  const table = rows[0].data_table || `"${rows[0].table_schema}"."${rows[0].table_name}"`;
  tableByView[key] = table;
  return table;
}

async function getTileData(pgEnv, viewId, z, x, y, columns, filter) {
  const table = await resolveTable(pgEnv, viewId);
  if (!table) return null;

  const db = getDb(pgEnv);

  // Build column list — sanitize to prevent SQL injection
  const colExpr = columns.length > 0
    ? ', ' + columns.map(c => `"${c.replace(/"/g, '')}"`).join(', ')
    : '';

  const sql = `
    WITH mvtgeom AS (
      SELECT
        ST_AsMVTGeom(
          ST_Transform(wkb_geometry, 3857),
          ST_TileEnvelope($1, $2, $3)
        ) AS geom
        ${colExpr}
        , ogc_fid
      FROM ${table},
        (SELECT ST_SRID(wkb_geometry) AS srid
         FROM ${table} WHERE wkb_geometry IS NOT NULL LIMIT 1) a
      WHERE ST_Intersects(
        wkb_geometry,
        ST_Transform(ST_TileEnvelope($1, $2, $3), srid)
      )
      ${filter ? ` AND ${filter}` : ''}
    )
    SELECT ST_AsMVT(mvtgeom.*, 'view_${+viewId}', 4096, 'geom', 'ogc_fid') AS mvt
    FROM mvtgeom
  `;

  try {
    const { rows } = await db.query(sql, [+z, +x, +y]);
    return rows[0]?.mvt || null;
  } catch (e) {
    console.error(`[tiles] Error generating tile (view ${viewId}, ${z}/${x}/${y}):`, e.message);
    return null;
  }
}

async function serveTile(req, res) {
  const { pgEnv, view_id, z, x, y } = req.params;
  const { cols, filter } = req.query;

  if (!pgEnv || !view_id || !z || !x || !y) {
    return res.status(400).json({ error: 'Missing required params: pgEnv, view_id, z, x, y' });
  }

  const db = getDb(pgEnv);
  if (db.type !== 'postgres') {
    return res.status(501).json({ error: 'Tile serving requires PostgreSQL with PostGIS' });
  }

  const mvt = await getTileData(pgEnv, view_id, +z, +x, +y, cols?.split(',') || [], filter);

  if (!mvt || mvt.length === 0) {
    return res.status(204).send();
  }

  res
    .header('Content-Type', 'application/x-protobuf')
    .header('Cache-Control', 'public, max-age=3600')
    .send(Buffer.from(mvt));
}

// Export as Express route handlers — mounted by upload/index.js at /dama-admin/
module.exports = { serveTile };
