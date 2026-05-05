# Time-based filter values in dataWrapper

Research note (not a plan-of-record). Triggered by the WCDB schedule pattern: the home page's schedule card needs to surface only the show that's airing **right now** — i.e., the row where `start_day` matches today's day-of-week, `start_time <= NOW < end_time`. The current dataWrapper filter pipeline has no way to express "now", and the WCDB schedule's stored data shape (12-hour text, full English day names) makes naive comparison wrong even if a "now" injection existed.

This note inventories the current filter pipeline, names the gaps, and sketches the design space for a generalizable "current-time" filter mechanism.

## The forcing problem

WCDB DJs source v2 has a schedule view (`source_id: 1957812`, view 1957813) where each row is a recurring weekly slot:

| column | observed values |
|---|---|
| `start_day` | `"Monday"`, `"Tuesday"`, …, `"Sunday"` (full English name; some empty) |
| `start_time` | `"10:00AM"`, `"6:00PM"` (12-hour text; some empty) |
| `end_day` | same shape as `start_day` |
| `end_time` | same shape as `start_time` |

The home page wants the section's filter to be roughly:

```
start_day = <today_dow_name>
AND start_time <= <current_local_time>
AND end_time   >  <current_local_time>
```

Two distinct problems:

1. **No "now" injection.** Filter values today are static (set in admin) or pulled from page-state filters (which are URL-driven, not clock-driven).
2. **Lexical comparison won't work on these strings.** `"10:00AM"` < `"6:00PM"` is true because `'1' < '6'`, and `"12:00PM"` > `"6:00PM"` is also true alphabetically — wrong both ways. Even if a "now" injection existed, you couldn't drop `start_time <= "<now>"` against this storage form.

A real solution has to address both — either at the filter layer (interpret + transform values), at the storage layer (normalize ingest), or at both.

## Current filter pipeline

The dataWrapper filter system has two coexisting representations and a runtime resolver. Files are all under `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/`.

### Storage shapes

**Per-column filter (legacy):** every column may carry a `filters` array of operation entries.

```js
column.filters = [
  {
    type: 'internal' | 'external',
    operation: 'filter' | 'exclude' | 'like' | 'gt' | 'gte' | 'lt' | 'lte',
    values: any[],                  // currently always a static literal array
    usePageFilters?: boolean,       // if true, value pulled from pageState
    searchParamKey?: string,        // page-state lookup key
    isMulti?: boolean,
    fn?: 'sum' | 'count' | 'max' | 'list',
    display?: 'expanded' | 'tabular',
  },
  // …
]
```

`extractLegacyColumnFilters(columns)` (`buildUdaConfig.js:356-407`) walks these, drops invalid entries, and produces a flat per-operation map: `{filter: {colName: values}, exclude: {…}, gt: {colName: val}, like: {…}}`.

**Top-level filter tree (current):** `state.filters = { op: 'AND'|'OR', groups: [...] }` where each leaf is `{ col, op, value, usePageFilters?, searchParamKey? }` and each group recurses. Built/edited in `ComplexFilters.jsx`. Carried through unchanged into `buildUdaConfig`.

### Runtime pipeline (`buildUdaConfig.js:776-…`)

1. `applyTableAliasToJoin(filterTree, …)` — prefixes `col` with the join alias when joins are present (`:292-318`).
2. `applyPageFilters(filterTree, pageFilters)` (`:325-348`) — for each leaf with `usePageFilters: true`, replaces `value` with `pageFilters[searchParamKey || col]`.
3. `extractNormalFiltersFromGroups(filterTree)` — splits "normal" (per-row column) filters out of the tree.
4. `mapFilterGroupCols(filterTree, getColumn, isDms)` (`:161-228`) — rewrites `col` to the server-side ref form (`data->>'name' as name` for DMS, raw column for DAMA), and translates `multiselect` filter/exclude leaves to `array_contains` / `array_not_contains` ops.
5. Operations map to SQL via `operationToExpressionMap` (`:130-137`): `filter→IN`, `exclude→NOT IN`, `gt→>`, `gte→>=`, `lt→<`, `lte→<=`. `like` is wrapped in `%…%` (`:186`).
6. The final `options` blob (`:1027-…`) is passed to UDA, which generates SQL.

