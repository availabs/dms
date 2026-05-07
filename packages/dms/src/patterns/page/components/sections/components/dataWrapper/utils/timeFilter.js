/**
 * Time filter utilities — pure, no React.
 *
 * Companion to the `op: 'time'` filter leaf (server-side handling lives at
 * `dms-server/src/routes/uda/time-filter.js`). This module exposes:
 *
 *   isTimeColumnType(type)     — column-type allow-list gate
 *   humanLabel(value)          — short human-readable summary, for chips/empty-states
 *   requiredTickGranularity(v) — finest clock granularity any range in v anchors on
 *   walkTreeForTickGranularity(filterTree) — same, across the whole filter tree
 *   parseTimeFilterURL(token)  — text → TimeFilterValue
 *   serializeTimeFilterURL(v)  — TimeFilterValue → text
 *
 * URL grammar (Phase 3):
 *
 *   ranges      = range ( "|" range )*
 *   range       = "last:" N unit                       e.g. last:7d, last:30m
 *               | "next:" N unit                       e.g. next:1h
 *               | "this:" period                       e.g. this:week, this:month
 *               | "today" | "yesterday" | "tomorrow"
 *               | "since:" YYYY-MM-DD                  open-ended absolute (≥ from)
 *               | "before:" YYYY-MM-DD                 open-ended absolute (< to)
 *               | YYYY-MM-DD ".." YYYY-MM-DD           bounded absolute
 *               | "now"                                instant
 *
 *   dow         = "weekdays" | "weekends" | day ( "+" day )*
 *   day         = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"
 *
 *   timeOfDay   = HH:MM "-" HH:MM                      midnight wrap forbidden
 *   compareEnd  = "end:" colname                       Phase 4; col allow-list [A-Za-z_][A-Za-z0-9_]*
 *
 *   token       = ranges? ( "&" axis )*                axes ANDed with `&`
 *   axis        = dow | timeOfDay | compareEnd
 *
 * Examples:
 *   last:7d
 *   today
 *   2024-01-01..2024-06-30
 *   last:7d|2024-04-01..2024-04-30                multi-range OR
 *   last:7d&weekdays&9:00-17:00                   range + dow + timeOfDay
 *   weekends&18:00-23:00                          DOW + time-of-day, no range
 *   now&end:end_at                                instant + compareEnd ("currently active")
 */

const TIME_COLUMN_TYPES = new Set([
    'date',
    'datetime',
    'timestamp',
    'timestamptz',
    'timestamp without time zone',
    'timestamp with time zone',
]);

export const isTimeColumnType = (type) => {
    if (!type || typeof type !== 'string') return false;
    return TIME_COLUMN_TYPES.has(type.trim().toLowerCase());
};

// Maps single-letter URL unit suffix → full unit name and vice versa.
const URL_UNIT_BY_LETTER = { m: 'minute', h: 'hour', d: 'day', w: 'week', M: 'month', y: 'year' };
const LETTER_BY_URL_UNIT = { minute: 'm', hour: 'h', day: 'd', week: 'w', month: 'M', year: 'y' };

const PERIODS = new Set(['hour', 'day', 'week', 'month', 'quarter', 'year']);
const NAMED = new Set(['today', 'yesterday', 'tomorrow']);
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_INDEX = Object.fromEntries(DAY_NAMES.map((n, i) => [n, i]));

const TICK_GRANULARITY_BY_UNIT = { minute: 'minute', hour: 'hour', day: 'day', week: 'day', month: 'day', year: 'day' };
const TICK_RANK = { second: 0, minute: 1, hour: 2, day: 3 };

const finerOf = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    return TICK_RANK[a] <= TICK_RANK[b] ? a : b;
};

/**
 * Inspect a single TimeFilterValue and return the finest tick granularity any
 * of its range entries needs, or null if the value never anchors to `now`.
 */
