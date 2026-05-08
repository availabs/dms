# Time filters in dataWrapper

## Objective

Add a first-class user-driven time filter primitive to dataWrapper. One filter leaf can express:

- **Relative ranges** anchored to `now` — last 30 days, last 7 days, last 1/3/24 hours, next 7 days.
- **Current-period ranges** — this week, this month, this quarter, this year.
- **Named ranges** — today, yesterday, tomorrow.
- **Absolute ranges** — from `2024-01-01` to `2024-06-30`, or open-ended.
- **Day-of-week restriction** — weekdays only, weekends only, specific days.
- **Time-of-day window** — between 9 AM and 5 PM.
- **Compositions** of the above — "last 7 days, weekends only, between 8 PM and midnight".
- **`instant` point-in-range** — find the row whose stored start/end straddles `now` (the WCDB schedule "show airing right now" case).

The user-controllable variants survive page reloads and sharing via a URL encoding.

See [research/time-based-filters.md](../../research/time-based-filters.md) for the full design space and rationale.

## Input data type constraints + assumptions

**Strict requirement.** A column is filterable with the new `time` op only when its server-side type is `date`, `timestamp`, or `timestamptz`. The pipeline checks the column's `metadata.columns[i].type` (or DAMA equivalent) and refuses to render the time picker for non-temporal columns. This is a deliberate constraint:

- Eliminates the lexical-comparison footgun (`"10:00AM"` vs `"6:00PM"` style bugs).
- Lets UDA emit native Postgres `date_trunc`, `EXTRACT(DOW FROM …)`, `AT TIME ZONE` predicates without wrapping every value in a coercion.
- Keeps the surface allow-listed and predictable — no per-column type guessing.

**Implications for existing data:**

