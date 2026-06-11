/**
 * Pure helpers for the built-in Schedule / Runs source pages.
 *
 * Client-side cron support deliberately covers only standard 5-field crons
 * (minute hour day-of-month month day-of-week, with `*`, comma lists,
 * ranges and `/step`). That's all the cadence presets and the legacy
 * schedules ever used, and it keeps the client dependency-free. The server
 * (cron-parser) remains authoritative — anything these helpers can't parse
 * falls back to the raw string / "custom — validated on save".
 */

const FIELD_RANGES = [
  { min: 0, max: 59 },  // minute
  { min: 0, max: 23 },  // hour
  { min: 1, max: 31 },  // day of month
  { min: 1, max: 12 },  // month
  { min: 0, max: 6 },   // day of week (7 normalized to 0 = Sunday)
];

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function parseField(field, { min, max }, isDow) {
  const values = new Set();
  for (const part of String(field).split(',')) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) throw new Error(`Unsupported cron field: ${field}`);
    const step = m[2] ? parseInt(m[2], 10) : 1;
    if (step < 1) throw new Error(`Bad step in cron field: ${field}`);
    let lo;
    let hi;
    if (m[1] === '*') {
      lo = min; hi = max;
    } else if (m[1].includes('-')) {
      [lo, hi] = m[1].split('-').map((n) => parseInt(n, 10));
    } else {
      lo = parseInt(m[1], 10);
      hi = m[2] ? max : lo; // `5/10` = every 10 starting at 5 (vixie-style)
    }
    for (let v = lo; v <= hi; v += step) {
      let val = v;
      if (isDow && val === 7) val = 0;
      if (val < min || val > max) throw new Error(`Value out of range in cron field: ${field}`);
      values.add(val);
    }
  }
  if (values.size === 0) throw new Error(`Empty cron field: ${field}`);
  return values;
}

/**
 * Parse a 5-field cron into per-field value Sets. Throws on anything it
 * doesn't understand (callers fall back to the raw string / server-side
 * validation).
 */
export function parseCron(cron) {
  const fields = String(cron || '').trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('Expected a 5-field cron expression');
  const [minutes, hours, dom, months, dow] = fields.map((f, i) =>
    parseField(f, FIELD_RANGES[i], i === 4));
  return {
    minutes, hours, dom, months, dow,
    domStar: fields[2] === '*',
    dowStar: fields[4] === '*',
    raw: fields,
  };
}

const pad2 = (n) => String(n).padStart(2, '0');

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function single(set) {
  return set.size === 1 ? [...set][0] : null;
}

/**
 * Human-readable description of the common 5-field cron shapes. Anything
 * unusual returns the raw cron string unchanged.
 */
export function cronToHuman(cron) {
  let p;
  try { p = parseCron(cron); } catch { return String(cron || ''); }

  const minute = single(p.minutes);
  const hour = single(p.hours);
  const domDay = single(p.dom);
  const month = single(p.months);
  const weekday = single(p.dow);
  const allDays = p.domStar && p.dowStar && p.raw[3] === '*';

  // step shapes on the raw fields (parse loses the step intent)
  const minStep = p.raw[0].match(/^\*\/(\d+)$/);
  if (minStep && p.raw.slice(1).every((f) => f === '*')) return `Every ${minStep[1]} minutes`;
  const hourStep = p.raw[1].match(/^\*\/(\d+)$/);
  if (minute != null && hourStep && p.raw.slice(2).every((f) => f === '*')) {
    return `Every ${hourStep[1]} hours at :${pad2(minute)}`;
  }

  if (minute == null || hour == null) return String(cron);
  const at = `${pad2(hour)}:${pad2(minute)}`;

  if (allDays) return `Daily at ${at}`;
  if (p.domStar && p.raw[3] === '*' && weekday != null) return `Weekly on ${DOW_NAMES[weekday]} at ${at}`;
  if (p.dowStar && p.raw[3] === '*' && domDay != null) return `Monthly on the ${ordinal(domDay)} at ${at}`;
  if (p.dowStar && month != null && domDay != null) return `Yearly on ${MONTH_NAMES[month]} ${ordinal(domDay)} at ${at}`;
  return String(cron);
}

// ── timezone-aware next-fire computation ────────────────────────────────────

const wallPartsCache = {};

function wallFormatter(timeZone) {
  if (!wallPartsCache[timeZone]) {
    wallPartsCache[timeZone] = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', weekday: 'short',
    });
  }
  return wallPartsCache[timeZone];
}

const DOW_LOOKUP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock fields a UTC instant shows in an IANA timezone. */
function wallParts(date, timeZone) {
  const parts = {};
  for (const { type, value } of wallFormatter(timeZone).formatToParts(date)) {
    parts[type] = value;
  }
  return {
    y: +parts.year,
    mo: +parts.month,
    d: +parts.day,
    h: +parts.hour % 24, // Intl can report 24 for midnight
    mi: +parts.minute,
    dow: DOW_LOOKUP[parts.weekday],
  };
}

/**
 * UTC instant for a wall-clock time in an IANA timezone. Two-pass fixpoint:
 * guess the instant by treating the wall time as UTC, see what wall time
 * that instant actually shows in the zone, correct by the difference.
 */