export const requiredTickGranularity = (value) => {
    if (!value || typeof value !== 'object' || !Array.isArray(value.ranges)) return null;
    let g = null;
    for (const r of value.ranges) {
        if (!r) continue;
        switch (r.kind) {
            case 'relative':
                g = finerOf(g, TICK_GRANULARITY_BY_UNIT[r.unit] || 'day');
                break;
            case 'current_period':
                g = finerOf(g, r.period === 'hour' ? 'hour' : 'day');
                break;
            case 'named':
                g = finerOf(g, 'day');
                break;
            case 'instant':
                g = finerOf(g, 'minute');
                break;
            // 'absolute': fixed values, no clock dependency.
            default:
                break;
        }
    }
    return g;
};

/**
 * Walk a filter tree and return the finest tick granularity required across all
 * `op: 'time'` leaves. Null when no leaf anchors to `now`.
 */
export const walkTreeForTickGranularity = (node) => {
    if (!node) return null;
    if (Array.isArray(node.groups)) {
        let g = null;
        for (const child of node.groups) g = finerOf(g, walkTreeForTickGranularity(child));
        return g;
    }
    if (node.op === 'time') return requiredTickGranularity(node.value);
    return null;
};

const formatRangeEntry = (r) => {
    if (!r) return '';
    switch (r.kind) {
        case 'relative': {
            const dir = r.direction === 'future' ? 'next' : 'last';
            const unitLabel = r.count === 1 ? r.unit : `${r.unit}s`;
            return `${dir} ${r.count} ${unitLabel}`;
        }
        case 'current_period':
            return `this ${r.period}`;
        case 'named':
            return r.name;
        case 'absolute': {
            if (r.from && r.to) return `${r.from} → ${r.to}`;
            if (r.from) return `since ${r.from}`;
            if (r.to) return `before ${r.to}`;
            return '';
        }
        case 'instant':
            return 'now';
        default:
            return '';
    }
};

const formatDow = (dow) => {
    if (!Array.isArray(dow) || !dow.length) return '';
    if (dow.length === 5 && [1, 2, 3, 4, 5].every(d => dow.includes(d))) return 'weekdays';
    if (dow.length === 2 && [0, 6].every(d => dow.includes(d))) return 'weekends';
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return [...dow].sort((a, b) => a - b).map(d => names[d]).join('+');
};

/**
 * Compact human-readable summary of a TimeFilterValue. Used by chips and
 * empty-state interpolation. Returns '' when nothing is constrained.
 */
export const humanLabel = (value) => {
    if (!value || typeof value !== 'object') return '';
    const parts = [];
    if (Array.isArray(value.ranges) && value.ranges.length) {
        const labels = value.ranges.map(formatRangeEntry).filter(Boolean);
        if (labels.length) {
            // When the only range is `instant` and a compareEnd is set, surface
            // the relationship (otherwise just "now" reads opaquely).
            const onlyInstant = value.ranges.length === 1 && value.ranges[0]?.kind === 'instant';
            if (onlyInstant && value.compareEnd) parts.push(`active vs ${value.compareEnd}`);
            else parts.push(labels.join(' or '));
        }
    }
    const dowLabel = formatDow(value.dow);
    if (dowLabel) parts.push(dowLabel);
    if (value.timeOfDay && value.timeOfDay.start && value.timeOfDay.end) {
        parts.push(`${value.timeOfDay.start}–${value.timeOfDay.end}`);
    }
    return parts.join(' · ');
};

// ─── URL parsing ─────────────────────────────────────────────────────────────