- New sources whose columns matter for filtering/ordering must use `date`/`timestamp` at storage. Document this as a storage convention alongside the existing source-creation flows.
- Existing sources with text-encoded times (the WCDB schedule's `"6:00PM"` columns) are *not* on the critical path here. They get either (a) a one-time data migration to `time`/`integer` siblings, or (b) per-section calculated columns that cast at query time. Both are tracked separately; the `time` op just doesn't apply until they migrate.
- The DAMA `metadata.columns` schema already carries Postgres types; UDA `getEssentials` already exposes them. No metadata migration needed.

**Timezone:**

- Every leaf carries an optional `tz` (IANA name); falls through to a pattern-level default (`pattern.data.timezone`), then to the browser's resolved zone if neither is set.
- Server-side functions wrap the column in `AT TIME ZONE $tz` whenever the predicate depends on a calendar boundary (DOW, date_trunc, time-of-day). Storage column is assumed UTC unless the source explicitly says otherwise.
- DST handling: `relative` ranges are evaluated as exact UTC durations (`now() - interval '24 hours'` is exactly 24 hours regardless of local DST transitions). `current_period` and `named` ranges use `date_trunc(… AT TIME ZONE $tz)` for local-calendar correctness. Documented edge case.

## Scope

In:
- New filter leaf op `time` with structured value (range list + DOW + time-of-day + tz + compareEnd).
- Server-side translation in UDA `handleFilters` (Postgres). ClickHouse mirror later.
- Allow-listed range kinds (`relative`, `current_period`, `named`, `absolute`, `instant`) and DOW indices. No raw expression injection.
- Client picker UI: preset row + three composable axis rows (Range, Day, Time-of-day) with active-constraint chip strip.
- Compact URL encoding (`last:7d&weekdays&9:00-17:00`) so user-controllable filters survive reload and sharing.
- `useNowTick({resolutions, tz})` hook to refetch the section when the filter's clock anchor crosses its next boundary (no polling — `setTimeout` to next boundary).
- Per-axis "exposed to viewers?" toggle on the leaf (lets section authors fix some axes and let end users edit others).
- Dropping the prior `valueSource: 'now'` draft — folded into `time`'s range kinds; one mechanism, not two.

Out:
- Storage normalization for text-time sources (separate task; calculated-column workaround unblocks WCDB schedule).
- Calculated columns referencing `now` directly (fold-to-derived-boolean pattern). Possible follow-up.
- Edit-mode "preview at time T" admin override — useful but behind a feature flag, parked until the picker is real.
- Per-source default timezone column-level overrides — pattern-level default + per-leaf override is enough for v1.
- Backwards-compat with the legacy per-column `column.filters[].usePageFilters` channel for time values — new code uses the `time` op; legacy stays static.

## Current State

Files under `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/`.

**Filter pipeline:** Two coexisting representations:
- Per-column legacy `column.filters[]` (extracted in `buildUdaConfig.js:356-407`).
- Top-level tree `state.filters = {op, groups: [...]}` with leaves `{col, op, value, usePageFilters?, searchParamKey?}`.

**Runtime** (`buildUdaConfig.js:776+`):
1. `applyTableAliasToJoin` (`:292-318`) — alias-prefixes join columns.
2. `applyPageFilters` (`:325-348`) — replaces value when `usePageFilters: true`.
3. `extractNormalFiltersFromGroups` — peels per-column filters out of the tree.
4. `mapFilterGroupCols` (`:161-228`) — rewrites `col` to server-side ref form, translates multiselect ops.
5. `operationToExpressionMap` (`:130-137`) — `filter→IN`, `gt→>`, `lt→<`, etc.

**Server side** (`packages/dms-server/src/routes/uda/utils.js`):
- `handleFilters` (~`:305-348` per the unified-column-types research) builds the WHERE clause from each leaf's op + value. No `time` op today.
- ClickHouse path lives at `query_sets/clickhouse.js` with a parallel structure.

**No clock-anchored values.** `usePageFilters` reads `pageState.filters[searchParamKey]`, written only by URL params or other section interactions. No clock.

**Filter UI:** `RenderFilters.jsx`, `RenderFilterValueSelector.jsx` host the per-leaf editor; ops are picked from a static list mapped to value editors.

## Filter primitive shape

```ts
type RangeEntry =
  | { kind: 'relative', unit: 'minute'|'hour'|'day'|'week'|'month'|'year', count: number, direction: 'past'|'future' }
  | { kind: 'current_period', period: 'hour'|'day'|'week'|'month'|'quarter'|'year' }
  | { kind: 'named', name: 'today'|'yesterday'|'tomorrow' }
  | { kind: 'absolute', from?: string /*ISO date or ISO timestamp*/, to?: string }
  | { kind: 'instant', at: 'now' };

type TimeFilterValue = {
  ranges?: RangeEntry[];                                // OR'd; omitted = no range constraint
  dow?: number[];                                       // 0..6 (Sun=0); omitted = all days
  timeOfDay?: { start: string /* HH:MM */, end: string };
  tz?: string;                                          // IANA; falls through to pattern-level default
  compareEnd?: string;                                  // column name for point-in-range tests
  exposedAxes?: { range?: boolean, dow?: boolean, timeOfDay?: boolean };  // viewer-mode editable axes
};

type TimeLeaf = {
  col: string;
  op: 'time';
  value: TimeFilterValue;
  usePageFilters?: boolean;                             // existing channel; URL ↔ value
  searchParamKey?: string;
};
```

Construction always goes through a builder API (`buildTimeFilter({...})`) that validates the shape; UDA also re-validates on the server.

## URL encoding

Compact textual form for `usePageFilters: true` leaves:

| URL token | resolves to |
|---|---|
| `last:7d` / `last:1h` / `last:30m` | `relative`, past, N units |
| `next:7d` | `relative`, future |
| `this:week` / `this:month` / `this:quarter` / `this:year` / `this:day` / `this:hour` | `current_period` |
| `today` / `yesterday` / `tomorrow` | `named` |
| `since:2024-01-01` / `before:2026-01-01` | `absolute`, single bound |
| `2024-01-01..2024-06-30` | `absolute`, both bounds |
| `now` | `instant` |
| `weekdays` / `weekends` | `dow:[1..5]` / `dow:[0,6]` |
| `sat+sun` / `mon+wed+fri` | `dow` explicit list |
| `9:00-17:00` | `timeOfDay` |

Composition: AND with `&`, OR (ranges only) with `|`. Example: `last:7d|2024-04&weekdays&9:00-17:00`.

Encoder/decoder in a new `dataWrapper/utils/timeFilter.js`. Roundtrips through the picker UI (URL change → editor state, editor change → URL).

## Server translation (UDA)

Predicate templates per axis. Each `time` leaf compiles to one bracketed clause that joins the existing AND/OR tree at the same level as other leaves.

**Range:**

```sql
-- relative: last 7 days
$col >= now() - interval '7 days' AND $col <= now()
-- current_period: this week
$col >= date_trunc('week', now() AT TIME ZONE $tz)
  AND $col < date_trunc('week', now() AT TIME ZONE $tz) + interval '1 week'
-- named: today
$col >= date_trunc('day', now() AT TIME ZONE $tz)
  AND $col < date_trunc('day', now() AT TIME ZONE $tz) + interval '1 day'
-- absolute (both bounds)
$col >= $from AND $col <= $to
-- instant point-in-range (with compareEnd)
$col <= now() AND $compareEnd > now()
```

Multiple range entries OR together inside a parenthesized group.

**DOW:**

```sql
EXTRACT(DOW FROM $col AT TIME ZONE $tz)::int IN (0, 6)
```

**Time-of-day:**

```sql
($col AT TIME ZONE $tz)::time >= $start::time
  AND ($col AT TIME ZONE $tz)::time < $end::time
```

All three predicates AND together.

**Validation:** server rejects unknown range kinds, DOW indices outside 0..6, malformed `HH:MM` strings, non-IANA tz strings. Strict allow-list — no raw SQL or expressions through the value.

**ClickHouse mirror:** identical structure, CH-flavored functions (`now()`, `toDayOfWeek`, `toStartOfWeek`, `toTimezone`). Lives at `dms-server/src/routes/uda/query_sets/clickhouse.js`.

## Live re-trigger (`useNowTick`)

`useNowTick({ resolutions, tz })` returns a tick counter that bumps when the next required boundary is crossed.

| RangeEntry | resolution |
|---|---|
| `relative` `unit: 'minute'` | minute |
| `relative` `unit: 'hour'` | hour |
| `relative` `unit: 'day'` / `current_period: 'day'` / `named` | midnight (in `tz`) |
| `current_period: 'week'` | Sunday/Monday-midnight (in `tz`) |
| `current_period: 'month'`/`'quarter'`/`'year'` | first of period midnight (in `tz`) |
| `instant: now` | minute (default), opt-in to second |

Implementation: compute next boundary, single `setTimeout` to fire at it, increment counter, recurse. No polling. The counter joins `useDataLoader`'s fetch deps so a tick triggers refetch through the same path as a column add or filter edit.

For sections with multiple time filters at different granularities, the hook aggregates to the finest required tick.

## UX (the picker)

Hybrid layout — preset bar wraps a labeled-row composer. Lives in a popover from the filter editor.

```
┌─────────────────────────────────────────────────────────┐
│ [Today] [Last hour] [Last 24h] [Last 7d] [Last 30d]      │  ← preset row
│ [Custom range…] [Day of week…] [Time of day…]            │
│  ───────                                                 │
│ Range:  ▼ last 7 days       (+ Add another range)        │  ← axis rows
│ Day:    ▼ Any                                            │
│ Time:   ▼ Any                                            │
│                                                          │
│ Timezone: America/New_York [edit]                        │
│                                                          │
│ Exposed to viewers: ☑ Range  ☐ Day  ☐ Time-of-day        │  ← author-only
└─────────────────────────────────────────────────────────┘

Active constraints (chip strip outside the popover):
  ⏱ last 7 days · ✕     📅 weekends · ✕     🕐 9 AM – 5 PM · ✕
```

**Behavior:**
- Preset click → sets just the Range axis (clears any custom Range entries; "+ Add another range" appears for OR'd disjoint windows).
- Each axis row defaults to "Any" (no constraint). Selecting opens an inline editor:
  - Range → `Last [7] [days]` for relative, calendar popover for absolute, dropdown for named/current_period.
  - Day → 7-checkbox grid + presets (weekdays/weekends).
  - Time-of-day → two `HH:MM` inputs + slider variant.
- Author-only toggle row: per-axis "exposed to viewers" checkboxes. End users see only exposed axes when the section is in view mode.
- Section-header "live" badge (⏱) when the filter resolves to a clock anchor.
- The picker publishes a human-readable label (`"last 7 days"`) the section's empty-state template can interpolate.

**Component breakdown:** `TimePicker`, `PresetBar`, `RangeRow`, `DowRow`, `TimeOfDayRow`, `Chips`. New folder `dataWrapper/components/filters/TimePicker/`.

## Phasing

Big enough that splitting reduces risk. Phases land independently; the schedule "show airing now" case waits for Phase 4.

**Phase 1 — Server `time` op, Postgres only. ✅ COMPLETE 2026-05-07.** New module `dms-server/src/routes/uda/time-filter.js` exporting `validateTimeFilter`, `extractTimeFilterValues`, `buildTimeFilterSQL`. Allow-listed enums (units / periods / named / DOW / IANA tz / `compareEnd` column name); strict regex / set validation; structured value never passes through to SQL. Postgres predicate templates cover every Range kind, DOW (`EXTRACT(DOW FROM …)::int = ANY`), time-of-day (`(col AT TIME ZONE $tz)::time`), composition (ranges OR'd, axes AND'd), `instant` + `compareEnd` (the schedule case), and tz cascade (`tz`-needing axes only — relative/absolute/instant don't bind a tz slot, keeping placeholder/value parity tight). DMS columns are auto-cast to `timestamptz` (`(data->>'…')::timestamptz`); raw DAMA columns flow through. SQLite/ClickHouse paths throw with a clear message. Wired into `routes/uda/utils.js`'s `getValuesFromGroup` + `buildLeafSQL` so existing `filterGroups` traversal picks up `op: 'time'` automatically. 12 new test sections in `tests/test-uda.js` cover validators, value extraction order, every Range kind's SQL shape, DOW + time-of-day, composition placeholder count, end-to-end `handleFilterGroups` parity, SQLite throw, and validator-rejected inputs. All 58 UDA tests pass.

**Phase 2 — Client primitive + minimal picker. ✅ COMPLETE 2026-05-07.** `time` op flows through `buildUdaConfig` unchanged — `applyTableAliasToJoin` doesn't touch `value`, `mapFilterGroupCols` only rewrites `col`, and `applyPageFilters` was extended to parse the URL token (when `usePageFilters: true`) into a structured TimeFilterValue. Filter editor in `ComplexFilters.jsx` surfaces a "time filter" op only when the selected column's type passes `isTimeColumnType` (`date`/`datetime`/`timestamp`/`timestamptz` + Postgres long-form aliases). `ConditionValueInput.jsx` routes `op === 'time'` to a new `<TimePicker/>` instead of the multiselect/scalar paths. Picker ships with `PresetBar` (Today / Last hour / Last 24h / Last 7d / Last 30d / This month), a minimal `RangeRow` (custom "Last/Next [N] [unit]" editor), and a `Chips` summary strip. `useNowTick` hook (boundary-aware `setTimeout` to next minute / hour / midnight, no polling) is wired into `useDataLoader`'s `fetchKey` via `walkTreeForTickGranularity` — when a section has any clock-anchored time leaf, the tick counter mixes into the dedup key so each boundary refetches naturally. URL roundtrip for the Phase 2 token subset (`last:Nu`, `next:Nu`, `today`/`yesterday`/`tomorrow`) via `parseTimeFilterURL` + `serializeTimeFilterURL`; the TimePicker's onChange pushes serialized tokens through `updatePageStateFilters` so URL stays in sync. Browser-resolved tz default; per-leaf `tz` override unchanged from Phase 1. Build green; 58 UDA server tests still pass.

**Phase 3 — Compositions. ✅ COMPLETE 2026-05-07.** URL grammar in `dataWrapper/utils/timeFilter.js` extended to cover the full Phase 3 surface: range tokens (`last:Nu`, `next:Nu`, `this:period`, `today`/`yesterday`/`tomorrow`, `since:YYYY-MM-DD`, `before:YYYY-MM-DD`, `YYYY-MM-DD..YYYY-MM-DD`, `now`), multi-range OR via `|`, DOW tokens (`weekdays`, `weekends`, plus-separated day names like `mon+wed+fri`), time-of-day (`HH:MM-HH:MM`), and AND-composition between axes via `&`. Midnight-wrap windows (`22:00-02:00`, or any `start >= end`) are forbidden in v1 — both parser and serializer return null; the UI surfaces an inline warning instead of committing. New picker rows: `DowRow` (Weekdays/Weekends presets + 7-button toggle grid, sorted-index canonicalization) and `TimeOfDayRow` (two `<input type="time">` controls with start<end validation, partial state held mid-edit). `Chips` rewrote to one removable chip per active axis (range / dow / timeOfDay) instead of a single combined chip. `TimePicker` hosts all four rows. 52 URL parse/serialize/roundtrip assertions verified end-to-end. Server already supported DOW + time-of-day from Phase 1, so no server-side changes were needed; Postgres `EXTRACT(DOW FROM …)` and `($col AT TIME ZONE $tz)::time` predicates light up automatically when the structured value reaches `buildLeafSQL`. Build green.

**Phase 4 — `instant` + `compareEnd`. ✅ COMPLETE 2026-05-07** (client primitive; WCDB schedule migration is a separate site-side follow-up). New `InstantRow.jsx` exposes a "Currently happening" toggle that sets `value.ranges = [{kind:'instant', at:'now'}]` and surfaces a column-select for `value.compareEnd`. Eligible end columns are filtered to `isTimeColumnType` and exclude the leaf's start column. Toggling on is destructive to the Range axis (instant doesn't compose meaningfully with relative/absolute ranges); DOW + time-of-day stay untouched so "currently airing on weekend evenings" still works. Toggling off clears both `ranges` and `compareEnd`. `TimePicker` accepts `columns` and `startCol` props; `ConditionValueInput` passes `columns={columns}` and `startCol={node.col}` through. URL grammar adds an `end:colname` axis token (allow-listed by `^[A-Za-z_][A-Za-z0-9_]*$`, mirroring the server-side validator); canonical serialize order is range → dow → timeOfDay → compareEnd. `humanLabel` shows "active vs `<col>`" instead of opaque "now" when an instant range pairs with a compareEnd. 25 Phase 4 parse/serialize/roundtrip/humanLabel assertions pass; Phase 3 sanity assertions still green; build clean. Server-side support already lived in `dms-server/src/routes/uda/time-filter.js` from Phase 1 (`buildRangeClause` case `'instant'` emits `(col <= now() AND compareEndCol > now())`), so no server changes were needed.

**Phase 5 — Author/viewer axis exposure. ✅ COMPLETE 2026-05-07.** TimeFilterValue gained an optional `exposedAxes: { range, dow, timeOfDay }` map. Absent ⇒ all axes user-controllable (back-compat with Phase 2-4 leaves); present ⇒ only truthy keys round-trip through the URL. `serializeTimeFilterURL` filters axes by exposure (compareEnd belongs to the range axis); a new `mergeUrlOntoExposedAxes(persisted, parsed)` helper merges URL-parsed values onto exposed axes only, leaving locked axes at the author-set values. `applyPageFilters` in `buildUdaConfig.js` calls the merger instead of wholesale-replacing. `TimePicker` accepts a `mode` prop (`'author'` | `'viewer'`, default `'author'`); in author mode, a footer with three checkboxes (Range / Day / Time of day) toggles exposure; in viewer mode, rows whose axis is locked are hidden entirely while the locked-axis values still apply server-side. `handleChange`'s "all-cleared" branch preserves `exposedAxes` so an author's exposure setup isn't lost when they clear all axes. 21 new URL/merge assertions pass; back-compat with Phase 2-4 still green; build clean.

**Phase 6 — ClickHouse predicate emitters. ✅ COMPLETE 2026-05-07** (predicate emitters; CH dispatch path migration deferred). New `buildTimeFilterCH(value, col, isDms)` in `dms-server/src/routes/uda/time-filter.js` emits CH-flavored SQL: `now() ± INTERVAL N unit` for relative; `toStartOfHour/Day/Week/Month/Quarter/Year` (wrapped in `toTimezone`) for current_period; `toStartOfDay(toTimezone(...))` + INTERVAL offsets for named; `parseDateTimeBestEffort(...)` literals for absolute; `(col <= now() AND compareEndCol > now())` for instant + compareEnd. DOW translates via `toDayOfWeek(...) % 7` so the on-wire 0=Sun..6=Sat indices match the PG dialect. Time-of-day uses `formatDateTime(toTimezone(col, tz), '%H:%M')` with lexical comparison against zero-padded `HH:MM` literals (no separate `time` type in CH). Values are inlined after `validateTimeFilter` (allow-list) + `escapeCH` (single-quote string escape) — matches the existing `handleFiltersCH` style for the legacy CH filter path. CH refuses `isDms` columns (DMS content never lives on CH per CLAUDE.md). `buildTimeFilterSQL` dispatches on `dbType`: `'postgres'` (or undefined) keeps the parameterized PG path unchanged; `'clickhouse'` calls `buildTimeFilterCH`; `'sqlite'` still throws. 16 CH SQL shape assertions exercise every axis/range kind; all 58 existing UDA tests still pass (PG path untouched). **Deferred:** wiring this into the CH dispatch path (`simpleFilter*` in `query_sets/clickhouse.js`) — that surface still uses legacy `handleFiltersCH` and doesn't flow through `handleFilterGroups`. The CH branch here is positioning code; full integration requires migrating the CH query path to tree-based filters, which is out of scope for this task and tracked separately. The values-binding asymmetry (PG pushes via `extractTimeFilterValues`; CH pushes nothing because values are inlined) is documented in the dispatch comment and will need a `dbType` argument in the value-extraction path when CH migrates.

## Cleanup — TimePicker subtree theming

The TimePicker subtree's seven JSX files (TimePicker, PresetBar, RangeRow, DowRow, TimeOfDayRow, InstantRow, Chips) shipped with inline Tailwind during Phases 2-5. After the new theming guidance landed in `packages/dms/CLAUDE.md` ("All markup must be styled through the theme"), the subtree was pulled into a sibling `timePicker.theme.js` (≈40 named keys: `wrapper`, `sectionDivider`, `presetButton`, `rangeContainer`, `rowHeader`/`rowLabel`/`rowSummary`/`rowEditor` shared across rows, `chip`*, `exposureFooter`, etc.). The theme is registered in `patterns/page/defaultTheme.js` under the `timePicker` key. A small `useTimePickerTheme.js` hook centralizes `getComponentTheme(themeFromContext, 'timePicker')` + local-default-spread so every row gets the same merged map without 7× boilerplate. All `className="..."` strings replaced by `t.<key>` lookups. Build clean post-cleanup.

## Files Requiring Changes

### dataWrapper (client)

- [ ] `dataWrapper/buildUdaConfig.js` — pass `op: 'time'` leaves through unchanged (the structured value is consumed server-side); resolve `now`/`relative`/`instant` anchors at build time so refetch keys are stable; ensure `tz` cascade (leaf → pattern → browser).
- [ ] `dataWrapper/components/filters/RenderFilters.jsx`, `RenderFilterValueSelector.jsx` — register the new op for `date`/`timestamp` columns; route to `TimePicker`. Existing static-op editors untouched.
- [ ] `dataWrapper/components/filters/TimePicker/` (new) — `TimePicker.jsx`, `PresetBar.jsx`, `RangeRow.jsx`, `DowRow.jsx`, `TimeOfDayRow.jsx`, `Chips.jsx`. Author-mode `exposedAxes` toggles + viewer-mode rendering live here.
- [ ] `dataWrapper/utils/timeFilter.js` (new) — pure helpers: `parseTimeFilterURL`, `serializeTimeFilterURL`, `resolveAnchors(value, now, tz)`, `requiredTickGranularity(value)`, `humanLabel(value)` for empty-state interpolation, `validateTimeFilter(value)`.
- [ ] `dataWrapper/useDataLoader.js` (or `useDataSource.js`) — wire `useNowTick({ resolutions, tz })` and feed its counter into the existing fetch dep list.
- [ ] `dataWrapper/hooks/useNowTick.js` (new) — boundary-aware tick hook. Single `setTimeout` to next boundary; no polling.
- [ ] `dataWrapper/schema.js` — extend the persisted leaf shape with the optional `time`-op fields so the dataWrapper save path round-trips them cleanly.

### Page state plumbing

- [ ] `patterns/page/pages/view.jsx` — extend the URL writer/reader to handle the time-filter encoding alongside existing search params; `useSearchParams: true` time leaves write/read through this path.
- [ ] `patterns/page/pages/_utils/index.js` — `updatePageStateFiltersOnSearchParamChange` extension.

### UDA (server)

- [ ] `dms-server/src/routes/uda/utils.js` — extend `handleFilters` with `op === 'time'` branch. Implements range/DOW/time-of-day predicate templates; allow-list validation; `tz` parameter binding; `compareEnd` plumbing.
- [ ] `dms-server/src/routes/uda/query_sets/postgres.js` — predicate emitters for each axis (factor out of `handleFilters` so the CH branch can mirror).
- [ ] `dms-server/src/routes/uda/query_sets/clickhouse.js` — CH mirror of the predicate emitters (Phase 6).
- [ ] `dms-server/test/uda-filters.test.js` (or current test file) — unit tests for each axis × dialect × tz cascade.

### Source metadata

- [ ] No schema migration required — `metadata.columns[i].type` already carries Postgres type info. UDA `getEssentials` exposes it. Confirm the type is reachable at the filter-editor mount and use it to gate the "Time filter" op.

## Testing Checklist

Server (Phase 1):

- [ ] `relative` past + future across all units (minute/hour/day/week/month/year). Single + multiple counts.
- [ ] `current_period` for each period; verify boundary crossing (the second after midnight changes "today").
- [ ] `named` (today/yesterday/tomorrow) — same boundary-crossing test.
- [ ] `absolute` with both bounds, with from-only, with to-only.
- [ ] `instant` with `compareEnd` — point-in-range straddle case.
- [ ] DOW with each individual day, weekdays preset, weekends preset, all-7 (= no constraint), out-of-range index rejected.
- [ ] Time-of-day with `[09:00, 17:00)` boundary semantics; midnight wrap (`[22:00, 02:00)` ranges) — open question: do we forbid this or split into two ranges? Document the call.
- [ ] Composition: range + DOW; range + DOW + time-of-day. Multiple ranges OR'd inside.
- [ ] `tz` cascade — leaf-set, leaf-unset (falls through), pattern default applied, DST transition day for `relative` (durations exact) vs `current_period` (calendar-correct).
- [ ] Allow-list rejection: unknown range kind, DOW=7, malformed `HH:MM`, malformed tz string.
- [ ] PostgreSQL emits the expected predicates; matching ClickHouse predicates emit equivalent results on a fixture (Phase 6).

Client (Phases 2–5):

- [ ] Time filter op only offered for `date`/`timestamp` columns (other column types: option absent from the editor).
- [ ] Preset click sets just the Range axis; clears any prior custom Range entries; chip strip updates.
- [ ] Custom relative editor accepts arbitrary unit + count; saves through.
- [ ] Absolute range with calendar popover saves both bounds (Phase 3).
- [ ] DOW grid + presets, time-of-day inputs (Phase 3).
- [ ] URL encoding: presets, custom relative, absolute, DOW, time-of-day, compositions, multi-range OR. Roundtrip URL ↔ editor.
- [ ] `useNowTick` resolutions: minute filter ticks at the next minute; midnight filter ticks at the next local-midnight; multi-resolution filter ticks at the finest. No polling visible in network tab.
- [ ] Author-mode `exposedAxes` toggles; viewer-mode hides locked axes; URL only round-trips exposed axes (Phase 5).
- [ ] Schedule pattern with a `compareEnd` time leaf renders "show airing right now"; a minute later, when the show transition crosses, the section refetches and the new row appears (Phase 4).
- [ ] DST transition: `last 24 hours` on a fall-back day returns rows from exactly 24 hours ago in UTC, not 23 or 25.
- [ ] Empty state interpolates the human-readable label (`"No events in the last 7 days"`).

## Open Questions

- **Midnight-wrap time-of-day windows** (`[22:00, 02:00)`). Forbid in the UI and ask users to split into two leaves, or allow and emit two ORed predicates server-side? Suggest: forbid in v1, revisit if real demand appears.
- **URL encoding format** — compact textual (`last:7d&weekdays`) vs structured JSON (`?time=eyJyYW5nZXM…`). Textual is more shareable + readable; JSON is simpler to parse. Suggest textual; revisit if the parser grows hairy.
- **Calculated columns referencing `now`** for derived booleans like `is_active`. Probably yes long-term, out of scope for this task.
- **Per-source default timezone** as a column-level metadata field, beyond the pattern-level default? Defer; pattern + leaf is enough.
- **SSR clock skew.** Server-rendered `now` differs from the client's `now` by ms to seconds. For minute-resolution invisible; for second-resolution there's a brief blink on hydration. Document; revisit only if a second-resolution case appears.
- **Edit-mode preview at time T** for admins boundary-testing a `now`-anchored filter. Useful, but feature-flag-gated; not on the critical path.

## References

- Research: [research/time-based-filters.md](../../research/time-based-filters.md)
- Filter pipeline: `dataWrapper/buildUdaConfig.js:130-348, 776-1027`
- Filter UI / page-state plumbing: `dataWrapper/components/filters/RenderFilters.jsx:56-100`, `Components/RenderFilterValueSelector.jsx:99-298`
- Page-state writers: `pages/view.jsx:71-125`, `pages/_utils/index.js:455`
- UDA filter handler: `packages/dms-server/src/routes/uda/utils.js:305-348`
- Adjacent: [research/unified-column-types.md](../../research/unified-column-types.md) — broader "client column types should drive sort/filter/format" thread.
