# External Source Editable CRUD

## Objective

Let add/edit/delete work for external (DAMA/UDA-backed) datasources through the same Card/Spreadsheet authoring UI already used for internal sources, gated on the `isEditable` + primary-key infrastructure from [[set_primary_col_from_meta]]. Once a source has `isEditable: true` and a resolvable primary key, `dataWrapper`'s existing add/edit/delete machinery should treat it like an internal source, and a new write path in the UDA layer should carry the actual DML.

Depends on [[set_primary_col_from_meta]] — that task must land first (or at minimum, its server-side `detectRealPrimaryKey`/`isEditable`/`isPrimaryKey` metadata shape must be settled) since this task's server-side gating checks reuse it directly.

---

## Scope

**In scope**
- New UDA CALL routes for row-level create/update/delete against external tables (mirroring `dms.data.create/edit/delete`), resolving the physical table the same way reads already do, and using the *real* detected PK column for `WHERE` clauses — never the fallback-to-`'id'` behavior in the existing `resolvePrimaryKey`.
- Server-side authorization: the write routes independently re-check `metadata.isEditable === true` and that a real PK is resolvable before executing any DML. The client-side `isEditable` flag is a UX convenience, not a trust boundary.
- Relaxing `dataWrapper`'s add/edit/delete gates (currently hard-gated on `externalSource.isDms`) so they also work when `externalSource.isEditable` is true.
- `apiUpdate`/`dmsDataEditor` gaining a branch that calls the new UDA write routes when the source is external+editable, instead of `dms.data.*`.
- Typed value handling for native Postgres columns (external tables store real typed columns, not a JSONB `data` blob like DMS split tables) — coercion for dates/numbers/booleans per `metadata.columns[].type`.
- Single-row create/update/delete only (matches the Card/Spreadsheet single-row edit affordances this is replacing the gate for).

**Out of scope**
- Bulk/mass edit (`dms.data.massedit` equivalent) for external sources.
- Schema changes (add/remove columns) — unrelated, already handled by the existing MetadataComp "add column" flow.
- The offline-sync intercept branch in `dmsDataEditor` (`api/index.js` sync path) — internal-only, not extended here.
- Sources without `isEditable`/a resolvable PK — these continue to behave exactly as today (read-only), no regression risk intended.

---

## Current State

### `dataWrapper` — where editing is gated today

File: `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/index.jsx`. Exports `{ EditComp, ViewComp, getData }` wrapping whatever `component.EditComp`/`ViewComp` is (Card, Spreadsheet, etc.).

Both the `Edit` (author-side page editor) and `View` (visitor-facing) variants define their own `updateItem`/`addItem`/`removeItem` closures, and every one starts with an `isDms`-only guard:
- `updateItem` (Edit, ~314-315): `if(!state?.externalSource?.isDms || !apiUpdate || groupByColumnsLength) return;`
- `addItem` (Edit, ~358-359): same guard
- `removeItem` (Edit, ~373-374): `if(!state?.externalSource?.isDms || groupByColumnsLength) return;`
- `updateItem`/`addItem`/`removeItem` (View, ~520-521, ~567-568, ~591-592): identical `!state?.externalSource?.isDms` guards

Two more derived flags follow the same pattern:
- `allowEdit` passed to the rendered component: Edit ~line 390 (`state?.externalSource?.isDms && !groupByColumnsLength`), View ~line 446 (`... isDms && state?.display?.allowEditInView && Boolean(apiUpdate)`).
- `Card.jsx` `isAddingNewItem` (~line 708-709): `allowAdddNew && !item.id && isDms && addItem`.

When `isDms` is true, these functions call `apiUpdate(...)` with `{data, config: {format: dataFormat}}` (and `requestType: 'delete'` for removal), where `dataFormat` is built from `state.externalSource`.

### `apiUpdate` = `dmsDataEditor` — the only existing write path

`src/dms/packages/dms/src/api/index.js:380-547`. Inside `updateRow()`:
- create: `falcor.call(["dms","data","create"], [app, type, row])` (~line 527-530)
- update: `falcor.call(["dms","data","edit"], [app, id, row, type])` (~line 512)
- delete: `falcor.call(["dms","data","delete"], [app, type, id])` (~line 481-484)

There's also an offline-sync intercept branch (~lines 418-470) — internal-only, out of scope here.

