# External Source Editable CRUD

**Status (2026-07-08): implemented, stub-DB verified, not yet live-tested.** No Postgres or browser was reachable in this sandbox (same constraint as [[set_primary_col_from_meta]]); Docker was present but its daemon wasn't running, so the `test:pg` path couldn't be used either. See "Verification Notes" at the end of this file.

**Update (2026-07-08, same day): three bugs found from the requester's own live testing, all fixed.** These surfaced from clicking through a real external+editable source in a real browser — the requester did the live testing this sandbox couldn't do. See "Bugs Found During Live Testing" below, added right after the main Proposed Changes section.

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

### 1. New UDA write routes — DONE

`src/dms/packages/dms-server/src/routes/uda/uda.route.js` — three new CALL routes, placed right before the existing `dataById` GET route:
- `uda.data.create` — args `[env, view_id, row]` → controller `createExternalRow`.
- `uda.data.edit` — args `[env, view_id, id, row]` → controller `updateExternalRow`.
- `uda.data.delete` — args `[env, view_id, id]` → controller `deleteExternalRow`.

Implemented exactly as scoped, with one response-shape decision not spelled out in the original plan: **`create`/`edit` write the returned row's attributes directly onto the same graph path the `dataById` GET route already uses** (`uda[env].viewsById[view_id].dataById[id][attribute]`), rather than returning `invalidated: true` on that path. This mirrors `dms.data.create`'s route (which populates `dms.data.byId[id][attr]` via `dataByIdResponse` rather than invalidating it) and lets the client extract the new/updated row's `id` synchronously from the CALL response the same way `dmsDataEditor` already does for `dms.data.create` (`Object.keys(res?.json?.dms?.data?.byId||{})[0]`) — see §4. `delete` invalidates that same specific `dataById[id]` path (nothing else in its response writes there, so no collision). Broader list/pagination cache invalidation (the `options[...]`-keyed subtree) is handled client-side instead — see the design note in §4.

### 2. Controller functions — DONE

`src/dms/packages/dms-server/src/routes/uda/uda.controller.js` — added `resolveEditableTable(env, view_id)` (shared helper), `coerceColumnValue`/`buildRowPayload`, and `createExternalRow`/`updateExternalRow`/`deleteExternalRow`, placed right before `clearViewData`. Each row-write function:
1. Calls `resolveEditableTable`, which loads `{table_schema, table_name, metadata}` via a direct `data_manager.views JOIN data_manager.sources` query keyed by `view_id` (same join `getDataTableFromViewId` in `utils.js` does, but that helper only surfaces `idxColumn`, not the full metadata this needs — duplicating the small join inline keeps the SQL readable at the call site per `dms-server/CLAUDE.md`'s SQL-readability convention, rather than growing a shared helper's return shape for one caller).
2. **Re-validates server-side, unconditionally**: throws if `isDms` (external-only), if `db.type !== 'postgres'`, if `metadata.isEditable` is falsy, or if `detectRealPrimaryKey` (from [[set_primary_col_from_meta]]) returns no real PK. None of this trusts the client.
3. Whitelists the incoming row against `metadata.columns[].name` (`buildRowPayload` — drops any key not declared on the source, e.g. UI-only fields) and coerces each value via `coerceColumnValue` per the column's bare-Postgres `type` (numeric types → `Number()`, `BOOLEAN` → truthy-string parsing, `JSON`/`JSONB` → `JSON.stringify` if not already a string, everything else passed through as-is).
4. Builds parameterized `INSERT .../UPDATE .../DELETE ...` against the real columns (not JSONB) with `RETURNING *`, using the *resolved-and-verified* PK column in the `WHERE` clause for update/delete — `updateExternalRow` also strips the PK from the SET payload so a row update can never overwrite it.
5. Returns the affected row with `id` aliased from the real PK column value (`{...row, id: row[pkCol]}`), matching the shape `dataById`'s read path already returns, so the client's local-state update (`res.id`) works identically to the DMS-internal path.

**Design note — no fine-grained permission check added.** The task's own scope only calls for re-validating `isEditable` + a resolvable PK, not a specific permission string. I checked `datasets.format.js`'s `permissionDomain` vocabulary (`view-source`, `update-source`, `create-view`, `delete-source`, `edit-source-permissions`, `*`) and confirmed there is no existing permission scoped to *row data* mutation, and that the DMS-internal counterpart these routes replace (`dms.data.create`/`dms.data.edit` in `dms.route.js`) has **zero** permission check today (only `dms.data.delete` requires `this.user` to be truthy). To keep the same security posture as the code being mirrored rather than inventing a new permission unilaterally, none of the three new routes call `isUserAuthedForSource`. If/when a `edit-source-data`-style permission is added to the datasets permission model, these routes should adopt it — flagging for whoever picks that up next rather than blocking on it here.

