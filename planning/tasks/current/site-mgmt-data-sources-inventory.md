# Site Management: Data Sources Inventory Page

## Objective

A site management page showing all data sources and views registered in a pattern's dmsEnv — which sections use each source, view counts, and which sources are orphaned (defined but used by no sections).

## Scope

- New tab on the site management page: "Data Sources"
- Spreadsheet section sourced from `{pattern} (sources)` — all sources in the pattern's dmsEnv
- Authors can see source health at a glance; orphaned sources are flagged
- Read-only by default; link to the datasets admin for edits

Out of scope:
- Creating or deleting sources from this page (routes to datasets admin)
- Cross-pattern source aggregation (v1: pattern-scoped only)

## Current State

- Sources/views exist in `data_items` as `{dmsEnv}|{name}:source` / `{name}|{id}:view`
- `useDataSource.buildDatasources()` already assembles the list for the section picker
- No management-facing view exposes this list to authors
- `source_id` / `view_id` columns in `cmsSection.attributes` give raw IDs; no reverse-lookup to count usage per source

## Proposed Changes

### 1. New DMS source type: `{pattern} (sources)`

Expose sources as a data source for Spreadsheet sections, analogous to `{pattern} (pages)`.

In `page.format.js` (or `useDataSource.js`), register a new source type that queries:
```sql
SELECT s.id, s.data->>'display_name' as name,
       s.data->>'doc_type' as source_type,
       COUNT(v.id) as view_count,
       s.updated_at, s.updated_by
FROM data_items s
WHERE s.app = $app AND s.type LIKE $dmsEnvInstance || '|%:source'
LEFT JOIN data_items v ON v.app = s.app AND v.type LIKE ...
GROUP BY s.id
```

### 2. `source_section_count` column type (client-side)

Reads `ComponentContext.state.data` for the sections dataset (from the Sections source),
counts how many sections have `source_id` matching this source's ID.

Renders: `4 sections` (link-style, opens sections tab filtered to that source).

`0 sections` renders as an amber "Orphaned" pill.

### 3. Columns

| Column | Source | Notes |
|--------|--------|-------|
| Name | `display_name` | editable? no — routes to datasets admin |
| Type | `doc_type` | internal_table / external / gis / file_upload |
| Views | `view_count` | count of views under this source |
| Used by | `source_section_count` | custom column type — 0 = orphaned |
| Last updated | `updated_at` | formatted date |
| Updated by | `updated_by` | username |
| Status | derived | "Active" / "Orphaned" pill from section_count |

### 4. Filter bar

- Type dropdown: All / internal_table / external / GIS / file_upload
- Status: All / Active / Orphaned
- Search by name

## Files Requiring Changes

- `src/dms/packages/dms/src/patterns/page/api/useDataSource.js` — register `{pattern} (sources)` source type
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/data/page.format.js` — add cmsSource attributes
- New file: `src/dms/packages/dms/src/patterns/page/columnTypes/source_section_count.jsx`
- `src/dms/packages/dms/src/patterns/page/columnTypes/index.jsx` — register new type

## Testing Checklist

- [ ] `{pattern} (sources)` appears in the data source picker
- [ ] Source rows load with name, type, view_count, updated_at
- [ ] `source_section_count` correctly counts sections using each source
- [ ] Sources with 0 sections show "Orphaned" pill
- [ ] Type and status filters work
- [ ] Clicking a source's section count opens sections tab filtered to that source
