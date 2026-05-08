# User-driven time filters in dataWrapper

Research note (not a plan-of-record). The original trigger was the WCDB home page's schedule card needing to surface only the show airing **right now**, but that's one corner of a much broader problem: the dataWrapper filter pipeline has no first-class concept of time. End users can't pick "last 30 days" on a logs page; admins can't set "weekends only" on an events card; sections can't compose "last 7 days, weekday afternoons" without writing custom SQL. This note reframes the design space around general user-driven time filtering, with "now" injection as one capability among several.

## Goal

Give end users (and admins authoring sections) one composable filter primitive that can express:

- **Relative range from now** — last 30 days, last 7 days, last 1/3/24 hours, this week, this month, today, yesterday.
- **Absolute date/time range** — from `2024-01-01` to `2024-06-30`, or open-ended (`since 2024-01-01`, `before 2026-01-01`).
- **Day-of-week restriction** — weekdays only, weekends only, just Saturdays + Sundays, all days except Wednesday.
- **Time-of-day window** — between 9:00 AM and 5:00 PM regardless of date.
- **Compositions** of the above — "last 7 days, weekends only, between 8 PM and midnight".
- **"Now" point-in-range tests** for stored start/end columns — the schedule "show airing right now" case.

The user is comfortable stipulating that the column being filtered is a real `date` or `timestamp` type. That's a load-bearing simplification: server-side cast just works, lexical-comparison footguns disappear, and the UDA generator can emit native Postgres `date_trunc` / `EXTRACT(DOW FROM …)` / `AT TIME ZONE` predicates without wrapping every value in a `to_timestamp()` first. Existing string-time columns (the WCDB schedule's `"6:00PM"` shape) are an *adjacent* problem solved by storage normalization or per-section calculated columns; they don't need to be on the critical path here.

The two genuinely hard parts are:

1. **A primitive shape that compresses these intents into one structured filter** so the UDA SQL generator and the editor UI both have a single thing to consume.
2. **A user input surface** that exposes all of this without becoming a settings dialog. Many possible knobs × small visible footprint = the design challenge.

## The forcing problems

Two concrete sections drive the requirements:

**Logs / activity feed.** Users want to drop into a logs page and immediately filter to "last hour", "last 24 hours", "today", "last 7 days", or "last 30 days". They want a custom relative range for diagnostics ("last 90 minutes"). They occasionally want an absolute window ("November 2024"). The filter is *user-controllable* — section authors don't fix it ahead of time, they expose it.

**Schedule card (WCDB).** A row represents a recurring weekly slot with `start_day`, `start_time`, `end_day`, `end_time`. The home page wants the row that's airing *right now*. That's the point-in-range test: find the row whose `(start_day, start_time) <= now < (end_day, end_time)`. The filter is *section-fixed* — admins don't set "now"; the section evaluates it on every clock tick.

These look different but share the same primitive: an expression of time intent that resolves to SQL. The logs case wants user choice; the schedule case wants automatic injection. Both compile to the same shape.

## Current filter pipeline (background)

Files under `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/`.

**Storage.** Two coexisting representations:

- *Per-column legacy filters* — `column.filters: [{type, operation, values, usePageFilters?, searchParamKey?, …}]`. `extractLegacyColumnFilters` (`buildUdaConfig.js:356-407`) flattens these to `{filter, exclude, gt, gte, lt, lte, like}` per-column maps.
- *Top-level filter tree* — `state.filters = { op: 'AND'|'OR', groups: [...] }` with leaves `{col, op, value, usePageFilters?, searchParamKey?}`. Built/edited in `ComplexFilters.jsx`.

**Runtime** (`buildUdaConfig.js:776+`):

1. `applyTableAliasToJoin` — alias-prefixes `col` for join queries.
2. `applyPageFilters` — for each leaf with `usePageFilters: true`, replaces `value` with `pageFilters[searchParamKey || col]`.
3. `extractNormalFiltersFromGroups` — peels per-column "normal" filters out of the tree.
4. `mapFilterGroupCols` — rewrites `col` to server-side ref form (`data->>'name' as name` for DMS) and translates `multiselect` ops to `array_contains` / `array_not_contains`.
5. `operationToExpressionMap` translates leaf ops to SQL: `filter→IN`, `exclude→NOT IN`, `gt/gte/lt/lte→>/>=/</<=`, `like→%…%`.
6. The compiled `options` blob feeds UDA, which emits SQL.