### 3. `dataWrapper` gating changes — DONE

`dataWrapper/index.jsx` — all six guards changed from `!state?.externalSource?.isDms` to `!(state?.externalSource?.isDms || state?.externalSource?.isEditable)` (Edit: `updateItem`/`addItem`/`removeItem`; View: `updateItem`/`addItem`/`removeItem`), plus both `allowEdit` derivations, plus the `useMemo`/`useCallback` dependency arrays that referenced `state?.externalSource?.isDms` (added `state?.externalSource?.isEditable` alongside). `Card.jsx` line passing `isDms={sourceInfo.isDms}` into `RenderItem` changed to `isDms={sourceInfo.isDms || sourceInfo.isEditable}` — confirmed via a targeted search that `RenderItem`'s `isDms` prop only drives `isAddingNewItem`/`isNewItem` (its downstream `CardColumnField` forwarding of `isDms` is dead — never read there), so this single-line change has no other side effects.

### 4. `apiUpdate`/`dmsDataEditor` branch — DONE

`src/dms/packages/dms/src/api/index.js` `updateRow()` — added a branch at the very top (before the dms-format/offline-sync machinery) that fires when `!config?.format?.isDms && config?.format?.isEditable`: reads `{srcEnv: env, view_id}` off `config.format` (this is `state.externalSource`, whose `srcEnv` field already holds the real pgEnv config name — confirmed the same field `EditableToggle`/`setPrimaryKey` calls already key off), then calls `uda.data.create/edit/delete` instead of `dms.data.*`, entirely bypassing dms-format attrs and the offline-sync intercept (both DMS-internal concepts, out of scope per this task).

**Design note — invalidation strategy.** After each `uda.data.*` call, the client does `falcor.invalidate(['uda', env, 'viewsById', view_id])` — a broad invalidate of the whole view's cached subtree (dataById *and* any options-keyed paginated/length queries), mirroring the existing `uda.viewsById.clearData` route's own invalidation shape. This intentionally also invalidates the row the CALL response just populated (see §1) — the same apparent redundancy already exists in `dms.data.edit`'s client branch today (it invalidates `dms.data.byId[id]` right after the route wrote fresh values there), so this isn't a new pattern, just the UDA-side equivalent. There's no static "list" path to invalidate the way DMS has `${app}+${type}` — UDA list/length queries are keyed by a dynamic JSON `options` string — so the coarse subtree invalidate is the only viable option without threading the caller's exact cached query keys through.

### 5. `externalSource` schema + copy-through — DONE

`dataWrapper/schema.js` — added `isEditable` to both documented shapes (source of the v2 config, and the fields-persisted block). `dataWrapper/useDataSource.js`'s `getSources()` — the `attr === "metadata"` branch now also extracts `isEditable: !!value?.isEditable` alongside `columns` (previously this branch silently dropped everything from the metadata blob except `.columns`, which is why `state.externalSource.isEditable` would otherwise never reach the client at all — this fix was necessary for the whole feature to work end-to-end, not just documentation).

**Correction to the original plan:** the file is `packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataSource.js`, not `packages/dms/src/patterns/page/pages/_utils/useDataSource.js` (that path doesn't exist). `isDms` copy-through sites are at lines 58, 77-78, 142, and 260 of the real file — not 142/267/293 as originally noted.

---

## Bugs Found During Live Testing (2026-07-08) — all fixed

### Bug 1: row `.id` was `undefined` for external+editable rows — edits silently became spurious creates

**Symptom:** an edit/live-edit fired an API call, but with `id: undefined`. Root cause: an external source's primary key can be on any column (that's the whole point of [[set_primary_col_from_meta]] — `ogc_fid`, `geoid`, anything), but `dataWrapper/getData.js`'s row-identity logic (the block that decides which column to fetch/alias as the row's `.id`) was gated purely on `isDms`:
```js
// before (getData.js)
if (isDms && !isPivotMode && !options.groupBy.length && !fnColumnsExists) {
    columnsToFetch.push({ name: idCol, reqName: idReq }); // idCol/idReq always literally "id"
    ...
} else {
    // strips any "id"-named column from the request entirely
}
```
For DMS split tables this is correct — the physical column really is named `id`. For an external source the physical PK column is whatever the admin picked, so the `else` branch ran and **no row-identity column was ever requested at all** — every row object came back with no `.id` field, regardless of `isEditable`.

