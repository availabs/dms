# WCDB schedule migration + now-playing schedule card

## Objective

Render the currently-airing show on the WCDB site by binding a configured `Card` section to the schedule source via the new `op: 'time'` filter primitive (Phase 4: `instant` + `compareEnd`). This is the first real consumer of the time-filter primitive shipped in `datawrapper-time-filters.md`.

Two coupled deliverables:

1. **Schedule data shape** — make the WCDB schedule rows queryable by typed timestamp comparison, either by migrating storage columns to `timestamp`/`timestamptz`, or by adding calculated columns that combine the existing `day_of_week` + text-time fields into typed timestamps. Pick whichever is lower-friction; both end at the same place from the filter pipeline's perspective.

2. **Now-airing card** — drop a `Card` section onto WCDB's home page bound to the schedule view, configured with `op: 'time'` + `value.ranges = [{kind:'instant', at:'now'}]` + `value.compareEnd = <end column>`. Page size 1, sort to break ties deterministically. Reuses the existing `Card` component end-to-end — **no new section type**, per `feedback_prefer_existing_components.md`.

The `useNowTick` hook (already wired into `useDataLoader`) handles refetch-on-boundary so the card transitions automatically between shows without polling.

## Background

The WCDB schedule pattern stores show-airing rows with text-time fields (`"6:00PM"`, `"8:30PM"`) and a `day_of_week` field. The original WCDB home-page schedule card was built before `op: 'time'` existed; it relied on JS-side time matching done in component code. The Phase 4 work in `datawrapper-time-filters.md` shipped the server-side `instant` + `compareEnd` predicate (`(start_at <= now() AND end_at > now())`), but the schedule data isn't yet in a shape the predicate can consume — the column allow-list requires `date` / `timestamp` / `timestamptz`, not text.

The Phase 4 task summary explicitly carved this migration out as a follow-up, noting "with a calculated column for the legacy text-time storage, until the storage migration lands. Both are tracked separately; the `time` op just doesn't apply until they migrate." This task is that follow-up.

## Scope

**In:**

- Decide on storage path: full migration to `timestamptz` columns, or calculated-column bridge over the existing text-time columns. Document the choice in this task file before implementing.
- Apply the chosen shape to the WCDB schedule source (or its DAMA view metadata) so the schedule view exposes start/end columns whose `metadata.columns[i].type` resolves to `timestamp` / `timestamptz` / `date`. Use the DMS CLI for any DMS-data edits (per `dms/CLAUDE.md`); use DAMA admin flows for any DAMA source/view metadata edits.
- Configure the now-airing `Card` section on WCDB's home page: bind to the schedule view; `op: 'time'` filter with `kind: 'instant'` + `compareEnd: <end_col>`; page size 1; sort by start time DESC as a deterministic tiebreaker.
- Verify the card transitions correctly when a show ends and the next one starts (boundary-tick refetch via `useNowTick`).
- Document the recipe in `documentation/` so other patterns (event calendars, "currently active" indicators) can follow it.

**Out:**

- New page-section component for "schedule." Card configuration is the deliverable.
- Multi-show "today's schedule" rendering. That's a separate filter (range = `today`) and a separate card. If we want it, it's a sibling card on the same page, not part of this task.
- ClickHouse routing for the schedule. The schedule lives in the WCDB pgEnv's PostgreSQL, not in CH.
- Storage migration of unrelated WCDB sources that also use text-time columns (DJ rotations, contest schedules, etc.). Each can adopt this recipe later; this task scopes to the home-page schedule card only.
- ACRCloud "now playing" metadata (already shipped via the `now_playing` plugin). The schedule card is **distinct** from now-playing — schedule = "what show is on according to the schedule grid"; now_playing = "what track ACRCloud detected on the audio stream right now." They render as separate cards on the home page.

## Current State

### WCDB schedule data

- Schedule rows live in the WCDB pgEnv as a DAMA source (likely `wcdb_main|schedule:source` or similar — verify via `dms raw list wcdb` against the live env). Columns of interest:
  - `day_of_week` — string, `"Monday"`-style
  - `start_time` — text, `"6:00PM"`-style
  - `end_time` — text
  - `dj_name`, `show_name`, etc. — display fields
