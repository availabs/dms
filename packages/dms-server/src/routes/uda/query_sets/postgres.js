/**
 * PostgreSQL (and SQLite) UDA query set.
 *
 * This is the existing UDA data-query logic, extracted from uda.controller.js
 * so the controller can dispatch to either the pg or ch query set based on
 * the ctx.dbType field produced by getEssentials().
 *
 * All three functions take a ctx object from getEssentials plus the
 * query-specific args. They return rows (or a numeric count for *Length).
 */

const {
  sanitizeName,
  getResponseColumnName,
  quoteAlias,
  getValuesExceptNulls,
  getValuesFromGroup,
  handleGroupBy,
  handleHaving,
  handleOrderBy,
  buildCombinedWhere,
} = require('../utils');
const { typeCast } = require('#db/query-utils.js');

/**
 * Translate PostgreSQL-specific SQL expressions to SQLite equivalents.
 * Handles client-sent "calculated columns" and groupBy expressions.
 * (Copied as-is from the original controller.)
 */
function translatePgToSqlite(expr) {
  expr = expr.replace(
    /array_to_string\s*\(\s*array_agg\s*\(\s*(?:distinct\s+)?([^)]+)\)\s*,\s*('[^']*')\s*\)/gi,
    'group_concat($1, $2)'
  );
  expr = expr.replace(/array_agg\s*\(/gi, 'json_group_array(');
  expr = expr.replace(
    /to_jsonb\s*\(\s*array_remove\s*\(\s*array\s*\[([^\]]*)\]\s*,\s*null\s*\)\s*\)/gi,
    'json_array($1)'
  );
  expr = expr.replace(/\barray\s*\[([^\]]*)\]/gi, 'json_array($1)');
  expr = expr.replace(/to_jsonb\s*\(/gi, 'json(');
  return expr;
}

async function simpleFilterLength(ctx, options) {
  const { isDms, db, app, type, table_schema, table_name } = ctx;

  let {
    filter = {}, exclude = {},
    gt = {}, gte = {}, lt = {}, lte = {}, like = {},
    filterRelation = 'and',
    filterGroups = {},
    groupBy = [], having = [],
    normalFilter = [],
  } = JSON.parse(options);

  if (db.type === 'sqlite' && groupBy.length) {
    groupBy = groupBy.map(translatePgToSqlite);
  }

  if (normalFilter.length) {
    normalFilter.forEach(({ column, values }) => {
      (filter[column] ??= []).push(...values);
    });
  }

  const oldValues = [
    ...(isDms ? [[app], [type]] : []),
    ...getValuesExceptNulls(filter), ...getValuesExceptNulls(exclude),
    ...getValuesExceptNulls(gt), ...getValuesExceptNulls(gte),
    ...getValuesExceptNulls(lt), ...getValuesExceptNulls(lte),
    ...getValuesExceptNulls(like),
  ];
  const newValues = getValuesFromGroup(filterGroups);
  const values = [...oldValues, ...newValues];

  const combinedWhere = buildCombinedWhere({
    filter, exclude, gt, gte, lt, lte, like, filterRelation,
    filterGroups, isDms, app, type, oldValues, dbType: db.type,
  });

  const hasArrayElements = groupBy?.[0]?.includes('jsonb_array_elements_text')
    || groupBy?.[0]?.includes('json_each');

  const sql =
    hasArrayElements && sanitizeName(groupBy?.[0])
      ? `WITH t AS (
           SELECT DISTINCT ${groupBy[0]}
           FROM ${table_schema}.${table_name}
           ${combinedWhere}
           GROUP BY 1
           ${handleHaving(having)}
         )
         SELECT count(*) numrows FROM t`
      : `SELECT count(${groupBy.length
           ? `DISTINCT ${groupBy.map((g) => sanitizeName(g)).filter((g) => g)
               .map((c) => `CASE WHEN ${c} IS NULL THEN '__NULL__VAL__' ELSE ${typeCast(c, 'TEXT', db.type)} END`)
               .join(`|| '-' ||`)}`
           : 1}) numrows
         FROM ${table_schema}.${table_name}
         ${combinedWhere}
         ${handleHaving(having)}`;

  const { rows } = await db.query(sql, values);
  return rows?.[0]?.numrows ?? 0;
}

