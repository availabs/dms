/**
 * Rule: Point from lat/lon.
 *
 * A BEFORE INSERT OR UPDATE OF <lat>, <lon> trigger that rebuilds the geometry column from the two
 * coordinate columns, so a row added or corrected in a form shows on every map (tiles are rendered
 * from the geometry column). It reads NEW, the full row after the change, so a single-cell edit of
 * one coordinate rebuilds the point from the stored other one.
 *
 * - Both coordinates set → the point, built for the column's declared type (ST_Multi for
 *   MULTIPOINT) and SRID (ST_Transform when it isn't 4326).
 * - A coordinate cleared on UPDATE → geometry NULL (no pin). An INSERT without coordinates leaves
 *   any geometry the writer supplied alone.
 * - Out of range (|lat| > 90, |lon| > 180), or outside the optional bounds → the write is refused
 *   with a plain-language message (SQLSTATE check_violation).
 *
 * Removing the rule drops the trigger and its function; the geometry values stay.
 */
const { qualified, quoteIdent, sqlNumber, sqlLiteral } = require('./sql');
const { findColumn, kindMatches } = require('./introspect');

const POINT_TYPES = ['POINT', 'MULTIPOINT', 'GEOMETRY'];

const pointGeometryColumns = (info) =>
  info.geometryColumns.filter(g => POINT_TYPES.includes(g.type) && g.dims === 2);

// bounds = [minLon, minLat, maxLon, maxLat] (GeoJSON bbox order), or null.
function normalizeBounds(bounds) {
  if (bounds == null || bounds === '') return null;
  if (!Array.isArray(bounds)) return bounds; // validate() reports it
  if (bounds.every(v => v === '' || v == null)) return null;
  return bounds.map(v => (v === '' || v == null ? v : Number(v)));
}

function targetSrid(geom) {
  return geom.declaredSrid || geom.srid || 4326;
}

function pointExpr(info, geom, latRef, lonRef) {
  const pg = quoteIdent(info.postgisSchema);
  let expr = `${pg}.ST_SetSRID(${pg}.ST_MakePoint(${lonRef}, ${latRef}), 4326)`;
  const srid = targetSrid(geom);
  if (srid !== 4326) expr = `${pg}.ST_Transform(${expr}, ${sqlNumber(srid)})`;
  if (geom.type === 'MULTIPOINT') expr = `${pg}.ST_Multi(${expr})`;
  return expr;
}

const worldCond = (latRef, lonRef) =>
  `${latRef} BETWEEN -90 AND 90 AND ${lonRef} BETWEEN -180 AND 180`;

function boundsCond(latRef, lonRef, bounds) {
  if (!bounds) return null;
  const [minLon, minLat, maxLon, maxLat] = bounds.map(sqlNumber);
  return `${latRef} BETWEEN ${minLat} AND ${maxLat} AND ${lonRef} BETWEEN ${minLon} AND ${maxLon}`;
}

function inRangeCond(latRef, lonRef, bounds) {
  const b = boundsCond(latRef, lonRef, bounds);
  return b ? `(${worldCond(latRef, lonRef)}) AND (${b})` : worldCond(latRef, lonRef);
}