### Page state — the existing "external" feed

`pageState.filters: Array<{ searchKey, values, useSearchParams, type? }>` lives on the page. Three sources write into it:

- **URL search params** — `view.jsx:63-65` calls `updatePageStateFiltersOnSearchParamChange` on any URL change.
- **Filter UI inside a section** — `RenderFilters.jsx:81-99`, `RenderFilterValueSelector.jsx:268-298` push back into pageState on user interaction.
- **Section "providers"** — Card and Spreadsheet sections can publish row values on hover via `setActionParam(key, value)` (`view.jsx:71-80`). These land as `{type: 'action'}` filters in the same pageState array (used by Card's `row_highlight` subscriber, `Card.config.jsx:227-249`).

In all cases the *value* is a static string/array/number — set once and only changed when something else writes back. Nothing produces values from the clock.

## Why "now" doesn't fit today

Concretely, three barriers stop a section from filtering on the current time:

1. **No source for clock-derived values.** `usePageFilters` reads `pageFilters[searchParamKey]`, which can only carry what the URL or another component already wrote. There is no `valueSource: 'now'` or equivalent.
2. **No re-trigger on time passing.** Even if a value were injected once at mount, the section wouldn't re-fetch when the wall clock rolled past the next minute / hour / day boundary unless something explicitly invalidated.
3. **No type awareness on filter values.** `gt`/`lt` ops on a `text` column fall through to lexical SQL comparison. The pipeline never asks "what kind of value is this — text, time, day-of-week ordinal?". The unified-column-types research note ([unified-column-types.md](./unified-column-types.md)) covers the deeper version of this problem; time filters expose the same gap from a different angle.

## The storage problem (independent of "now")

Before discussing how to inject `now`, observe that the WCDB schedule data alone breaks `gt`/`lt` filters even with hardcoded values:

| stored `start_time` | sorted lexicographically |
|---|---|
| `"10:00AM"` | comes before `"2:00AM"` |
| `"6:00PM"` | comes before `"7:00AM"` |
| `"12:00AM"` | comes before `"1:00AM"` |

For ordering or ranged filtering to work on this column at all, one of these has to happen:

- **Server-side cast** — if `start_time` is known to be 12-hour text, the SQL generation must cast: `(data->>'start_time')::time`. This requires the pipeline to know the column's *real* type, which it doesn't (today `column.type` is a render hint only, not a sortable type). Unified-column-types research is the correct vehicle for this.
- **Client-side normalization at ingest** — the DJs source's CSV import / form publish writes `start_time` as `"22:00:00"` (24-hour ISO `time`) and `start_day_idx` as `1..7` next to the human-readable column. Comparison then "just works" for any new tooling.
- **Computed columns** — declare a virtual column on the source whose expression is `to_minutes(start_time)`. UDA already supports calculated/formula columns (`AddCalculatedColumn`/`AddFormulaColumn`). This avoids re-importing data but adds a per-section binding.

This note's recommendation (see below) leans on the second approach for new data and the first for existing data; the third is a useful fallback when neither is feasible.

## Design space for "current-time" injection

Four options, ordered roughly by complexity:

### Option A — Computed filter values resolved at buildUdaConfig

Extend the filter leaf shape with a `valueSource` channel:

```js
{
  col: 'start_day',
  op: 'filter',
  valueSource: 'now',         // new
  valueFormat: 'day_name_full',  // new — one of a small library of formats
  // value is left blank; resolved at build time
}
```

`buildUdaConfig` resolves it before SQL generation:

```js
const resolveValueSource = ({ valueSource, valueFormat, params }, clock = Date) => {
  if (valueSource !== 'now') return undefined;
  const now = new clock();
  switch (valueFormat) {
    case 'day_name_full': return now.toLocaleString('en-US', { weekday: 'long', timeZone: params?.tz });
    case 'time_24h':      return now.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: params?.tz });
    case 'minutes_since_midnight': return now.getHours() * 60 + now.getMinutes();  // tz-aware variant TBD
    case 'iso_timestamp': return now.toISOString();
    case 'date_iso':      return now.toISOString().slice(0, 10);
    // …
  }
};
```

A small, named library of formats keeps the channel disciplined; the `params` object lets a leaf pass `tz: 'America/New_York'` (essential for WCDB).

**Re-trigger on the clock:** `useDataLoader` (or `useDataSource`) subscribes to a `useNowTick({ resolution })` hook that bumps a version each time the resolved value would change. Resolution comes from the leaf's `valueFormat`:

| valueFormat | natural tick |
|---|---|
| `day_name_full`, `date_iso` | midnight (recompute once per day) |
| `time_24h`, `minutes_since_midnight` | once per minute |
| `iso_timestamp` (live `created_at` displays) | once per minute, or per second only if requested |

The hook can compute the next boundary and use `setTimeout` to fire exactly at that boundary — no polling.

**Scope:** purely client. No server changes. Plays well with the column-name → server-ref mapping that already happens in `mapFilterGroupCols`.

**Tradeoff:** doesn't address the storage problem. If `start_time` is `"6:00PM"` text and the resolved `now` is `"18:00"`, the SQL will still do `data->>'start_time' >= '18:00'` and pick rows lexicographically — wrong.

### Option B — Page-level system params

Treat the clock as another writer to `pageState.filters`:

```js
// pages/view.jsx
useNowTick(({ now, today_dow_name, today_minutes }) => {
  setPageState(draft => {
    upsertFilter(draft, { searchKey: '__now_dow', values: [today_dow_name], type: 'system' });
    upsertFilter(draft, { searchKey: '__now_minutes', values: [today_minutes], type: 'system' });
  });
});
```

Filters then reference these via `usePageFilters: true, searchParamKey: '__now_dow'` — exactly the existing channel.

**Scope:** thin glue on top of `pageState.filters` and `usePageFilters`. No schema changes to filter leaves.

**Tradeoffs:**
- Mixes a clock signal into URL search-param territory (`pageState.filters` is what backs URL params and pattern-level filters today). Adding a `type: 'system'` discriminator avoids URL pollution but adds branching everywhere `pageState.filters` is consumed.
- Section authors have to know the magic `__now_*` keys; the per-leaf `valueSource: 'now'` of Option A is more self-describing.
- Same storage tradeoff as A — the value is still a string compared lexically against the column.

### Option C — Server-side `$NOW` expressions

Allow the filter `value` to be a sentinel like `{ $expr: 'now', tz: 'America/New_York' }`, and translate server-side:

```sql
-- before
WHERE data->>'start_time' >= 'AT_NOW'
-- after, server substitutes
WHERE data->>'start_time' >= to_char(now() AT TIME ZONE $1, 'HH24:MI')
```

**Tradeoffs:**
- Unambiguously correct — postgres knows the time and the column type, no client/server clock skew.
- Naturally pairs with server-side casts (the right place to fix the lexical-comparison problem too).
- Requires server work (allow-listing expression sentinels, careful escaping). Touches the UDA `handleFilters` path (`routes/uda/utils.js:305-348` per the unified-column-types research). Adds a security surface that has to be carefully bounded.
- No re-trigger story by itself — the section still has to invalidate on a tick if the user keeps the page open. This option doesn't replace the client-side tick; it complements it.

### Option D — Storage normalization

Stop fighting the data shape. For the schedule:

- `start_time_minutes` = integer minutes since midnight of the start (e.g., `1320` for 10:00 PM)
- `end_time_minutes` = same
- `start_day_idx` = 0..6 (Sunday=0, matching JS `Date#getDay()`)
- Keep `start_time` / `start_day` as display-only string columns, derived at render time

With these, `gt`/`lt` work natively. The "active show" filter becomes:

```
start_day_idx = {now_dow}
AND start_time_minutes <= {now_minutes}
AND end_time_minutes  >  {now_minutes}
```

Where `{now_dow}` and `{now_minutes}` come from Option A (or B, or C). Nothing about the comparison logic is special anymore.

**Scope:** ingest pipeline change (CSV/form publish handlers), source `metadata.columns` adds two integer columns, existing rows get a one-time migration script to populate them.

**Tradeoffs:**
- Permanent fix; downstream tooling (sorting, filtering, charting) all benefits.
- One-time cost: data migration + client display formatters.
- Doesn't help sources we can't change (third-party CSVs that arrive with text times). For those, the server-side cast in Option C (or a client-side calculated column) is the relief valve.

## Recommendation

The minimum viable combination:

1. **Adopt Option A** as the runtime mechanism. `valueSource: 'now'` with a small named-format library, resolved in `buildUdaConfig`, plus a `useNowTick` hook that bumps the section's reload version at the right granularity. This is contained, self-describing, and doesn't touch the server.
2. **Suggest Option D** as the storage convention for new time-bearing data going forward. Document a "sortable time storage" pattern: when a column's logical type is a time/date/duration, write a sibling integer column (`*_minutes`, `*_idx`, `*_epoch`) and treat the human-readable column as display-only. The schedule source migration is a single CSV reshape + a small write-side handler change.
3. **Park Option C** until two pressures align: (a) we have a third-party time-bearing source we can't normalize, and (b) the unified-column-types work is far enough along that the server has type metadata to drive the cast. At that point Option C is a small extension to `handleFilters`.
4. **Skip Option B** outright unless it falls out of unrelated page-state work. The dual-writer story (clock writes alongside URL writes) is more complexity than benefit, and Option A subsumes its expressiveness.

For the immediate WCDB schedule problem — getting the home page's "now" card working before storage normalization lands — there's a one-step interim: a client-side calculated column on the schedule section (`start_minutes` = `parseTime(start_time)`) + Option A's `now` injection on a `lte` filter against that calculated column. This proves the pattern out on a single section without committing the data migration.

## Filter shape sketch (Option A)

The smallest extension to the filter leaf that captures the design:

```js
// existing filter leaf
{ col, op, value, usePageFilters?, searchParamKey?, ... }

// extended filter leaf
{
  col,
  op,
  value,                   // optional when valueSource is set
  valueSource?: 'static' | 'now' | 'page' | 'date_offset',
  valueFormat?: string,    // resolver-specific format token (see table below)
  valueParams?: object,    // resolver-specific options (e.g. { tz, offsetDays })
  usePageFilters?, searchParamKey?, ...
}
```

`valueSource: 'static'` is the implicit default — every existing filter is treated as static and unchanged. `'page'` is shorthand for the existing `usePageFilters: true` plumbing (they could merge over time). `'now'` is the new path. `'date_offset'` is a near-term variant for things like "last 7 days" (`{valueSource: 'date_offset', valueParams: {days: -7}, valueFormat: 'date_iso'}`).

Suggested initial format library:

| valueFormat | resolved value | tick granularity |
|---|---|---|
| `day_name_full` | `"Monday"` | midnight |
| `day_name_short` | `"Mon"` | midnight |
| `day_idx` | `0..6` (Sun=0) | midnight |
| `date_iso` | `"2026-05-05"` | midnight |
| `time_24h` | `"18:42"` | minute |
| `minutes_since_midnight` | `1122` | minute |
| `iso_timestamp` | `"2026-05-05T22:42:00.000Z"` | minute (or second on opt-in) |
| `epoch_seconds` | `1746479320` | minute |

`valueParams.tz` (IANA name) is honored for every format that depends on a calendar boundary. Default is the browser's resolved timezone; for the WCDB station-clock case the section's filter would set `tz: 'America/New_York'`.

## Schedule storage convention sketch (Option D)

When a source has a time/date column whose semantics matter for filtering or ordering, write *both*:

| display column (text) | sortable sibling | type | example |
|---|---|---|---|
| `start_time: "10:00AM"` | `start_time_minutes: 600` | integer | 10:00 AM = 10*60 |
| `start_day: "Monday"` | `start_day_idx: 1` | integer | Sun=0..Sat=6 |
| `event_at: "Mar 14, 2026 8 PM"` | `event_at_epoch: 1773993600` | integer | unix seconds |

The display column stays human-friendly for free-text rendering; the sibling drives all comparison and ordering. Card / Spreadsheet sections can hide the sibling (`show: false`) and still filter against it.

This convention is also the right place to introduce a per-source `metadata.columns[i].sortRef` field that points at the sortable sibling for the display column — so a generic `sort: 'asc'` on the display column transparently sorts on the sibling. Out of scope for this note but worth designing in tandem if D is pursued.

## Files this would touch (Option A only)

- `dataWrapper/buildUdaConfig.js` — add `resolveValueSource(filter)` and call it inside `applyPageFilters` (or a new `applyComputedValues` step). Map `'page'` to the existing `usePageFilters` codepath for consistency.
- `dataWrapper/components/filters/Components/RenderFilterValueSelector.jsx` — add a "Value Source" select alongside operation/type pills with options `static`/`now`/`page`/`date_offset`; conditionally show a "Format" select keyed off the chosen source.
- `dataWrapper/useDataLoader.js` (or `useDataSource.js`) — wire a `useNowTick({ resolutions })` hook that aggregates the resolutions of every dynamic value across the section's filters and bumps a state-counter at the next boundary. The counter participates in the existing fetch dependency list, so a tick triggers a refetch through the same path as a column add or filter edit.
- `patterns/page/pages/view.jsx` and `pages/edit/index.jsx` — no changes needed if Option B is skipped.

## Open questions

- **Timezone defaulting.** Browser local vs. station/site-configured? Add `theme.timezone` or `pattern.data.timezone` as the default fallback? Per-section override? Suggest: pattern-level default with per-leaf override.
- **Calculated columns + computed values.** Should a calculated column also be allowed to reference `now` in its formula (e.g. `is_active = (now_dow = start_day_idx) AND (now_minutes BETWEEN start_minutes AND end_minutes)`)? That folds the whole problem into a single derived boolean column the section filters on. Probably yes long-term; out of scope for the first cut.
- **Active-row vs. visible-row reactivity.** When the clock ticks and the filtered set changes, do we want a smooth animated transition or a hard refetch? For schedule cards specifically, an active-row state (highlight + scroll-to) is preferable to a re-render. That's a UX layer on top of the data layer; consider once the data layer is solid.
- **Edit-mode preview.** When an admin is editing the section in `isEdit=true`, does `now` always evaluate to the real wall clock, or do we offer a "preview at time T" knob so they can verify the empty / boundary cases? Suggest: real clock by default with an admin-only override, parked behind a feature flag for now.
- **Caching.** The dataWrapper layer caches by request shape. If the request includes a clock value, every minute boundary is a new cache key — fine, but worth confirming server-side cache budgets aren't hit.
- **SSR.** Pages rendered on the server have a server-side `now`. The hydrated client may be ~seconds later. For minute-resolution this is invisible; for second-resolution there's a brief blink. Document and accept, or stamp the SSR time and skip the first client tick boundary.

## References

- Filter pipeline: `dataWrapper/buildUdaConfig.js:130-348, 776-1027`
- Filter UI / page-state plumbing: `dataWrapper/components/filters/RenderFilters.jsx:56-100`, `Components/RenderFilterValueSelector.jsx:99-298`
- Page-state writers: `pages/view.jsx:71-125`, `pages/_utils/index.js:455`
- Storage shape (schedule): observed via `dms dataset query 1957812 --view 1957813 --filter "start_day=Monday"` against `dmsserver.availabs.org`
- Adjacent: [unified-column-types.md](./unified-column-types.md) — the broader "client column types should drive sort/filter/format behavior" thread that "now" filters share a root with.
