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

const { getEssentials, sanitizeName, buildCombinedWhere, getValuesExceptNulls, getValuesFromGroup } = require('./utils');
const { ckmeans } = require('./colorDomain/ckmeans');

const DEFAULTS = {
  ckmeansFullScanThreshold: 50_000,
  histogramBuckets: 1_000,
  ckmeansMaxRepresentatives: 10_000,
};

const round2 = (n) => Math.round(n * 100) / 100;

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
  const filterRelation = options.filterRelation || 'and';
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
    filter, exclude, gt, gte, lt, lte, like, filterRelation,
    filterGroups, isDms, app, type, oldValues, dbType,
  });

  return { whereClause, values };
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
  const { isDms, db, app, type, table_schema, table_name } = essentials;

  if (db.type !== 'postgres') {
    throw new Error('colorDomain: PostgreSQL only');
  }

  const { whereClause, values } = buildFilterContext({
    options, column: safeColumn, excludeNull, excludeZero, isDms, app, type, dbType: db.type,
  });

  const tableRef = `${table_schema}.${table_name}`;

  // Bounds + count in one query — needed by every method to decide branching
  // and to return `{min, max, count}` alongside the breaks.
  const statsSql = `
    SELECT
      min(${safeColumn}::double precision) AS min,
      max(${safeColumn}::double precision) AS max,
      count(${safeColumn}) AS cnt
    FROM ${tableRef}
    ${whereClause}
  `;
  const { rows: statsRows } = await db.query(statsSql, values);
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
      return await quantileBreaks({ db, tableRef, safeColumn, whereClause, values, numbins, min, max, count });
    case 'standardDeviation':
      return await stdDevBreaks({ db, tableRef, safeColumn, whereClause, values, numbins, min, max, count });
    case 'ckmeans':
      return await ckmeansBreaks({
        db, tableRef, safeColumn, whereClause, values, numbins, min, max, count,
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
