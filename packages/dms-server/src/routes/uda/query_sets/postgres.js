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
  handleHaving,
  handleGroupBy,
  handleOrderBy,
  buildCombinedWhere,
  buildJoin,
  offsetPlaceholders,
  restoreLongColumnNames
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
    filterGroups = {},
    groupBy = [], having = [],
    normalFilter = [],
    join = {},
    // Comparison series: total length is the sum of each variant arm's count
    // (each arm has a distinct series label, so the grouped counts don't overlap).
    seriesVariants = [], seriesKey = '__series'
  } = JSON.parse(options);

  // Translate PG-specific SQL in groupBy expressions for SQLite
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

  // Detect whether the request includes a real join (server-side mirror of
  // calculateIsJoinPresent) so the WHERE builder can disambiguate base-table
  // columns like app/type with a `ds.` prefix.
  const joinPresent = !!join &&
    (Object.keys(join.sources || {}).length > 1 ||
      (Object.keys(join.sources || {}).length === 1 && Object.keys(join.sources || {})[0] !== 'ds'));

  const combinedWhere = buildCombinedWhere({
    filter, exclude, gt, gte, lt, lte, like,
    filterGroups, isDms, app, type, oldValues, dbType: db.type, joinPresent,
  });

  // Check for jsonb_array_elements_text (PG) or json_each (SQLite) in groupBy
  const hasArrayElements = groupBy?.[0]?.includes('jsonb_array_elements_text')
    || groupBy?.[0]?.includes('json_each');

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

  // GroupBy entries.
  const groupByExprs = groupBy.map((g) => sanitizeName(g)).filter(Boolean);

  // Grouped length = number of GROUP BY buckets. Count rows of a subquery that
  // groups by the same keys, rather than count(DISTINCT keyA || '-' || keyB):
  // the concatenation collides on ambiguous '-' boundaries (('x-','y') vs
  // ('x','-y') both → 'x--y') and the per-row CASE/::TEXT + distinct-sort is far
  // slower than letting the index drive the GROUP BY (15 s → ~0.5 s on the 4.87 M
  // -row congestion ED table). GROUP BY already folds NULLs into one bucket, so
  // the '__NULL__VAL__' guard is no longer needed.
  // ── Comparison-series fan-out length ────────────────────────────────────────
  // Sum each arm's count as a scalar subquery. The count expression mirrors the
  // single-arm DISTINCT-groupBy / count(1) below; only each arm's WHERE differs.
  // Placeholders are renumbered per arm against one shared values array.
  if (seriesVariants.length) {
    // The series discriminator is constant within an arm, so it can't add distinct
    // groups — and it isn't a real column in the count subquery (no literal alias
    // there). Drop it from the count's groupBy; the per-arm counts still sum to the
    // total fan-out row count.
    const countGroupBy = groupBy.filter((g) => g !== seriesKey);
    const countExpr = `count(${countGroupBy.length
      ? `DISTINCT ${countGroupBy.map((g) => sanitizeName(g)).filter((g) => g)
          .map((c) => `CASE WHEN ${c} IS NULL THEN '__NULL__VAL__' ELSE ${typeCast(c, 'TEXT', db.type)} END`)
          .join(`|| '-' ||`)}`
      : 1})`;
    const armCountSqls = [];
    const fanoutValues = [];
    for (const variant of seriesVariants) {
      const armFilterGroups = variant.filterGroups || {};
      const armValues = [...oldValues, ...getValuesFromGroup(armFilterGroups)];
      const armWhere = buildCombinedWhere({
        filter, exclude, gt, gte, lt, lte, like,
        filterGroups: armFilterGroups, isDms, app, type, oldValues, dbType: db.type, joinPresent,
      });
      const armCount = `SELECT ${countExpr} AS c FROM ${fromClause} ${armWhere} ${handleHaving(having)}`;
      armCountSqls.push(`(${offsetPlaceholders(armCount, fanoutValues.length)})`);
      fanoutValues.push(...armValues);
    }
    const sql = `SELECT ${armCountSqls.join(' + ')} AS numrows`;
    const { rows } = await db.query(sql, fanoutValues);
    return rows?.[0]?.numrows ?? 0;
  }

  const sql =
    hasArrayElements && sanitizeName(groupBy?.[0])
      ? `WITH t AS (
           SELECT DISTINCT ${groupBy[0]}
           FROM ${fromClause}
           ${combinedWhere}
           GROUP BY 1
           ${handleHaving(having)}
         )
         SELECT count(*) numrows FROM t`
      : groupByExprs.length
        ? `SELECT count(*) numrows FROM (
             SELECT 1
             FROM ${fromClause}
             ${combinedWhere}
             GROUP BY ${groupByExprs.join(', ')}
             ${handleHaving(having)}
           ) t`
        : `SELECT count(1) numrows
           FROM ${fromClause}
           ${combinedWhere}
           ${handleHaving(having)}`;

  const { rows } = await db.query(sql, values);
  return rows?.[0]?.numrows ?? 0;
}

