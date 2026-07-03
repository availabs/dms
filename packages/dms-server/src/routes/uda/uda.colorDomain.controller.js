/**
 * Color-domain computation for choropleth/circle map layers.
 *
 * Given a view, a numeric column, a bin count, and a binning method, returns
 * the break values needed to render a color scale. PostgreSQL only — spatial
 * datasets aren't on SQLite, and each method leans on PG-specific aggregates
 * (`percentile_cont`, `stddev_samp`, `width_bucket`).
 *
 * Methods:
 *   - equalInterval      — single min/max scan; breaks at (max-min)/k
 *   - quantile           — single `percentile_cont` call; breaks are percentile cuts
 *   - standardDeviation  — single avg/stddev scan; breaks at mean + i·σ
 *   - ckmeans            — exact scan for ≤ ckmeansFullScanThreshold rows;
 *                          otherwise a width_bucket histogram expanded into
 *                          ~10K weighted representatives fed to the JS ckmeans
 *                          algorithm. Optimizes within-cluster variance.
 *
 * Returns `{ breaks, min, max, count, source, truncated }`:
 *   - breaks: number[] — sorted ascending, length ≤ numbins-1 (internal cuts,
 *                         excluding min and max endpoints)
 *   - min, max: number — domain bounds after filters applied
 *   - count: number — rows considered
 *   - source: "full" | "histogram" | "aggregate" — how breaks were derived
 *   - truncated: boolean (optional) — set when numbins had to shrink to
 *                                     match the distinct-value count
 */

const { getEssentials, sanitizeName, buildCombinedWhere, getValuesExceptNulls, getValuesFromGroup, getColumnsFromGroup } = require('./utils');
const { buildSimpleFilterSql } = require('./query_sets/postgres');
const { ckmeans } = require('./colorDomain/ckmeans');

const DEFAULTS = {
  ckmeansFullScanThreshold: 50_000,
  histogramBuckets: 1_000,
  ckmeansMaxRepresentatives: 10_000,
};

const round2 = (n) => Math.round(n * 100) / 100;
const quoteIdentifier = (name) => `"${String(name).replace(/"/g, '')}"`;
const shiftParams = (sql, offset) => sql.replace(/\$(\d+)/g, (_, n) => `$${+n + offset}`);
const getOutputName = (expr) => {
  const aliasMatch = String(expr).match(/\s+as\s+("?)([^"]+)\1\s*$/i);
  if (aliasMatch?.[2]) return aliasMatch[2];
  return String(expr).trim();
};

/**
 * Walks a filterGroups tree and returns the leaf nodes ({op, col, value}) whose
 * column belongs to the joined source, so they can be pushed into the join's own
 * subquery. The aggregated output column is skipped — it only exists after the
 * join's GROUP BY, never inside it.
 */
const collectJoinFilterLeaves = (node, isJoinColumn, safeColumn) => {
  if (!node) return [];
  if (Array.isArray(node.groups)) {
    return node.groups.flatMap((child) => collectJoinFilterLeaves(child, isJoinColumn, safeColumn));
  }
  if (node.col && node.col !== safeColumn && isJoinColumn(node.col)) {
    return [node];
  }
  return [];
};

/**
 * Parse incoming options and merge null/zero exclusion into the filter shape.
 * Returns the filter options ready for buildCombinedWhere + the binding values.
 */
