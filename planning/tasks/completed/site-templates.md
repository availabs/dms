# Site Templates

## Status: DONE

## Objective

When a user creates a new site, show a template picker. The selected template determines which patterns
(and their initial content) get created alongside the required auth pattern.

---

## Templates (stored in `defaultTheme.site_templates`)

Data lives in `src/dms/packages/dms/src/ui/siteTemplates.js`, imported into `defaultTheme.js`.

Order (Simple Site first, Blank last): Simple Site → Report → Dashboard → Blank.
Default selection: `simple_site`.

### 1. Simple Site (default)
- Auth pattern
- Page pattern: name=`"Pages"`, base_url=`"pages"`
  - 1 page using the `blank` page template (title: `"Page 1"`)

### 2. Report
- Auth pattern
- Page pattern: name=`"Report"`, base_url=`"report"`
  - 1 page using the `narrative` page template (title: `"Report"`)

### 3. Dashboard
- Auth pattern
- Datasets pattern: name=`"Data"`, base_url=`"data"`
  - 1 dmsEnv: name=`"default"`
  - 1 source: name=`"dataset"`, source_type=`"internal_table"` with 3-column schema (label/value/category)
  - 1 view: name=`"version 1"` with 5 seed rows
- Page pattern: name=`"Dashboard"`, base_url=`"dashboard"`
  - 1 page using the `dashboard` page template (title=`"Dashboard"`, wireSource=true)

### 4. Blank
- Auth pattern only.

---

## Key implementation details

### `wireSection()` — `createSite.jsx`

Rewrites Graph and Spreadsheet sections to use a real source_id/view_id. Called for every
non-lexical section when `pageSpec.wireSource === true` and `wiredContext` is set.

**Spreadsheet columns** — full attrCol objects with `show: true`:
```js
columns: attrCols.map(c => ({ ...c, show: true }))
```

**Graph columns** — full attrCol objects spread with explicit axis/group flags.
`show: true` is required by `getColumnsToFetch`; `group: true` on x and categorize columns
is required for a valid GROUP BY query; `fn: 'count'` on the y-axis column:
```js
columns = attrCols.map(c => {
  const isX = c === xCol; const isY = c === yCol; const isCat = c === catCol;
  return { ...c, show: true, xAxis: isX, group: isX || isCat, categorize: isCat,
           ...(isY ? { yAxis: true, fn: 'count' } : {}) };
});
```

**`externalSource`** — must include `app`, `type` (source slug), and `srcEnv` to match the
production shape and allow `useDataSource` to resolve the view list on first render:
```js
{ source_id, view_id, isDms: true, columns: attrCols, env, app, type: sourceSlug, srcEnv }
```

**`wiredContext`** tracks: `{ sourceId, viewId, attrs, env, app, sourceSlug, srcEnv }`.

### Server-side cache fix — `dms.controller.js`

`_sourceIdCache` (process-level Map keyed `"${app}:${sourceSlug}"`) became stale during
repeated test-site creation, causing data rows to be written to the wrong split table
(`s{oldId}_v{newViewId}_dataset`). Fixed: evict cache entry when a new `:source` row is
created, using `getKind`/`getInstance` from `type-utils.js`.

---

## Files modified

| File | Change |
|---|---|
| `patterns/admin/pages/createSite.jsx` | Template picker UI; dataset/page pattern creation loop; wireSection() with full column objects, externalSource fields |
| `patterns/admin/pages/createSite.theme.js` | Theme keys for template picker cards |
| `ui/siteTemplates.js` | 4 template definitions; order: Simple→Report→Dashboard→Blank |
| `ui/defaultTheme.js` | Imports + registers `site_templates` |
| `dms-server/src/routes/dms/dms.controller.js` | Evict `_sourceIdCache` on source creation |