### `dms.route.js`/`dms.controller.js` — cannot reach external tables

`src/dms/packages/dms-server/src/routes/dms/dms.route.js` write (CALL) routes: `dms.data.edit` (422-436), `dms.data.massedit` (438-449), `dms.type.edit` (451-464), `dms.data.create` (466-486), `dms.data.delete` (488-503). Every one delegates to a controller function (`dms.controller.js`: `setDataById`, `createData`, `deleteData`) that resolves the physical table via `resolveTable(app, type, dbType, splitMode, sourceId)` — always inside the **DMS's own** database, always keyed by the synthetic `id` column (`UPDATE ... WHERE id = ...`, `DELETE FROM ... WHERE id = ...`, `INSERT INTO ...(id, app, type, data, ...)`). This file has no concept of an external table at all — it cannot be extended in place; a parallel write path is needed in the **UDA** layer, which already knows how to resolve external tables (`getEssentials`/`getDataTableFromViewId`).

### UDA layer — currently read-only for row data

`src/dms/packages/dms-server/src/routes/uda/uda.route.js` exposes only read routes for row data (`dataById`, `dataByIndex`, `simpleFilter`/`simpleFilterLength`) plus source/view-metadata admin CALL routes (`uda.sources.setIndex`, `.update`, `.delete`, `.hardDelete`, `.setPrimaryKey` once [[set_primary_col_from_meta]] lands). No `INSERT`/`UPDATE`/`DELETE` exists anywhere for row data on external tables today.

`getEssentials({env, view_id, options})` (`uda/utils.js:92-218`) is the existing resolver: branches on `isDms = env.includes('+') && !options.isDama`; for DAMA/external it calls `getDataTableFromViewId({db, view_id})` (`utils.js:223-243`) which does `SELECT v.table_schema, v.table_name, s.metadata FROM data_manager.views v LEFT JOIN data_manager.sources s ON s.source_id = v.source_id WHERE v.view_id = $1`. This is the exact resolution the new write routes should reuse.

`dataById(ctx, ids, attributes)` in `query_sets/postgres.js:481-493` shows the read-side column-accessor pattern for external tables (plain column names, not `data->>'col'`) that the new write routes' `INSERT`/`UPDATE` payload-building must mirror.

### `externalSource` schema — needs a new field

`src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/schema.js:14-19,56-58` documents the per-section `externalSource` shape: `{ source_id, view_id, isDms, env, srcEnv, app, type, columns, name, view_name, baseUrl }`. `isDms` is copied from the matching datasource entry in `useDataSource.js` (~lines 142, 267, 293) when the author picks a source. `isEditable` needs to be copied the same way once [[set_primary_col_from_meta]] adds it to the source/datasource shape.

---

## Proposed Changes

### 1. New UDA write routes

`src/dms/packages/dms-server/src/routes/uda/uda.route.js` — three new CALL routes, naming TBD against existing conventions (candidates: `uda.data.create` / `uda.data.edit` / `uda.data.delete`, namespaced under `uda` to avoid colliding with `dms.data.*`):
- `uda.data.create` — args `[env, view_id, row]` → controller `createExternalRow`.
- `uda.data.edit` — args `[env, view_id, id, row]` → controller `updateExternalRow`.
- `uda.data.delete` — args `[env, view_id, id]` → controller `deleteExternalRow`.

### 2. Controller functions

