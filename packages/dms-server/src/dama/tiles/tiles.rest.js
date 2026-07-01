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
const { getEssentials } = require('../../routes/uda/utils');
const { buildSimpleFilterSql } = require('../../routes/uda/query_sets/postgres');

// Cache view_id → data_table mapping in memory
const tableByView = {};
const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '')}"`;
const shiftParams = (sql, offset) => sql.replace(/\$(\d+)/g, (_, n) => `$${+n + offset}`);
const normalizeSingleJoinColumn = (value) =>
  String(Array.isArray(value) ? value[0] : value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)[0] || '';

const stripLimitOffset = (sql) => String(sql || '').replace(/\bLIMIT\s+\d+\s*(\bOFFSET\s+\d+)?\s*$/i, '').trimEnd();

const injectTileKeyFilter = (sql, joinKey) => {
  const trimmedSql = String(sql || '').trim();
  if (!trimmedSql) return trimmedSql;

  const tileKeyFilter = `${quoteIdentifier(joinKey)} IN (SELECT join_value FROM tile_keys)`;
  const clauseMatch = /\bGROUP BY\b|\bHAVING\b|\bORDER BY\b|\bLIMIT\b|\bOFFSET\b/i.exec(trimmedSql);
  const insertAt = clauseMatch ? clauseMatch.index : trimmedSql.length;
  const before = trimmedSql.slice(0, insertAt).trimEnd();
  const after = trimmedSql.slice(insertAt);

  if (/\bWHERE\b/i.test(before)) {
    return `${before}\n    AND ${tileKeyFilter}\n${after}`;
  }

  return `${before}\n    WHERE ${tileKeyFilter}\n${after}`;
};

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

async function getJoinedTileData(pgEnv, viewId, z, x, y, columns, filter, join) {
  const geoTable = await resolveTable(pgEnv, viewId);
  if (!geoTable) return null;
  const localKey = normalizeSingleJoinColumn(join?.localKey);
  const joinKey = normalizeSingleJoinColumn(join?.joinKey || join?.linkedKey);
  if (!join?.viewId || !localKey || !joinKey) return null;

  const db = getDb(pgEnv);
  const joinCtx = await getEssentials({
    env: pgEnv,
    view_id: join.viewId,
    options: join.options || {},
  });

  if (joinCtx.dbType !== 'pg') return null;

  const { sql: joinSql, values: joinValues } = await buildSimpleFilterSql(
    joinCtx,
    JSON.stringify(join.options || {}),
    join.attributes || [],
    { from: 0, to: 1_000_000 - 1 }
  );

  if (!joinSql) return null;

  const geomTileCols = columns.length > 0
    ? ', ' + columns.map((c) => `geo.${quoteIdentifier(c)} AS ${quoteIdentifier(c)}`).join(', ')
    : '';
  const geomMvtCols = columns.length > 0
    ? ', ' + columns.map((c) => `tile_geo.${quoteIdentifier(c)}`).join(', ')
    : '';
  const joinedCols = (join.tileCols || []).length > 0
    ? ', ' + (join.tileCols || []).map((c) => `joined_cte.${quoteIdentifier(c)}`).join(', ')
    : '';
  const optimizedJoinSql = shiftParams(injectTileKeyFilter(stripLimitOffset(joinSql), joinKey), 3);

  const sql = `
    WITH tile_geo AS (
      SELECT
        geo.wkb_geometry,
        geo.ogc_fid,
        geo.${quoteIdentifier(localKey)} AS join_value
        ${geomTileCols}
      FROM ${geoTable} geo,
        (SELECT ST_SRID(wkb_geometry) AS srid
         FROM ${geoTable} WHERE wkb_geometry IS NOT NULL LIMIT 1) a
      WHERE ST_Intersects(
        geo.wkb_geometry,
        ST_Transform(ST_TileEnvelope($1, $2, $3), srid)
      )
      ${filter ? ` AND ${filter}` : ''}
    ),
    tile_keys AS (
      SELECT DISTINCT join_value
      FROM tile_geo
      WHERE join_value IS NOT NULL
    ),
    joined_cte AS (
      ${optimizedJoinSql}
    ),
    mvtgeom AS (
      SELECT
        ST_AsMVTGeom(
          ST_Transform(tile_geo.wkb_geometry, 3857),
          ST_TileEnvelope($1, $2, $3)
        ) AS geom
        ${geomMvtCols}
        ${joinedCols}
        , tile_geo.ogc_fid
      FROM tile_geo
      LEFT JOIN joined_cte
        ON tile_geo.join_value = joined_cte.${quoteIdentifier(joinKey)}
    )
    SELECT ST_AsMVT(mvtgeom.*, 'view_${+viewId}', 4096, 'geom', 'ogc_fid') AS mvt
    FROM mvtgeom
  `;

  try {
    const queryValues = [+z, +x, +y, ...joinValues];
    const { rows } = await db.query(sql, queryValues);
    return rows[0]?.mvt || null;
  } catch (e) {
    console.error(`[tiles] join tile error (view ${viewId} ⋈ ${join.viewId}, ${z}/${x}/${y}):`, e.message);
    return null;
  }
}

async function serveTile(req, res) {
  const { pgEnv, view_id, z, x, y } = req.params;
  const { cols, filter, join: joinRaw } = req.query;

  if (!pgEnv || !view_id || !z || !x || !y) {
    return res.status(400).json({ error: 'Missing required params: pgEnv, view_id, z, x, y' });
  }

  const db = getDb(pgEnv);
  if (db.type !== 'postgres') {
    return res.status(501).json({ error: 'Tile serving requires PostgreSQL with PostGIS' });
  }

  let join = null;
  if (joinRaw) {
    try {
      join = JSON.parse(joinRaw);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid join param JSON' });
    }
  }

  const joinedColumnList = (cols?.split(',') || [])
    .map((col) => String(col || '').trim())
    .filter(Boolean);
  const mvt = join
    ? await getJoinedTileData(pgEnv, view_id, +z, +x, +y, joinedColumnList, filter, join)
    : await getTileData(pgEnv, view_id, +z, +x, +y, cols?.split(',') || [], filter);

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
