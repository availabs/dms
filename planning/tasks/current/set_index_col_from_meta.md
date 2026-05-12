# Set Index Column from Metadata UI

## Objective

Add a toggle on the metadata page that lets users mark a column as an index on both `internal_table` (DMS) and external (DAMA) data sources. Back the toggle with a dedicated UDA CALL route so the DDL (CREATE/DROP INDEX) is atomic and server-validated.

---

## Research Summary

### `internal` vs `internal_table`

**`internal` sources can no longer be created.** The `siteConfig.jsx` for the datasets pattern only registers `internal_table`; `sourceCreate.jsx` hardcodes `type: 'internal_table'`. The old `internal/` folder still exists but is used only as a shared-component library (upload, admin, validate) imported by `internal_table`. No feature work is needed for `internal` — existing rows (if any) are already served by the `internal_table` UI path via the `isDms` flag.

### How metadata is stored

| Source kind | Column array location |
|---|---|
| `internal_table` (DMS) | `source.data.config.attributes` |
| External (gis_dataset, csv_dataset, …) | `source.data.metadata.columns` |

Both arrays hold flexible JSON objects. The index flag is stored as `index: true` on the column object.

### Current metadata editing flow

1. `metadata.jsx` renders `<MetadataComp>` with `accessKey='attributes'` (DMS) or `accessKey='columns'` (external).
2. `MetadataComp/index.jsx` maps columns → `RenderField.jsx` for individual column editing.
3. `RenderField.jsx` renders type/required/display/options/etc. in basic + advanced panels.
4. `onChange` serializes the full column array and calls `updateSourceData()` → `apiUpdate`.

---

## Scope

**In scope**
- `internal_table` and external sources — index toggle in `MetadataComp`.
- One index per source (toggling a column ON clears the flag on all other columns).
- UDA CALL route `setIndex` to atomically validate, persist, and run DDL server-side.
- Visual indicator ("IDX" badge) in the column list for columns marked as indexed.
- Support unsetting the index from the UI (passing `null` to the CALL route). ← **remaining**

**Out of scope**
- DDL `ALTER TABLE … ADD PRIMARY KEY` (actual SQL PK constraint). We create/drop a btree index.
- Old `internal` rows — not creatable; handled by existing paths if they appear.

---

## Implementation Plan

### Phase 1 — Frontend: index toggle in RenderField ✓

**File:** `packages/dms/src/patterns/datasets/components/MetadataComp/components/RenderField.jsx`

- Added `RenderIndexSwitch` with label "Index" and an "IDX" badge in the column header.
- Toggle calls `onSetIndex(colName, enable)`.

**File:** `packages/dms/src/patterns/datasets/components/MetadataComp/index.jsx`

- Implemented `setIndex(colName, enable)` with mutual-exclusivity logic.
- Passes `onSetIndex={setIndex}` to each `RenderField`.

### Phase 2 — Backend: UDA CALL route ✓

**File:** `packages/dms-server/src/routes/uda/uda.route.js`

CALL route: `uda.sources.setIndex`
Arguments: `[env, sourceId, columnName | null]`

Logic:
1. Fetch source row.
2. Determine column array (`config.attributes` for DMS, `metadata.columns` for external).
3. Set `index: true` on the named column; remove the flag from all others.
4. Persist via `updateSource()`.
5. Run DDL: drop old index (`pk_<table>_<oldCol>`), create new index (`pk_<table>_<newCol>`).
6. Invalidate affected Falcor paths.

**File:** `packages/dms-server/src/routes/uda/uda.controller.js`

- `setIndexColumn(env, sourceId, columnName)` implements the above for both DMS and DAMA source paths.

### Phase 3 — Wire frontend to CALL route ✓

`metadata.jsx` calls `falcor.call(['uda', 'sources', 'setIndex'], [env, id, columnName])` on toggle.

### Phase 4 — Support unsetting index from UI [ ]

Currently `metadata.jsx` has an early return when `columnName` is null/falsy, so toggling a column OFF does not reach the server. The CALL route already handles `null` correctly (clears all index flags and drops the old DB index). The fix is to remove the guard and let the null propagate.

**File:** `packages/dms/src/patterns/datasets/pages/dataTypes/gis_dataset/pages/metadata.jsx`

```js
// remove: if(!columnName) return;
onIndexChange={async (columnName) => {
    await falcor.call(['uda', 'sources', 'setIndex'], [env, id, columnName]);
}}
```

---

## Files Changed

| File | Change |
|---|---|
| `packages/dms/src/patterns/datasets/components/MetadataComp/components/RenderField.jsx` | `RenderIndexSwitch` + IDX badge; `onSetIndex` prop |
| `packages/dms/src/patterns/datasets/components/MetadataComp/index.jsx` | `setIndex` mutual-exclusivity handler; `onIndexChange` prop |
| `packages/dms-server/src/routes/uda/uda.route.js` | `setIndex` CALL route |
| `packages/dms-server/src/routes/uda/uda.controller.js` | `setIndexColumn()` with DDL management |
| `packages/dms/src/patterns/datasets/pages/dataTypes/gis_dataset/pages/metadata.jsx` | Wires `onIndexChange` to CALL route |

---

## Testing Checklist

- [ ] `internal_table` source: toggle index ON — verify `index: true` saved in `source.config.attributes`
- [ ] `internal_table` source: toggle index on a second column — verify first column's flag is cleared
- [ ] External (`gis_dataset`) source: same two tests on `source.metadata.columns`
- [ ] Toggle index OFF — verify flag cleared in metadata and DB index dropped (Phase 4)
- [ ] UDA CALL route: call `setIndex` with `null` — verify all index flags cleared
- [ ] No index set: verify all toggle controls render unchecked
- [ ] Reload after save: verify index toggle state persists