async function buildSimpleFilterSql(ctx, options, attributes, indices) {
  const num = indices.to - indices.from + 1;
  const { isDms, db, app, type, table_schema, table_name, dmsAttributes } = ctx;

  let sanitizedAttrs = sanitizeName(attributes).filter((f) => f);
  if (!sanitizedAttrs.length) {
    return {
      sql: null,
      values: [],
      columnNameMap: {},
    };
  }

  // Translate PG-specific SQL to SQLite equivalents
  if (db.type === 'sqlite') {
    sanitizedAttrs = sanitizedAttrs.map(translatePgToSqlite);
  }

  // Map long column names to short aliases
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
    normalFilter = [], meta = {},
    join = {}
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

  // Detect whether the request includes a real join (server-side mirror of
  // calculateIsJoinPresent) so the WHERE builder can disambiguate base-table
  // columns like app/type with a `ds.` prefix.
  const joinPresent = !!join &&
    (Object.keys(join.sources || {}).length > 1 ||
      (Object.keys(join.sources || {}).length === 1 && Object.keys(join.sources || {})[0] !== 'ds'));

  const combinedWhere = buildCombinedWhere({
    filter, exclude, gt, gte, lt, lte, like,
    filterGroups, isDms, app, type, oldValues, dbType: db.type, joinPresent,
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
    SELECT ${sanitizedAttrs.map((c) => quoteAlias(columnNameMap[c] || c)).join(', ')}
    FROM ${fromClause}
    ${combinedWhere}
    ${handleGroupBy(groupBy)}
    ${handleHaving(having)}
    ${handleOrderBy(orderBy, dmsAttributes)}
    LIMIT ${+num}
    OFFSET ${indices.from}
  `;
  return {
    sql,
    values,
    columnNameMap,
  };
}

async function simpleFilter(ctx, options, attributes, indices) {
  const num = indices.to - indices.from + 1;
  const { isDms, db, app, type, table_schema, table_name, dmsAttributes } = ctx;

  const {
    filter = {}, exclude = {},
    gt = {}, gte = {}, lt = {}, lte = {}, like = {},
    filterRelation = 'and',
    filterGroups = {},
    groupBy = [], having = [], orderBy = {},
    normalFilter = [], meta = {},
    join = {},
    // Comparison series (query fan-out): each variant is one UNION ALL arm = the
    // base query with `filterGroups` swapped for the variant's resolved tree, plus
    // a constant `'<label>' as <seriesKey>` column the chart categorizes on. Empty
    // → single-arm path below, byte-identical to before.
    seriesVariants = [], seriesKey = '__series'
  } = JSON.parse(options);

  let sanitizedAttrs = sanitizeName(attributes).filter((f) => f);
  if (!sanitizedAttrs.length) return [];

  // Translate PG-specific SQL to SQLite equivalents
  if (db.type === 'sqlite') {
    sanitizedAttrs = sanitizedAttrs.map(translatePgToSqlite);
  }

  // Map long column names to short aliases
  const columnNameMap = sanitizedAttrs.reduce((acc, attr, i) => {
    const responseName = getResponseColumnName(attr);
    if (attr.toLowerCase().includes(' as ') && responseName.length > 60) {
      acc[attr] = attr.replace(` ${responseName}`, ` col_${i}`);
    }
    return acc;
  }, {});

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

  // Detect whether the request includes a real join (server-side mirror of
  // calculateIsJoinPresent) so the WHERE builder can disambiguate base-table
  // columns like app/type with a `ds.` prefix.
  const joinPresent = !!join &&
    (Object.keys(join.sources || {}).length > 1 ||
      (Object.keys(join.sources || {}).length === 1 && Object.keys(join.sources || {})[0] !== 'ds'));

  const combinedWhere = buildCombinedWhere({
    filter, exclude, gt, gte, lt, lte, like,
    filterGroups, isDms, app, type, oldValues, dbType: db.type, joinPresent,
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

  // Sanitize each groupBy entry individually (mirrors simpleFilterLength).
  const groupByExprs = groupBy.map(g => sanitizeName(g)).filter(Boolean);

  // ── Comparison-series fan-out ───────────────────────────────────────────────
  // One UNION ALL arm per variant: the shared SELECT/FROM/GROUP BY built above,
  // but with each arm's own WHERE (from the variant's resolved filterGroups) and a
  // constant `'<label>' as "<seriesKey>"` discriminator column. The label is a
  // single-quote-escaped string literal rather than a bind param so it needs no
  // placeholder slot; it is constant per arm, so it never
  // needs to appear in GROUP BY. Placeholders are renumbered per arm by the running
  // param count and all arms share one flat `values` array. ORDER BY is intentionally
  // omitted across the union for v1 (charts sort client-side); LIMIT/OFFSET page the
  // combined set. Empty seriesVariants → falls through to the single-arm path.
  if (seriesVariants.length) {
    // The series discriminator is a constant literal per arm — always valid in the
    // SELECT without a GROUP BY entry — so drop it from the arm GROUP BY (it carries
    // no `data->>`/alias the base table actually has).
    const armGroupByExprs = groupByExprs.filter((g) => g !== seriesKey);
    const armSqls = [];
    const fanoutValues = [];
    for (const variant of seriesVariants) {
      const armFilterGroups = variant.filterGroups || {};
      const armValues = [...oldValues, ...getValuesFromGroup(armFilterGroups)];
      const armWhere = buildCombinedWhere({
        filter, exclude, gt, gte, lt, lte, like,
        filterGroups: armFilterGroups, isDms, app, type, oldValues, dbType: db.type, joinPresent,
      });
      const safeLabel = `'${String(variant.label ?? '').replace(/'/g, "''")}'`;
      // The discriminator column is provided solely by the constant literal below.
      // The client requests `seriesKey` as an attribute (so the route projects it),
      // which would otherwise land in sanitizedAttrs as a bare — non-existent —
      // base column; drop it and let the literal be its single source.
      const armSelect = [
        ...sanitizedAttrs
          .filter((c) => getResponseColumnName(c) !== seriesKey)
          .map((c) => quoteAlias(columnNameMap[c] || c)),
        `${safeLabel} as "${seriesKey}"`,
      ].join(', ');
      const armSql = `
        SELECT ${armSelect}
        FROM ${fromClause}
        ${armWhere}
        ${armGroupByExprs.length ? `GROUP BY ${armGroupByExprs.join(', ')}` : ''}
        ${handleHaving(having)}`;
      armSqls.push(offsetPlaceholders(armSql, fanoutValues.length));
      fanoutValues.push(...armValues);
    }

    const fanoutSql = `
      SELECT * FROM (
        ${armSqls.join('\n        UNION ALL\n')}
      ) AS fanout
      ${handleOrderBy(orderBy, dmsAttributes)}
      LIMIT ${+num}
      OFFSET ${indices.from}
    `;
    const fanoutRes = await db.query(fanoutSql, fanoutValues);
    return restoreLongColumnNames(fanoutRes.rows, columnNameMap);
  }

  const sql = `
    SELECT ${sanitizedAttrs.map((c) => quoteAlias(columnNameMap[c] || c)).join(', ')}
    FROM ${fromClause}
    ${combinedWhere}
    ${groupByExprs.length ? `GROUP BY ${groupByExprs.join(', ')}` : ''}
    ${handleHaving(having)}
    ${handleOrderBy(orderBy, dmsAttributes)}
    LIMIT ${+num}
    OFFSET ${indices.from}
  `;
  console.log("s filter sql::", sql)
  const res = await db.query(sql, values);

  // Restore long column names from short aliases
  let rows = restoreLongColumnNames(res.rows, columnNameMap);

  // // Apply meta lookups

  // if (Object.keys(meta).length) {
  //   return applyMeta(rows, meta, env, ctx.isDms, options);
  // }
  return rows;
}

