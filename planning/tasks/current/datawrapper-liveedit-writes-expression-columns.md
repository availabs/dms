# dataWrapper updateItem writes calc-expression columns into row data

## Status: FIXED 2026-08-31 (found during the MNY worklists live build)

## Bug

`dataWrapper/index.jsx`'s `updateItem` composes the row update from `editableColumns`,
which filtered only `!(serverFn && joinKey) && editable !== false` — i.e. it included
EVERY section column: calculated columns, static cells, selectOnly siblings. For each,
`acc[col.name] = d[col.name]` keys the update by the column's raw `name` — for a calc
column that name is the whole SQL SELECT expression.

Because the server's `dms.data.edit` route jsonb-MERGES (`data || $1`), every
liveEdit pick / form save then wrote keys like

```
"CASE WHEN data->>'implementation_status' IS NULL THEN 'Not Reported' … as status_norm": "Proposed"
"(id)::text as view_link": 2171548
```

into the live row's `data` JSONB — permanent data pollution on an internal source
(observed: row 2171548 of Actions_Revised 1029065 gained 8 junk keys from one pick;
keys can't be REMOVED via the public API, merge-only). Every `allowEditInView` grid
built to date (e.g. the prioritize page 2262755's worklist) shares the latent bug.

## Fix (BC)

`editableColumns` now excludes columns that can never be writable source fields:
`selectOnly`, `origin: 'calculated-column' | 'static'`, `type: 'calculated' | 'formula'`,
and any column whose `name` contains whitespace (a SQL expression, never a field).
Plain source columns (the actual edit targets and untouched siblings) still round-trip
exactly as before, so the action-edit page's form save and existing editable grids are
unchanged.

## Files

- `src/patterns/page/components/sections/components/dataWrapper/index.jsx` — the
  `editableColumns` memo.

## Verification

- MNY workspace worklist (internal 1029065): tier pick → row diff vs pre-test snapshot
  shows ONLY `county_priority` (+ the pre-existing `id` shadow the API always writes).
- Residue: row 2171548 carries 8 now-nulled junk keys from the pre-fix pick (merge-only
  API can't drop keys) — one-off SQL cleanup for the owner:
  `UPDATE <split table> SET data = data - '<key>' …` for the 8 keys.