module.exports = {
  label: 'Point from lat/lon',
  description:
    'Builds the geometry from a latitude and a longitude column whenever a row is added or either ' +
    'coordinate changes, so the row appears on maps.',
  removeNote: 'Geometry that was already built stays. Later coordinate changes stop moving the pin.',
  params: [
    { name: 'lat', type: 'column', columnKinds: ['number'], label: 'Latitude column' },
    { name: 'lon', type: 'column', columnKinds: ['number'], label: 'Longitude column' },
    { name: 'geom', type: 'geometry_column', label: 'Geometry column', geometryTypes: POINT_TYPES, default: 'wkb_geometry' },
    {
      name: 'bounds', type: 'bbox', optional: true, label: 'Reject coordinates outside',
      desc: 'Optional box (west, south, east, north). Catches swapped coordinates and missing minus signs.',
    },
  ],

  appliesTo: (info) => pointGeometryColumns(info).length > 0,

  normalize({ info, params }) {
    const points = pointGeometryColumns(info);
    const geom = params.geom
      || (points.length === 1 ? points[0].name : null)
      || (points.some(g => g.name === 'wkb_geometry') ? 'wkb_geometry' : undefined);
    return { lat: params.lat, lon: params.lon, geom, bounds: normalizeBounds(params.bounds) };
  },

  key: (params) => `point_from_lat_lon:${params.geom}`,

  validate({ info, params }) {
    if (!info.postgisSchema) throw new Error('This database does not have PostGIS installed.');
    for (const [name, label] of [['lat', 'latitude'], ['lon', 'longitude']]) {
      if (!params[name]) throw new Error(`Pick the ${label} column.`);
      const col = findColumn(info, params[name]);
      if (!col) throw new Error(`Column "${params[name]}" does not exist on ${info.schema}.${info.table}.`);
      if (!kindMatches(col.kind, ['number'])) {
        throw new Error(`The ${label} column must hold numbers; "${col.name}" is ${col.udt}.`);
      }
    }
    if (params.lat === params.lon) throw new Error('Latitude and longitude must be different columns.');
    if (!params.geom) throw new Error('Pick the geometry column to fill.');
    const geom = info.geometryColumns.find(g => g.name === params.geom);
    if (!geom) throw new Error(`"${params.geom}" is not a geometry column on ${info.schema}.${info.table}.`);
    if (!POINT_TYPES.includes(geom.type)) {
      throw new Error(`Point from lat/lon needs a point geometry column; "${geom.name}" is ${geom.type}.`);
    }
    if (geom.dims !== 2) throw new Error(`"${geom.name}" has ${geom.dims} dimensions; only 2D points are supported.`);
    if (params.bounds) {
      const b = params.bounds;
      if (!Array.isArray(b) || b.length !== 4 || b.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        throw new Error('Bounds need four numbers: west, south, east, north.');
      }
      const [minLon, minLat, maxLon, maxLat] = b;
      if (!(minLon < maxLon) || !(minLat < maxLat)) {
        throw new Error('Bounds: west must be less than east, and south less than north.');
      }
      if (minLat < -90 || maxLat > 90 || minLon < -180 || maxLon > 180) {
        throw new Error('Bounds must lie within latitude -90 to 90 and longitude -180 to 180.');
      }
    }
  },

  install({ info, params, names }) {
    const geom = info.geometryColumns.find(g => g.name === params.geom);
    const t = qualified(info.schema, info.table);
    const fn = qualified(info.schema, names.fn);
    const trg = quoteIdent(names.trigger);
    const lat = `NEW.${quoteIdent(params.lat)}`;
    const lon = `NEW.${quoteIdent(params.lon)}`;
    const g = `NEW.${quoteIdent(params.geom)}`;

    const b = params.bounds;
    const boundsCheck = b
      ? `
    IF NOT (${boundsCond(lat, lon, b)}) THEN
      RAISE EXCEPTION ${sqlLiteral(
        `Coordinates %, % are outside the allowed area (latitude ${sqlNumber(b[1])} to ${sqlNumber(b[3])}, ` +
        `longitude ${sqlNumber(b[0])} to ${sqlNumber(b[2])}). Are latitude and longitude swapped, or is a minus sign missing?`
      )}, ${lat}, ${lon} USING ERRCODE = 'check_violation';
    END IF;`
      : '';

    const body = `
  -- Managed by a DMS source rule (point_from_lat_lon). Change it from the datasets Rules page.
  BEGIN
    IF ${lat} IS NULL OR ${lon} IS NULL THEN
      IF TG_OP = 'UPDATE' THEN ${g} := NULL; END IF;
      RETURN NEW;
    END IF;
    IF NOT (${worldCond(lat, lon)}) THEN
      RAISE EXCEPTION ${sqlLiteral(
        'Coordinates %, % are not valid (latitude must be -90 to 90, longitude -180 to 180). Are latitude and longitude swapped?'
      )}, ${lat}, ${lon} USING ERRCODE = 'check_violation';
    END IF;${boundsCheck}
    ${g} := ${pointExpr(info, geom, lat, lon)};
    RETURN NEW;
  END`;

    return [
      `CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $dms_rule$${body}
$dms_rule$`,
      `DROP TRIGGER IF EXISTS ${trg} ON ${t}`,
      `CREATE TRIGGER ${trg} BEFORE INSERT OR UPDATE OF ${quoteIdent(params.lat)}, ${quoteIdent(params.lon)} ON ${t}
       FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
      `COMMENT ON TRIGGER ${trg} ON ${t} IS ${sqlLiteral(
        `DMS source rule point_from_lat_lon: ${params.geom} from ${params.lat}/${params.lon}. Managed from the datasets Rules page.`
      )}`,
    ];
  },

  uninstall({ info, names }) {
    return [
      `DROP TRIGGER IF EXISTS ${quoteIdent(names.trigger)} ON ${qualified(info.schema, info.table)}`,
      `DROP FUNCTION IF EXISTS ${qualified(info.schema, names.fn)}()`,
    ];
  },

  backfill({ info, params }) {
    const geom = info.geometryColumns.find(g => g.name === params.geom);
    const pg = quoteIdent(info.postgisSchema);
    const t = qualified(info.schema, info.table);
    const lat = quoteIdent(params.lat);
    const lon = quoteIdent(params.lon);
    const g = quoteIdent(params.geom);
    const expr = pointExpr(info, geom, lat, lon);
    const ok = inRangeCond(lat, lon, params.bounds);
    // "Already right" = within ~1 cm (1e-7 degrees, compared in EPSG:4326), not exactly equal:
    // pins built by another tool differ from the stored coordinates by float noise, and an exact
    // comparison reported them all as "updated" (72 of Land Bank's 1,232, 2026-10-16).
    const near = `${pg}.ST_DWithin(${pg}.ST_Transform(${g}, 4326), ${pg}.ST_SetSRID(${pg}.ST_MakePoint(${lon}, ${lat}), 4326), 1e-7)`;
    // Sets only the geometry column, so the UPDATE OF <lat>, <lon> trigger doesn't fire.
    return {
      text: `
        WITH upd AS (
          UPDATE ${t} SET ${g} = ${expr}
          WHERE ${lat} IS NOT NULL AND ${lon} IS NOT NULL AND (${ok})
            AND (${g} IS NULL OR NOT ${near})
          RETURNING 1
        )
        SELECT (SELECT count(*) FROM upd)::int AS updated,
               (SELECT count(*) FROM ${t} WHERE ${lat} IS NOT NULL AND ${lon} IS NOT NULL AND NOT (${ok}))::int AS "skippedOutOfBounds",
               (SELECT count(*) FROM ${t} WHERE ${lat} IS NULL OR ${lon} IS NULL)::int AS "skippedMissing"`,
      values: [],
    };
  },

  async status({ q, info, names }) {
    const { rows } = await q.query(
      `SELECT 1 FROM pg_trigger WHERE tgrelid = $1::regclass AND tgname = $2 AND NOT tgisinternal`,
      [qualified(info.schema, info.table), names.trigger]
    );
    return rows.length ? 'installed' : 'missing';
  },
};