Consequence, traced all the way through: `dataWrapper/index.jsx`'s update/create/delete closures all hardcode `{id: row.id}` when building the DB payload (`row.id` → `undefined`) → `api/index.js`'s `dmsDataEditor` `updateRow` checks `if (id) { ...edit... }` / `if (requestType === 'delete' && id) { ...delete... }`, both false when `id` is falsy → **every edit and every delete silently fell through to the `create` branch instead**, producing spurious duplicate `INSERT`s rather than the intended `UPDATE`/`DELETE`. In `Card.jsx` specifically, the effect was more often a silent no-op (its `isFormLikeEditMode`/`isLiveEdit`/`isAddingNewItem` gates all separately require a truthy `tmpItem.id`, so typing did nothing rather than mis-firing) — but `ui/components/table/components/TableCell.jsx`'s live-edit effect has no such id gate and calls `updateItem` unconditionally on value change, so Spreadsheet was the one actually producing the spurious creates.

**Fix:**
- `dataWrapper/useDataSource.js` — `getSources()`'s metadata extraction now also derives `pkeyColumn` (the column flagged `isPrimaryKey` in `metadata.columns[]`) alongside `columns`/`isEditable`.
- `dataWrapper/getData.js` — the id-column block now also fires for `isEditableExternal` (`!isDms && sourceInfo.isEditable && sourceInfo.pkeyColumn`), requesting `sourceInfo.pkeyColumn` **aliased `AS id`** (`${pkeyColumn} as id`, or `ds.${pkeyColumn} as id` when a join is present) rather than assuming the literal column name `id`. The *output* key (`column.name`) is always `"id"` — only the raw SQL reference (`reqName`/`orderBy` key) varies — so every downstream consumer that already hardcodes `.id` (dataWrapper, Card, TableCell, api/index.js) keeps working unmodified once the row actually carries that field. For DMS and for external-non-editable sources this is byte-identical to the old behavior (verified by construction: `pkColName` only deviates from the literal `"id"` when `isEditableExternal` is true).
- **Known residual gap, not fixed:** if a source's real PK is dropped/changed directly in the DB out-of-band (the same edge case flagged as a deferred limitation in [[set_primary_col_from_meta]]'s bug #1), the client's `pkeyColumn` (from the persisted `metadata.columns[].isPrimaryKey` flag) could point at a stale column. The write routes' own `detectRealPrimaryKey`-based re-validation means this fails safely — `updateExternalRow`/`deleteExternalRow` would find 0 matching rows and throw `"Row {id} not found"` rather than corrupting data — but the client wouldn't proactively detect the mismatch. Not fixed here; same class of issue as the already-documented one, deferred alongside it.

### Bug 2: `columnTypes` registry was missing a `'string'` entry — no edit control rendered at all for `type: 'string'` columns

**Symptom:** some columns rendered no interactive edit control in Card/Spreadsheet at all (not even a broken one) regardless of `allowEditInView`/`liveEdit`, while others (e.g. `type: 'text'`) worked. Root cause, in `ui/components/Card.jsx`'s `CompWrapper` (and the identical pattern in `ui/components/table/components/TableCell.jsx:292`):
```js
const Comp = ColumnTypes[attribute.type]?.[editMode ? 'EditComp' : 'ViewComp'] || DefaultComp;
```
`DefaultComp` is a static, non-interactive `<div>{value}</div>` — the silent fallback for any `attribute.type` not present in the `ColumnTypes` registry at all. `packages/dms/src/patterns/datasets/components/MetadataComp/components/RenderField.jsx`'s `fieldTypes` dropdown (the UI authors use to set a column's type) offers `{ value: 'string', label: 'string (text)' }` as a real, selectable option — but `ui/columnTypes/index.jsx`'s registry only ever defined `'text'`, never `'string'`. Any column an author typed as "string (text)" — which is common for external/DAMA columns, since that's exactly the shape in the bug report's JSON dump (`municipality_type`/`census_type` both `"type":"string"`) — silently got zero edit affordance, forever, in both Card and Spreadsheet (both consume the same shared registry).