**Page state — the existing "external" feed.** `pageState.filters: Array<{searchKey, values, useSearchParams, type?}>` is written by URL changes (`view.jsx:63-65`), in-section filter UIs (`RenderFilters.jsx:81-99`), and section "providers" (Card/Spreadsheet hover publishes via `setActionParam`). All values are static strings/arrays — nothing produces clock-derived values today.

## Why user time filters don't fit today

Five concrete gaps:

1. **No structured time op.** Every leaf is `{col, op: 'gt'|'lte'|...}` against a scalar value. There's no way to express "this column is within last 7 days" as a single leaf — the user would have to construct two leaves (`gte` + `lte`) and the pipeline has nowhere to look up "now" for either bound.
2. **No composition primitive for time.** "Last 7 days AND weekends only" is two semantically distinct constraints (range + DOW set). The current tree can AND two leaves, but DOW filtering is `EXTRACT(DOW FROM …)` — there's no leaf op that emits that. A user trying to construct this today gets stuck at "I want to filter on a function of the column, not the column itself".
3. **No clock-derived values.** `usePageFilters` reads the URL; the URL only carries what something else wrote. There's no `valueSource: 'now'` or `valueSource: 'now - 7d'`.
4. **No re-trigger on time passing.** Even if a value were injected once at mount, the section wouldn't refetch when the wall clock rolls past the next minute / hour / day boundary. For "last 30 days" the boundary moves every midnight; for "last hour" every minute.
5. **No type awareness.** `gt`/`lt` on a `text` column generates lexical SQL comparison. Stipulating the column is `date`/`timestamp` removes this gap, but the generator still has to *know* it's safe to emit `column AT TIME ZONE $tz` instead of `data->>'col'`. UDA's column metadata can carry this; today the filter pipeline doesn't consult it.

The unified-column-types research note ([unified-column-types.md](./unified-column-types.md)) covers the type-awareness gap from a different angle. Time filters need that work to land or to live alongside it.

## The operation taxonomy

Every user time intent decomposes into at most three orthogonal axes against a single date/datetime column:

| Axis | What it constrains | Examples |
|---|---|---|
| **Range** | The continuous interval the value falls inside | last 7 days; from 2024-01-01 to 2024-06-30; this month; since the start of last quarter; before today |
| **Day-of-week** | Which weekday(s) of the value's local date | weekdays only; weekends only; Saturdays |
| **Time-of-day** | Which clock-time window of the value's local time | between 9:00 AM and 5:00 PM; before noon |

Compositions are AND across axes. "Last 7 days, weekends only, between 8 PM and midnight" = `range:last_7d AND dow:[Sat,Sun] AND timeOfDay:[20:00, 24:00)`.

A single column can carry multiple disjoint **range entries** OR'd together (e.g. "April or October"), so the range axis is a list, not a single value:

```
ranges: [
  { kind: 'relative', unit: 'day', count: 7, anchor: 'now' },
  { kind: 'absolute', from: '2024-04-01', to: '2024-04-30' }
]
```

A handful of preset ranges shows up over and over and deserves explicit kinds rather than a generic "from/to":

| kind | shape | examples |
|---|---|---|
| `relative` | `{unit, count, direction: 'past'|'future', anchor: 'now'}` | last 30 days, next 7 days, last 1 hour |
| `current_period` | `{period: 'hour'|'day'|'week'|'month'|'quarter'|'year'}` | this week, this month |
| `named` | `{name: 'today'|'yesterday'|'tomorrow'}` | today |
| `absolute` | `{from?, to?}` (either bound optional → open-ended) | from 2024-01-01 to 2024-06-30; before 2026-01-01 |
| `instant` | `{at: 'now'}` | the schedule's "show airing right now" — point-in-range test |

`instant` is the key piece for the schedule case. With it, "find the row airing now" becomes `range: [{kind: 'instant', at: 'now'}]` against a column with both bounds (or a pair of columns interpreted as start/end). See "Point-in-range" below.

The DOW and time-of-day axes are simpler — a small set of weekdays and a `[start, end)` clock-time pair respectively.

## Filter primitive shape

The smallest extension that captures the taxonomy is a new leaf op `time` whose value is a structured object:

```js
{
  col: 'event_at',                  // a date or timestamp column
  op: 'time',                       // new
  value: {
    ranges?: Array<RangeEntry>,     // OR'd together; omitted = no range constraint
    dow?: number[],                 // 0..6 (Sun=0); omitted = all days
    timeOfDay?: { start: 'HH:MM', end: 'HH:MM' },  // omitted = full day
    tz?: 'America/New_York',        // omitted = pattern default → browser default
    compareEnd?: 'col-name',        // for point-in-range; the row's end column
  },
  usePageFilters?: boolean,         // existing channel; values come from pageState
  searchParamKey?: string,
}
```

Where `RangeEntry` is one of the kinds in the taxonomy table.

A few properties of this shape that matter:

- **One leaf, one column, all axes.** The user expresses the full intent in a single editor row instead of stitching two `gte`/`lte` leaves with a magic AND. The UI can render the three axes as three controls inside one card.
- **Disjoint ranges trivially OR.** "April or October" is two entries in the array; the SQL generator emits `(range1) OR (range2)`. DOW + time-of-day still AND across the union.
- **`compareEnd` enables point-in-range.** When set, the leaf evaluates `<col> <= now AND <compareEnd> > now` instead of `now BETWEEN col AND compareEnd`-on-one-column. This is the schedule case: `col: start_at, compareEnd: end_at, ranges: [{kind:'instant', at:'now'}]`.
- **`tz` is per-leaf with pattern-level default.** WCDB station-clock case sets `tz: 'America/New_York'`; default is the browser's resolved zone, with a pattern-level override for site-configured timezones.
- **`usePageFilters` still applies.** The leaf's structured value can come from page state (URL params) — see "Surface" below for the URL encoding sketch.
- **`valueSource: 'now'` from the prior draft folds in.** The previous note's "compute the value at build time" mechanism becomes "the `relative` and `instant` range kinds anchor to `now` at build time". One mechanism, multiple expressions.

A `static` filter (existing `gt`/`lt`/etc) on the same column should keep working — the new `time` op is additive, not a replacement. Migration is opt-in: a section author opens the filter, picks "time filter" instead of "greater than", builds the new structure.

### URL / pageState encoding

