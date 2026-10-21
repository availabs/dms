/**
 * One read of a table's catalog facts, shared by every rule: its columns (with a coarse "kind"
 * the Rules page filters column pickers by), its PostGIS geometry columns, and its primary key.
 * `q` is anything with query(sql, values): the adapter, or a withTransaction `tx`.
 */
const { qualified, quoteIdent } = require('./sql');

const KIND_BY_UDT = {
  int2: 'integer', int4: 'integer', int8: 'integer',
  float4: 'number', float8: 'number', numeric: 'number',
  text: 'text', varchar: 'text', bpchar: 'text',
  bool: 'boolean',
  geometry: 'geometry',
  date: 'date', timestamp: 'date', timestamptz: 'date',
  json: 'json', jsonb: 'json',
};

// A param's `columnKinds: ['number']` also accepts integer columns.
function kindMatches(kind, wanted = []) {
  if (!wanted.length) return true;
  return wanted.includes(kind) || (kind === 'integer' && wanted.includes('number'));
}

async function postgisSchema(q) {
  const { rows } = await q.query(
    `SELECT n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
     WHERE e.extname = 'postgis'`
  );
  return rows[0]?.schema || null;
}

async function introspectTable(q, schema, table) {
  const { rows: colRows } = await q.query(
    `SELECT column_name, udt_name, is_nullable, column_default, is_identity
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, table]
  );
  if (!colRows.length) throw new Error(`Table ${schema}.${table} does not exist`);

  const columns = colRows.map(c => ({
    name: c.column_name,
    udt: c.udt_name,
    kind: KIND_BY_UDT[c.udt_name] || c.udt_name,
    notNull: c.is_nullable === 'NO',
    default: c.column_default,
    isIdentity: c.is_identity === 'YES',
  }));

  const pgSchema = await postgisSchema(q);
  let geometryColumns = [];
  if (pgSchema) {
    const { rows: geomRows } = await q.query(
      `SELECT f_geometry_column AS name, type, srid, coord_dimension
       FROM ${quoteIdent(pgSchema)}.geometry_columns
       WHERE f_table_schema = $1 AND f_table_name = $2`,
      [schema, table]
    );
    geometryColumns = [];
    for (const g of geomRows) {
      let srid = Number(g.srid) || 0;
      // A bare `geometry` column has typmod SRID 0; what matters is the values' SRID
      // (memory: reference_dama_srid0_breaks_tiles).
      if (!srid) {
        const { rows } = await q.query(
          `SELECT ${quoteIdent(pgSchema)}.ST_SRID(${quoteIdent(g.name)}) AS srid
           FROM ${qualified(schema, table)} WHERE ${quoteIdent(g.name)} IS NOT NULL LIMIT 1`
        );
        srid = Number(rows[0]?.srid) || 0;
      }
      geometryColumns.push({
        name: g.name,
        type: String(g.type || 'GEOMETRY').toUpperCase(),
        srid,
        declaredSrid: Number(g.srid) || 0,
        dims: Number(g.coord_dimension) || 2,
      });
    }
  }

  const { rows: pkRows } = await q.query(
    `SELECT a.attname AS pk
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = $1::regclass AND i.indisprimary
     LIMIT 1`,
    [qualified(schema, table)]
  );

  return { schema, table, columns, geometryColumns, pk: pkRows[0]?.pk || null, postgisSchema: pgSchema };
}

const findColumn = (info, name) => info.columns.find(c => c.name === name) || null;

module.exports = { introspectTable, kindMatches, findColumn, KIND_BY_UDT };