function buildFilterContext({ options, column, excludeNull, excludeZero, isDms, app, type, dbType }) {
  const filter = { ...(options.filter || {}) };
  const exclude = { ...(options.exclude || {}) };
  const gt = { ...(options.gt || {}) };
  const gte = { ...(options.gte || {}) };
  const lt = { ...(options.lt || {}) };
  const lte = { ...(options.lte || {}) };
  const like = { ...(options.like || {}) };
  const filterGroups = options.filterGroups || {};

  // Default-exclude nulls on the target column (can be disabled by caller).
  if (excludeNull !== false) {
    (exclude[column] ??= []).push('null');
  }
  // Opt-in: exclude zero/'0' on the target column. Some UIs want this, some don't.
  if (excludeZero === true) {
    (exclude[column] ??= []).push(0, '0');
  }

  const oldValues = [
    ...(isDms ? [[app], [type]] : []),
    ...getValuesExceptNulls(filter),
    ...getValuesExceptNulls(exclude),
    ...getValuesExceptNulls(gt),
    ...getValuesExceptNulls(gte),
    ...getValuesExceptNulls(lt),
    ...getValuesExceptNulls(lte),
    ...getValuesExceptNulls(like),
  ];
  const newValues = getValuesFromGroup(filterGroups);
  const values = [...oldValues, ...newValues];

  const whereClause = buildCombinedWhere({
    filter, exclude, gt, gte, lt, lte, like,
    filterGroups, isDms, app, type, oldValues, dbType,
  });

  return { whereClause, values };
}

async function buildColorDomainTarget({ env, view_id, options, safeColumn, whereClause, values }) {
  const essentials = await getEssentials({ env, view_id, options });
  const { db, table_schema, table_name } = essentials;

  if (db.type !== 'postgres') {
    throw new Error('colorDomain: PostgreSQL only');
  }

  const tableRef = `${table_schema}.${table_name}`;
  const join = options?.join;
  const joinedColumns = Array.isArray(join?.tileCols) ? join.tileCols.filter(Boolean) : [];
  const joinAttributeColumns = Array.isArray(join?.attributes)
    ? join.attributes.map(getOutputName).filter(Boolean)
    : [];
  const joinKey = join?.joinKey || join?.linkedKey;
  const isJoinColumn = (col) => joinedColumns.includes(col) || joinAttributeColumns.includes(col);

  // The join must be attached whenever the query references a joined column —
  // not only when the *colored* column is joined, but also when a filter
  // targets a joined-only column (e.g. coloring by a base-table count while
  // filtering on a joined "column"). Otherwise the WHERE clause
  // below references a column that doesn't exist on the bare base table and
  // the query errors out ("column ... does not exist").
  const referencedColumns = [
    safeColumn,
    ...Object.keys(options.filter || {}),
    ...Object.keys(options.exclude || {}),
    ...Object.keys(options.gt || {}),
    ...Object.keys(options.gte || {}),
    ...Object.keys(options.lt || {}),
    ...Object.keys(options.lte || {}),
    ...Object.keys(options.like || {}),
    ...getColumnsFromGroup(options.filterGroups),
  ];

  if (!join || !referencedColumns.some(isJoinColumn)) {
    return { db, tableRef, whereClause, values };
  }

  // 5a — Push any filter on a raw joined-source column into the join's OWN
  // subquery, so it filters BEFORE the aggregation rather than only in the
  // outer query afterward. Without this the CTE aggregates the entire source
  // (every joined key → millions of grouped rows, disk-spilling). The
  // aggregated output column (safeColumn) is skipped — it only exists after the
  // join's GROUP BY, never inside it.
  const JOIN_FILTER_KEYS = ['filter', 'exclude', 'gt', 'gte', 'lt', 'lte', 'like'];
  const joinRuntimeOptions = { ...(join.options || {}) };
  for (const key of JOIN_FILTER_KEYS) {
    const runtimeCols = Object.fromEntries(
      Object.entries(options[key] || {}).filter(([col]) => isJoinColumn(col) && col !== safeColumn)
    );
    if (Object.keys(runtimeCols).length) {
      joinRuntimeOptions[key] = { ...(joinRuntimeOptions[key] || {}), ...runtimeCols };
    }
  }
  // The runtime map sends its combined static + dynamic filters as a
  // `filterGroups` tree, not the flat keys above — pull the joined-column
  // leaves out of that tree and push them in too.
  const joinFilterLeaves = collectJoinFilterLeaves(options.filterGroups, isJoinColumn, safeColumn);
  if (joinFilterLeaves.length) {
    const existingGroups = joinRuntimeOptions.filterGroups?.groups
      || (joinRuntimeOptions.filterGroups ? [joinRuntimeOptions.filterGroups] : []);
    joinRuntimeOptions.filterGroups = {
      op: 'and',
      groups: [...existingGroups, ...joinFilterLeaves],
    };
  }

  const joinCtx = await getEssentials({ env, view_id: join.viewId, options: joinRuntimeOptions });
  if (joinCtx.dbType !== 'pg') {
    throw new Error('colorDomain: join view must be PostgreSQL');
  }

  // 5c — No row cap: the pushed-down filter (5a) already bounds the join result,
  // and the CTE is reduced to aggregates (breaks/min/max/count), never returned
  // as raw rows — so there's no unbounded-response risk to guard against here.
  const { sql: joinSql, values: joinValues } = await buildSimpleFilterSql(
    joinCtx,
    JSON.stringify(joinRuntimeOptions),
    join.attributes || []
  );

  if (!joinSql) {
    return { db, tableRef, whereClause, values };
  }

  // Select the tile-authored columns plus any joined attribute referenced by a
  // filter — a filter column doesn't have to be a tile column, but it still
  // must be projected out of the join so the outer WHERE clause can resolve it.
  const joinedSelectColumns = Array.from(new Set([
    ...joinedColumns,
    ...referencedColumns.filter((col) => joinAttributeColumns.includes(col)),
  ]));
  const joinedSelect = joinedSelectColumns
    .map((column) => `joined_cte.${quoteIdentifier(column)} AS ${quoteIdentifier(column)}`)
    .join(', ');

  // 5b — Never `SELECT geo.*` — that drags the base table's geometry blob
  // (wkb_geometry) through the join for a min/max/count/breaks computation that
  // only touches the numeric data column. Select just the join key plus any
  // base-table column the aggregate or WHERE clause actually references.
  const geoSelectColumns = Array.from(new Set([
    join.localKey,
    ...referencedColumns.filter((col) => col && !isJoinColumn(col)),
  ].filter(Boolean)));
  const geoSelect = geoSelectColumns
    .map((column) => `geo.${quoteIdentifier(column)} AS ${quoteIdentifier(column)}`)
    .join(', ');

  const joinedTableRef = `(
    WITH joined_cte AS (${shiftParams(joinSql, values.length)})
    SELECT
      ${geoSelect}
      ${joinedSelect ? `, ${joinedSelect}` : ''}
    FROM ${tableRef} geo
    LEFT JOIN joined_cte
      ON geo.${quoteIdentifier(join.localKey)} = joined_cte.${quoteIdentifier(joinKey)}
  ) joined_data`;

  return {
    db,
    tableRef: joinedTableRef,
    whereClause,
    values: [...values, ...joinValues],
  };
}

