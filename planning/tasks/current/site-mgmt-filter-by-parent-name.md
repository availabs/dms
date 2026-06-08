# Task: Filter sections/pages by resolved parent name

## Objective

When an author filters the `parent` column in a pages/sections Spreadsheet, they should be able to type a page title (e.g., "Documentation") and see only rows with that parent. Currently, filters on `parent` match the raw stored ID (an integer) because filter predicates are evaluated by SQL before `applyServerFn` resolves titles.

## Current behavior

Filter `parent = "Documentation"` → no results (raw stored value is `"42"` not `"Documentation"`).

## Root cause

`applyServerFn` runs as a post-query enrichment step. Filter predicates in `buildUdaConfig` reference the raw `data->>'parent'` accessor, not the resolved title. There's no mechanism to translate "filter by resolved title" into "filter by ID".

## Proposed fix

Two approaches:

**Option A (preferred): SQL-level LEFT JOIN**

Instead of `applyServerFn` for `parent`, inject a LEFT JOIN into the main query:

```sql
FROM data_items ds
LEFT JOIN data_items parent_row ON parent_row.id = (ds.data->>'parent')::integer
  AND parent_row.app = $1
```

Then `parent` becomes `parent_row.data->>'title'` in the SELECT. Filtering on `parent` works naturally via the WHERE clause.

This requires:
- A new `serverJoin` option type in `buildUdaConfig.js` (client-side: mark `parent` as a server join column)
- Server-side: detect `options.serverJoin` in `simpleFilter`, inject the LEFT JOIN into the FROM clause

**Option B: Pre-filter by ID lookup**

Before running the main query, resolve filter values for `serverFn` columns:
1. Detect filter conditions on `parent`
2. Look up `data_items` for rows whose `valueKey` matches the filter value
3. Replace the filter condition with `data->>'joinKey' IN ({resolved ids})`

This is simpler server-side but requires a pre-query round-trip.

## Effort

Medium. Option B is simpler; Option A is more general and performant.

## Dependencies

- `server-fn-recurse-extract.md` (done — provides `applyServerFn` as the baseline)
