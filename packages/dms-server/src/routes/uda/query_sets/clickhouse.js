/**
 * ClickHouse UDA query set.
 *
 * Dispatched to when a DAMA view's table_schema starts with `clickhouse.`.
 * Ported from references/avail-falcor/routes/uda_query_sets/clickhouse.js
 * with the DMS-specific branches removed — CH is DAMA-only by design.
 *
 * The ctx.db here is a ClickHouseAdapter from src/db/adapters/clickhouse.js.
 * Its query() takes { query, query_params, format } and returns a result set
 * with an async .json() method, matching @clickhouse/client's native shape.
 *
 * Note: ctx.table_schema has already had the `clickhouse.` prefix stripped
 * by getEssentials, so SQL references ${table_schema}.${table_name} directly.
 */

const { sanitizeName, getResponseColumnName } = require('../utils');
const {
  handleFiltersCH,
  handleGroupByCH,
  handleHavingCH,
  handleOrderByCH,
} = require('./helpers');

async function simpleFilterLength(ctx, options) {
  const { db, table_schema, table_name } = ctx;
  const {
    filter = {}, exclude = {},
    gt = {}, gte = {}, lt = {}, lte = {}, like = {},
    groupBy = [], having = [],
    normalFilter = [],
  } = JSON.parse(options);

  if (normalFilter.length) {
    normalFilter.forEach(({ column, values }) => {
      (filter[column] ??= []).push(...values);
    });
  }

  const sanitizedGroupBy = sanitizeName(groupBy).filter(Boolean);

  const countExpr = sanitizedGroupBy.length
    ? `count(DISTINCT concat(${sanitizedGroupBy.map((c) => `toString(${c})`).join(", '-' ,")}))`
    : `count(*)`;

  const sql = `
    SELECT ${countExpr} AS numRows
    FROM ${table_schema}.${table_name}
    ${handleFiltersCH({ filter, exclude, gt, gte, lt, lte, like })}
    ${handleHavingCH(having)}
  `;

  const result = await db.query({ query: sql, format: 'JSON' });
  const rows = await result.json();
  return rows?.data?.[0]?.numRows != null ? Number(rows.data[0].numRows) : 0;
}

async function simpleFilter(ctx, options, attributes, indices) {
  const num = indices.to - indices.from + 1;
  const { db, table_schema, table_name } = ctx;

  const sanitizedAttrs = sanitizeName(attributes).filter((f) => f);
  if (!sanitizedAttrs.length) return [];

  const columnNameMap = sanitizedAttrs.reduce((acc, attrName, i) => {
    const responseName = getResponseColumnName(attrName);
    if (attrName.toLowerCase().includes(' as ') && responseName.length > 60) {
      acc[attrName] = attrName.replace(` ${responseName}`, ` col_${i}`);
    }
    return acc;
  }, {});

  const {
    filter = {}, exclude = {},
    gt = {}, gte = {}, lt = {}, lte = {}, like = {},
    groupBy = [], having = [], orderBy = {},
    normalFilter = [],
  } = JSON.parse(options);

  if (normalFilter.length) {
    normalFilter.forEach(({ column, values }) => {
      (filter[column] ??= []).push(...values);
    });
  }

  const sql = `
    SELECT ${sanitizedAttrs.map((c) => columnNameMap[c] || c).join(', ')}
    FROM ${table_schema}.${table_name}
    ${handleFiltersCH({ filter, exclude, gt, gte, lt, lte, like })}
    ${handleGroupByCH(groupBy)}
    ${handleHavingCH(having)}
    ${handleOrderByCH(orderBy)}
    LIMIT ${+num}
    OFFSET ${indices.from}
  `;

  const result = await db.query({ query: sql, format: 'JSON' });
  const json = await result.json();
  const rawRows = json.data || [];

  const rows = Object.keys(columnNameMap).length
    ? rawRows.map((row) => {
        const restored = Object.keys(columnNameMap).reduce((acc, originalName) => ({
          ...acc,
          [getResponseColumnName(originalName)]: row[getResponseColumnName(columnNameMap[originalName])],
        }), {});
        return { ...row, ...restored };
      })
    : rawRows;

  return rows;
}

async function dataById(ctx, ids, attributes) {
  const { db, table_schema, table_name } = ctx;

  const sanitizedAttrs = sanitizeName(attributes).filter((f) => f);
  if (!sanitizedAttrs.length) return [];

  const sql = `
    SELECT id, ${sanitizedAttrs.join(', ')}
    FROM ${table_schema}.${table_name}
    WHERE id IN {ids:Array(UInt64)}
  `;

  const result = await db.query({
    query: sql,
    query_params: { ids: ids.map((id) => Number(id)) },
    format: 'JSON',
  });
  const json = await result.json();
  return json.data || [];
}

module.exports = {
  simpleFilterLength,
  simpleFilter,
  dataById,
};
