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

const { sanitizeName, getResponseColumnName, getEssentials, buildJoin, restoreLongColumnNames } = require('../utils');
const {
  handleFiltersCH,
  handleFilterGroupsCH,
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
    aliasGroups = {},
    // Comparison series: total length = sum of each variant arm's count.
    seriesVariants = [], seriesKey = '__series'
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
  console.log("ch length seriesVariants::", seriesVariants)
  // ── Comparison-series fan-out length ────────────────────────────────────────
  // Sum each arm's count as a scalar subquery. The series discriminator is constant
  // per arm and not a real column here, so it's dropped from the count's groupBy.
  if (seriesVariants.length) {
    const countGroupBy = groupBy.filter((g) => g !== seriesKey);
    const armCountExpr = countGroupBy.length
      ? `count(DISTINCT concat(${countGroupBy.map((g) => activeAliasGroups[g] || sanitizeName(g)).filter(Boolean).map((c) => `toString(${c})`).join(", '-' ,")}))`
      : `count(*)`;
    const armCountSqls = seriesVariants.map((variant) => {
      const armWhere = buildCombinedWhereCH({
        filter, exclude, gt, gte, lt, lte, like,
        filterGroups: variant.filterGroups || {}, joinPresent,
      });
      return `(SELECT ${armCountExpr} FROM ${fromClause} ${armWhere} ${handleHavingCH(having)})`;
    });
    const fanoutSql = `SELECT ${armCountSqls.join(' + ')} AS numRows`;
    console.log({fanoutSql})
    const fanoutResult = await db.query({ query: fanoutSql, format: 'JSON' });
    const fanoutRows = await fanoutResult.json();
    return fanoutRows?.data?.[0]?.numRows != null ? Number(fanoutRows.data[0].numRows) : 0;
  }

  // Grouped length = number of GROUP BY buckets. Count rows of a subquery that
  // groups by the same keys, instead of count(DISTINCT concat(a,'-',b)): the
  // concat collides on ambiguous '-' boundaries (('x-','y') vs ('x','-y') both →
  // 'x--y') and the per-row toString + distinct-aggregate is far slower than
  // letting ClickHouse drive the GROUP BY. Mirrors the Postgres path
  // (query_sets/postgres.js). GROUP BY folds NULLs into one bucket (the old
  // count(DISTINCT concat(toString(NULL),…)) dropped them).
  const sql = sanitizedGroupBy.length
    ? `
      SELECT count(*) AS numRows FROM (
        SELECT 1
        FROM ${fromClause}
        ${combinedWhere}
        GROUP BY ${sanitizedGroupBy.join(', ')}
        ${handleHavingCH(having)}
      )
    `
    : `
      SELECT count(*) AS numRows
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
    aliasGroups = {},
    // Comparison series (query fan-out): one UNION ALL arm per variant. CH inlines
    // filter values (no $N placeholders), so arms compose directly. Empty → single
    // arm, unchanged.
    seriesVariants = [], seriesKey = '__series'
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

  // Bucket aliases are already compiled into a vetted CASE expression
  // (activeAliasGroups); only the bare column entries still need sanitizing.
  // Passing the CASE through handleGroupByCH()'s sanitizeName() would discard it
  // whenever a label/value/fallback contains a SQL keyword token (e.g. a "Union"
  // county value), dropping the SELECT's CASE column out of GROUP BY. Sanitize
  // per-entry instead — mirrors simpleFilterLength.
  const groupByExprs = groupBy.map(g => activeAliasGroups[g] || sanitizeName(g)).filter(Boolean);

  // ── Comparison-series fan-out ───────────────────────────────────────────────
  // One UNION ALL arm per variant: shared SELECT/FROM/GROUP BY with each arm's own
  // (inlined) WHERE and a constant `'<label>' as <seriesKey>` discriminator. CH
  // preserves identifier case, so the alias stays bare (unlike the PG path's quoting).
  // The label literal is single-quote-escaped; the discriminator is dropped from the
  // base SELECT (the client requests it, but the literal is its sole source) and from
  // the arm GROUP BY (constant per arm). ORDER BY omitted across the union for v1.
  if (seriesVariants.length) {
    const armGroupByExprs = groupByExprs.filter((g) => g !== seriesKey);
    const baseArmAttrs = sanitizedAttrs.filter((c) => getResponseColumnName(c) !== seriesKey);
    const armSqls = seriesVariants.map((variant) => {
      const armWhere = buildCombinedWhereCH({
        filter, exclude, gt, gte, lt, lte, like,
        filterGroups: variant.filterGroups || {}, joinPresent,
      });
      const safeLabel = `'${String(variant.label ?? '').replace(/'/g, "''")}'`;
      const armSelect = [
        ...baseArmAttrs.map((c) => columnNameMap[c] || c),
        `${safeLabel} as ${seriesKey}`,
      ].join(', ');
      return `
        SELECT ${armSelect}
        FROM ${fromClause}
        ${armWhere}
        ${armGroupByExprs.length ? `GROUP BY ${armGroupByExprs.join(', ')}` : ''}
        ${handleHavingCH(having)}`;
    });
    const fanoutSql = `
      SELECT * FROM (
        ${armSqls.join('\n        UNION ALL\n')}
      ) AS fanout
      LIMIT ${+num}
      OFFSET ${indices.from}
    `;
    console.log("fan sql",fanoutSql)
    const fanoutResult = await db.query({ query: fanoutSql, format: 'JSON' });
    const fanoutJson = await fanoutResult.json();
    return restoreLongColumnNames(fanoutJson.data || [], columnNameMap);
  }

  const sql = `
    SELECT ${sanitizedAttrs.map((c) => columnNameMap[c] || c).join(', ')}
    FROM ${fromClause}
    ${combinedWhere}
    ${groupByExprs.length ? `GROUP BY ${groupByExprs.join(', ')}` : ''}
    ${handleHavingCH(having)}
    ${handleOrderByCH(orderBy)}
    LIMIT ${+num}
    OFFSET ${indices.from}
  `;

  const result = await db.query({ query: sql, format: 'JSON' });
  const json = await result.json();
  return restoreLongColumnNames(json.data || [], columnNameMap);
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