`src/dms/packages/dms-server/src/routes/uda/uda.controller.js`. Each:
1. Resolves `{db, table_schema, table_name, metadata}` via `getEssentials`/`getDataTableFromViewId` (reuse existing helpers, do not duplicate).
2. **Re-validates server-side**: `metadata.isEditable === true` and a real PK is resolvable (`detectRealPrimaryKey` from [[set_primary_col_from_meta]], or the persisted `metadata.columns[].isPrimaryKey` column name) — throw/reject otherwise, regardless of what the client sent.
3. Builds typed `INSERT`/`UPDATE`/`DELETE` SQL against the real columns (not JSONB), using `metadata.columns[].type` to coerce values (dates, numbers, booleans) the same way `gis-publish.js`/`csv-publish.js` already do during ingest.
4. `WHERE "${pkCol}" = $N` for update/delete, using the *resolved-and-verified* PK column, never a guess.
5. Returns the affected row (for create, including the DB-assigned PK value if it's a serial/identity column) so the client can update its local cache the same way `dms.data.create`'s response does today.

### 3. `dataWrapper` gating changes

`dataWrapper/index.jsx` — change the six guards from `!state?.externalSource?.isDms` to `!(state?.externalSource?.isDms || state?.externalSource?.isEditable)` (Edit: ~314-315, 358-359, 373-374; View: ~520-521, 567-568, 591-592). Update the two `allowEdit` derivations (~390, ~446) the same way. `Card.jsx` `isAddingNewItem` (~708-709): same `isDms || isEditable` change.

### 4. `apiUpdate`/`dmsDataEditor` branch

`src/dms/packages/dms/src/api/index.js` `updateRow()` (~380-547) — when `config.format.isDms` is falsy but `config.format.isEditable` is true, call the new `uda.data.create/edit/delete` routes (with `env`/`view_id` from the format) instead of `dms.data.*`. Cache invalidation after each call should mirror what the existing `dms.data.*` branch already does for the equivalent UDA read paths (`uda[env].viewsById[view_id].dataByIndex`/`.dataById`) so the UI reflects the change without a full reload.

### 5. `externalSource` schema + copy-through

`dataWrapper/schema.js` — add `isEditable` to the documented shape (~lines 14-19, 56-58). `useDataSource.js` (~lines 142, 267, 293) — copy `isEditable` from the datasource entry the same way `isDms` is copied today.

---

## Files Requiring Changes

| File | Change |
|---|---|
| `packages/dms-server/src/routes/uda/uda.route.js` | New CALL routes: `uda.data.create`, `uda.data.edit`, `uda.data.delete` |
| `packages/dms-server/src/routes/uda/uda.controller.js` | `createExternalRow`/`updateExternalRow`/`deleteExternalRow` — resolve table, re-validate `isEditable`+PK server-side, typed DML using the real PK column |
| `packages/dms/src/patterns/page/components/sections/components/dataWrapper/index.jsx` | Relax the six `isDms`-only CRUD guards and two `allowEdit` derivations to `isDms \|\| isEditable` |
| `packages/dms/src/patterns/page/components/sections/components/dataWrapper/schema.js` | Add `isEditable` to the `externalSource` shape docs |
| `packages/dms/src/ui/components/Card.jsx` | `isAddingNewItem` (~line 708-709): `isDms \|\| isEditable` |
| `packages/dms/src/api/index.js` | `dmsDataEditor`/`updateRow()` branch: call `uda.data.*` routes when external+editable instead of `dms.data.*` |
| `packages/dms/src/patterns/page/pages/_utils/useDataSource.js` (or wherever `isDms` is copied onto `externalSource`, ~lines 142, 267, 293) | Copy `isEditable` through the same way |

---

## Testing Checklist

- [ ] External source, `isEditable: false` (no PK, or PK exists but toggle off): verify add/edit/delete UI is not shown and no CRUD calls are made — exact current (pre-feature) behavior, no regression.
- [ ] External source, `isEditable: true`, real PK set: add a new row via Card — verify row appears in the real Postgres table with correct typed values, and the UI reflects the DB-assigned PK.
- [ ] Same source: edit an existing row's value via Card/Spreadsheet — verify `UPDATE` lands on the correct row (matched by real PK, not a guess) and typed value coercion is correct for at least one non-text column type (number, date, boolean).
- [ ] Same source: delete a row — verify it's removed from the real table and disappears from the UI without a full reload.
- [ ] Attempt a write via a manually-crafted Falcor call to `uda.data.edit` against a source with `isEditable: false` (bypassing the UI) — verify the server rejects it (confirms server-side re-validation isn't just relying on the client flag).
- [ ] Attempt a write against a source where the PK became unresolvable after being set (e.g. constraint dropped out-of-band) — verify the server rejects rather than guessing a column.
- [ ] Internal (`isDms: true`) sources: verify existing add/edit/delete behavior is completely unchanged (no regression from the gating changes in `dataWrapper`/`Card.jsx`/`apiUpdate`).
- [ ] Grouped views (`groupByColumnsLength` truthy): verify CRUD remains disabled for both internal and now-editable external sources (existing `groupByColumnsLength` short-circuit preserved).
- [ ] Multiple concurrent edits/creates on the same external source from two browser sessions: verify no corruption (relies on the DB's own PK/unique constraint enforcement — no new locking needed, but worth a smoke test).
