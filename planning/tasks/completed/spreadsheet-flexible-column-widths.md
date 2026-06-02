# Spreadsheet: fixed-width columns coexisting with flex-stretch columns

**Topic:** ui (`table` / Spreadsheet primitive). **Status:** ✅ done & verified (2026-06-01).

## ✅ Implemented & verified
- `index.jsx` — added module-level `augmentColSizing(c, defaultColumnSize, forceFixed?)`
  → adds `_hasFixedSize` + `_track` to every column in `structureValues` (and the fixed
  actions column). Add-new footer template + cell widths updated to honour `_track` /
  `_hasFixedSize`.
- `TableHeader.jsx` / `TableRow.jsx` — `grid-template-columns` joins `c._track`.
- `TableCell.jsx` — cell `width` pinned only when `_hasFixedSize`, else unset (fills track).
- `RenderGutter.jsx` — left untouched (dead code; not imported anywhere).
- **Note:** the existing auto-fit effect (`index.jsx:318`) already sets `defaultColumnSize =
  max(120, gridWidth/numCols) − 5`, which becomes the `minmax` floor — so flex columns
  stretch *above* it to fill, and never crash below it.

**Verified live (MAP-21 page, Playwright):**
- §04 MPO (narrow 56px `#`, 6 unsized): grid now `0px 56px` + six `1fr` tracks ≈178px each
  summing to the full 1126px container — **fills width**, header/body aligned, "PHED TOT ·
  DIAG." header no longer truncated. (Was ~104px short before — the old code sized all 7
  columns at `gridWidth/7` but the 56px `#` left the row short.)
- §06 download (30 columns): tracks hold the **115px floor**, `scrollWidth 3335 > clientWidth
  1126`, parent `overflow-x:auto` → **scrolls as before**. No cramming, no regression.
- No new console/page errors (only the pre-existing key-spread warning).

## Problem
The Spreadsheet renders as a **CSS grid** (not an HTML `<table>`), so it must declare a
width for every column via `grid-template-columns`. Today every column track is a fixed
`${size}px` (author `size`, or `defaultColumnSize` = 250 when unset), and every cell also
hard-sets `style={{ width: size }}`. Consequence: if the fixed widths sum to **less than**
the container, the grid leaves empty space on the right — the table doesn't fill its width.
Surfaced by narrowing the MAP-21 §04 `#` column to 56px: the row no longer spans full width.

## Goal
Columns **with an explicit `size`** (author-set in the toolbar, or pinned by a drag-resize)
keep that exact px width. Columns **without** an explicit size **stretch** to share the
leftover width, never shrinking below the default. BC + render-performance conscious.

## Solution
A column with an explicit size → fixed track `${size}px`. A column with no explicit size →
`minmax(${defaultColumnSize}px, 1fr)`:
- when fixed widths sum **< container** → the `1fr` columns expand to fill (the fix);
- when they sum **≥ container** → each flex column floors at its default and the container
  scrolls (`overflow-x-auto`) — i.e. **today's behavior is preserved** for wide tables.

Single source of truth: compute once, in `index.jsx structureValues`, two derived fields per
column and let them flow through the existing column objects (no new prop plumbing):
- `_hasFixedSize` — author/resize set an explicit `size`.
- `_track` — the grid-template token (`'56px'` or `'minmax(250px, 1fr)'`).

Then:
- the three `grid-template-columns` builders (`TableHeader`, `TableRow`, the add-new footer
  in `index.jsx`) join `c._track` instead of `` `${c.size}px` ``;
- cells pin width only when fixed: `width: attribute._hasFixedSize ? attribute.size : undefined`
  (`TableCell`, `TableHeader`, footer, `RenderGutter`). A grid item with `width:auto` fills
  its track, so flex columns stretch and stay aligned with the header.

### BC
- Tables with **no** explicit sizes: previously fixed 250px each (could underfill / overflow);
  now stretch to fill when there's slack, unchanged when they overflow. No config breaks.
- **Resize** writes `column.size` (px) → the column becomes `_hasFixedSize` → fixed. Correct.
- **Frozen** columns here are class/`sticky`-based (no size→offset math), so flex tracks
  don't break a computed offset. (A flex frozen column is an pre-existing edge case.)

### Performance
`_track`/`_hasFixedSize` are computed in the existing `structureValues` `useMemo` (keyed on
`columns`/`defaultColumnSize`) — O(cols), no per-row cost added. The per-row/header template
`useMemo`s keep their current shape (string join over the sliced window); deps unchanged, so
no extra renders. (A later optimization could hoist the joined string to the parent and pass
it down once, removing the per-row join entirely — noted, not required.)

### Caveat / open question (worth confirming before implementing)
- **Horizontal column virtualization.** If the table slices columns by a visible
  `[start,end]` window, a `1fr` track distributes leftover among *visible* columns only.
  In practice this is benign: when flex columns have slack they fill the viewport (nothing
  to scroll to), and when they don't they sit at the floor and behave like today's fixed
  px (scrollable). But it should be eyeballed on a genuinely wide table (20+ cols) to
  confirm no surprise. The report tables here render all columns, so they're unaffected.
- **`truncate` inside a flex track.** Grid items default to `min-width:auto`, which can
  resist shrinking below content. The `minmax` floor (≥250px) means flex columns never go
  that small, so existing `truncate` keeps working; only relevant if a future default size
  drops very low.

### Assessment
This is a sound, backwards-compatible, low-risk solution that uses CSS grid the way it's
meant to be used (`minmax(min, 1fr)` for elastic tracks). It's the standard fix for exactly
this "grid needs to know widths but should still fill" problem. Recommend implementing.

## Files
- `ui/components/table/index.jsx` — `structureValues` augments columns with `_hasFixedSize` /
  `_track`; the add-new footer template + cell widths.
- `ui/components/table/components/TableHeader.jsx` — template + header-cell width.
- `ui/components/table/components/TableRow.jsx` — template.
- `ui/components/table/components/TableCell.jsx` — cell width.
- `ui/components/table/components/RenderGutter.jsx` — gutter template + width (secondary path).

## Verify
- MAP-21 §04 (narrow `#`, rest unsized) now fills the container; columns stretch evenly.
- A wide many-column table still scrolls (floors hold).
- Drag-resize a column → it pins; neighbors re-flow.
