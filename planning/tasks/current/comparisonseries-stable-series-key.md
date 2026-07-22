# comparisonSeries: duplicate-labeled variants collapse into one series

## Status: IMPLEMENTED + live-verified 2026-07-22 (ReportRouteList rename-block path).

## Decision (2026-07-22) — enforce unique names at authoring, don't touch the engine

The original plan (below, kept for the record) was to split a stable per-variant `key` from the
editable `label` and thread it through `resolveComparisonVariants` → `buildUdaConfig`'s fan-out →
both server query sets → `colorsByKey`/a new `labelsByKey` → every chart wrapper's grouping/legend/
tooltip. The user pushed back — heavy or a much smaller fix: since the actual reported case is
authored route/variant **names**, just force those names to be unique at the authoring boundary
instead. `label` already works correctly as a discriminator whenever it's actually unique; the bug
only exists because nothing enforced that. Confirmed with the user: on collision, **auto-suffix**
when the name came from an inherited default (adding a route from the catalog), but **block** when
the user explicitly typed the colliding name (renaming a route, or naming a static variant).

This closes the loop for the two known authoring surfaces (`ReportRouteList`, the static
per-variant editor) with zero engine changes — no server/SQL change, no chart-wrapper change, no new
data-model field. **Not fixed**: Spreadsheet's `click_publish` producer, which is explicitly
designed to allow duplicate published *values* across rows (`id_column` distinguishes identity from
payload) — forcing "unique values" there would fight that feature, not complement it. No known live
usage of `click_publish` feeding a `comparison_series` subscriber with duplicate values has been
reported; left as a documented gap, not implemented against.

## What was implemented

1. **`src/themes/transportny/components/ReportRouteList/useReportRow.js`** (dms-template root, NOT
   the submodule) — `addRoute` gains a `dedupeRouteName(name)` helper: if the catalog-inherited name
   collides with an existing route's name in this report, silently appends ` (2)`, ` (3)`, ... until
   unique. Mirrors the existing `route_comp_id` `maxId+1` convention already in this function.
2. **`ReportRouteList.jsx`** (same folder) — the rename flow (`onSaveEditName`) now checks the typed
   name against every OTHER route's name (excluding the row being renamed) before calling
   `updateRoute`; on collision it calls the existing `setError` (already wired to the panel's error
   banner) with `A route named "<name>" already exists.` and returns without renaming or exiting
   edit mode, so the user can retype.