/**
 * Top-level entry point. Dispatches on method, returns the break config.
 *
 * @param {string} env — pgEnv (DAMA) or app+type (DMS)
 * @param {string|number} view_id — view identifier
 * @param {object|string} rawOptions — JSON or object with binning config
 */
async function colorDomain(env, view_id, rawOptions) {
  const options = typeof rawOptions === 'string' ? JSON.parse(rawOptions) : rawOptions;
  const {
    column,
    numbins: rawNumbins,
    method = 'ckmeans',
    excludeNull,
    excludeZero,
    ckmeansFullScanThreshold = DEFAULTS.ckmeansFullScanThreshold,
    histogramBuckets = DEFAULTS.histogramBuckets,
    ckmeansMaxRepresentatives = DEFAULTS.ckmeansMaxRepresentatives,
  } = options;

  if (!column || typeof column !== 'string') {
    throw new Error('colorDomain: `column` is required');
  }
  const safeColumn = sanitizeName(column);
  if (!safeColumn) throw new Error(`colorDomain: invalid column "${column}"`);

  const numbins = Math.max(2, Math.min(12, Number(rawNumbins) || 2));

  const essentials = await getEssentials({ env, view_id, options });
  const { isDms, app, type, db } = essentials;

  if (db.type !== 'postgres') {
    throw new Error('colorDomain: PostgreSQL only');
  }

  const { whereClause, values } = buildFilterContext({
    options, column: safeColumn, excludeNull, excludeZero, isDms, app, type, dbType: db.type,
  });

  const {
    db: domainDb,
    tableRef: domainTableRef,
    whereClause: domainWhereClause,
    values: domainValues,
  } = await buildColorDomainTarget({ env, view_id, options, safeColumn, whereClause, values });

  // Bounds + count in one query — needed by every method to decide branching
  // and to return `{min, max, count}` alongside the breaks.
  const statsSql = `
    SELECT
      min(${safeColumn}::double precision) AS min,
      max(${safeColumn}::double precision) AS max,
      count(${safeColumn}) AS cnt
    FROM ${domainTableRef}
    ${domainWhereClause}
  `;
  const { rows: statsRows } = await domainDb.query(statsSql, domainValues);
  const stats = statsRows?.[0] || {};
  const min = stats.min === null || stats.min === undefined ? null : Number(stats.min);
  const max = stats.max === null || stats.max === undefined ? null : Number(stats.max);
  const count = Number(stats.cnt) || 0;

  if (count === 0 || min === null || max === null) {
    return { breaks: [], min: 0, max: 0, count: 0, source: 'aggregate', truncated: true };
  }

  // Uniform-value short-circuit: every method collapses to a single break.
  if (min === max) {
    return {
      breaks: [round2(min)],
      min: round2(min),
      max: round2(max),
      count,
      source: 'aggregate',
      truncated: true,
    };
  }

  switch (method) {
    case 'equalInterval':
      return equalIntervalFromStats({ min, max, numbins, count });
    case 'quantile':
      return await quantileBreaks({ db: domainDb, tableRef: domainTableRef, safeColumn, whereClause: domainWhereClause, values: domainValues, numbins, min, max, count });
    case 'standardDeviation':
      return await stdDevBreaks({ db: domainDb, tableRef: domainTableRef, safeColumn, whereClause: domainWhereClause, values: domainValues, numbins, min, max, count });
    case 'ckmeans':
      return await ckmeansBreaks({
        db: domainDb, tableRef: domainTableRef, safeColumn, whereClause: domainWhereClause, values: domainValues, numbins, min, max, count,
        ckmeansFullScanThreshold, histogramBuckets, ckmeansMaxRepresentatives,
      });
    default:
      throw new Error(`colorDomain: unknown method "${method}"`);
  }
}

