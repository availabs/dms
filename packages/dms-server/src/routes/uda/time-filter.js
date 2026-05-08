/**
 * Time filter — server-side support for the `op: 'time'` filter leaf.
 *
 * The leaf shape (set client-side after column resolution):
 *   {
 *     col: "data->>'event_at'" | "event_at",   // SQL accessor (DMS or raw)
 *     op: 'time',
 *     value: {
 *       ranges?: Array<RangeEntry>,            // OR'd together
 *       dow?: number[],                        // 0..6 (Sun=0); ANDed
 *       timeOfDay?: { start: 'HH:MM', end: 'HH:MM' },  // ANDed
 *       tz?: 'America/New_York',               // IANA; defaults to 'UTC'
 *       compareEnd?: 'col-name',               // for `instant` point-in-range
 *     }
 *   }
 *
 * RangeEntry kinds:
 *   { kind: 'relative', unit, count, direction: 'past'|'future' }
 *   { kind: 'current_period', period }
 *   { kind: 'named', name: 'today'|'yesterday'|'tomorrow' }
 *   { kind: 'absolute', from?, to? }
 *   { kind: 'instant', at: 'now' }
 *
 * Phase 1 supports PostgreSQL only — SQLite/ClickHouse paths throw. Multi-axis
 * compositions: `ranges` OR together; DOW + time-of-day AND with the range
 * group. The shape stipulates the column is a `date`/`timestamp`/`timestamptz`;
 * for DMS columns, `data->>'…'` is cast to `::timestamptz` (text-extracted).
 *
 * Allow-listed enums are inlined into the SQL string after validation; only
 * literal values (counts, dates, dow indices, time strings, tz) are bound as
 * positional parameters. No raw SQL passes through the structured value.
 */

const VALID_UNITS = new Set(['minute', 'hour', 'day', 'week', 'month', 'year']);
const VALID_PERIODS = new Set(['hour', 'day', 'week', 'month', 'quarter', 'year']);
const VALID_NAMED = new Set(['today', 'yesterday', 'tomorrow']);
const VALID_DIRECTIONS = new Set(['past', 'future']);
const VALID_RANGE_KINDS = new Set(['relative', 'current_period', 'named', 'absolute', 'instant']);

const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
// Permissive ISO date / timestamp shape — Postgres parses these natively.
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
// IANA tz — letters, digits, `+`, `-`, `_`, single segment or slash-separated.
// Accepts 'UTC', 'America/New_York', 'Etc/GMT+5', 'America/Argentina/Buenos_Aires'.
const TZ_REGEX = /^[A-Za-z][A-Za-z0-9+_-]*(\/[A-Za-z][A-Za-z0-9+_-]*)*$/;
// Column name (used for compareEnd interpolation).
const COL_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

function validateRange(r) {
    if (!r || typeof r !== 'object') return 'range entry must be an object';
    if (!VALID_RANGE_KINDS.has(r.kind)) return `invalid range kind: ${r.kind}`;
    switch (r.kind) {
        case 'relative':
            if (!VALID_UNITS.has(r.unit)) return `invalid relative unit: ${r.unit}`;
            if (!Number.isInteger(r.count) || r.count < 0) return `invalid relative count: ${r.count}`;
            if (!VALID_DIRECTIONS.has(r.direction)) return `invalid direction: ${r.direction}`;
            return null;
        case 'current_period':
            if (!VALID_PERIODS.has(r.period)) return `invalid period: ${r.period}`;
            return null;
        case 'named':
            if (!VALID_NAMED.has(r.name)) return `invalid named: ${r.name}`;
            return null;
        case 'absolute':
            if (r.from == null && r.to == null) return 'absolute range needs at least from or to';
            if (r.from != null && !ISO_DATE_REGEX.test(r.from)) return `invalid absolute.from: ${r.from}`;
            if (r.to != null && !ISO_DATE_REGEX.test(r.to)) return `invalid absolute.to: ${r.to}`;
            return null;
        case 'instant':
            if (r.at !== 'now') return `invalid instant.at: ${r.at}`;
            return null;
        default:
            return `unknown range kind: ${r.kind}`;
    }
}

/**
 * Validate a `time`-op value. Returns { ok: true } on success, { error: string } on
 * failure. Callers should treat any `error` as a 400-style client error.
 */