- Storage is text. SQL comparisons are lexical (`"6:00PM" < "8:30PM"` happens to work for same AM/PM, but `"10:00AM" < "9:00AM"` lex-compares incorrectly). This is exactly the foot-gun the time-filter primitive was designed to avoid by requiring typed columns.

### Time-filter primitive (already shipped — see `datawrapper-time-filters.md`)

- `op: 'time'` leaf with structured value validated by allow-list on the server.
- Server-side `instant` predicate (Phase 1, `dms-server/src/routes/uda/time-filter.js:275-286`):
  ```js
  case 'instant': {
      if (!value.compareEnd) return `(${colCast} <= now())`;
      const compareEndAccessor = isDms
          ? `(data->>'${value.compareEnd}')::timestamptz`
          : value.compareEnd;
      return `(${colCast} <= now() AND ${compareEndAccessor} > now())`;
  }
  ```
  → emits `(start_at <= now() AND end_at > now())` when `compareEnd` is set.
- Client-side `InstantRow` (Phase 4) lets a section author toggle "Currently happening" and pick the end column.
- `useNowTick` (Phase 2) ticks on the next minute boundary and invalidates the dataWrapper fetch key, so the card refetches when shows transition.
- Column allow-list (`isTimeColumnType`) gates the `time` op to `date` / `datetime` / `timestamp` / `timestamptz` — text columns don't qualify, which is why migration is needed.

### now_playing precedent

