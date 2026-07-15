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

const { sanitizeName, getResponseColumnName, quoteAlias, getEssentials, buildJoin, restoreLongColumnNames, substituteAnchorMarkers } = require('../utils');
const {
  handleFiltersCH,
  handleFilterGroupsCH,
  handleHavingCH,
  handleOrderByCH,
} = require('./helpers');

// ClickHouse only drops a selected column's table qualifier from its default
// output name when that bare name is unambiguous across the query's joined
// tables. When it collides with a same-named column elsewhere (e.g. `ds.tmc`
// selected while joined against `ny_2025_tmc_meta`, which also has a `tmc`
// column — the join key itself), CH keeps the qualifier and names the output
// column `"ds.tmc"` instead of `"tmc"` — confirmed live against the actual
// production query (pulled from `system.query_log`). getResponseColumnName()
// always assumes the bare name, so an unaliased colliding column comes back
// `undefined` downstream. Force every attribute to carry an explicit alias so
// the output key is never left to ClickHouse's collision-dependent default.
const ALIAS_RE = /\s+as\s+("[^"]+"|\w+)\s*$/i;
const withExplicitAlias = (attr) =>
  ALIAS_RE.test(attr) ? attr : `${attr} as ${quoteAlias(getResponseColumnName(attr))}`;

