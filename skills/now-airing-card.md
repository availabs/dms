# Currently-active row card (WCDB "Now Airing" pattern)

Render a single card showing the row whose `[start_at, end_at]` interval contains `now()` — the show currently airing, the event currently happening, the rotation slot currently on call. Auto-refreshes when an interval boundary crosses (`useNowTick`).

This is a **configuration recipe**, not a new component. It uses the existing `Card` section with calc columns + an `op: 'time'` filter. Worked end-to-end on the WCDB home page (section id 1964231 if you need a live reference).

## Prerequisites

- An internal-table source (DMS) or DAMA source whose rows describe **recurring weekly slots**, with these columns:
  - `dow_start` — smallint 0-6 (Sunday=0, Saturday=6)
  - `time_start` — text in `HH:MM` 24-hour format (`"06:00"`, `"22:30"`)
  - `dow_end` — smallint 0-6
  - `time_end` — text `HH:MM`
- Plus whatever display fields the card surfaces (icon, title, description, etc.).
- The pattern must be on a page-type pattern wired to a `dmsEnvId`. The view's `metadata.columns` need to be populated (the DMS internal-table publish path handles this automatically).

If your data isn't in this shape, see "Data shape decisions" at the bottom for why and what the alternatives are.

## The recipe

### 1. Calc columns

The card needs `start_at` and `end_at` as `timestamptz` so the time-filter primitive accepts them (column-type allow-list: `date | datetime | timestamp | timestamptz`). Recurring slots have no fixed timestamp, so we project `now()`'s "most-recent occurrence" each query.

Add two **section-level** calculated columns to the Card section. The `name` carries the SQL with an `as <alias>` suffix; `display: 'calculated'` marks it as calc; `type: 'timestamp'` makes `isTimeColumnType` accept it for the picker; `show: false` keeps them out of the visible card UI.

```js
const SUNDAY_ANCHOR =
  `(date_trunc('week', now() AT TIME ZONE 'America/New_York') - interval '1 day') AT TIME ZONE 'America/New_York'`;

const PROJECTED_START =
  `(${SUNDAY_ANCHOR} + (NULLIF(data->>'show_day_start','')::int * interval '1 day') + NULLIF(data->>'show_start','')::interval)`;

// "Most recent occurrence" — if the projection lands in the future, subtract
// 7 days. `(bool)::int` is 0 or 1 in Postgres.
const START_AT_SQL =
  `(${PROJECTED_START} - interval '7 days' * (${PROJECTED_START} > now())::int)`;

// Duration: dow-difference days + time-of-day difference. Negative values
// (Sat→Sun, weekday late-night wraps) get +7 days to land in the same week.
const RAW_DURATION =
  `(((NULLIF(data->>'show_day_end','')::int - NULLIF(data->>'show_day_start','')::int) * interval '1 day') + (NULLIF(data->>'show_end','')::interval - NULLIF(data->>'show_start','')::interval))`;

const DURATION_SQL =
  `(CASE WHEN ${RAW_DURATION} < interval '0 seconds' THEN ${RAW_DURATION} + interval '7 days' ELSE ${RAW_DURATION} END)`;

const END_AT_SQL = `(${START_AT_SQL} + ${DURATION_SQL})`;

const calcColumns = [
  {
    name: `${START_AT_SQL} as start_at`,
    display_name: 'Start At',
    type: 'timestamp',
    display: 'calculated',
    show: false,
  },
  {
    name: `${END_AT_SQL} as end_at`,
    display_name: 'End At',
    type: 'timestamp',
    display: 'calculated',
    show: false,
  },
];
```

Replace `'America/New_York'` with the broadcast timezone for your data, and the four `data->>'…'` field names if your columns are spelled differently.

### 2. Filter

A single `op: 'time'` leaf bound to `start_at` with `kind: 'instant'` and `compareEnd: 'end_at'`:

```js
const filters = {
  op: 'AND',
  groups: [
    {
      col: 'start_at',
      op: 'time',
      value: {
        ranges: [{ kind: 'instant', at: 'now' }],
        compareEnd: 'end_at',
        tz: 'America/New_York',
        // Author-controlled card; URL won't override any axis.
        exposedAxes: {},
      },
    },
  ],
};
```

The server emits `(start_at <= now() AND end_at > now())` from this leaf. The client (`mapFilterGroupCols` in `buildUdaConfig.js`) resolves both `start_at` and the compareEnd `end_at` to their full calc-SQL accessors — and stuffs the latter into a sibling `compareEndAccessor` field so the server doesn't fall back to its `data->>'<name>'` derivation (which is wrong for calc columns).

### 3. Display + sort

Page size 1, deterministic tiebreaker, no pagination:

```js
const display = {
  pageSize: 1,
  usePagination: false,
  compactView: true,
  showAttribution: false,
  // ... other Card display config
};

// Optionally sort by start_at DESC as a tiebreaker if data hygiene is imperfect
// and two rows could overlap. Add to columns:
//   { name: '... as start_at', sort: 'desc nulls last', ... }
```

### 4. Visible columns

Whatever the card should show — icon, title, DJ, description. Match the existing Card configuration patterns; nothing time-filter-specific here.

### 5. Putting it together

Build the section's `element-data` blob with `{ externalSource, columns: [...calcColumns, ...visibleColumns], filters, display, join, data: [] }` and create the section via the DMS CLI:

```bash
node references/build-section.cjs > /tmp/section.json
DMS_HOST=http://localhost:3001 DMS_APP=<app> DMS_TYPE=<type> \
  dms section create <home-page-id> \
  --element-type Card \
  --title "Now Airing" \
  --data "$(cat /tmp/section.json)"
```

For the WCDB-specific build script, see `references/wcdb/build-now-airing-section.cjs` (kept around as a reproducible example).

## Live updates

The section auto-refetches on the next minute boundary because `useNowTick` walks the filter tree, sees `op: 'time'` with a clock-anchored `kind: 'instant'`, and schedules a single `setTimeout` to the next boundary (no polling). When a show transitions, the card updates within ~1 minute.

## Data shape decisions

**Why per-pattern rows + calc columns instead of pre-computed timestamps?**

A recurring weekly schedule has no single absolute `start_at` — every show airs every week, indefinitely. If you bake "this Sunday 6am" into a stored field at upload time, the value is wrong starting next week. The only place `now()` can enter the math is at query time, which is exactly what calc columns do.

The alternative (per-broadcast rows: 68 patterns × 52 weeks ≈ 3500 rows/year) makes the card filter trivially `start_at <= now() AND end_at > now()` with no calc columns — but at the cost of: (a) editing the recurring rule means rewriting many rows, (b) you need a populator extending the rolling window forever, (c) editorial intent ("this slot belongs to DJ X on Tuesdays") is lost in the row data. For an editable internal-table source, per-pattern + calc columns is the better tradeoff.

## Common pitfalls

These are the issues we hit configuring this on WCDB. Each is a real code path; the fixes are in the package, but knowing about them saves the next person an hour of debugging.

1. **`compareEnd` against a calc column hits a hardcoded `data->>'<name>'`** — fixed by `value.compareEndAccessor` (resolved client-side). If you see SQL like `(data->>'end_at')::timestamptz > now()` and `end_at` is a calc column, the client's compareEnd-resolution didn't run. Hard reload; if still broken, check `mapFilterGroupCols` in `buildUdaConfig.js` is finding the column via the alias index.

2. **`mapFilterGroupCols`'s lookup misses calc columns by alias** — calc columns are stored with `name: '<sql> as <alias>'` and a leaf says `col: '<alias>'`. Direct name lookup misses. The fix is the alias map at the call site (around line 972 in `buildUdaConfig.js`); the file's local `getColumn` helper has the right shape.

3. **`column "data" is ambiguous` under joins** — when the card joins (e.g., to a DJ table for `on_air_name`), bare `data->>` in calc-col SQL hits both tables. `buildUdaConfig` rewrites `data->>` → `${alias}.data->>` for calc columns under joins (see `aliasCalcSql` at the top of `buildUdaConfig`). Don't pre-prefix in your calc SQL — let the builder do it.

4. **Empty/null schedule slots** — rows without a regular slot have empty strings for the dow/time fields. `''::int` throws in Postgres. Wrap every JSON access with `NULLIF(data->>'…','')` so empty strings cast to NULL, NULL casts to NULL, and the predicate evaluates as null/false (filtering the row out). The math doesn't care, but the cast does.

5. **Sat→Sun and other day-crossing slots** — a show airing Sat 23:00 to Sun 01:00 has `dow_start=6, dow_end=0`. Naive duration is negative; the `+ 7 days` normalize in `DURATION_SQL` handles it. If you skip that branch, the seven Sat→Sun shows in WCDB miss their currently-airing window for ~minutes around midnight Sun.

6. **DST.** `interval '1 hour'` arithmetic on `timestamptz` is exact UTC duration, not wall-clock. Spring/fall transition Sundays will be 23 or 25 hours of wall-clock time but our 6 hours added past midnight is still 6 hours of UTC. For minute-resolution scheduling cards this is a deferred edge case; if it bites, switch the `(...)::interval` to a `time` cast and use `+ time` semantics, which Postgres tracks against the local calendar.

## When to use this recipe

- "What's playing right now" — schedule cards.
- "Currently active" — event calendar live indicator.
- "On call this hour" — rotation displays.
- Any "single row, currently happening" feed where data is recurring rather than per-occurrence.

For one-off events with absolute timestamps, you don't need any of this — `op: 'time' kind: 'instant' compareEnd: 'end_at'` against your stored `start_at` / `end_at` columns works directly without calc columns.

## References

- Live reference section: WCDB `app=wcdb type=prod`, page id `1471789` (Home), section id `1964231` ("Now Airing").
- Time-filter primitive: `packages/dms-server/src/routes/uda/time-filter.js` (server) + `packages/dms/src/patterns/page/components/sections/components/dataWrapper/utils/timeFilter.js` (client utilities).
- Builder & alias lookup: `packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js` (search for `aliasCalcSql`, `columnsByAlias`, `compareEndAccessor`).
- Picker UI: `packages/dms/src/patterns/page/components/sections/components/dataWrapper/components/filters/TimePicker/InstantRow.jsx`.
- Phase-by-phase task that built the primitive: `planning/tasks/completed/datawrapper-time-filters.md`.
- Section build helper used to create the WCDB card: `references/wcdb/build-now-airing-section.cjs` (if present in the repo; otherwise check the task notes for the inlined version).