`data-types/now_playing/` is a fully-shipped plugin that follows the same "configured Card section bound to a stream view" pattern (see `tasks/completed/dama-now-playing-datatype.md`). The schedule card here is the same architecture, just with a different filter shape (`instant` + `compareEnd` vs. now_playing's `sort + page-size 1 + filter kind='matched'`).

## Approach

### Phase 1: Schedule data shape

Decide and apply one of:

**Option A — Calculated-column bridge.** Add two calculated columns to the schedule view's `metadata.columns`:
- `start_at` — combines `day_of_week` + `start_time` into a `timestamptz` representing the next/most-recent occurrence (depending on which makes sense for a recurring weekly schedule).
- `end_at` — same shape, end side.

Pros: no destructive change to source rows; trivial to roll back; works on any DAMA source via the existing calculated-column machinery. Cons: SQL gets gnarly because you need to project a recurring weekly schedule onto absolute timestamps relative to `now()`.

**Option B — Storage migration.** Re-shape the source to store one row per *broadcast* (absolute `start_at` / `end_at` columns), with the schedule grid driving an out-of-band populator that writes rows for the upcoming week.

Pros: data shape matches the query semantics directly; no calculated-column gymnastics. Cons: changes the data model; needs a populator job that runs ahead of the rolling window; existing schedule editors keep their text-time UX but now feed a derived absolute-timestamp table.

**Recommendation (revisit before implementing):** Option B is cleaner long-term but requires a populator. Option A unblocks the card immediately. Likely path: ship A as a calculated-column bridge so the card works against the existing data within a day, then revisit B if/when the schedule grows beyond one weekly recurrence (recurring exceptions, holidays, pre-empted shows) and the calculated-column SQL gets unwieldy.

The choice doesn't affect Phase 2 — both end with a view exposing `timestamp`-typed columns.

### Phase 2: Card configuration

On the WCDB home page (or wherever the home-page schedule card lives), drop a `Card` section bound to the schedule view. Section config:

- **Source/view binding:** the schedule view from Phase 1.
- **Columns shown:** show name, DJ name, optionally DJ portrait (via existing `isImg` column type).
- **Filters (the load-bearing piece):** add a tree leaf:
  ```js
  { col: 'start_at', op: 'time', value: {
      ranges: [{ kind: 'instant', at: 'now' }],
      compareEnd: 'end_at',
      tz: 'America/New_York',  // or whatever the station's broadcast tz is
  }}
  ```
- **Page size:** 1 — exactly one show is "currently airing."
- **Sort:** `start_at DESC` as a deterministic tiebreaker if multiple rows accidentally straddle (shouldn't happen if the data is clean, but the sort makes the failure-mode predictable).
- **Empty state:** "Off-air" / "Schedule unavailable" string. The empty-state interpolator in the dataWrapper already accepts a `humanLabel`-style template.

Once the time-filter Phase 5 author/viewer axis exposure work is in production usage, the card author can also lock the time axis (`exposedAxes: { range: false }`) so end users don't accidentally URL-override the "currently airing" semantics.

### Phase 3: Documentation

Add `src/dms/documentation/schedule-card-recipe.md` describing the configuration pattern and the data shape it expects. This is the "how do I build a 'currently active' card" reference — useful both for the WCDB schedule and for any future event-calendar pattern.

## Files Requiring Changes

- [ ] `src/dms/planning/research/time-based-filters.md` — cross-link this task once filed.
- [ ] **WCDB DMS data (live, via DMS CLI):** schedule view's `metadata.columns` gains the `start_at` / `end_at` columns (calculated-column path) OR new source/populator (storage-migration path).
- [ ] **WCDB home page (live, via DMS CLI):** new Card section configured per Phase 2.
- [ ] `src/dms/documentation/schedule-card-recipe.md` (new) — the recipe doc.
- [ ] (Out of scope, but flag if hit): `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx` — likely no changes; verify the existing `Card` config supports time-filter leaves out of the box. If not, that's a small Card config tweak.

## Testing Checklist

- [ ] Pick storage path (Option A or B); document the choice in this file before implementing.
- [ ] Verify the schedule view's `metadata.columns[i].type` for `start_at` / `end_at` resolves to one of the allow-listed types (`isTimeColumnType` returns true). Without this the picker will not even offer the `time` op.
- [ ] Configure the home-page Card section per Phase 2.
- [ ] Confirm the SQL emitted by `buildTimeFilterSQL` for the leaf is the expected `(start_at <= now() AND end_at > now())` form — easiest check: turn on dms-server request logging and inspect a `simpleFilter` query.
- [ ] Open the WCDB home page during a show. Verify the card shows that show.
- [ ] Wait for the show to end (or simulate by editing the schedule). Verify the card refetches automatically (no manual reload) and now shows the next show. `useNowTick` should fire on the minute boundary.
- [ ] Verify the off-air case (no row currently airing): card shows the empty-state string, doesn't render a stale row.
- [ ] DST transition: verify the `tz` parameter on the leaf produces correct local-clock semantics on the next DST changeover (or document that this is checked by Phase 1 server tests since it goes through the same predicate emitter).
- [ ] Live DJ portrait column renders correctly when the airing show has a portrait, and degrades gracefully when it doesn't.
- [ ] Compare the rendered card vs. the previous (legacy) schedule card to confirm no regression in fields shown / styling.
- [ ] If `exposedAxes` ends up locked (Phase 5), confirm the URL on the WCDB home page does not include any `?<filter>=now…` query string — locked axes shouldn't round-trip.

## Open Questions

- **Option A vs B for storage shape.** Resolve before Phase 1 implementation; document the call here.
- **Timezone source.** Hard-code `America/New_York` on the leaf, or read it from a pattern-level default (`pattern.data.timezone`)? Pattern-level is more reusable; hard-coding is simpler for v1. Suggested: pattern-level if the WCDB pattern already exposes a `data.timezone`; otherwise hard-code on the leaf and revisit.
- **Multiple-show overlap.** If two rows accidentally cover the same minute (data error), the card sorts by `start_at DESC` and shows the latest. Is that desired, or should we deduplicate / surface a warning? Deferring to "data is correct" assumption for v1.
- **Pre-empted shows / live overrides.** Out of scope for v1; live overrides would need a separate "live override" flag column or a higher-priority row, but that's a content-management feature not a filter-primitive feature.
- **Should the recipe doc move into `documentation/` or stay as a section comment in `Card.config.jsx`?** Documentation is the better home — discoverability for non-WCDB consumers.

## References

- Time-filter primitive task: [tasks/completed/datawrapper-time-filters.md](../completed/datawrapper-time-filters.md)
- Time-filter design rationale: [research/time-based-filters.md](../../research/time-based-filters.md)
- now_playing precedent (similar architecture, different filter shape): [tasks/completed/dama-now-playing-datatype.md](../completed/dama-now-playing-datatype.md)
- Server-side instant predicate: `packages/dms-server/src/routes/uda/time-filter.js:275-286`
- Client-side InstantRow: `packages/dms/src/patterns/page/components/sections/components/dataWrapper/components/filters/TimePicker/InstantRow.jsx`
- Card component config: `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx`
