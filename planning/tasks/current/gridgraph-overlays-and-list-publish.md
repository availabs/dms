# GridGraph overlays (cell bands + point markers) & `load_publish` 'list' derivation

> **Status:** ✅ BUILT 2026-07-17, verified live on tsmo2/incident_view (dev). Rides the next
> git sync/deploy.
> **Driver (Alex):** the incident-view speed grid must border the (TMC × epoch) SQUARES that
> are in the event's congestion data (each delay TMC's bound_start → bound_end window) and
> (next phase) dot the cell where the incident opened. Labels never included.

## What shipped (all additive/BC)

### 1. `load_publish` derivation `'list'` — Spreadsheet + Card

`ComponentRegistry/spreadsheet/index.jsx` + `ComponentRegistry/Card.jsx` (same block in each):
alongside `first`/`max`/`min`, `derivation: 'list'` publishes EVERY loaded row's value for each
`publishes[]` column — deduped, in row order — as the action param's value **array**. Its own
dedupe key is the joined value list (`''` separator), so re-loads with identical content
don't re-publish. Registered as "List (all rows)" in both configs' derivation select.

⚠ The published list covers `state.data` — the section's loaded rows. Spreadsheets fetch
page-sized windows, so a list-publisher should be unpaginated (`usePagination:false` +
`pageSize` ≥ expected rows + `display.maxHeight` for a scroll container) — the incident page's
Delay-by-TMC table uses pageSize 120 / maxHeight 420.

### 2. GridGraph overlay subscribers — `grid_cell_bands` + `grid_point`

The avl-layer GridGraph has always accepted `points` ({index, key, r/fill/stroke} → circle
centered on a cell) and `bounds` ({index, bounds:[xKeys]} → one border rect spanning the run)
— nothing upstream ever supplied them. Now:

- `ui/components/graph_new/index.jsx` — `useGetActions` passes each subscriber's whole `args`
  through on the action (additive; consumers previously read only column/value). Also fixed a
  latent crash: `_functions?.providers.find` → `providers?.find` (a section whose `_functions`
  has only `subscribers` — first ever such section — crashed every graph).
- `ui/components/graph_new/components/GridGraph.jsx` (wrapper) — builds the two overlay props
  from actions:
  - **`grid_cell_bands`**: param entries `"rowKey|xFrom|xTo"` (array of triplets, or
    comma-joined inside one value) → one border rect per matched row spanning the x keys
    from xFrom..xTo. **X bounds compare lexicographically against the x-axis category keys**
    (inclusive) — the publisher must emit them in the axis's own key vocabulary (e.g.
    zero-padded `"07:40"` for a 5-min tod axis; any ordinal string axis works). Styling via
    args: `stroke` (default #111827), `strokeWidth` (1.5).
  - **`grid_point`**: entries `"rowKey|xKey"` → ring/dot centered on that cell. Args: `r`
    (4.5), `fill` (#0F1722), `stroke` (#ffffff).
  - Both resolve rowKey → y index through `args.column`: a fetched row-level column constant
    per y row (like the height column) — e.g. a selectOnly `max(ds.tmc) as rowtmc` behind an
    `"intersection · tmc"` y label. Unmatched rowKeys/keys are skipped, which makes the
    overlays self-scoping: publish event-wide entries and only rows present in the current
    grid draw.
- `ComponentRegistry/graph_new/config.jsx` — author-facing subscriber descriptors
  ("Grid: Cell Bands", "Grid: Point Marker") with column-select + style args.

Pure overlays — no refetch; they redraw on param change.

## First consumer (tsmo2/incident_view, builder `build_tsmo2_incident_view.mjs`)

- Delay-by-TMC spreadsheet (2799⋈984): selectOnly triplet column
  `ds.tmc || '|' || lpad((min(ds.bound_start_time)*5/60)::text, 2, '0') || … as band`
  (bound_*_time are 5-min epoch indices → formatted to the grid's HH:MM keys) + list-publish
  `eventBands`; unpaginated pageSize 120 + maxHeight 420 scroll.
- Speed grid: selectOnly `max(ds.tmc) as rowtmc` + `grid_cell_bands` subscriber
  (paramKey `eventBands`, column rowtmc, stroke #1F3F8F). Verified: 88 band rects on the
  default event's I-495 corridor, re-scoping on corridor click.

## Notes / follow-ups

- `congestion_data.tmcBounds` on the event record is the same data event-wide; a scalar
  subquery attribute (`(select string_agg(…) from jsonb_each(…))`) does NOT survive the UDA
  attribute path (returns undefined) — hence publishing from the per-TMC table instead.
- Multi-day events: the HH:MM formatting wraps epochs within one day; bands on the grid's
  single activeDate day are correct, cross-midnight windows clamp visually (edge case, noted).
- Pre-existing page bug surfaced (NOT from this change): `tmclinear` values repeat across TMC
  regions (120-NYC vs 104-upstate), so the grid's `meta.tmclinear` filter can pull foreign
  rows — corridor-identity fix tracked in the transportny task.
