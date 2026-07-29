# Map hover popup never hydrates the feature whose ogc_fid is 0

> **Status:** ✅ FIXED + VERIFIED (2026-07-28). BC bugfix, one line in each of three copies.
> Verified live on the Freight Atlas map: the same feature that hung on "Fetching / Attributes 0"
> before the change renders `Orange County Transportation Council / OCTC` after it, with no other
> map behaviour altered. **Remaining:** sync the three files to transportNY with the other pending
> core syncs (batched, per the theme-sync recipe).
> **Origin:** TransportNY QA ticket 2191409 (client, 2026-07-15) — "Orange County Transportation
> Council (OCTC) polygon is not labelled like the others" on the Freight Atlas MPO layer. Filed as
> a data problem; it is a code problem.

## Root cause

DAMA vector tiles carry **no attribute properties** — `tiles.rest.js` emits geometry plus
`ogc_fid` only, and `ST_AsMVT(..., 'ogc_fid')` promotes that column to the MVT **feature id**:

```sql
SELECT ST_AsMVT(mvtgeom.*, 'view_${viewId}', 4096, 'geom', 'ogc_fid') AS mvt
```

So the hover popup has to fetch its own values: `onHover` hands `feature.id` to `HoverComp`, which
resolves the row through `uda[pgEnv].viewsById[view_id].dataById[id]`. That fetch was gated on:

```js
if (!id) return;
```

`ogc_fid = 0` is a perfectly ordinary value — it is what a 0-indexed source file produces, and
`ogc_fid` is copied from the temp table's `fid` verbatim by the GIS publish worker. For that one
feature `!id` is true, the effect returns before issuing the fetch, `attrInfo` stays `{}`, and the
popup renders its header and then sits on "Fetching / Attributes 0" forever. Every other feature
in the same layer hydrates normally, which is exactly why it reads as one polygon being
"not labelled like the others" rather than as a broken layer.

The bug is invisible in most views because most uploads are 1-indexed. `NYS MPOs` v2551 happened to
be 0-indexed, and OCTC was its first row.

## Fix

Test for *presence* instead of truthiness, in all three copies of the hover component:

```js
if (id === null || id === undefined || id === '') return;
```

| file | line (pre-fix) |
|---|---|
| `patterns/page/components/sections/components/ComponentRegistry/map/SymbologyViewLayer.jsx` | 1979 |
| `patterns/page/components/sections/components/ComponentRegistry/map_dama/SymbologyViewLayer.jsx` | 676 |
| `patterns/mapeditor/MapEditor/components/SymbologyViewLayer.jsx` | 918 |

Backward compatible: it strictly widens the set of ids that hydrate. `null`/`undefined` (no feature
under the cursor) and `''` still short-circuit, so the no-hover case is unchanged. The downstream
falcor path already stringifies (`''+id`), and `dataById` resolves `0` correctly server-side — the
guard was the only thing in the way.

Three copies is the pre-existing duplication between `map`, `map_dama`, and the map-editor layer
class; this change does not attempt to consolidate them. Any future edit to hover hydration has to
touch all three.

## Verification

Isolated the code fix from the data fix by testing against the *unchanged* view (2551, where OCTC is
still `ogc_fid` 0), same page, same hover point:

| | popup on the OCTC polygon |
|---|---|
| before | `MPOS` / `Fetching` / `Attributes 0` (permanent) |
| after | `MPOS` / `MPO Name: Orange County Transportation Council` / `MPO ACRONYM: OCTC` |

Neighbouring polygons (UCTC, NYMTC) rendered correctly both before and after, confirming nothing
else in the hover path moved.

## Related

- Ticket 2191409's *other* half was a genuine data fix (a corrected MPO upload, view 3578), which
  incidentally re-indexes `ogc_fid` from 1 and so also masks this bug for this one layer. The code
  fix is what keeps it from resurfacing on the next 0-indexed upload.
- `dama/upload/workers/gis-publish.js` — separate bug found in the same ticket: the worker did not
  filter `columnTypes` entries whose output name is empty, so any upload that drops a column failed
  with `zero-length delimited identifier`. Fixed alongside (see the DAMA notes in `todo.md`).