function validateTimeFilter(value) {
    if (!value || typeof value !== 'object') return { error: 'time filter value must be an object' };
    if (value.tz != null && (typeof value.tz !== 'string' || !TZ_REGEX.test(value.tz))) {
        return { error: `invalid tz: ${value.tz}` };
    }
    if (value.compareEnd != null && (typeof value.compareEnd !== 'string' || !COL_NAME_REGEX.test(value.compareEnd))) {
        return { error: `invalid compareEnd: ${value.compareEnd}` };
    }
    if (value.ranges != null) {
        if (!Array.isArray(value.ranges)) return { error: 'ranges must be an array' };
        for (const r of value.ranges) {
            const err = validateRange(r);
            if (err) return { error: err };
        }
    }
    if (value.dow != null) {
        if (!Array.isArray(value.dow)) return { error: 'dow must be an array' };
        for (const d of value.dow) {
            if (!Number.isInteger(d) || d < 0 || d > 6) return { error: `invalid dow index: ${d}` };
        }
    }
    if (value.timeOfDay != null) {
        const t = value.timeOfDay;
        if (!t || typeof t !== 'object') return { error: 'timeOfDay must be an object' };
        if (typeof t.start !== 'string' || !HHMM_REGEX.test(t.start)) return { error: `invalid timeOfDay.start: ${t.start}` };
        if (typeof t.end !== 'string' || !HHMM_REGEX.test(t.end)) return { error: `invalid timeOfDay.end: ${t.end}` };
        // v1 forbids midnight-wrap windows; the UI splits these into two leaves
        // if needed.
        if (t.start >= t.end) {
            return { error: `timeOfDay.start (${t.start}) must be < end (${t.end}); midnight wrap is forbidden in v1` };
        }
    }
    return { ok: true };
}

/**
 * True when any axis in the value depends on a calendar boundary and therefore
 * needs `AT TIME ZONE $tz`. `relative`, `absolute`, and `instant` ranges all
 * evaluate as exact UTC instants/durations; `current_period` and `named` are
 * local-calendar-anchored, and DOW + time-of-day always project the value into
 * local-tz space. Used to skip the tz bind slot entirely when no axis needs
 * it — keeps placeholder/value parity tight.
 */
function needsTz(value) {
    if (value.dow && value.dow.length) return true;
    if (value.timeOfDay) return true;
    if (value.ranges) {
        for (const r of value.ranges) {
            if (r.kind === 'current_period' || r.kind === 'named') return true;
        }
    }
    return false;
}

/**
 * Walk a validated `time`-op value in canonical order, returning the array of
 * scalar/array values to bind as positional parameters. Order MUST match the
 * order in which buildTimeFilterSQL mints `$N` placeholders.
 *
 * Order: [tz?, ...range_values, dow_array?, timeOfDay.start?, timeOfDay.end?]
 *   - tz is emitted only when an axis depends on a calendar boundary (see needsTz).
 *   - relative ranges emit their `count`.
 *   - absolute ranges emit `from` then `to` (each conditional on presence).
 *   - current_period / named / instant emit nothing (kind/name are inlined).
 *   - dow is emitted as a single array (consumed by `= ANY($N)`).
 *   - timeOfDay emits start then end.
 */
function extractTimeFilterValues(value) {
    if (validateTimeFilter(value).error) return [];
    const out = [];

    if (needsTz(value)) out.push(value.tz || 'UTC');

    for (const r of (value.ranges || [])) {
        if (r.kind === 'relative') {
            out.push(r.count);
        } else if (r.kind === 'absolute') {
            if (r.from != null) out.push(r.from);
            if (r.to != null) out.push(r.to);
        }
        // current_period / named / instant: no bound values
    }

    if (value.dow && value.dow.length) out.push(value.dow);

    if (value.timeOfDay) {
        out.push(value.timeOfDay.start);
        out.push(value.timeOfDay.end);
    }

    return out;
}

/**
 * Generate the compound WHERE-clause fragment for a `time`-op leaf. Increments
 * `ctx.index` once per emitted placeholder, matching extractTimeFilterValues
 * walk order. Returns '' when the value contributes no constraints.
 *
 * Dispatches by dbType:
 *   - 'postgres' (or undefined): emits parameterized SQL with $N placeholders;
 *     values are bound via extractTimeFilterValues.
 *   - 'clickhouse': emits CH-flavored SQL with values inlined (allow-listed by
 *     validateTimeFilter, then escaped). ClickHouse refuses isDms columns
 *     (DMS content never lives on CH per CLAUDE.md). Note: today the CH
 *     dispatch path (`simpleFilter*` in query_sets/clickhouse.js) still uses
 *     legacy `handleFiltersCH` and does not flow through buildLeafSQL — the
 *     CH branch here is positioning code for the eventual migration of the
 *     CH path to tree-based filters. When that migration happens, the value-
 *     binding asymmetry (PG pushes via extractTimeFilterValues; CH pushes
 *     nothing because values are inlined) will need a dispatch on dbType in
 *     the value-extraction path too.
 *   - 'sqlite': throws — out of scope.
 *
 * Throws on validation failure (server-side guard) and on unsupported dbType.
 */