// Break-array convention: follows the Mapbox `step` expression layout that
// the client's `choroplethPaint()` consumes. The first break is the minimum
// (lower bound of bin 0); subsequent breaks are bin boundaries. Length is
// `numbins` — one lower-bound per bin. The maximum is returned separately
// as `max` for legend rendering of the top bin's upper bound.
//
// Example: numbins=3, min=10, max=30, equalInterval → [10, 16.67, 23.33].

function equalIntervalFromStats({ min, max, numbins, count }) {
  const step = (max - min) / numbins;
  const breaks = [];
  for (let i = 0; i < numbins; i++) {
    breaks.push(round2(min + step * i));
  }
  return {
    breaks: uniqueAscending(breaks),
    min: round2(min),
    max: round2(max),
    count,
    source: 'aggregate',
  };
}

async function quantileBreaks({ db, tableRef, safeColumn, whereClause, values, numbins, min, max, count }) {
  // Fractions 1/k, 2/k, ..., (k-1)/k give (k-1) internal percentile cuts.
  // We prepend `min` to reach the numbins-length break array convention.
  const fractions = [];
  for (let i = 1; i < numbins; i++) fractions.push(i / numbins);

  const sql = `
    SELECT percentile_cont($${values.length + 1}::float8[]) WITHIN GROUP (ORDER BY ${safeColumn}::double precision) AS breaks
    FROM ${tableRef}
    ${whereClause}
  `;
  const { rows } = await db.query(sql, [...values, fractions]);
  const raw = rows?.[0]?.breaks || [];
  const breaks = [min, ...raw.map(Number)].map(round2);
  return {
    breaks: uniqueAscending(breaks),
    min: round2(min),
    max: round2(max),
    count,
    source: 'aggregate',
  };
}