const HHMM = /^(\d{1,2}):(\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REL_TOKEN = /^(last|next):(\d+)([mhdwMy])$/;
const RANGE_TOKEN_BOUNDED = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;
// Same allow-list as the server-side validator (dms-server time-filter.js).
const COL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const parseHHMM = (s) => {
    if (!s || typeof s !== 'string') return null;
    const m = HHMM.exec(s.trim());
    if (!m) return null;
    const h = +m[1], min = +m[2];
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
};

const parseRangeToken = (token) => {
    if (!token) return null;
    if (NAMED.has(token)) return { kind: 'named', name: token };
    if (token === 'now') return { kind: 'instant', at: 'now' };

    const rel = REL_TOKEN.exec(token);
    if (rel) {
        const direction = rel[1] === 'next' ? 'future' : 'past';
        const count = parseInt(rel[2], 10);
        const unit = URL_UNIT_BY_LETTER[rel[3]];
        if (unit && Number.isFinite(count) && count >= 0) {
            return { kind: 'relative', unit, count, direction };
        }
        return null;
    }

    if (token.startsWith('this:')) {
        const period = token.slice('this:'.length);
        if (PERIODS.has(period)) return { kind: 'current_period', period };
        return null;
    }
    if (token.startsWith('since:')) {
        const from = token.slice('since:'.length);
        if (ISO_DATE.test(from)) return { kind: 'absolute', from };
        return null;
    }
    if (token.startsWith('before:')) {
        const to = token.slice('before:'.length);
        if (ISO_DATE.test(to)) return { kind: 'absolute', to };
        return null;
    }

    const bounded = RANGE_TOKEN_BOUNDED.exec(token);
    if (bounded) return { kind: 'absolute', from: bounded[1], to: bounded[2] };

    return null;
};

const parseDowToken = (token) => {
    if (!token) return null;
    if (token === 'weekdays') return [1, 2, 3, 4, 5];
    if (token === 'weekends') return [0, 6];

    const parts = token.split('+');
    const idxs = [];
    for (const p of parts) {
        const i = DAY_INDEX[p.toLowerCase()];
        if (i === undefined) return null;
        if (!idxs.includes(i)) idxs.push(i);
    }
    if (!idxs.length) return null;
    return idxs.sort((a, b) => a - b);
};

const parseTimeOfDayToken = (token) => {
    if (!token || token.indexOf('-') === -1) return null;
    const [a, b] = token.split('-');
    const start = parseHHMM(a);
    const end = parseHHMM(b);
    if (!start || !end) return null;
    if (start >= end) return null; // midnight-wrap forbidden in v1
    return { start, end };
};

/**
 * Parse a URL token into a TimeFilterValue, or null if unrecognized.
 * Axes are ANDed with `&`, ranges within the range axis are ORed with `|`.
 */
export const parseTimeFilterURL = (token) => {
    if (!token || typeof token !== 'string') return null;
    const trimmed = token.trim();
    if (!trimmed) return null;

    const value = {};
    const axisTokens = trimmed.split('&').map(s => s.trim()).filter(Boolean);

    for (const axis of axisTokens) {
        // Range axis: `|`-separated range tokens. Detect by trying to parse each
        // sub-token as a range — only commit if every sub-token parses.
        const subTokens = axis.split('|').map(s => s.trim()).filter(Boolean);
        const asRanges = subTokens.map(parseRangeToken);
        if (asRanges.every(r => r !== null)) {
            value.ranges = (value.ranges || []).concat(asRanges);
            continue;
        }

        // Single-token axes: try compareEnd, DOW, then time-of-day.
        if (subTokens.length === 1) {
            if (axis.startsWith('end:')) {
                const col = axis.slice('end:'.length);
                if (COL_NAME.test(col)) {
                    value.compareEnd = col;
                    continue;
                }
                return null;
            }
            const dow = parseDowToken(axis);
            if (dow) {
                value.dow = dow;
                continue;
            }
            const tod = parseTimeOfDayToken(axis);
            if (tod) {
                value.timeOfDay = tod;
                continue;
            }
        }

        // Unrecognized axis — fail the whole token rather than silently dropping.
        return null;
    }

    if (!Object.keys(value).length) return null;
    return value;
};

// ─── URL serialization ───────────────────────────────────────────────────────

const serializeRangeEntry = (r) => {
    if (!r) return null;
    if (r.kind === 'named' && NAMED.has(r.name)) return r.name;
    if (r.kind === 'instant' && r.at === 'now') return 'now';
    if (r.kind === 'relative') {
        const letter = LETTER_BY_URL_UNIT[r.unit];
        if (!letter) return null;
        const prefix = r.direction === 'future' ? 'next' : 'last';
        return `${prefix}:${r.count}${letter}`;
    }
    if (r.kind === 'current_period' && PERIODS.has(r.period)) return `this:${r.period}`;
    if (r.kind === 'absolute') {
        const from = r.from && ISO_DATE.test(r.from) ? r.from : null;
        const to = r.to && ISO_DATE.test(r.to) ? r.to : null;
        if (from && to) return `${from}..${to}`;
        if (from) return `since:${from}`;
        if (to) return `before:${to}`;
        return null;
    }
    return null;
};

const serializeDow = (dow) => {
    if (!Array.isArray(dow) || !dow.length) return null;
    if (dow.length === 5 && [1, 2, 3, 4, 5].every(d => dow.includes(d))) return 'weekdays';
    if (dow.length === 2 && [0, 6].every(d => dow.includes(d))) return 'weekends';
    const sorted = [...dow].sort((a, b) => a - b);
    if (sorted.some(d => d < 0 || d > 6 || !Number.isInteger(d))) return null;
    return sorted.map(d => DAY_NAMES[d]).join('+');
};

const serializeTimeOfDay = (tod) => {
    if (!tod || !tod.start || !tod.end) return null;
    const start = parseHHMM(tod.start);
    const end = parseHHMM(tod.end);
    if (!start || !end) return null;
    if (start >= end) return null; // midnight-wrap forbidden
    return `${start}-${end}`;
};

/**
 * True when an axis is exposed to viewers (i.e. should round-trip through
 * the URL). `value.exposedAxes` absent ⇒ all axes exposed (back-compat
 * with leaves authored before Phase 5). Present ⇒ only truthy keys
 * are exposed.
 */
export const isAxisExposed = (value, axis) => {
    if (!value || !value.exposedAxes) return true;
    return !!value.exposedAxes[axis];
};

/**
 * Serialize a TimeFilterValue back to URL token form, or null if no axis is
 * representable. When `value.exposedAxes` is set, only exposed axes are
 * included — locked axes are author-controlled and don't round-trip.
 */
export const serializeTimeFilterURL = (value) => {
    if (!value || typeof value !== 'object') return null;
    const axes = [];

    if (isAxisExposed(value, 'range') && Array.isArray(value.ranges) && value.ranges.length) {
        const tokens = value.ranges.map(serializeRangeEntry);
        if (tokens.every(t => t !== null)) {
            axes.push(tokens.join('|'));
        } else {
            return null; // partial ranges — refuse to lossy-encode
        }
    }
    if (isAxisExposed(value, 'dow')) {
        const dowToken = serializeDow(value.dow);
        if (dowToken) axes.push(dowToken);
    }
    if (isAxisExposed(value, 'timeOfDay')) {
        const todToken = serializeTimeOfDay(value.timeOfDay);
        if (todToken) axes.push(todToken);
    }
    // compareEnd belongs to the range axis — locked when range is locked.
    if (isAxisExposed(value, 'range') && value.compareEnd && COL_NAME.test(value.compareEnd)) {
        axes.push(`end:${value.compareEnd}`);
    }

    if (!axes.length) return null;
    return axes.join('&');
};

/**
 * Merge a URL-parsed TimeFilterValue onto a persisted leaf value, respecting
 * `persisted.exposedAxes`: only the exposed axes pick up URL values, locked
 * axes keep the author-set values. Used by buildUdaConfig.applyPageFilters
 * for `op === 'time'` leaves.
 */
export const mergeUrlOntoExposedAxes = (persisted, parsed) => {
    if (!parsed || typeof parsed !== 'object') return persisted;
    const next = { ...(persisted || {}) };

    if (isAxisExposed(persisted, 'range')) {
        if (parsed.ranges) next.ranges = parsed.ranges;
        else delete next.ranges;
        if (parsed.compareEnd) next.compareEnd = parsed.compareEnd;
        else delete next.compareEnd;
    }
    if (isAxisExposed(persisted, 'dow')) {
        if (parsed.dow) next.dow = parsed.dow;
        else delete next.dow;
    }
    if (isAxisExposed(persisted, 'timeOfDay')) {
        if (parsed.timeOfDay) next.timeOfDay = parsed.timeOfDay;
        else delete next.timeOfDay;
    }
    return next;
};
