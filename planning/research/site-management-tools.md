# Site Management Tools: How the System Works & Improvements

## Background

Pages and sections can be used as a data source inside any Spreadsheet, Card, or Table section. This makes it possible to build site management views entirely within DMS — a page list, a section inventory, a publish dashboard — without custom components.

This document explains how the pipeline works end-to-end, what currently works, what was broken, and what still needs attention.

---

## How it works

### Source selection (`useDataSource.js:407–416`)

Every Spreadsheet/Card/Table section has a dataset picker. Two built-in options are always injected at the top:

```
{app}+{type}|page       → all page rows for this pattern
{app}+{type}|component  → all section (component) rows for this pattern
```

When the user picks one of these, `onSourceChange` sets `externalSource.isDms = true` and populates `externalSource.columns` with the column definitions from the pattern's format:
- **Pages**: `format.attributes` from `page.format.js`
- **Sections**: `cmsSection.attributes` from `page.format.js` (found via `format.registerFormats`)

### Column definitions (`page.format.js`)

**Page columns**: `title`, `parent`, `published`, `has_changes`, `is_draft`, `url_slug`, `hide_in_nav`, `index`, `template_id`, `authPermissions`.

**Section columns**: `title`, `parent`, `url_slug`, `level`, `tags`, `requirements`, `description`, `is_draft`, `size`, `authPermissions`.

Some columns are marked `hidden: true` (`url_slug`, `index`, `sidebar`, etc.) — they don't appear in the column picker by default.

### `serverFn: "recurse_extract_data"` — what it does

The `parent` column in both pages and sections is defined with:

```js
{
  key: "parent",
  serverFn: "recurse_extract_data",
  joinKey: "parent",   // field holding the parent row reference
  valueKey: "title",   // field to resolve from the parent row
  joinWithChar: ","
}
```

The intent: instead of showing the raw parent reference, the server looks up the parent row in `data_items` and returns its `title`. The same mechanism is used on the sections `url_slug` column to resolve the parent page's URL slug.

**Important: the `parent` field is stored as a JSON object string**, not a plain integer:
```json
{"id":"570240","ref":"myapp+my_docs|page"}
```

`buildUdaConfig.js:995–1003` packages this into `options.serverFn` and sends it to the server with every fetch. The server-side `applyServerFn` function (added to `uda.controller.js`) processes it:

1. Reads the raw joinKey values from the result rows
2. Parses the `{id, ref}` JSON format via `extractRefId()` to get the numeric ID
3. Fetches the valueKey fields (titles) for those IDs from `data_items` in a single batched query
4. Replaces each row's column value with the resolved string

**Note**: filter predicates are evaluated in SQL *before* `applyServerFn` runs. So filtering on the `parent` column matches against the raw stored ID, not the resolved title. See "Filtering sections for a page" below.

### CRUD support

`updateItem`, `addItem`, `removeItem` all work for `isDms` sources (`dataWrapper/index.jsx:263–341`). Edit mode is enabled when `isDms && !groupByColumns`. In view mode, `display.allowEditInView` must be set to `true` in the section display controls.

### Query efficiency

Pages and sections are stored in `data_items` with a WHERE clause on `(app, type)`. All column access uses JSONB operators (`data->>'field'`). For typical site sizes (hundreds to low thousands of rows) this is fast. `applyServerFn` adds one extra lookup query per resolved column, batching all needed IDs in a single round-trip — no N+1.

---

## What works correctly

| Feature | Status |
|---------|--------|
| Display pages/sections in Spreadsheet or Card | ✅ |
| Filter by title, published, is_draft, level, tags | ✅ |
| Group by any direct column | ✅ |
| Sort, paginate | ✅ |
| `parent` column resolved to human-readable title | ✅ |
| `url_slug` on sections resolved to parent page slug | ✅ |
| Inline edit (update page/section fields) | ✅ |
| Add new pages/sections from list | ✅ |
| Delete pages/sections from list | ✅ |

---

## Filtering sections for a page

To show only sections that belong to a specific page, filter the `parent` column. Because `parent` is stored as `{"id":"570240","ref":"app+type"}`, the filter value must match that raw stored string — or, more practically, use a `like` filter on a fragment of the JSON (e.g. `like "570240"`). This is not author-friendly.

The better fix is the SQL JOIN approach described below, which would let authors filter by page title.

**Fix path**: implement a SQL-level correlated subquery or LEFT JOIN that maps parent title → ID before the WHERE clause. Medium effort, tracked as a follow-on task.

---

## Remaining gaps & recommendations

### 1. Filter on resolved parent name

Described above. Filtering `parent` by title string doesn't work — only by ID.

**Fix**: server-side LEFT JOIN or subquery approach. Track separately.

### 2. `url_slug` hidden for pages by default

In `page.format.js`, `url_slug` is `hidden: true`. It won't appear in the column picker. For management views (navigate to a page), it's the most useful field.

**Fix**: remove `hidden: true` from `url_slug` in `page.format.js`.

### 3. No "open page" link affordance

No way to click a row and navigate to the page. Authors see the slug but can't click it.

**Fix**: add a `pageLink` formatFn that renders a cell as a React Router `<Link>` using the row's `url_slug`.

### 4. Section `component_type` not exposed

Sections have an element `type` field (`Spreadsheet`, `Map`, `RichText`, etc.) inside their element config, but it's not in `cmsSection.attributes`. Authors can't filter sections by component type.

**Fix**: add a `component_type` attribute to `cmsSection.attributes` reading `data->'element'->>'type'`.

### 5. Source labels are technical

Source options show as `{pattern} (pages)` and `{pattern} (sections)`. 

**Fix**: change labels in `useDataSource.js:407–409` to `"All Pages"` / `"All Sections"`.

### 6. `allowEditInView` not discoverable

Editing from a published page requires `display.allowEditInView = true`, which is a buried setting.

**Fix**: expose as a labelled toggle in the section display controls.

---

## Summary

The pages/sections data source is efficient and architecturally sound. Direct columns filter, group, and sort correctly. CRUD works. `parent` and `url_slug` now resolve to human-readable values via `applyServerFn`. The main open item is filtering by resolved parent name (currently filters match raw IDs). The remaining items are UX refinements for author accessibility.
