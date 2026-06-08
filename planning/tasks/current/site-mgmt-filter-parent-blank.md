# Task: Filter dropdown blank for `parent` column in Sections source

## Status: IN PROGRESS — implementation attempted, not verified working

## Symptom

In a Spreadsheet/Card section using `{pattern} (sections)` as the data source, opening the filter menu on the `parent` column shows a blank dropdown — no values appear. The main data display correctly shows the resolved parent title (e.g., "Documentation") but the filter UI is empty.

Pages source does NOT have this problem (or may also have it — unverified).

---

## What was implemented (may not be working)

Three files were changed to plumb `serverFn` through the filter query pipeline:

### `uda.controller.js`
- Extract `keepOriginalValues` from parsed options alongside `meta`/`serverFn`
- Pass `keepOriginalValues` to `applyServerFn`
- In `applyServerFn`, when `keepOriginalValues = true`, wrap the resolved title as `{value: resolvedTitle, originalValue: rawStoredValue}` instead of just setting the string

### `filters/utils.js`
- Added `serverFn = {}` parameter to `getData`
- Includes `serverFn` in the options JSON when non-empty

### `RenderFilters.jsx`
- Before each `getData` call, look up `colDef` from `state.columns` and build a single-column `colServerFn` config from `colDef.serverFn`, `colDef.joinKey`, `colDef.valueKey`, etc.
- Pass `serverFn: colServerFn` to `getData`
- Fixed `originalValue` extraction (line 195): changed from `parseIfJson(responseValue?.originalValue || responseValue)` to `responseValue?.originalValue ?? parseIfJson(responseValue)` — prevents the raw JSON blob `'{"id":570240,...}'` from being parsed to an object (which would break SQL matching)

---

## Hypotheses for why it still doesn't work

### H1: `state.columns` columns don't have `serverFn` as a top-level property

`colDef = state.columns.find(c => c.name === columnName)`. If `colDef.serverFn` is `undefined`, then `colServerFn = {}` and the server never runs `applyServerFn`.

**Check**: Add a `console.log('colDef', colDef)` in `RenderFilters.jsx` right after the `colDef` line and inspect the browser console when the filter menu opens. Does the column object have `serverFn`, `joinKey`, `valueKey`?

If not: the issue is that `serverFn` isn't persisted in the column state. Columns may have been added before `serverFn` was in `page.format.js`, OR the column-add flow doesn't copy `serverFn` from the format attribute into the column state.

**Fix path if H1**: Don't rely on `state.columns` having `serverFn`. Instead, look it up from the format's attribute definition. The format is available via `state.externalSource`. In `useDataSource.js`, `externalSource.columns` contains the full format attribute definitions including `serverFn`. Read from there, or look up the source format from the DMS context.

### H2: `keepOriginalValues` + `applyServerFn` interaction with Falcor atom reading

When `applyServerFn` wraps `row["parent"] = {value: "Documentation", originalValue: rawString}`, the Falcor route wraps this as `$atom({value, originalValue})`. In the client, `d[formattedAttrStr]?.value` accesses the atom's `.value` property. 

But `d[formattedAttrStr]` from the Falcor cache might be `{$type: 'atom', value: {...}}`, making `.value` the inner `{value, originalValue}` object. Or it might be something else depending on how Falcor normalizes atoms.

**Check**: Log `data[0]` returned from `getData` to see what shape the response has.

### H3: The filter query uses a different Falcor route that bypasses `simpleFilter`

Check which Falcor path the filter `getData` uses. If it hits a `byIndex` route (returns `$ref`s to `dataById`) instead of `dataByIndex`, then `applyServerFn` runs on a different endpoint with different context.

**Check**: Search for `stopFullDataLoad` in the Falcor route handling — the filter `getData` sets `stopFullDataLoad: true`.

### H4: `serverFn` keys use column `name` but rows use the SQL alias

`options.serverFn = {"parent": {...}}`. In `applyServerFn`, `colName = "parent"`. The row after the DISTINCT query has key `row["parent"]` (the SQL alias from `AS parent`). These should match. ✓ But double-check with actual log output.

---

## Debugging steps (for next session)

1. Add `console.log('colDef', colDef, 'colServerFn', colServerFn)` in `RenderFilters.jsx` and open the filter menu in the browser.

2. If `colDef.serverFn` is undefined:
   - Check `state.externalSource.columns` for the `serverFn` property
   - Look at `useDataSource.js` to see how `externalSource.columns` is set up for DMS sources
   - Potentially look up the serverFn config from `externalSource.columns` rather than `state.columns`

3. Add `console.log('getData result', data)` after the `getData` call in `RenderFilters.jsx` (around line 187) and inspect what comes back.

4. If the response has the right shape but options are still blank, add a log in `uda.controller.js:simpleFilter` to confirm `serverFn` is non-empty when the filter query runs.

---

## Related tasks

- `server-fn-recurse-extract.md` — core `applyServerFn` implementation (complete)
- `site-mgmt-filter-by-parent-name.md` — filtering BY the resolved title (SQL JOIN approach, future)