// Per-table IDX column cache. DAMA gis_datasets tables use `ogc_fid`; DMS
// data_items uses `id`. Looking up dynamically lets the same route serve both.
const _pkCache = new Map();

async function resolvePrimaryKey(db, schema, table, storedIdx = null) {
  const key = `${schema}.${table}`;
  if (storedIdx) {
    _pkCache.set(key, storedIdx);
    return storedIdx;
  }
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
  const { db, table_schema, table_name, isDms, idxColumn } = ctx;

  const sanitizedAttrs = sanitizeName(attributes).filter((f) => f);
  if (!sanitizedAttrs.length) return [];

  // For DMS, the split table's SQL PK is always 'id'; the stored primaryKeyColumn
  // is a data field name (inside the JSONB 'data' column) and should not override it.
  const idxCol = await resolvePrimaryKey(db, table_schema, table_name, isDms ? null : idxColumn);
  const sql = `SELECT ${idxCol} AS id, ${sanitizedAttrs.map((c) => quoteAlias(c)).join(', ')} FROM ${table_schema}.${table_name} WHERE ${idxCol} = ANY($1)`;
  const { rows } = await db.query(sql, [ids.map((id) => +id)]);
  return rows;
}

module.exports = {
  simpleFilterLength,
  simpleFilter,
  dataById,
  buildSimpleFilterSql,
  // Exported for testing
  translatePgToSqlite,
};