**Fix:** `ui/columnTypes/index.jsx` — added `'string': text` (aliasing to the exact same `TextEdit`/`TextView` pair as `'text'`, matching the dropdown's own "string (text)" labeling of intent). This is a general column-rendering fix, not external-source-specific — it would have silently broken 'string'-typed columns on internal (DMS) sources too, for exactly as long as that dropdown option has existed.

### Bug 3: "Allow editing" toggle didn't visually flip until a full page refresh (write itself was correct)

**Symptom:** clicking the `EditableToggle` switch on the source admin page ([[set_primary_col_from_meta]]) persisted correctly (confirmed by refreshing), but the switch didn't visually update until that refresh. Root cause, `default/admin.jsx`'s `EditableToggle`:
```js
// before
const data = JSON.stringify({...(source?.metadata || {}), isEditable: e});
updateSourceData({data, attrKey: 'metadata', isDms: false, setSource, format, source, pgEnv, falcor, id});
```
`updateSourceData` (`default/utils.js:74-98`)'s success callback does `setSource({...source, [attrKey]: data})` **verbatim** — whatever `data` was is what lands in local `source.metadata`. Every other caller of `updateSourceData({attrKey: 'metadata', ...})` (e.g. `gis_dataset/pages/metadata.jsx`'s `MetadataComp` `onChange`) passes the **raw object**, so `source.metadata` stays an object after the optimistic update, matching the shape a GET response would parse it into. `EditableToggle` alone pre-`JSON.stringify`'d its payload before calling `updateSourceData`, so post-click `source.metadata` became a raw **string** — and `isEditable = !!source?.metadata?.isEditable` reads `undefined` off a string, always false, until the next full `getSourceData()` refetch replaced `source` with a properly-parsed object.

**Fix:** `default/admin.jsx` — `EditableToggle` now passes the raw object (`{...(source?.metadata || {}), isEditable: e}`), matching every other `updateSourceData({attrKey:'metadata', ...})` call site's convention.

All three fixes were code-reviewed against the exact data-flow paths involved but **not live-browser-verified in this sandbox** (same constraint as the rest of this task) — the requester should re-test the same three scenarios (toggle click, typing in a `string`-typed column, editing/deleting a row on a non-`id`-named-PK source) against a real external Postgres source next.

## Security Review (2026-07-08, requested)

Asked directly whether the new SQL is safe against injection/misuse. Findings:

- **Values are always parameterized** (`$N` bind params) in all three DML statements (`INSERT`/`UPDATE`/`DELETE`) — never string-concatenated. No injection surface there regardless of what a caller sends as a row value or `id`.
- **Column-name identifiers ARE string-interpolated** (`"${c}"` in `colList`/`setClauses`) — normally the risky part — but `buildRowPayload` only lets a key through if it exactly matches an entry in `metadata.columns[].name` (the admin/ingestion-controlled column list), so an attacker's row payload can't smuggle an arbitrary identifier through; anything not already a real column name is silently dropped before ever reaching a query string. Verified with a stub test sending `'title"; DROP TABLE users; --'` as a row key — only the legitimate `title` key survives into the SQL.
- **Found and fixed: the whitelist match alone relied on `sanitizeName()`**, which only blocks a handful of SQL keywords + `;` — it doesn't block `"`, so a corrupted/unexpected `metadata.columns[].name` (not attacker-reachable via the API, but theoretically reachable via a bad ingest or a careless admin edit) could in principle have broken out of the `"${c}"` quoting. Replaced with a strict `^[A-Za-z_][A-Za-z0-9_]*$` identifier regex (`SAFE_IDENTIFIER`) applied to: the column whitelist in `buildRowPayload`, and `table_schema`/`table_name`/`pkCol` in `resolveEditableTable` (the latter three come from `data_manager.views` and a live `pg_attribute` lookup, not request input, but the check costs nothing and closes the case outright). Verified with a stub test injecting an unsafe `pkCol` (`weird"pk`) — now rejected with `"Unsupported identifier"` before any query is built.
- **Found and fixed: no authentication check at all on any of the three new routes.** `create`/`edit` matched their DMS-internal counterparts (`dms.data.create`/`dms.data.edit`, which also have none — a deliberate parity decision, see the design note above), but `delete` didn't even match `dms.data.delete`'s existing minimal bar (`if (!this.user) throw`). Added the same `if (!this.user) throw` guard to all three `uda.data.*` routes — a caller must at least be logged in. This does **not** add per-source/per-permission granularity (e.g. an `isUserAuthedForSource`-style check) — that's still an open gap, matching the deliberate parity decision already documented above; flagging again here since it's the actual most-exploitable gap (any logged-in user can write to any `isEditable` source's rows, not just ones they're meant to manage), just not a SQL-injection-class issue.
- **Found and fixed: a bare `id` of `undefined`/`null`/`''` on update/delete** would have reached the database driver as an ambiguous bound parameter instead of failing with a clear message. Added `requireRowId()`, called at the top of both `updateExternalRow`/`deleteExternalRow`.

All five hardening points were added to `scratchpad/verify-uda-crud.js` (20/20 checks passing) and the full `test-uda.js` regression suite was re-run clean (67/67) after these changes.

## Follow-up Round (2026-07-08, same day): data-loss regression + re-verified injection fix + wait-for-confirm UX

### Bug: the bug-3 "fix" above caused actual data loss — toggling "Allow editing" wiped a source's entire `metadata` blob