function buildTimeFilterSQL(value, col, ctx, isDms, dbType) {
    const validation = validateTimeFilter(value);
    if (validation.error) throw new Error(`time filter: ${validation.error}`);
    if (dbType === 'sqlite') {
        throw new Error(`time filter: sqlite is not supported`);
    }
    if (dbType === 'clickhouse') {
        return buildTimeFilterCH(value, col, isDms);
    }

    // For DMS, col arrives as `data->>'event_at'` which yields text — cast to
    // timestamptz so date functions work. For non-DMS, col is already typed.
    const colCast = isDms ? `(${col})::timestamptz` : col;

    // tz placeholder is minted only when an axis actually references it; keeps
    // bound values 1:1 with referenced placeholders. The order of subsequent
    // ++ctx.index calls follows the same canonical walk as
    // extractTimeFilterValues so positional binding stays consistent.
    let tzIdx = null;
    let colInTz = null;
    if (needsTz(value)) {
        tzIdx = `$${++ctx.index}`;
        colInTz = `(${colCast} AT TIME ZONE ${tzIdx})`;
    }

    const predicates = [];

    // Range axis (entries OR'd together, then ANDed with DOW + timeOfDay).
    if (value.ranges && value.ranges.length) {
        const rangeClauses = value.ranges.map(r => buildRangeClause(r, colCast, tzIdx, value, ctx, isDms)).filter(Boolean);
        if (rangeClauses.length === 1) predicates.push(rangeClauses[0]);
        else if (rangeClauses.length > 1) predicates.push(`(${rangeClauses.join(' OR ')})`);
    }

    // DOW axis.
    if (value.dow && value.dow.length) {
        const idx = `$${++ctx.index}`;
        predicates.push(`(EXTRACT(DOW FROM ${colInTz})::int = ANY(${idx}))`);
    }

    // Time-of-day axis.
    if (value.timeOfDay) {
        const startIdx = `$${++ctx.index}`;
        const endIdx = `$${++ctx.index}`;
        predicates.push(`((${colInTz})::time >= ${startIdx}::time AND (${colInTz})::time < ${endIdx}::time)`);
    }

    if (!predicates.length) return '';
    if (predicates.length === 1) return predicates[0];
    return `(${predicates.join(' AND ')})`;
}

function buildRangeClause(r, colCast, tzIdx, value, ctx, isDms) {
    switch (r.kind) {
        case 'relative': {
            const idx = `$${++ctx.index}`;
            // unit is allow-listed; safe to inline.
            if (r.direction === 'past') {
                return `(${colCast} >= now() - ${idx} * interval '1 ${r.unit}' AND ${colCast} <= now())`;
            }
            return `(${colCast} <= now() + ${idx} * interval '1 ${r.unit}' AND ${colCast} >= now())`;
        }
        case 'current_period': {
            // 'quarter' lacks a single-step interval literal; '3 months' is the
            // documented Postgres equivalent.
            const stepInterval = r.period === 'quarter' ? `interval '3 months'` : `interval '1 ${r.period}'`;
            const trunc = `date_trunc('${r.period}', now() AT TIME ZONE ${tzIdx})`;
            return `(${colCast} >= ${trunc} AND ${colCast} < ${trunc} + ${stepInterval})`;
        }
        case 'named': {
            // Always anchor on today's local midnight, then offset.
            const base = `date_trunc('day', now() AT TIME ZONE ${tzIdx})`;
            let lo, hi;
            if (r.name === 'today') {
                lo = base;
                hi = `${base} + interval '1 day'`;
            } else if (r.name === 'yesterday') {
                lo = `${base} - interval '1 day'`;
                hi = base;
            } else { // tomorrow
                lo = `${base} + interval '1 day'`;
                hi = `${base} + interval '2 days'`;
            }
            return `(${colCast} >= ${lo} AND ${colCast} < ${hi})`;
        }
        case 'absolute': {
            const parts = [];
            if (r.from != null) {
                const idx = `$${++ctx.index}`;
                parts.push(`${colCast} >= ${idx}::timestamptz`);
            }
            if (r.to != null) {
                const idx = `$${++ctx.index}`;
                parts.push(`${colCast} <= ${idx}::timestamptz`);
            }
            return parts.length === 1 ? parts[0] : `(${parts.join(' AND ')})`;
        }
        case 'instant': {
            // Point-in-range: row's start <= now AND row's end > now. Without
            // compareEnd, fall back to "row started by now" so the leaf is
            // still well-defined; the schedule case sets compareEnd.
            if (!value.compareEnd) {
                return `(${colCast} <= now())`;
            }
            const compareEndAccessor = isDms
                ? `(data->>'${value.compareEnd}')::timestamptz`
                : value.compareEnd;
            return `(${colCast} <= now() AND ${compareEndAccessor} > now())`;
        }
        default:
            return '';
    }
}