function zonedTimeToUtc(y, mo, d, h, mi, timeZone) {
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let utc = want;
  for (let i = 0; i < 2; i++) {
    const shown = wallParts(new Date(utc), timeZone);
    const shownUtc = Date.UTC(shown.y, shown.mo - 1, shown.d, shown.h, shown.mi);
    if (shownUtc === want) break;
    utc += want - shownUtc;
  }
  return new Date(utc);
}

/**
 * Next `count` fire instants (as Dates) of a 5-field cron evaluated in an
 * IANA timezone. Walks wall-clock days in the zone (up to ~400) and checks
 * each allowed hour/minute. Standard cron day semantics: when BOTH
 * day-of-month and day-of-week are restricted, a day matches if EITHER
 * matches. Throws when the cron can't be parsed.
 */
export function nextCronFires(cron, timezone = 'America/New_York', count = 3, from = new Date()) {
  const p = parseCron(cron);
  const hours = [...p.hours].sort((a, b) => a - b);
  const minutes = [...p.minutes].sort((a, b) => a - b);
  const fires = [];
  const seenDays = new Set();

  // Half-day probe steps so a DST-shortened day can't make us skip a wall date.
  for (let step = 0; step <= 800 && fires.length < count; step++) {
    const probe = new Date(from.getTime() + step * 43200000);
    const wp = wallParts(probe, timezone);
    const dayKey = `${wp.y}-${wp.mo}-${wp.d}`;
    if (seenDays.has(dayKey)) continue;
    seenDays.add(dayKey);

    if (!p.months.has(wp.mo)) continue;
    const domMatch = p.dom.has(wp.d);
    const dowMatch = p.dow.has(wp.dow);
    const dayMatches = p.domStar && p.dowStar ? true
      : p.domStar ? dowMatch
        : p.dowStar ? domMatch
          : (domMatch || dowMatch);
    if (!dayMatches) continue;

    for (const h of hours) {
      for (const mi of minutes) {
        const utc = zonedTimeToUtc(wp.y, wp.mo, wp.d, h, mi, timezone);
        if (utc.getTime() > from.getTime()) {
          fires.push(utc);
          if (fires.length >= count) return fires;
        }
      }
    }
  }
  return fires;
}

// ── timestamp display ────────────────────────────────────────────────────────

/**
 * Schedule timestamps (next_fire_at / last_fired_at) are stored as UTC
 * 'YYYY-MM-DD HH:MM:SS' wall-clock strings — parse them AS UTC. Task
 * timestamps may already be ISO strings; both shapes are handled.
 */
export function utcStringToDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value).replace(/"/g, '');
  const date = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)
    ? new Date(`${s.replace(' ', 'T')}Z`)
    : new Date(s);
  return isNaN(date.getTime()) ? null : date;
}

/** Relative time, past ("3 hours ago") or future ("in 2 days"). */
export function timeAgo(input) {
  const date = utcStringToDate(input);
  if (!date) return '';
  const formatter = new Intl.RelativeTimeFormat('en');
  const ranges = {
    years: 3600 * 24 * 365, months: 3600 * 24 * 30, weeks: 3600 * 24 * 7,
    days: 3600 * 24, hours: 3600, minutes: 60, seconds: 1,
  };
  const secondsElapsed = (date.getTime() - Date.now()) / 1000;
  for (const key in ranges) {
    if (ranges[key] < Math.abs(secondsElapsed)) {
      return formatter.format(Math.round(secondsElapsed / ranges[key]), key);
    }
  }
  return 'just now';
}

export function formatTimestamp(value) {
  const date = utcStringToDate(value);
  return date ? date.toLocaleString() : '';
}

export function formatDuration(startedAt, completedAt) {
  const start = utcStringToDate(startedAt);
  if (!start) return '';
  const end = utcStringToDate(completedAt) || new Date();
  const ms = end.getTime() - start.getTime();
  if (isNaN(ms) || ms < 0) return '';
  if (ms < 2000) return `${ms} ms`;
  if (ms < 600000) return `${Math.floor(ms / 1000)} seconds`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)} minutes`;
  return `${Math.floor(ms / 3600000)} hours`;
}

// ── loader ↔ source matching ────────────────────────────────────────────────

/**
 * Loader matching rule for the Schedule page's loader select: a schedulable
 * matches a source when its registered datatype equals the source's type
 * exactly, or the two share a *type family* — the family being everything up
 * to the longer name's next underscore (so `npmrds` / `npmrds_raw` /
 * `npmrds_raw_tmc_identification` are one family, but `transcom` does NOT
 * match `transit`). Matching loaders sort first (exact before family);
 * everything else stays selectable below — the worker decides what it reads,
 * the source filter is a convenience, not a constraint.
 *
 * Returns 0 = exact, 1 = family, 2 = no match.
 */
export function schedulableMatchRank(schedulableDatatype, sourceType) {
  const a = String(schedulableDatatype || '');
  const b = String(sourceType || '');
  if (!a || !b) return 2;
  if (a === b) return 0;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.startsWith(`${shorter}_`)) return 1;
  return 2;
}
