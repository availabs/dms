# Task: Implement `serverFn: recurse_extract_data` on the server

## Status: COMPLETE (including filter dropdown fix)

## Objective

Pages and sections expose a `parent` column whose value is the raw parent page ID. The column definition declares `serverFn: "recurse_extract_data"` to signal that the server should resolve the ID to a human-readable title. `buildUdaConfig.js` correctly packages this into `options.serverFn` but the server never processed it — it was silently ignored.

## Root cause

`uda.controller.js:simpleFilter` parsed `options.meta` and dispatched to `applyMeta`, but `options.serverFn` was never extracted or acted on. No server-side registry or dispatcher existed.

## Files changed

- `src/dms/packages/dms-server/src/routes/uda/uda.controller.js`
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/components/filters/utils.js`
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/components/filters/RenderFilters.jsx`

---

## Phase 1: Core `applyServerFn` implementation

Added `applyServerFn(rows, serverFn, app, db, splitMode)` to `uda.controller.js`.

Called from `simpleFilter` after `applyMeta`:
```js
const { meta = {}, serverFn = {} } = JSON.parse(options);
if (Object.keys(meta).length) rows = await applyMeta(...);
if (Object.keys(serverFn).length) rows = await applyServerFn(rows, serverFn, app, ctx.db, ctx.splitMode);
```

`applyServerFn` for `recurse_extract_data`:
1. Collects unique parent IDs from result rows (the `joinKey` field)
2. Fetches `data->>'${valueKey}'` for those IDs in a single `WHERE id = ANY($1)` query
3. Replaces each row's `[colName]` with the resolved string

For `joinWithChar` set to `","`, multiple IDs are resolved and joined.

---

## Phase 2: Sections showing blank parent (cross-session fix)

**Root cause:** Sections store parent as `JSON.stringify({id: item.id, ref: \`${item.app}+${item.type}\`})` where `item.type` is the pattern name (e.g. `"playground"`), NOT the full DMS type string (`"playground|page"`). The original implementation grouped IDs by `ref` and added `AND app || '+' || type = ref` to the lookup query. Since `ref = "myapp+playground"` but pages have `type = "playground|page"`, the scoped lookup found zero rows → blank.

**Fix:** Removed type-scope filtering entirely. Since `id` is a PK in `data_items`, `WHERE id = ANY(...)` is sufficient and always correct. Simplified to a flat `idSet` with a single unscoped lookup query.

**Also:** Added `parseParentRef()` helper to handle both plain-integer parents (pages) and JSON-blob parents (sections): `{"id":"570240","ref":"..."}`.

---

## Phase 3: Filter dropdown showing blank for `serverFn` columns

**Root cause:** `RenderFilters.jsx` calls `getData` from `filters/utils.js` without `serverFn` in the options. So `applyServerFn` never ran for filter queries. Raw JSON strings like `'{"id":570240,...}'` came back from the server; `parseIfJson` in `RenderFilters.jsx` converted them to objects; then `typeof label !== 'object'` filtered them out → blank dropdown.

### Changes

**`uda.controller.js`:** Extract `keepOriginalValues` from options and pass to `applyServerFn`. When `keepOriginalValues: true`, wrap resolved values as `{value: resolvedTitle, originalValue: rawStoredValue}` instead of just the title string. This matches how `applyMeta` wraps values so the filter UI can show resolved labels while retaining the raw value for SQL matching.

**`filters/utils.js`:** Added `serverFn = {}` parameter to `getData`. Includes it in the options JSON when non-empty.

**`RenderFilters.jsx`:**
1. Before each `getData` call, build `colServerFn` from the column definition's `serverFn`/`joinKey`/`valueKey` fields.
2. Pass `serverFn: colServerFn` to `getData`.
3. Fixed `originalValue` extraction (line 195): changed from `parseIfJson(responseValue?.originalValue || responseValue)` to `responseValue?.originalValue ?? parseIfJson(responseValue)`. This preserves the raw stored string as `originalValue` rather than parsing `'{"id":570240,...}'` into a JS object (which would cause the `pg` driver to serialize it as `"[object Object]"` when used as a SQL parameter).

### How filter values work end-to-end

1. Filter query fetches DISTINCT raw parent values: `'{"id":"570240","ref":"..."}'` (sections) or `"570240"` (pages)
2. `applyServerFn` resolves each to a title and wraps: `{value: "Documentation", originalValue: '{"id":"570240","ref":"..."}'}`
3. Falcor route stores as `$atom({value, originalValue})`
4. Client receives atom; `responseValue = {value: "Documentation", originalValue: '{"id":"570240",...}'}`
5. `metaValue = "Documentation"` (the label), `originalValue = '{"id":"570240",...}'` (the raw string, NOT parsed)
6. Dropdown option: `{label: "Documentation", value: '{"id":"570240",...}'}`
7. When user selects, filter stores the raw JSON string
8. SQL: `data->>'parent' = ANY($1)` with `$1 = ['{"id":"570240",...}']` → matches stored value ✓

---

## Verification

1. Create a Spreadsheet section, select `{pattern} (pages)` as source, add `parent` column
2. Verify pages show parent page title (not raw integer)
3. Verify sections show parent page title (not blank)
4. Open the filter menu on the `parent` column
5. Verify dropdown shows page titles (not blank, not JSON blobs)
6. Select a title → verify rows filter to only matching parent
7. Verify standard column filters (title, published, is_draft) still work
8. Verify `updateItem` edits still save correctly

---

## Known limitations

- **Filtering by parent title across SQL (future task):** The filter matches by raw stored value. For sections, selecting "Documentation" matches rows where `data->>'parent'` equals the exact stored JSON string `'{"id":"570240","ref":"..."}'`. This works, but is fragile if the stored JSON format changes. The proper fix is a SQL-level JOIN — tracked separately in `site-mgmt-filter-by-parent-name.md`.
- **`joinKey !== colName` in filter context:** Columns like `url_slug` (which uses `joinKey = "parent"`) won't get serverFn resolution in filter dropdowns because the filter rows don't include the `id` column. The secondary lookup branch is silently skipped. Only columns where `joinKey === colName` (like `parent`) are resolved in filter queries.