Live-tested by the requester immediately after the bug-3 fix landed: toggling repeatedly left the source's `metadata` as a bare `{"$type":"atom"}` — not just a display glitch, an actual server-side write that silently no-ops.

**Root cause** (this is deeper than the bug-3 diagnosis — that fix had the *symptom* right but the *direction* backwards): the bug-3 fix made `EditableToggle` pass a **raw JS object** as `data` to `updateSourceData`, which then placed that raw object directly at a leaf position in a `falcor.set({paths, jsonGraph})` call. Both the client `falcor` library and this server's vendored `falcor-router` require a leaf graph value to be either a primitive or a value already carrying a `$type` sentinel (`falcor-router`'s `jsongMerge.js`: `if (message === null || typeOfMessage !== 'object' || message.$type) { ...treat as leaf... }`). A bare object fails that test, so the router tries to descend *further* into it using the next path segment — but the requested path already ended at that exact depth, so there's nowhere to descend to, and **the value is silently dropped**. The response then gets backfilled with `materializeMissing`'s gap-filler, which for an unresolved path inserts `atom(undefined)` — literally `{$type:'atom'}` with no `value` key, matching the exact symptom reported.

This is not new to this task — **it's a latent, pre-existing bug in `updateSourceData`/`updateVersionData` (`default/utils.js`) that appears to already affect every other caller writing a non-primitive value** (`metadata.jsx`'s `MetadataComp` `onChange`, `SourceAccessEditor.jsx`'s `auth_permissions` writer, and possibly `overview.jsx`'s `description`/`categories` writers depending on the exact shape `data` takes there) — none of them were ever verified end-to-end before this task, they just hadn't been caught. The function's existing `attrKey === 'description' || 'categories' || 'statistics'` stringify allowlist was already known-incomplete (it excluded `metadata`/`config`/`auth_permissions`, which are exactly the attrKeys later callers use for object-shaped writes).

**Fix** — `default/utils.js`:
- Replaced the attrKey allowlist with a single, general rule: `toWireValue(data) = (typeof data === 'object' && data !== null) ? JSON.stringify(data) : data`. Any non-primitive gets stringified for the wire regardless of which attrKey it's headed for; any primitive (string/number/boolean) passes through unchanged — no more relying on a hand-maintained list of which attrKeys happen to carry objects.
- Both `updateSourceData` and `updateVersionData` now **return the server's own confirmed value** for that attrKey (parsed from the `falcor.set(...)` response's echoed row, e.g. `d.json.uda[envKey].sources.byId[id][attrKey]`), falling back to the locally-known `data` only if the response genuinely didn't include it. The local optimistic `setSource`/`setView` call now uses this confirmed value too — so local state matches what a fresh GET would return, and callers can `await` the promise and actually check what was persisted instead of trusting that "the promise resolved" means "the write succeeded" (it didn't, in this exact bug).
- Both functions now `return` their `falcor.set(...)` promise chain (previously fire-and-forget) so callers can `await` them — needed for the UX fix below.

### UX hardening, per direct request: verify before flipping, show an indicator meanwhile

`EditableToggle` (`default/admin.jsx`) reworked to be pessimistic rather than optimistic, since this exact toggle just proved a "successful" round trip can silently not persist:
- `handleToggle` is now `async`: sets `saving=true`, `await`s `updateSourceData(...)`, and explicitly compares the **confirmed** `isEditable` value against what was requested (`!!confirmed?.isEditable !== e`) — if they don't match, shows an error instead of assuming success.
- The switch's visible position was already driven purely by `source.metadata.isEditable` (no separate optimistic flag) — so it now only visibly moves once the server has actually confirmed the new value, not the instant the click handler fires.
- Added a `saving` state that disables the switch and shows a `LoadingHourGlass` icon (spinning via a new `editableToggleSavingIcon` theme class) for the duration of the round trip, plus an `error` state rendering the existing `errorText` theme class on failure.

### Security re-verification, per direct request: column-identifier injection via a malicious `metadata.columns[].name`

The `SAFE_IDENTIFIER` regex hardening from the previous round (`buildRowPayload`'s whitelist filter + `resolveEditableTable`'s `table_schema`/`table_name`/`pkCol` check) was already in place and unaffected by this round's changes — confirmed by re-reading the live file. Added one more explicit stub test to prove the exact scenario raised: a malicious string (`x" , (SELECT pg_sleep(5)) --`) planted directly as a column **name** inside `metadata.columns[]` (not just an unmatched row-payload key) is excluded from the whitelist by `SAFE_IDENTIFIER.test(name)` and can never reach `colList`/`setClauses`, regardless of what a caller's row payload contains. `scratchpad/verify-uda-crud.js` is now at 21/21 passing (added this case); `test-uda.js` re-run clean at 67/67 after all of this round's changes.

