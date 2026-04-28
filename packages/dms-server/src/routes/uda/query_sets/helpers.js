/**
 * ClickHouse-specific filter and parameter builders for the UDA query set.
 *
 * The Postgres UDA path uses parameterized queries with $N placeholders and
 * the ANY() array operator. ClickHouse speaks a different dialect: named
 * parameters ({name:Type}) and IN (...) lists. These helpers produce that
 * second dialect, kept narrowly scoped to the CH query set.
 *
 * Adapted from references/avail-falcor/routes/uda_query_sets/helpers.js.
 */

const { sanitizeName } = require('../utils');

/**
 * Build a ClickHouse-safe WHERE clause from simple filter/exclude/gt/.../like
 * condition objects. Values are inlined into the SQL (escaped) rather than
 * parameterized — matches avail-falcor behavior. See handleFiltersCH upstream.
 */
function handleFiltersCH({
  filter = {},
  exclude = {},
  gt = {},
  gte = {},
  lt = {},
  lte = {},
  like = {},
}) {
  const escapeValue = (v) =>
    typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v;

  const isNullToken = (val) => ['null', 'not null'].includes(val);

  const splitValues = (arr) => {
    const nullValues = arr.filter(isNullToken);
    const realValues = arr.filter((v) => !isNullToken(v));
    return { nullValues, realValues };
  };

  const buildClause = (col, val, type) => {
    if (val === undefined) return '';

    const toCondition = (v) => {
      if (v === 'null') return `${col} IS NULL`;
      if (v === 'not null') return `${col} IS NOT NULL`;
      return `${col} = ${escapeValue(v)}`;
    };

    const toNotCondition = (v) => {
      if (v === 'null') return `${col} IS NOT NULL`;
      if (v === 'not null') return `${col} IS NULL`;
      return `${col} != ${escapeValue(v)}`;
    };

    if (type === 'filter') {
      if (Array.isArray(val)) {
        const { nullValues, realValues } = splitValues(val);
        const conditions = [];
        if (realValues.length === 1) {
          conditions.push(`${col} = ${escapeValue(realValues[0])}`);
        } else if (realValues.length > 1) {
          conditions.push(`${col} IN (${realValues.map(escapeValue).join(', ')})`);
        }
        if (nullValues.length) conditions.push(...nullValues.map(toCondition));
        return conditions.length > 1 ? `(${conditions.join(' OR ')})` : conditions[0];
      }
      return toCondition(val);
    }

    if (type === 'exclude') {
      if (Array.isArray(val)) {
        const { nullValues, realValues } = splitValues(val);
        const conditions = [];
        if (realValues.length === 1) {
          conditions.push(`${col} != ${escapeValue(realValues[0])}`);
        } else if (realValues.length > 1) {
          conditions.push(`${col} NOT IN (${realValues.map(escapeValue).join(', ')})`);
        }
        if (nullValues.length) conditions.push(...nullValues.map(toNotCondition));
        return conditions.length > 1 ? `(${conditions.join(' AND ')})` : conditions[0];
      }
      return toNotCondition(val);
    }

    if (type === 'gt') return `${col} > ${escapeValue(val)}`;
    if (type === 'gte') return `${col} >= ${escapeValue(val)}`;
    if (type === 'lt') return `${col} < ${escapeValue(val)}`;
    if (type === 'lte') return `${col} <= ${escapeValue(val)}`;
    if (type === 'like') {
      const likeStr = Array.isArray(val)
        ? val.map((v) => `${col} LIKE '%${v}%'`).join(' OR ')
        : `${col} LIKE '%${val}%'`;
      return `(${likeStr})`;
    }

    return '';
  };

  const mapConditions = (conditions, type) =>
    Object.keys(conditions)
      .map((col) => buildClause(col, conditions[col], type))
      .filter(Boolean);

  const clauses = [
    ...mapConditions(filter, 'filter'),
    ...mapConditions(exclude, 'exclude'),
    ...mapConditions(gt, 'gt'),
    ...mapConditions(gte, 'gte'),
    ...mapConditions(lt, 'lt'),
    ...mapConditions(lte, 'lte'),
    ...mapConditions(like, 'like'),
  ];

  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

/**
 * Extract non-null, non-sentinel values from condition objects for use as
 * ClickHouse named query parameters. Currently unused by handleFiltersCH
 * (which inlines values) but kept for forward compatibility with parameterized
 * CH queries (e.g., IN {ids:Array(UInt64)}).
 */
function getClickhouseQueryParams(conditions, prefix = '') {
  const params = {};
  Object.entries(conditions).forEach(([column, value]) => {
    const paramName = prefix ? `${prefix}_${column}` : column;
    if (Array.isArray(value)) {
      const filtered = value.filter(
        (v) => v !== null && v !== undefined && !['null', 'not null'].includes(v)
      );
      if (filtered.length > 0) params[paramName] = filtered;
    } else if (
      value !== null &&
      value !== undefined &&
      !['null', 'not null'].includes(value)
    ) {
      params[paramName] = [value];
    }
  });
  return params;
}

/**
 * GROUP BY / HAVING / ORDER BY builders for ClickHouse. Same shape as the
 * Postgres helpers but without type-cast handling (CH infers numeric types
 * natively on native columns).
 */
function handleGroupByCH(groups) {
  const sanitized = sanitizeName(groups).filter((f) => f);
  return sanitized.length ? `GROUP BY ${sanitized.join(', ')}` : '';
}

function handleHavingCH(clauses) {
  const sanitized = sanitizeName(clauses).filter((f) => f);
  return sanitized.length
    ? `HAVING ${sanitized.map((c) => `(${c})`).join(' and ')}`
    : '';
}

function handleOrderByCH(orders) {
  const sanitized = Object.keys(orders).filter(
    (col) => sanitizeName(col) && sanitizeName(orders[col])
  );
  return sanitized.length
    ? `ORDER BY ${sanitized.map((col) => `${col} ${orders[col]}`).join(', ')}`
    : '';
}

module.exports = {
  handleFiltersCH,
  getClickhouseQueryParams,
  handleGroupByCH,
  handleHavingCH,
  handleOrderByCH,
};