async function simpleFilter(ctx, options, attributes, indices) {
  const num = indices.to - indices.from + 1;
  const { isDms, db, app, type, table_schema, table_name, dmsAttributes } = ctx;

  let sanitizedAttrs = sanitizeName(attributes).filter((f) => f);
  if (!sanitizedAttrs.length) return [];

  if (db.type === 'sqlite') {
    sanitizedAttrs = sanitizedAttrs.map(translatePgToSqlite);
  }

  const columnNameMap = sanitizedAttrs.reduce((acc, attr, i) => {
    const responseName = getResponseColumnName(attr);
    if (attr.toLowerCase().includes(' as ') && responseName.length > 60) {
      acc[attr] = attr.replace(` ${responseName}`, ` col_${i}`);
    }
    return acc;
  }, {});

  const {
    filter = {}, exclude = {},
    gt = {}, gte = {}, lt = {}, lte = {}, like = {},
    filterRelation = 'and',
    filterGroups = {},
    groupBy = [], having = [], orderBy = {},
    normalFilter = [],
  } = JSON.parse(options);

  if (normalFilter.length) {
    normalFilter.forEach(({ column, values }) => {
      (filter[column] ??= []).push(...values);
    });
  }

  const oldValues = [
    ...(isDms ? [[app], [type]] : []),
    ...getValuesExceptNulls(filter), ...getValuesExceptNulls(exclude),
    ...getValuesExceptNulls(gt), ...getValuesExceptNulls(gte),
    ...getValuesExceptNulls(lt), ...getValuesExceptNulls(lte),
    ...getValuesExceptNulls(like),
  ];
  const newValues = getValuesFromGroup(filterGroups);
  const values = [...oldValues, ...newValues];

  const combinedWhere = buildCombinedWhere({
    filter, exclude, gt, gte, lt, lte, like, filterRelation,
    filterGroups, isDms, app, type, oldValues, dbType: db.type,
  });

  const sql = `
    SELECT ${sanitizedAttrs.map((c) => quoteAlias(columnNameMap[c] || c)).join(', ')}
    FROM ${table_schema}.${table_name}
    ${combinedWhere}
    ${handleGroupBy(groupBy)}
    ${handleHaving(having)}
    ${handleOrderBy(orderBy, dmsAttributes)}
    LIMIT ${+num}
    OFFSET ${indices.from}
  `;

  const res = await db.query(sql, values);

  const rows = Object.keys(columnNameMap).length
    ? res.rows.map((row) => {
        const restored = Object.keys(columnNameMap).reduce((acc, originalName) => {
          return { ...acc, [getResponseColumnName(originalName)]: row[getResponseColumnName(columnNameMap[originalName])] };
        }, {});
        return { ...row, ...restored };
      })
    : res.rows;

  return rows;
}

// Per-table PK column cache. DAMA gis_datasets tables use `ogc_fid`; DMS
// data_items uses `id`. Looking up dynamically lets the same route serve both.
const _pkCache = new Map();

async function resolvePrimaryKey(db, schema, table) {
  const key = `${schema}.${table}`;
  if (_pkCache.has(key)) return _pkCache.get(key);

  let pk = 'id';
  if (db.type === 'postgres') {
    try {
      const { rows } = await db.query(
        `SELECT a.attname AS pk
         FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = $1::regclass AND i.indisprimary
         LIMIT 1`,
        [`${schema}.${table}`]
      );
      if (rows[0]?.pk) pk = rows[0].pk;
    } catch (e) {
      // Table may not exist or pg_index lookup may fail — fall back to 'id'.
    }
  }
  _pkCache.set(key, pk);
  return pk;
}

async function dataById(ctx, ids, attributes) {
  const { db, table_schema, table_name } = ctx;

  const sanitizedAttrs = sanitizeName(attributes).filter((f) => f);
  if (!sanitizedAttrs.length) return [];

  const pkCol = await resolvePrimaryKey(db, table_schema, table_name);
  const sql = `SELECT ${pkCol} AS id, ${sanitizedAttrs.map((c) => quoteAlias(c)).join(', ')} FROM ${table_schema}.${table_name} WHERE ${pkCol} = ANY($1)`;
  const { rows } = await db.query(sql, [ids.map((id) => +id)]);
  return rows;
}

module.exports = {
  simpleFilterLength,
  simpleFilter,
  dataById,
  // Exported for testing
  translatePgToSqlite,
};
