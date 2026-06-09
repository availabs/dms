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

const { sanitizeName, getResponseColumnName, getEssentials, buildJoin } = require('../utils');
const {
  handleFiltersCH,
  handleFilterGroupsCH,
  handleGroupByCH,
  handleHavingCH,
  handleOrderByCH,
  buildAliasGroupCaseCH,
} = require('./helpers');



function buildCombinedWhereCH({ filter, exclude, gt, gte, lt, lte, like, filterGroups, joinPresent }) {
  const filterClause = handleFiltersCH({ filter, exclude, gt, gte, lt, lte, like, joinPresent });
  const hasExisting = !!filterClause;
  const filterGroupsClause = handleFilterGroupsCH(filterGroups, hasExisting);

  if (!filterClause && !filterGroupsClause) return '';
  return `${filterClause} ${filterGroupsClause}`.trim();
}

async function simpleFilterLength(ctx, options) {
  const { db, table_schema, table_name } = ctx;
  const {
    filter = {}, exclude = {},
    gt = {}, gte = {}, lt = {}, lte = {}, like = {},
    filterGroups = {},
    groupBy = [], having = [],
    normalFilter = [],
    join = {},
    aliasGroups = {}
  } = JSON.parse(options);

  // Detect whether the request includes a real join so the WHERE builder can
  // disambiguate base-table columns like app/type with a `ds.` prefix.
  const joinPresent = !!join &&
    (Object.keys(join.sources || {}).length > 1 ||
      (Object.keys(join.sources || {}).length === 1 && Object.keys(join.sources || {})[0] !== 'ds'));

  if (normalFilter.length) {
    normalFilter.forEach(({ column, values }) => {
      (filter[column] ??= []).push(...values);
    });
  }

  const activeAliasGroups = {};
  if (aliasGroups) {
    for (const [alias, definition] of Object.entries(aliasGroups)) {
      if (groupBy.includes(alias)) {
        activeAliasGroups[alias] = buildAliasGroupCaseCH(definition);
      }
    }
  }

  const sanitizedGroupBy = groupBy.map(g => activeAliasGroups[g] || sanitizeName(g)).filter(Boolean);

  const countExpr = sanitizedGroupBy.length
    ? `count(DISTINCT concat(${sanitizedGroupBy.map((c) => `toString(${c})`).join(", '-' ,")}))`
    : `count(*)`;

  const combinedWhere = buildCombinedWhereCH({
    filter, exclude, gt, gte, lt, lte, like, filterGroups,
  });

  const { joins, merges } = await buildJoin({join});
  const hasMerge = merges.length > 0;
  const hasJoin = joins.length > 0;

  let fromClause;
  if (hasMerge) {
    fromClause = `(SELECT * FROM ${table_schema}.${table_name} ${merges}) AS ds`;
    if (hasJoin) {
      fromClause += ` ${joins}`;
    }
  } else {
    //default case for no merge
    //could have 1 or more joins
    fromClause = `${table_schema}.${table_name} ${hasJoin ? ' as ds ' : ''} ${joins}`;
  }

  const sql = `
    SELECT ${countExpr} AS numRows
    FROM ${fromClause}
    ${combinedWhere}
    ${handleHavingCH(having)}
  `;

  const result = await db.query({ query: sql, format: 'JSON' });
  const rows = await result.json();
  return rows?.data?.[0]?.numRows != null ? Number(rows.data[0].numRows) : 0;
}

function transformAttributesForClickHouse(attrs) {
  return attrs.map(attr => {
    // Matches simple columns AND complex CASE statements inside distinct (...)
    const regex = /array_to_string\(array_agg\(distinct\s+(?:\(\s*)?([\s\S]+?)(?:\s*\))?\),\s*',\s*'\)\s+as\s+(\w+)/i;

    return attr.replace(regex, (match, column, alias) => {
      // ClickHouse: arrayStringConcat(groupArrayDistinct(COLUMN), ', ') as ALIAS
      return `arrayStringConcat(groupArrayDistinct(${column}), ', ') as ${alias}`;
    });
  });
}

async function simpleFilter(ctx, options, attributes, indices) {
  const num = indices.to - indices.from + 1;
  const { db, table_schema, table_name } = ctx;

  const {
    filter = {}, exclude = {},
    gt = {}, gte = {}, lt = {}, lte = {}, like = {},
    filterGroups = {},
    groupBy = [], having = [], orderBy = {},
    normalFilter = [], join = {},
    aliasGroups = {}
  } = JSON.parse(options);

  const activeAliasGroups = {};
  if (aliasGroups) {
    for (const [alias, definition] of Object.entries(aliasGroups)) {
      if (groupBy.includes(alias)) {
        activeAliasGroups[alias] = buildAliasGroupCaseCH(definition);
      }
    }
  }

  const transformedAttributes = transformAttributesForClickHouse(attributes);

  const sanitizedAttrs = sanitizeName(transformedAttributes).filter((f) => f)
    .map(attr => {
      const respName = getResponseColumnName(attr);
      if (activeAliasGroups[respName]) {
        return `${activeAliasGroups[respName]} as ${respName}`;
      }
      return attr;
    });

  // Ensure grouped alias groups are in the SELECT clause
  groupBy.forEach(g => {
    if (activeAliasGroups[g]) {
      const alreadyIn = sanitizedAttrs.some(attr => getResponseColumnName(attr) === g);
      if (!alreadyIn) {
        sanitizedAttrs.push(`${activeAliasGroups[g]} as ${g}`);
      }
    }
  });

  if (!sanitizedAttrs.length) return [];

  const columnNameMap = sanitizedAttrs.reduce((acc, attrName, i) => {
    const responseName = getResponseColumnName(attrName);
    if (attrName.toLowerCase().includes(' as ') && responseName.length > 60) {
      acc[attrName] = attrName.replace(` ${responseName}`, ` col_${i}`);
    }
    return acc;
  }, {});

  if (normalFilter.length) {
    normalFilter.forEach(({ column, values }) => {
      (filter[column] ??= []).push(...values);
    });
  }

 // Detect whether the request includes a real join (server-side mirror of
  // calculateIsJoinPresent) so the WHERE builder can disambiguate base-table
  // columns like app/type with a `ds.` prefix.
  const joinPresent = !!join &&
    (Object.keys(join.sources || {}).length > 1 ||
      (Object.keys(join.sources || {}).length === 1 && Object.keys(join.sources || {})[0] !== 'ds'));

  const combinedWhere = buildCombinedWhereCH({
    filter, exclude, gt, gte, lt, lte, like, filterGroups, joinPresent
  });

  const { joins, merges } = await buildJoin({join});
  const hasMerge = merges.length > 0;
  const hasJoin = joins.length > 0;
  let fromClause;
  if (hasMerge) {
    fromClause = `(SELECT * FROM ${table_schema}.${table_name} ${merges}) AS ds`;
    if (hasJoin) {
      fromClause += ` ${joins}`;
    }
  } else {
    //default case for no merge
    //could have 1 or more joins
    fromClause = `${table_schema}.${table_name} ${hasJoin ? ' as ds ' : ''} ${joins}`;
  }

  const sql = `
    SELECT ${sanitizedAttrs.map((c) => columnNameMap[c] || c).join(', ')}
    FROM ${fromClause}
    ${combinedWhere}
    ${handleGroupByCH(groupBy.map(g => activeAliasGroups[g] || g))}
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