For user-controllable filters that survive page reloads + sharing, the `time` value needs a URL form. Suggest a compact textual encoding (similar in spirit to Kibana's `now-7d`):

```
last:7d                          → relative, past, 7 days
last:1h                          → relative, past, 1 hour
this:week                        → current_period, week
today                            → named, today
since:2024-01-01                 → absolute, from-only
2024-01-01..2024-06-30           → absolute, from + to
weekdays                         → dow:[1..5]
weekends                         → dow:[0,6]
sat+sun                          → dow:[6,0]
9:00-17:00                       → timeOfDay
last:7d&weekdays&9:00-17:00      → composition (AND-joined with &)
last:7d|2024-04                  → multiple ranges (OR-joined with |)
```

Parser is small and deterministic; the editor UI roundtrips through this string so URL changes update the editor and vice versa. (Open question: stick with structured JSON in the URL instead, simpler but uglier.)

## Server translation

Each compiled time filter becomes one SQL predicate, ANDed/ORed by the UDA generator at the same level as the existing per-leaf SQL. The work happens in UDA's `handleFilters` (server-side, `routes/uda/utils.js:305-348` per the unified-column-types research note).

**Range:**

```sql
-- relative: last 7 days
event_at >= now() - interval '7 days' AND event_at <= now()
-- current_period: this week  (Postgres date_trunc)
event_at >= date_trunc('week', now() AT TIME ZONE $tz)
  AND event_at < date_trunc('week', now() AT TIME ZONE $tz) + interval '1 week'
-- named: today
event_at >= date_trunc('day', now() AT TIME ZONE $tz)
  AND event_at < date_trunc('day', now() AT TIME ZONE $tz) + interval '1 day'
-- absolute
event_at >= $1 AND event_at <= $2
-- instant point-in-range (with compareEnd)
event_at <= now() AND end_at > now()
```

**DOW:**

```sql
EXTRACT(DOW FROM event_at AT TIME ZONE $tz)::int IN (0, 6)
```

**Time-of-day:**

```sql
(event_at AT TIME ZONE $tz)::time >= '09:00'::time
  AND (event_at AT TIME ZONE $tz)::time < '17:00'::time
```

**Composition:** all three predicates ANDed; multiple ranges ORed inside the range bucket then ANDed with DOW + time-of-day.

Two server-side concerns:

- **Allow-list.** The set of `RangeEntry.kind` values, DOW indices, and timeOfDay format must be strictly validated. No raw expression injection. The server accepts only the named shapes from the taxonomy.
- **`tz` parameterization.** Every clause that depends on calendar boundaries takes a `$tz` IANA name as a parameter. UDA already parameterizes filter values; this is a new bind slot per leaf. Default falls through to a session/server timezone if the leaf doesn't specify.

ClickHouse path (`uda/query_sets/clickhouse.js`) needs the same translations with CH-flavored functions: `now()`, `toStartOfWeek`, `toDayOfWeek`, etc. Identical structure, different syntax tree.

## Live re-trigger

Filters anchored to `now` (any `relative`, `current_period`, `named`, `instant` kind) need to invalidate the section when the clock crosses the next boundary they depend on. Granularity per kind:

| kind | natural tick |
|---|---|
| `relative` with `unit: 'minute'` | every minute |
| `relative` with `unit: 'hour'` | every hour |
| `relative` with `unit: 'day'`, `current_period: 'day'`, `named: 'today'` | midnight (in `tz`) |
| `current_period: 'week'`/`'month'`/`'quarter'`/`'year'` | start-of-week/month/quarter/year midnight |
| `instant: now` | resolution chosen by section (default: minute) |

A `useNowTick({ resolutions, tz })` hook computes the *next* such boundary, sets a single `setTimeout` to fire at it, then re-resolves. The hook returns a counter that participates in `useDataLoader`'s fetch-deps list — a tick triggers refetch through the same path as a column add. No polling.

For a section with multiple time filters at different granularities, the hook aggregates to the finest required tick.

## UX surface (the hard part)

The taxonomy gives us a lot of expressive power; the UI has to expose it without overwhelming. Three observations frame the design:

1. **Most users want one of ~7 presets.** Today, yesterday, last hour, last 24 hours, last 7 days, last 30 days, this month. Anything that makes those one click is a win.
2. **Compositions are admin- or power-user territory.** Most people don't combine DOW + time-of-day; the few who do are doing it deliberately and tolerate a couple of extra clicks.
3. **Discoverability vs. footprint.** The filter UI sits in section settings, often in a popover. It can't be a multi-page wizard. But it has to surface that DOW and time-of-day are *available* without forcing them into the user's face.

### Three layout candidates

**Option U1 — Tabbed picker.** A popover with three tabs: `Range | Day | Time`. Most users land on Range, pick a preset, close. Power users open the other tabs to add constraints. Active constraints show as small chips below the tabs ("last 7 days · weekends · 9 AM–5 PM").

```
┌──────────────────────────────────────────┐
│ [ Range ] [ Day ] [ Time ]               │
│                                          │
│  ◉ Today          ○ This week            │
│  ○ Yesterday      ○ This month           │
│  ○ Last hour      ○ This year            │
│  ○ Last 24 hours  ○ Custom relative…     │
│  ○ Last 7 days    ○ Custom absolute…     │
│  ○ Last 30 days                          │
│                                          │
│  Timezone: America/New_York [edit]       │
└──────────────────────────────────────────┘

Below the popover (when collapsed):
  ⏱ last 7 days · ✕ remove
  📅 weekends    · ✕ remove
  🕐 9 AM – 5 PM · ✕ remove
```

Pros: each tab is small and focused; presets dominate the Range tab; the chip strip makes compositions visible. Cons: hidden tabs reduce discoverability of DOW/time-of-day for first-time users.

**Option U2 — Stacked builder rows.** All three axes visible at once, each a single editable row. Default rows say "Any" and don't constrain.

```
┌───────────────────────────────────────────────┐
│ Range:  ▼ last 7 days                          │
│ Day:    ▼ Any                                  │
│ Time:   ▼ Any                                  │
│                                                │
│ Timezone: America/New_York [edit]              │
└───────────────────────────────────────────────┘
```

Pros: zero discoverability cost; the user sees there are three axes immediately. Cons: vertical real-estate; less elegant for the 90% case of "just pick a preset".

**Option U3 — Preset bar + advanced disclosure.** A horizontal preset bar (one click resolves the common cases), with an "Advanced…" link that expands into the U1 or U2 layout for compositions and absolute ranges.

```
┌─────────────────────────────────────────────────────┐
│ [Today] [Last hour] [Last 24h] [Last 7d] [Last 30d] │
│ [Custom range…] [Day of week…] [Time of day…]        │
└─────────────────────────────────────────────────────┘
```

Pros: fastest for the common case; presets are buttons, not menu items. Cons: button bar gets visually heavy with 8+ presets; secondary axes still need a place.

### Recommendation

**Hybrid: U3 wraps U1.** A preset row at the top covers the 90% case in one click. Below it, three labeled rows (`Range / Day / Time`) for explicit composition. Each row defaults to "Any" if not set. Custom relative ranges use a small inline editor (`Last [7] [days]`); absolute ranges open a small calendar; DOW is a 7-checkbox grid; time-of-day is two `HH:MM` inputs with a slider variant.

Active constraints render as a chip strip outside the picker so the user sees the composed filter at a glance after they close it.

The preset bar resolves to setting *just* the Range axis; selecting a preset clears any custom Range entries (with a "+ Add another range" affordance for OR'd disjoint windows).

### Section author vs. end user

Two consumers of the same UI, different defaults:

- **Section author (admin)** sets filter shape + a default range, optionally publishes the filter to URL params (`useSearchParams: true`) so end-users can change it. Author can also fix axes (e.g. always weekends, end users can only pick the Range).
- **End user (viewer)** sees only the axes the author exposed. If the author published the Range axis but locked DOW + time-of-day, the user sees just the preset row + custom range editor — the other two rows are hidden.

This is a per-axis "exposed in view mode?" toggle on the leaf, similar to existing `useSearchParams` but per-axis instead of per-leaf.

### Adjacent UI mechanics

- **Quick-toggle from the URL.** A `?range=last:7d&dow=weekends` query param round-trips with the editor — bookmarkable, shareable.
- **"Live" indicator.** When a filter resolves to `now`, the section header gets a small ⏱ "live" badge so the user knows the data refreshes on the clock.
- **Empty / boundary states.** "Last 7 days" with no rows in range should say "No events in the last 7 days" rather than the generic empty-state. The picker can publish a human-readable label (`"last 7 days"`) the section's empty-state template can interpolate.

## Storage normalization (orthogonal, deferred)

The original note's Option D — write sortable integer siblings (`*_minutes`, `*_idx`, `*_epoch`) at ingest — is still the right call for sources that store time as text (the WCDB schedule). But:

- The user's logs / events case already has `date`/`timestamp` columns; nothing to migrate.
- The schedule case can ship today by either (a) running a one-time migration to normalize `start_time` → `start_time_minutes` and `start_day` → `start_day_idx`, or (b) declaring per-section calculated columns in the dataWrapper that compute those at query time. Either is fine.

This note recommends running the ingest migration when the schedule pattern is rebuilt for the unified-column-types refactor; until then a calculated column unblocks the home page card.

The general principle stays: any new source whose columns matter for sorting/filtering should be `date`/`timestamp` at storage. The `time` filter primitive presumes that.

## Recommendation

1. **Ship the `time` op.** New leaf op with the structured shape above. Server translation in UDA `handleFilters` for the three-axis composition + the `instant` point-in-range case. `useNowTick` hook for live re-trigger. Allow-listed `tz` parameter per leaf.
2. **Build the hybrid U3+U1 picker.** Preset bar for the 90% case; labeled axis rows for compositions; chip strip outside the popover for active constraints. Per-axis "exposed to viewers" toggle for section authors.
3. **Ship a small URL encoding** (`last:7d&weekdays&9:00-17:00`) so user-controllable time filters survive reloads and sharing.
4. **Stipulate `date`/`timestamp` storage** for new sources whose columns are filterable; document the storage convention; defer migration of WCDB schedule (use a calculated column or a one-time data migration).
5. **Skip the `valueSource: 'now'` shape from the prior draft.** Folded into the `time` op's range kinds. Single mechanism, simpler surface.

The schedule "show airing now" card falls out as a special case: a `time` leaf with `compareEnd: 'end_at'` and `ranges: [{kind: 'instant', at: 'now'}]`. No special-case code needed.

## Files this would touch

**Filter shape + builder (client):**

- `dataWrapper/buildUdaConfig.js` — add `time` op handling: pass the structured value through to UDA; resolve `instant` / relative anchors at build time so refetch keys are stable.
- `dataWrapper/components/filters/RenderFilters.jsx`, `RenderFilterValueSelector.jsx` — host the new picker UI; keep existing static-op pickers untouched.
- New: `dataWrapper/components/filters/TimePicker/` — the U3+U1 hybrid component, broken into `PresetBar`, `RangeRow`, `DowRow`, `TimeOfDayRow`, `Chips`.
- `dataWrapper/useDataLoader.js` (or `useDataSource.js`) — wire `useNowTick({ resolutions, tz })` so its counter participates in fetch deps.
- New: `dataWrapper/utils/timeFilter.js` — pure helpers: `parseTimeFilterURL`, `serializeTimeFilterURL`, `resolveAnchors(value, now, tz)`, `requiredTickGranularity(value)`.

**SQL generation (server):**

- `dms-server/src/routes/uda/utils.js` — `handleFilters` extension for `op === 'time'`. Postgres branch first; ClickHouse branch follows with the same structure.
- `dms-server/src/routes/uda/query_sets/clickhouse.js` — CH translations of the predicate set.

**Page-state plumbing:**

- `patterns/page/pages/view.jsx` — URL writer/reader for the new encoding alongside the existing search-param logic.
- `patterns/page/pages/_utils/index.js` — `updatePageStateFiltersOnSearchParamChange` extension.

## Open questions

- **Timezone defaulting.** Browser-local vs station-configured vs site-configured? Suggest: pattern-level default (`pattern.data.timezone`), per-leaf override, fall through to browser if neither set. Document the cascade.
- **DST + boundary semantics.** "Last 24 hours" on a DST transition day: 23 or 25 hours? Suggest: anchor on UTC instant (`now - 24h`) so duration is exact regardless of local offset; document the edge case.
- **"This month" semantics on the 31st.** Treats month as `[start_of_month, start_of_next_month)`. Standard, but spell it out.
- **Multiple time filters on different columns.** A section might filter on `created_at` (logs window) AND `event_at` (event window). Two separate `time` leaves, each on its own column — supported by the shape, just confirm the UI handles it (probably one `TimePicker` instance per column rendered in the filter list).
- **Calculated columns referencing `now`.** Should a calculated column be allowed to express `is_active = (now BETWEEN start_at AND end_at)` so the section just filters on that boolean? Folds the schedule case into a derived column. Probably yes long-term; out of scope for the first cut.
- **Edit-mode preview of "now".** Admin authoring a `now`-anchored filter wants to verify boundary cases ("what does 'last 7 days' evaluate to right now? what about at 11:55 PM?"). Suggest: an admin-only "preview at time T" knob behind a feature flag. Not on the critical path.
- **SSR.** Server-rendered `now` differs from the client's `now` by ~ms to seconds. For minute-resolution filters, invisible. For second-resolution (rare), the first client tick might re-resolve and refetch — accept it, or stamp the SSR time and skip the first tick. Document and revisit if a second-resolution case appears.
- **Caching.** Each clock tick invalidates the cache for the affected section. Server-side response cache budget should tolerate this — usually fine for minute-resolution but worth confirming for high-traffic logs pages.
- **URL encoding choice.** Compact textual (`last:7d&weekdays`) vs structured JSON. Suggest textual for shareability / readability; revisit if the parser grows hairy.

## References

- Filter pipeline: `dataWrapper/buildUdaConfig.js:130-348, 776-1027`
- Filter UI / page-state plumbing: `dataWrapper/components/filters/RenderFilters.jsx:56-100`, `Components/RenderFilterValueSelector.jsx:99-298`
- Page-state writers: `pages/view.jsx:71-125`, `pages/_utils/index.js:455`
- Adjacent: [unified-column-types.md](./unified-column-types.md) — the broader "client column types should drive sort/filter/format behavior" thread that time filters share a root with.
- Inspiration: Datadog / Grafana time pickers (preset bar + custom range), Kibana relative time format (`now-7d`), Linear's date filters (relative + absolute toggle).