async function stdDevBreaks({ db, tableRef, safeColumn, whereClause, values, numbins, min, max, count }) {
  const sql = `
    SELECT
      avg(${safeColumn}::double precision) AS mean,
      stddev_samp(${safeColumn}::double precision) AS sigma
    FROM ${tableRef}
    ${whereClause}
  `;
  const { rows } = await db.query(sql, values);
  const mean = Number(rows?.[0]?.mean);
  const sigma = Number(rows?.[0]?.sigma);

  if (!Number.isFinite(sigma) || sigma === 0) {
    // Degenerate: fall back to equal interval on the observed min/max so we
    // still return a usable set of breaks.
    return equalIntervalFromStats({ min, max, numbins, count });
  }

  // Breaks at mean + (i - k/2)·σ for i = 0..k-1, so the set is symmetric
  // around the mean. First break is always `min` (bin 0's lower bound).
  const breaks = [min];
  for (let i = 1; i < numbins; i++) {
    const offset = i - numbins / 2;
    const b = mean + offset * sigma;
    breaks.push(Math.max(min, Math.min(max, b)));
  }
  return {
    breaks: uniqueAscending(breaks.map(round2)),
    min: round2(min),
    max: round2(max),
    count,
    source: 'aggregate',
  };
}

async function ckmeansBreaks({
  db, tableRef, safeColumn, whereClause, values,
  numbins, min, max, count,
  ckmeansFullScanThreshold, histogramBuckets, ckmeansMaxRepresentatives,
}) {
  // Exact path — pull every row, run ckmeans directly.
  if (count <= ckmeansFullScanThreshold) {
    const sql = `
      SELECT ${safeColumn}::double precision AS v
      FROM ${tableRef}
      ${whereClause}
      ORDER BY 1
    `;
    const { rows } = await db.query(sql, values);
    const data = rows.map((r) => Number(r.v)).filter(Number.isFinite);
    const clusters = ckmeans(data, numbins);
    // ckmeans returns cluster lower bounds — first element is the data min,
    // matching our breaks-array convention.
    return {
      breaks: uniqueAscending(clusters.map(round2)),
      min: round2(min),
      max: round2(max),
      count,
      source: 'full',
      truncated: clusters.length < numbins,
    };
  }

  // Histogram path — bucketize in PG, expand into weighted representatives.
  const histogramSql = `
    SELECT
      width_bucket(${safeColumn}::double precision, $${values.length + 1}::double precision, $${values.length + 2}::double precision, $${values.length + 3}::int) AS bucket,
      count(*) AS weight,
      avg(${safeColumn}::double precision) AS centroid
    FROM ${tableRef}
    ${whereClause}
    GROUP BY bucket
    ORDER BY bucket
  `;
  const { rows: hist } = await db.query(
    histogramSql,
    [...values, min, max, histogramBuckets],
  );

  // Expand centroids proportional to weight, capped at ckmeansMaxRepresentatives.
  const totalWeight = hist.reduce((s, r) => s + Number(r.weight), 0);
  const scale = Math.min(1, ckmeansMaxRepresentatives / totalWeight);
  const samples = [];
  for (const r of hist) {
    const centroid = Number(r.centroid);
    if (!Number.isFinite(centroid)) continue;
    // Always at least 1 representative per non-empty bucket so tails survive.
    const reps = Math.max(1, Math.round(Number(r.weight) * scale));
    for (let i = 0; i < reps; i++) samples.push(centroid);
  }

  const clusters = ckmeans(samples, numbins);
  return {
    breaks: uniqueAscending(clusters.map(round2)),
    min: round2(min),
    max: round2(max),
    count,
    source: 'histogram',
    truncated: clusters.length < numbins,
  };
}

/** Dedupe + sort ascending. */
function uniqueAscending(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a - b);
}

module.exports = { colorDomain };
