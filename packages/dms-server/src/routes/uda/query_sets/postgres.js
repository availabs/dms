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
  handleOrderBy,
  buildCombinedWhere,
  buildJoin,
  buildAliasGroupCase
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
    aliasGroups = {}
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

  // Custom buckets: for any groupBy entry that names an alias group, compile its
  // definition into a CASE expression to use in place of the bare column.
  const activeAliasGroups = {};
  if (aliasGroups) {
    for (const [alias, definition] of Object.entries(aliasGroups)) {
      if (groupBy.includes(alias)) {
        activeAliasGroups[alias] = buildAliasGroupCase(definition);
      }
    }
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
      : `SELECT count(${groupBy.length
           ? `DISTINCT ${groupBy.map((g) => activeAliasGroups[g] || sanitizeName(g)).filter((g) => g)
               .map((c) => `CASE WHEN ${c} IS NULL THEN '__NULL__VAL__' ELSE ${typeCast(c, 'TEXT', db.type)} END`)
               .join(`|| '-' ||`)}`
           : 1}) numrows
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
    aliasGroups = {}
  } = JSON.parse(options);

  // Custom buckets: compile the CASE expression for any alias group that the
  // request groups by, so it can be substituted into the SELECT and GROUP BY.
  const activeAliasGroups = {};
  if (aliasGroups) {
    for (const [alias, definition] of Object.entries(aliasGroups)) {
      if (groupBy.includes(alias)) {
        activeAliasGroups[alias] = buildAliasGroupCase(definition);
      }
    }
  }

  let sanitizedAttrs = sanitizeName(attributes).filter((f) => f);
  if (!sanitizedAttrs.length) return [];

  // Translate PG-specific SQL to SQLite equivalents
  if (db.type === 'sqlite') {
    sanitizedAttrs = sanitizedAttrs.map(translatePgToSqlite);
  }

  // Substitute the alias-group CASE expression into any SELECT column whose
  // response name matches an active alias group.
  //
  // The alias is double-quoted so PostgreSQL preserves its exact case. Unlike
  // regular columns (whose client-side alias is already lowercased via
  // colNameAfterAS), the custom-bucket alias must stay verbatim to match the
  // aliasGroups key + groupBy. An UNquoted `as RoadClass` is folded to
  // `roadclass` by PG, so the returned row is keyed lowercase while the route
  // reads it back by the original-case attribute (rows[ii][getResponseColumnName
  // (attr)]) → undefined → null cell. ClickHouse preserves case, which is why
  // the bug only surfaced on the PG/SQLite port. getResponseColumnName strips
  // the surrounding quotes, so the round-trip key stays consistent.
  sanitizedAttrs = sanitizedAttrs.map(attr => {
    const respName = getResponseColumnName(attr);
    return activeAliasGroups[respName] ? `${activeAliasGroups[respName]} as "${respName}"` : attr;
  });

  // Ensure grouped alias groups are present in the SELECT clause.
  groupBy.forEach(g => {
    if (activeAliasGroups[g] && !sanitizedAttrs.some(attr => getResponseColumnName(attr) === g)) {
      sanitizedAttrs.push(`${activeAliasGroups[g]} as "${g}"`);
    }
  });

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

  // Bucket aliases are already compiled into a vetted CASE expression
  // (activeAliasGroups); only the bare column entries still need sanitizing.
  // Passing the CASE through handleGroupBy()'s sanitizeName() would discard it
  // whenever a label/value/fallback contains a SQL keyword token (e.g. a "Union"
  // county value), dropping the SELECT's CASE column out of GROUP BY. Sanitize
  // per-entry instead — mirrors simpleFilterLength.
  const groupByExprs = groupBy.map(g => activeAliasGroups[g] || sanitizeName(g)).filter(Boolean);

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

  const res = await db.query(sql, values);

  // Restore long column names from short aliases
  let rows = Object.keys(columnNameMap).length
    ? res.rows.map(row => {
        const restored = Object.keys(columnNameMap).reduce((acc, originalName) => {
          return { ...acc, [getResponseColumnName(originalName)]: row[getResponseColumnName(columnNameMap[originalName])] };
        }, {});
        return { ...row, ...restored };
      })
    : res.rows;

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
  buildAliasGroupCase,
};
