# Task: Site management page/section column UX fixes

## Objective

Several small UX issues reduce the usability of pages/sections as a management data source. This task covers all of them.

## Items

### 1. Un-hide `url_slug` for pages

**File**: `src/dms/packages/dms/src/patterns/page/page.format.js`

`url_slug` is `hidden: true` — it won't show up in the column picker by default. For management views (link to page, filter by path), it's essential.

**Fix**: remove `hidden: true` from the `url_slug` attribute.

### 2. Friendly source labels

**File**: `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataSource.js:407–409`

Current labels: `"{type} (pages)"` and `"{type} (sections)"` — confusing to non-developer authors.

**Fix**: change to `"All Pages"` and `"All Sections"`.

### 3. `allowEditInView` toggle in display controls

**Context**: editing pages/sections from a published view requires `display.allowEditInView = true`, but it's not surfaced in any UI.

**Fix**: add a labelled switch to the section's display controls (`controls.data` or `controls.more` in the dataWrapper component config). Follows the same pattern as `allowEdit` / `hideExternalToggle`.

### 4. `component_type` column for sections

**File**: `src/dms/packages/dms/src/patterns/page/page.format.js` — `cmsSection.attributes`

Section element type (`Spreadsheet`, `Map`, `RichText`, etc.) is nested inside `data.element.type` but not exposed as a queryable column. Authors can't filter sections by type.

**Fix**: add to `cmsSection.attributes`:
```js
{ key: "component_type", name: "component_type", display_name: "Component Type", type: "text" }
```

This requires the server to read `data->'element'->>'type'` for the `component_type` column. Because `attributeAccessorStr` for isDms sources constructs `data->>'component_type'`, a simple column won't work — the accessor would need to be `data->'element'->>'type'`.

One option: use a calculated-column expression as the attribute `key`:
```js
{ key: "data->'element'->>'type'", name: "component_type", display_name: "Component Type", type: "text" }
```

Or alternatively, denormalize on write: when a section's element is saved, also write `data.component_type = element.type`. Simpler for reads.

**Recommended**: denormalize on write. Add to `dms.controller.js` section save path: extract `data.element?.type` → `data.component_type`.

### 5. `pageLink` formatFn

**Context**: No way to click a row in a pages Spreadsheet and navigate to that page.

**Fix**: add a `pageLink` entry to the formatFns registry (where formatFns like `dollarsAndCents`, `toPercent`, etc. live). The `pageLink` formatFn renders the cell value as a React Router `<Link>` using the row's `url_slug`.

This requires the formatFn to have access to the row, not just the cell value. Check whether the existing `formatFn` calling convention passes the row; if not, use the `combine` pattern (column combining `title` + `url_slug` into a link).

## Effort

Small (each item is 1–5 lines of code). Can be done together in one pass.