// ────────────────────────────────────────────────────────────────────────────
// ClickHouse path (Phase 6) — values inlined after allow-list validation.
// ────────────────────────────────────────────────────────────────────────────

function escapeCH(v) {
    if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
    return v;
}

function buildTimeFilterCH(value, col, isDms) {
    if (isDms) {
        throw new Error('time filter: ClickHouse path does not support DMS columns; DMS content never lives on ClickHouse');
    }
    // CH columns are typed natively — no cast needed.
    const tz = value.tz || 'UTC';
    const colInTz = needsTz(value) ? `toTimezone(${col}, ${escapeCH(tz)})` : null;

    const predicates = [];

    if (value.ranges && value.ranges.length) {
        const rangeClauses = value.ranges
            .map(r => buildRangeClauseCH(r, col, value, tz))
            .filter(Boolean);
        if (rangeClauses.length === 1) predicates.push(rangeClauses[0]);
        else if (rangeClauses.length > 1) predicates.push(`(${rangeClauses.join(' OR ')})`);
    }

    if (value.dow && value.dow.length) {
        // toDayOfWeek default returns 1=Mon..7=Sun. `% 7` re-maps to PG's
        // 0=Sun..6=Sat so the on-wire `dow` indices match between dialects.
        const dowList = value.dow.join(', ');
        predicates.push(`(toDayOfWeek(${colInTz}) % 7 IN (${dowList}))`);
    }

    if (value.timeOfDay) {
        // CH has no separate `time` type; format to zero-padded 'HH:MM' and
        // string-compare. Both inputs are validated `HH:MM` so lexical and
        // chronological order match.
        const start = escapeCH(value.timeOfDay.start);
        const end = escapeCH(value.timeOfDay.end);
        const fmt = `formatDateTime(${colInTz}, '%H:%M')`;
        predicates.push(`(${fmt} >= ${start} AND ${fmt} < ${end})`);
    }

    if (!predicates.length) return '';
    if (predicates.length === 1) return predicates[0];
    return `(${predicates.join(' AND ')})`;
}

function buildRangeClauseCH(r, col, value, tz) {
    switch (r.kind) {
        case 'relative': {
            // unit allow-listed; safe to inline. CH `INTERVAL N unit` (no quotes).
            const unitUpper = r.unit.toUpperCase();
            if (r.direction === 'past') {
                return `(${col} >= now() - INTERVAL ${r.count} ${unitUpper} AND ${col} <= now())`;
            }
            return `(${col} <= now() + INTERVAL ${r.count} ${unitUpper} AND ${col} >= now())`;
        }
        case 'current_period': {
            const truncFns = {
                hour: 'toStartOfHour', day: 'toStartOfDay', week: 'toStartOfWeek',
                month: 'toStartOfMonth', quarter: 'toStartOfQuarter', year: 'toStartOfYear',
            };
            const truncFn = truncFns[r.period];
            const unitUpper = r.period.toUpperCase();
            const stepInterval = r.period === 'quarter' ? `INTERVAL 3 MONTH` : `INTERVAL 1 ${unitUpper}`;
            const trunc = `${truncFn}(toTimezone(now(), ${escapeCH(tz)}))`;
            return `(${col} >= ${trunc} AND ${col} < ${trunc} + ${stepInterval})`;
        }
        case 'named': {
            const base = `toStartOfDay(toTimezone(now(), ${escapeCH(tz)}))`;
            let lo, hi;
            if (r.name === 'today') {
                lo = base;
                hi = `${base} + INTERVAL 1 DAY`;
            } else if (r.name === 'yesterday') {
                lo = `${base} - INTERVAL 1 DAY`;
                hi = base;
            } else { // tomorrow
                lo = `${base} + INTERVAL 1 DAY`;
                hi = `${base} + INTERVAL 2 DAY`;
            }
            return `(${col} >= ${lo} AND ${col} < ${hi})`;
        }
        case 'absolute': {
            const parts = [];
            if (r.from != null) parts.push(`${col} >= parseDateTimeBestEffort(${escapeCH(r.from)})`);
            if (r.to != null) parts.push(`${col} <= parseDateTimeBestEffort(${escapeCH(r.to)})`);
            return parts.length === 1 ? parts[0] : `(${parts.join(' AND ')})`;
        }
        case 'instant': {
            if (!value.compareEnd) return `(${col} <= now())`;
            // compareEnd is the column name; allow-listed by validateTimeFilter.
            return `(${col} <= now() AND ${value.compareEnd} > now())`;
        }
        default:
            return '';
    }
}

module.exports = {
    validateTimeFilter,
    extractTimeFilterValues,
    buildTimeFilterSQL,
    buildTimeFilterCH,
};