function buildCombinedWhereCH({ filter, exclude, gt, gte, lt, lte, like, filterGroups, joinPresent }) {
  const filterClause = handleFiltersCH({ filter, exclude, gt, gte, lt, lte, like, joinPresent });
  const hasExisting = !!filterClause;
  const filterGroupsClause = handleFilterGroupsCH(filterGroups, hasExisting, joinPresent);

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
    // Comparison series: total length = sum of each variant arm's count.
    seriesVariants = [], seriesKey = '__series',
    // Set by buildUdaConfig.js when every shown column is a real aggregate
    // (fn: avg/sum/...) and there's no real groupBy dimension besides the
    // series discriminator. Lets the branches below tell an aggregate-only
    // query (always exactly 1 output row, even over 0 matching rows) apart
    // from a plain passthrough (raw row count).
    ungroupedAggregate = false,
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

  const sanitizedGroupBy = groupBy.map(g => sanitizeName(g)).filter(Boolean);

  const combinedWhere = buildCombinedWhereCH({
    filter, exclude, gt, gte, lt, lte, like, filterGroups, joinPresent,
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
  // ── Comparison-series fan-out length ────────────────────────────────────────
  // Sum each arm's count as a scalar subquery. The series discriminator is constant
  // per arm and not a real column here, so it's dropped from the count's groupBy.
  if (seriesVariants.length) {
    const countGroupBy = groupBy.filter((g) => g !== seriesKey);
    // No real per-arm groupBy dimension. The matching simpleFilter arm SELECT
    // (armGroupByExprs also empty there) has no GROUP BY either — for an
    // ungrouped-aggregate arm (every shown column wrapped in fn: avg/sum/...)
    // SQL always collapses that to exactly one row, even over zero matching
    // source rows, so the count is always 1, not a raw row count. A plain
    // passthrough arm (no aggregate fn) still needs the raw count(*) below.
    const armCountExpr = countGroupBy.length
      ? `count(DISTINCT concat(${countGroupBy.map((g) => sanitizeName(g)).filter(Boolean).map((c) => `toString(${c})`).join(", '-' ,")}))`
      : ungroupedAggregate ? null : `count(*)`;
    const armCountSqls = seriesVariants.map((variant) => {
      if (armCountExpr === null) return '1';
      const armWhere = buildCombinedWhereCH({
        filter, exclude, gt, gte, lt, lte, like,
        filterGroups: variant.filterGroups || {}, joinPresent,
      });
      return `(SELECT ${armCountExpr} FROM ${fromClause} ${armWhere} ${handleHavingCH(having)})`;
    });
    const fanoutSql = `SELECT ${armCountSqls.join(' + ')} AS numRows`;
    const fanoutResult = await db.query({ query: fanoutSql, format: 'JSON' });
    const fanoutRows = await fanoutResult.json();
    return fanoutRows?.data?.[0]?.numRows != null ? Number(fanoutRows.data[0].numRows) : 0;
  }

  // No groupBy at all, and every shown column is a real aggregate (fn: avg/
  // sum/...) — simpleFilter's matching query has no GROUP BY either, so it's an
  // ungrouped aggregate: always exactly one output row, even over zero matching
  // rows. Same reasoning as the seriesVariants branch above.
  if (!sanitizedGroupBy.length && ungroupedAggregate) return 1;

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

/**
 * Build-only twin of postgres.js#buildSimpleFilterSql for the ClickHouse
 * dialect. Returns the full single-arm SELECT for the given options WITHOUT
 * executing it — callers that splice the query into a larger plan (the tile
 * join in dama/tiles/tiles.rest.js, colorDomain's joined breaks) need the
 * text, and omit `indices` to get every matching row with NO LIMIT/OFFSET.
 * ClickHouse inlines filter values into the SQL (no $N placeholders), so
 * unlike the PG builder there is no `values` array — the returned `sql` is
 * self-contained. simpleFilter's single-arm path delegates here, so the built
 * text is exactly what live client queries run.
 */
async function buildSimpleFilterSqlCH(ctx, options, attributes, indices = null) {
  const hasLimit = indices && Number.isFinite(indices.from) && Number.isFinite(indices.to);
  const num = hasLimit ? indices.to - indices.from + 1 : null;
  const { table_schema, table_name } = ctx;

  const {
    filter = {}, exclude = {},
    gt = {}, gte = {}, lt = {}, lte = {}, like = {},
    filterGroups = {},
    groupBy = [], having = [], orderBy = {},
    normalFilter = [], join = {},
  } = JSON.parse(options);

  const transformedAttributes = transformAttributesForClickHouse(attributes);
  const sanitizedAttrs = sanitizeName(transformedAttributes).filter((f) => f);
  if (!sanitizedAttrs.length) return { sql: null, columnNameMap: {} };

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
    filter, exclude, gt, gte, lt, lte, like, filterGroups, joinPresent,
  });

  const { joins, merges } = await buildJoin({ join });
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

  const groupByExprs = groupBy.map(g => sanitizeName(g)).filter(Boolean);

  const sql = `
    SELECT ${sanitizedAttrs.map((c) => withExplicitAlias(columnNameMap[c] || c)).join(', ')}
    FROM ${fromClause}
    ${combinedWhere}
    ${groupByExprs.length ? `GROUP BY ${groupByExprs.join(', ')}` : ''}
    ${handleHavingCH(having)}
    ${handleOrderByCH(orderBy)}
    ${hasLimit ? `LIMIT ${+num}
    OFFSET ${indices.from}` : ''}
  `;
  return { sql, columnNameMap };
}

/**
 * Map a ClickHouse result-meta type to the Postgres column type used when CH
 * rows are merged into a PG query via jsonb_to_recordset (tile joins,
 * colorDomain). Numeric fidelity is load-bearing — MVT feature properties and
 * break computations must see numbers, not text. CH quotes 64-bit ints as
 * JSON strings; the bigint cast parses them.
 */
function chTypeToPg(chType) {
  let t = String(chType || '').trim();
  let m;
  while ((m = /^(?:Nullable|LowCardinality)\((.*)\)$/.exec(t))) t = m[1];
  if (/^U?Int\d+$/.test(t)) return 'bigint';
  if (/^Float(32|64)$/.test(t)) return 'double precision';
  if (/^Decimal/.test(t)) return 'numeric';
  if (/^Bool$/i.test(t)) return 'boolean';
  // String/FixedString/Enum/UUID/Date/DateTime/... — text is always a safe
  // jsonb_to_recordset target.
  return 'text';
}

/**
 * Convert a CH JSON result ({meta, data}) into the pieces a Postgres
 * jsonb_to_recordset() merge needs: a typed column-definition list and the
 * rows as a JSON string. Any col_N-shortened aliases (see columnNameMap in
 * buildSimpleFilterSqlCH) are restored in both the column names and the rows
 * so downstream SQL can reference the real response names.
 */
function chResultToRecordset(chJson, columnNameMap = {}) {
  const shortToLong = Object.entries(columnNameMap).reduce((acc, [originalName, shortened]) => {
    acc[getResponseColumnName(shortened)] = getResponseColumnName(originalName);
    return acc;
  }, {});
  const columnDefs = (chJson?.meta || [])
    .map((m) => {
      const name = shortToLong[m.name] || m.name;
      return `"${String(name).replace(/"/g, '')}" ${chTypeToPg(m.type)}`;
    })
    .join(', ');
  const rows = restoreLongColumnNames(chJson?.data || [], columnNameMap);
  return { columnDefs, rowsJson: JSON.stringify(rows) };
}

async function simpleFilter(ctx, options, attributes, indices) {
  // Single-arm queries delegate to the shared build-only twin above — one
  // source of truth for the query shape with the tile-join / colorDomain
  // merge callers. The comparison-series fan-out below builds its own
  // per-arm SQL.
  if (!(JSON.parse(options).seriesVariants || []).length) {
    const { sql, columnNameMap } = await buildSimpleFilterSqlCH(ctx, options, attributes, indices);
    if (!sql) return [];
    const result = await ctx.db.query({ query: sql, format: 'JSON' });
    const json = await result.json();
    return restoreLongColumnNames(json.data || [], columnNameMap);
  }

  const num = indices.to - indices.from + 1;
  const { db, table_schema, table_name } = ctx;

  const {
    filter = {}, exclude = {},
    gt = {}, gte = {}, lt = {}, lte = {}, like = {},
    filterGroups = {},
    groupBy = [], having = [], orderBy = {},
    normalFilter = [], join = {},
    // Comparison series (query fan-out): one UNION ALL arm per variant. CH inlines
    // filter values (no $N placeholders), so arms compose directly. Empty → single
    // arm, unchanged.
    seriesVariants = [], seriesKey = '__series'
  } = JSON.parse(options);

  const transformedAttributes = transformAttributesForClickHouse(attributes);

  const sanitizedAttrs = sanitizeName(transformedAttributes).filter((f) => f);

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
  // One UNION ALL arm per variant: shared SELECT/FROM/GROUP BY with each arm's own
  // (inlined) WHERE and a constant `'<label>' as <seriesKey>` discriminator. CH
  // preserves identifier case, so the alias stays bare (unlike the PG path's quoting).
  // The label literal is single-quote-escaped; the discriminator is dropped from the
  // base SELECT (the client requests it, but the literal is its sole source) and from
  // the arm GROUP BY (constant per arm). ORDER BY omitted across the union for v1.
  if (seriesVariants.length) {
    const armGroupByExprs = groupByExprs.filter((g) => g !== seriesKey);
    const baseArmAttrs = sanitizedAttrs.filter((c) => getResponseColumnName(c) !== seriesKey);
    // The arm SELECT must project every GROUP BY column even when the request's
    // attribute list omits it. The falcor client cache-dedupes attributes: a
    // section whose options string matches an earlier query's (two graphs over
    // the same routes differing only in their measure column) re-requests only
    // its own uncached measure — and the cross-union ORDER BY below references
    // response-column names, which must exist in the fanout's scope or CH
    // raises "Unknown expression identifier '<col>'".
    const projectedNames = new Set(
      baseArmAttrs.map((c) => getResponseColumnName(columnNameMap[c] || c)));
    const unprojectedGroupBys = armGroupByExprs.filter(
      (g) => !projectedNames.has(getResponseColumnName(g)));
    // __ANCHOR__(<expr>) support (see substituteAnchorMarkers) — a column can ask
    // for <expr> evaluated against the FIRST variant's own filter specifically,
    // e.g. a "% different from the anchor route" delta column. Built once (every
    // arm anchors to the same first variant) and only when actually referenced —
    // buildCombinedWhereCH runs once more per query, not once more per arm.
    const usesAnchor = baseArmAttrs.some((c) => c.includes('__ANCHOR__('));
    const anchorFromWhere = usesAnchor
      ? `${fromClause} ${buildCombinedWhereCH({
          filter, exclude, gt, gte, lt, lte, like,
          filterGroups: seriesVariants[0].filterGroups || {}, joinPresent,
        })}`
      : null;
    const armSqls = seriesVariants.map((variant) => {
      const armWhere = buildCombinedWhereCH({
        filter, exclude, gt, gte, lt, lte, like,
        filterGroups: variant.filterGroups || {}, joinPresent,
      });
      const safeLabel = `'${String(variant.label ?? '').replace(/'/g, "''")}'`;
      const armSelect = [
        ...baseArmAttrs.map((c) => withExplicitAlias(columnNameMap[c] || c)),
        ...unprojectedGroupBys,
        `${safeLabel} as ${seriesKey}`,
      ].join(', ');
      const armSql = `
        SELECT ${armSelect}
        FROM ${fromClause}
        ${armWhere}
        ${armGroupByExprs.length ? `GROUP BY ${armGroupByExprs.join(', ')}` : ''}
        ${handleHavingCH(having)}`;
      return usesAnchor ? substituteAnchorMarkers(armSql, anchorFromWhere) : armSql;
    });
    const fanoutSql = `
      SELECT * FROM (
        ${armSqls.join('\n        UNION ALL\n')}
      ) AS fanout
      ${handleOrderByCH(orderBy)}
      LIMIT ${+num}
      OFFSET ${indices.from}
    `;
    const fanoutResult = await db.query({ query: fanoutSql, format: 'JSON' });
    const fanoutJson = await fanoutResult.json();
    return restoreLongColumnNames(fanoutJson.data || [], columnNameMap);
  }

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
  withExplicitAlias,
  buildSimpleFilterSqlCH,
  chTypeToPg,
  chResultToRecordset,
};