## Follow-up Round 2 (2026-07-08, same day): `id` still undefined — the pkeyColumn approach was fundamentally wrong

Live-tested again after the previous round: `id` was *still* undefined on the `test_shaun` source (both Card and Spreadsheet), even with `isEditable: true`. The state dump showed the smoking gun directly: `"pkeyColumn":null` sitting right next to `"isEditable":true`.

**Root cause:** the bug-1 fix (Round 1) derived `pkeyColumn` client-side from `metadata.columns[].isPrimaryKey` — but that stored flag is **only ever set when an admin sets a PK *through the metadata UI*** (`setPrimaryKeyColumn`'s `ALTER TABLE ... ADD CONSTRAINT`). `test_shaun` is a GIS source — its PK (`ogc_fid`) was auto-detected from a pre-existing constraint the GIS ingestion pipeline creates at table-creation time (`gis-publish.js`), never "set" through the client. `EditableToggle` could still turn `isEditable` on because it only requires the *live* `pkeyInfo.hasPkey` check — but nothing ever writes `isPrimaryKey: true` onto any column's metadata for an auto-detected PK. Net effect: `pkeyColumn` was guaranteed to stay `null` forever for exactly this (common — every GIS source) case, regardless of `isEditable`. **This is the identical class of mistake [[set_primary_col_from_meta]]'s own "Known Issues Found & Fixed" bug #1 already documents and warns against** ("PK badge/switch trusted the stored metadata flag instead of live detection") — Round 1 reintroduced it in a new place.

**Fix — moved the resolution server-side, where live detection already lives, instead of caching it client-side:**
- `packages/dms-server/src/routes/uda/uda.controller.js` — new `resolveIdAttribute(ctx, attributes)`: if the request's `attributes` array contains a literal `"id"` and the source isn't `isDms` and the db is Postgres, resolve the real PK column via `resolvePrimaryKey(ctx.db, ctx.table_schema, ctx.table_name)` (no `storedIdx` hint — forces genuine live detection, benefiting from that function's existing `_pkCache`) and substitute `"id"` with `"${pkCol} as id"` in the attributes array before it reaches the query builder. No-ops for `isDms` sources, non-Postgres dbs (e.g. ClickHouse-backed views), tables whose real PK genuinely is already named `id`, and requests that never asked for `"id"` in the first place (i.e. every existing call path is untouched). Wired into `simpleFilter` (the dispatcher `uda[env].viewsById[viewId].options[...].dataByIndex[...]` resolves through), which is the one function that needed it — `simpleFilterLength` doesn't select attributes at all.
- `packages/dms-server/src/routes/uda/query_sets/postgres.js` — exported `resolvePrimaryKey` (previously internal-only) so the controller could reuse its cache instead of re-querying `pg_index` on every single page load.
- `dataWrapper/getData.js` — simplified back to **not** depending on any client-tracked PK column name at all: for `isDms || (external && isEditable && !joinPresent)`, request a literal `"id"` attribute (byte-identical to what DMS already sends) and let the server resolve it. Join support for editable-external sources is explicitly left as a follow-on (falls through to "no id requested," matching pre-feature behavior for that combination — not a regression, just not yet handled).
- `dataWrapper/useDataSource.js` — removed the `pkeyColumn` derivation entirely; it's no longer needed and was the source of the bug.

**Design lesson, worth restating for whoever touches this next:** anywhere a source's real primary key needs to be known — reads, writes, or UI state — resolve it **live** via `resolvePrimaryKey`/`detectRealPrimaryKey`, never from a persisted `metadata.columns[].isPrimaryKey` flag. That flag exists purely for admin-UI bookkeeping (badge display when a PK genuinely *was* set through the client) and is not a reliable signal of "does this column hold the real PK" — it can be `false`/absent on a column that IS the real PK (auto-detected case, this bug) just as easily as it can theoretically go stale in the other direction (dropped out-of-band, [[set_primary_col_from_meta]]'s already-documented bug #1).

Verified: `scratchpad/verify-uda-crud.js` extended to 26/26 passing, including the exact reproduction (`resolvedPk: 'ogc_fid'` with no `isPrimaryKey` flag anywhere in metadata resolves correctly) plus no-op cases (isDms, non-Postgres, PK genuinely named `id`, `"id"` never requested). `test-uda.js` re-run clean at 67/67.

**Not done, and worth being explicit about:** the identifier check is a strict allowlist (`^[A-Za-z_][A-Za-z0-9_]*$`), not a general-purpose Postgres-identifier quoter — it will refuse legitimate exotic column names (unicode, spaces, etc. — which Postgres would otherwise allow via `"quoting"`) rather than trying to correctly escape them. This is a deliberate trade: rejecting valid-but-unusual names is safe; trying to hand-roll correct identifier-escaping is exactly the kind of thing that's easy to get subtly wrong. If a real source ever needs a non-ASCII-identifier column, this will need revisiting (e.g. `pg-format`'s `%I`), but no such case has come up in this codebase's column-naming conventions (`nameToSlug()` etc. already produce ASCII/underscore names everywhere else).

## Files Requiring Changes

| File | Change | Status |
|---|---|---|
| `packages/dms-server/src/routes/uda/uda.route.js` | New CALL routes: `uda.data.create`, `uda.data.edit`, `uda.data.delete` | DONE |
| `packages/dms-server/src/routes/uda/uda.controller.js` | `createExternalRow`/`updateExternalRow`/`deleteExternalRow` — resolve table, re-validate `isEditable`+PK server-side, typed DML using the real PK column | DONE |
| `packages/dms/src/patterns/page/components/sections/components/dataWrapper/index.jsx` | Relax the six `isDms`-only CRUD guards and two `allowEdit` derivations to `isDms \|\| isEditable` | DONE |
| `packages/dms/src/patterns/page/components/sections/components/dataWrapper/schema.js` | Add `isEditable` to the `externalSource` shape docs | DONE |
| `packages/dms/src/ui/components/Card.jsx` | `isAddingNewItem`/`isNewItem` (via the `isDms` prop passed into `RenderItem`): `isDms \|\| isEditable` | DONE |
| `packages/dms/src/api/index.js` | `dmsDataEditor`/`updateRow()` branch: call `uda.data.*` routes when external+editable instead of `dms.data.*` | DONE |
| `packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataSource.js` (real path — see Design note in §5; the originally-noted `pages/_utils/useDataSource.js` doesn't exist) | Copy `isEditable` through in `getSources()`'s metadata handling; also derive `pkeyColumn` (bug 1 fix) | DONE |
| `packages/dms/src/patterns/page/components/sections/components/dataWrapper/getData.js` | Not in the original plan — bug 1 fix: alias the real PK column `AS id` for editable-external sources instead of assuming a literal `id` column | DONE |
| `packages/dms/src/ui/columnTypes/index.jsx` | Not in the original plan — bug 2 fix: register `'string'` as a column type (aliased to `text`'s Edit/View comps) | DONE |
| `packages/dms/src/patterns/datasets/pages/dataTypes/default/admin.jsx` | Not in the original plan — bug 3 fix: `EditableToggle` passes a raw object to `updateSourceData` instead of a pre-stringified one | DONE |

---

## Testing Checklist

Mix of stub-DB logic checks (this session — no live Postgres/DAMA/browser reachable; Docker binary present but daemon not running, so `npm run test:pg` couldn't be used either) and the existing `test-uda.js` regression suite. Nothing below has been live-browser-tested yet.

- [x] `createExternalRow`/`updateExternalRow`/`deleteExternalRow` build the expected `INSERT`/`UPDATE`/`DELETE` SQL text against a stubbed `db.query` — verified column whitelisting (unknown keys dropped), type coercion (string→number, string→boolean), PK exclusion from `UPDATE ... SET`, and `id` aliased from the real PK column on the returned row. See "Verification Notes" below (14/14 checks passed).
- [x] Reject when `metadata.isEditable` is falsy — stub-verified (`createExternalRow` throws `"is not editable"`; same shared `resolveEditableTable` path is used by update/delete).
- [x] Reject when no real PK is resolvable (`detectRealPrimaryKey` returns null) — stub-verified.
- [x] Reject when called against an `isDms` env, or a non-Postgres db — stub-verified (matches [[set_primary_col_from_meta]]'s `setPrimaryKeyColumn` guard pattern).
- [x] Reject `updateExternalRow`/`deleteExternalRow` when the target row doesn't exist (`rows.length`/`rowCount` check) — stub-verified.
- [x] Existing UDA test suite (`node tests/test-uda.js`, 67 tests — sources/views CRUD, filters, comparison series, DAMA sources/views) still passes unchanged — confirms no regression from the new routes/controller functions or from requiring `./utils`/`./query_sets/postgres` (whose exports several of the checks above monkey-patch in an isolated script, not in the real test file).
- [ ] External source, `isEditable: false` (no PK, or PK exists but toggle off): verify add/edit/delete UI is not shown and no CRUD calls are made — exact current (pre-feature) behavior, no regression. **Not yet live-tested.**
- [ ] External source, `isEditable: true`, real PK set: add a new row via Card — verify row appears in the real Postgres table with correct typed values, and the UI reflects the DB-assigned PK. **Not yet live-tested.**
- [ ] Same source: edit an existing row's value via Card/Spreadsheet — verify `UPDATE` lands on the correct row (matched by real PK, not a guess) and typed value coercion is correct for at least one non-text column type (number, date, boolean). **Not yet live-tested.**
- [ ] Same source: delete a row — verify it's removed from the real table and disappears from the UI without a full reload. **Not yet live-tested.**
- [ ] Attempt a write via a manually-crafted Falcor call to `uda.data.edit` against a source with `isEditable: false` (bypassing the UI) — logic-verified via stub (see above); **not yet confirmed against a real running server + browser devtools console call.**
- [ ] Attempt a write against a source where the PK became unresolvable after being set (e.g. constraint dropped out-of-band) — logic-verified via stub; **not yet live-tested against a real dropped constraint.**
- [ ] Internal (`isDms: true`) sources: verify existing add/edit/delete behavior is completely unchanged — code-reviewed (every changed guard is a strict OR-widening of an existing condition: when `isDms` is true the new `|| isEditable` term is never reached), **not yet live-tested.**
- [ ] Grouped views (`groupByColumnsLength` truthy): verify CRUD remains disabled for both internal and now-editable external sources — code-reviewed (the `|| groupByColumnsLength` / `&& !groupByColumnsLength` short-circuits were left untouched in every guard), **not yet live-tested.**
- [ ] Multiple concurrent edits/creates on the same external source from two browser sessions: verify no corruption (relies on the DB's own PK/unique constraint enforcement — no new locking needed, but worth a smoke test). **Not yet tested.**

### Verification Notes (2026-07-08)

No live Postgres/DAMA pgEnv or browser was reachable in this sandbox (same constraint documented in [[set_primary_col_from_meta]]'s Verification Notes — the local `dms-sqlite.config.json` is gitignored/machine-specific and points at an unreachable remote Postgres host). Docker was installed but its daemon wasn't running, so `npm run test:pg` (which would give a real Postgres integration run) wasn't available either. Instead:

- `node --check` on both modified server files (no syntax errors); `npx babel --presets @babel/preset-react` parse-check on both modified `.jsx` files (no syntax errors, since ESLint's flat config ignores files under `dataWrapper/` and `ui/components/` in this workspace).
- A standalone script (`scratchpad/verify-uda-crud.js`, not committed) loaded `uda.controller.js` with `./utils`'s `getEssentials` and `./query_sets/postgres`'s `detectRealPrimaryKey` monkey-patched via `require.cache` (everything else in both modules is the real, unmodified code) and drove `createExternalRow`/`updateExternalRow`/`deleteExternalRow` against a hand-written `db.query` stub covering: happy-path SQL text for all three, column whitelist + type coercion, PK-exclusion on update, not-editable rejection, no-PK rejection, `isDms` rejection, and not-found rejection on update/delete. All 14 checks passed.
- `node tests/test-uda.js` (the existing DMS+DAMA UDA route regression suite, runs against real SQLite) — all 67 tests still pass, confirming the new routes/controller additions didn't disturb existing route dispatch, `require` graphs, or DAMA sources/views behavior.
- `npx eslint` on the two modified server files reports only pre-existing errors (`no-undef` on every `require`/`module` in the file — an ESLint flat-config/env mismatch affecting the whole file, not something this change introduced) and pre-existing `no-unused-vars` on code this task didn't touch; the modified frontend files (`dataWrapper/index.jsx`, `Card.jsx`) are excluded by this workspace's ESLint ignore patterns entirely.
- `npm test` (full suite) fails at `test-sqlite.js` on a pre-existing, unrelated config mismatch (confirmed identical symptom to the one documented in [[set_primary_col_from_meta]]: the local `dms-sqlite` config resolves to a real Postgres adapter instead of SQLite, so a raw `?`-placeholder SQLite query fails against Postgres) — this reproduces with or without this task's changes and is a machine-local environment issue, not a code regression.
- **Not exercised at all**: any real Postgres DDL/DML (the `INSERT`/`UPDATE`/`DELETE` SQL text was verified as *text*, not executed against a real table), the frontend wiring end-to-end in a running browser (Card/Spreadsheet add/edit/delete against a real editable external source), and the `test:pg` Docker-based Postgres integration path. Whoever picks this up next should run through the `[ ]` checklist items above against a real external/DAMA Postgres source with `isEditable: true` and a running dev server — ideally by first finishing the remaining live-testing checklist items on [[set_primary_col_from_meta]] (isEditable toggle click-through was itself never live-tested) since this task's live testing depends on that toggle actually working end-to-end in the browser first.