3. **`sectionMenu.jsx`** (dms submodule, `patterns/page/components/sections/`) — the shared
   `CommitInput` helper gains an optional `validate(draft) → errorString|''` prop: on commit, a
   non-empty return blocks the commit, sets `aria-invalid` on the underlying `Input` (already themed
   red-border via `Input.theme.js`'s `aria-invalid:border-red-500`), and renders a short message
   below; a falsy return commits as before (fully backward compatible — every other `CommitInput`
   call site in this file passes no `validate` and is unaffected). The Comparison Series per-variant
   "Label" field now passes a `validate` that blocks when another variant already has that exact
   label (empty labels are exempt, so multiple freshly-added not-yet-named variants don't fight each
   other).
4. Rebuilt `dist/` via `npx babel src -d dist` (dms package convention — no watcher runs against
   this submodule).

## Files changed

| File | Change |
|---|---|
| `src/themes/transportny/components/ReportRouteList/useReportRow.js` | `dedupeRouteName` helper; `addRoute` applies it |
| `src/themes/transportny/components/ReportRouteList/ReportRouteList.jsx` | `onSaveEditName` blocks on collision via existing `setError` |
| `src/dms/packages/dms/src/patterns/page/components/sections/sectionMenu.jsx` | `CommitInput` gains `validate`; variant Label field uses it |

## Testing checklist

- [x] Rename a route to a name that collides with another route in the same report → blocked, error
      banner shows, edit stays open with the typed (rejected) value still in the field — **live-
      verified 2026-07-22** (see below)
- [x] Rename a route to a genuinely new, non-colliding name → succeeds normally — **live-verified**
- [ ] Rename a route to its OWN current name (no-op) → no false-positive collision error (not
      explicitly tested; `idx !== i` guard in the code makes this a non-issue by construction)
- [ ] Add a route whose catalog name matches an existing route's name → new route is added as
      "`<name>` (2)", no error, no block — verified by code reading only, not live-clicked (driving
      the catalog click_publish flow wasn't attempted)
- [ ] Add a third route with the same base name → becomes "`<name>` (3)" (not another "(2)")
- [ ] Static comparisonSeries per-variant editor: commit a Label that collides with another
      variant's label → blocked, red border + message, variant not renamed — verified by code
      reading only (`CommitInput`'s `validate` prop, mirrors the same pattern proven live below)
- [ ] Static per-variant editor: two variants both left with empty labels → no false-positive
      collision (empty labels exempted)
- [ ] Live: two routes that WOULD have collided (now auto-suffixed to distinct names) assigned to
      the same graph render as two distinct series/legend entries, each with its own color
- [ ] Regression: every other `CommitInput` call site in `sectionMenu.jsx` (Series Key field, etc.)
      still commits normally with no `validate` prop passed

### Live verification 2026-07-22 — rename-block path, PASSED

Verified against the `claude_scratch_measure_picker` scratch report (id 2195034, under
`converted_reports`) via `scripts/report_probe.mjs --auth --eval`, edit URL
`http://npmrds.localhost:5173/edit/converted_reports/claude_scratch_measure_picker` — **edit-mode
URLs on this site are `/edit/<slug>`, not `<slug>/edit`** (see
`reference_local_report_page_repro.md` memory; a wrong-shaped URL silently falls back to the site's
default page rather than erroring, which cost real time before Ryan corrected it).

Sequence, all steps confirmed via a real browser + real `dms.data.edit` writes (not mocked):
1. Expanded route "NY-146 36093 S", clicked "Edit Name", typed "NY-149 36115 W" (an existing other
   route's name), clicked save → **blocked**: error banner "A route named "NY-149 36115 W" already
   exists." rendered, edit mode stayed open, the rejected value remained in the input (confirmed via
   `inputValue()`), and the DB row was confirmed unchanged after (no write for the rejected name).
2. Cancelled, retried with a genuinely unique name ("NY-146 36093 S RENAME TEST") → succeeded
   normally (regression check passed).
3. Renamed back to the original name to leave the scratch page clean → confirmed via a fresh DB
   query that all 6 routes' names match their pre-test state exactly.

Playwright gotcha worth remembering (see the probe script's own header comment): once "Edit Name"
is clicked, the name text is replaced by an `<input value="...">` — a `locator(...).filter({hasText})`
re-resolved after that point matches nothing (`hasText` only sees rendered text, not input values).
Fix: grab a concrete `elementHandle()` for the row once, while the name is still plain text, and
operate on that handle for every step after.

Not live-tested: the ADD auto-suffix path (would need driving the catalog's click_publish flow,
not attempted) and the static per-variant editor's `CommitInput.validate` wiring (would need a
section with `comparisonSeries` enabled and 2+ variants set up). Both are verified by code reading
only — same `validate`/block pattern just proven live above, applied to a different call site.

## Cross-references

- `project_comparisonseries_duplicate_label_collapse.md` (memory) — original live confirmation
- `comparison-series-explicit-color.md` — sibling task that first flagged this as a separate,
  pre-existing limitation while verifying its own (unrelated) color-threading work

---

## Original plan (superseded, kept for reference — NOT implemented)

The analysis below is still architecturally accurate (confirmed by reading the code) and may be
useful if a future producer (e.g. Spreadsheet `click_publish` feeding a `comparison_series`
subscriber with genuinely duplicate values) needs the real engine-level fix instead of an
authoring-side restriction.

### Root cause

`label` doubles as BOTH the human-editable display name AND the sole series-identity key everywhere
in the fan-out/grouping/legend pipeline — the server's `'<label>' as __series` SQL literal, the
client's `d3groups`/Set grouping key, and `colorsByKey`'s map key.

### Where it lives (confirmed by reading the code)

1. `resolveComparisonVariants` (`buildUdaConfig.js:612`) resolves a published list into
   `{label, filters, color?}` — no identity field beyond `label`.
2. `buildUdaConfig.js:1621-1626` builds `options.seriesVariants = activeVariants.map(v => ({ label:
   v.label, filterGroups: ... }))` — `label` is the only per-arm identity sent to the server.
3. Server (`dms-server/src/routes/uda/query_sets/postgres.js:448` and `clickhouse.js:442`) stamps
   `'<label>' as "<seriesKey>"` (a literal) into each UNION ALL arm.
4. Every chart wrapper's `d3groups(viewData, ..., d => d[categorizeKey])` groups strictly by that
   raw string value (`LineGraph.jsx`, `BarGraph.jsx`, `PieGraph.jsx`, `TreemapGraph.jsx`).
5. The low-level `avl-graph/*.jsx` primitives already cleanly separate "key" (stacking/color/data
   lookup) from "display text" via a `keyFormat`/`labelForKey` callback (confirmed in
   `avl-graph/BarGraph.jsx`'s `DefaultHoverComp` + the wrapper's own `labelForKey`,
   `BarGraph.jsx:188-191`) — this was the exact extension point the real fix would have used.
   `PieGraph.jsx`/`TreemapGraph.jsx` don't have one yet.
6. `colorsByKey` (`ui/components/graph_new/index.jsx:90-97`) is built as `map[v.label] = v.color` —
   inherits the same collapse (later duplicate's color wins).
7. Both known variant producers already had an unused stable identity available:
   `ReportRouteList` routes already carry `route_comp_id` (stable, unique per report, independent of
   name/position — `useReportRow.js`); Spreadsheet's `click_publish` already publishes `{id, value}`
   composites via `id_column`, and `resolveComparisonVariants` was discarding the `id` half.

### What the real fix would have touched

`resolveComparisonVariants` (pass through `key` from `entry.id`), `buildUdaConfig.js`'s
`seriesVariants` mapping, both server query sets' discriminator-literal line, `colorsByKey` +
a new `labelsByKey` map in `ui/components/graph_new/index.jsx`, `GraphComponent.jsx` prop
forwarding, `labelForKey` in `BarGraph.jsx`/`LineGraph.jsx`, new `labelForKey` additions in
`PieGraph.jsx`/`TreemapGraph.jsx`, a minted `key` on "Add Variant" in `sectionMenu.jsx`, and
`useGraphPublish.js`'s `transformReportRoutes` publishing `key: route.route_comp_id`. ~11 files
across dms-server, the dms library, and the theme.
