# DataWrapper Join Support

## Objective

Enable datawrappers to join multiple data sources (DAMA views, internal tables, or other UDA configs) via a join DSL that compiles to server-side SQL. This builds on the dataWrapper rearchitecture (completed task) which established:

- `buildUdaConfig` — pure function that takes `{ externalSource, columns, filters, join, pageFilters }` and produces UDA options. The `join` parameter is accepted but not yet implemented (passes through as null).
- `outputSourceInfo` — each dataWrapper produces a description of its output columns, types, and the UDA config that produces them (`asUdaConfig`). A downstream join can reference this to compile a WITH clause.
- Page-level data sources — a `dataSources` map on each page with named, reusable source configs. Joins reference multiple sources from this map.
- v2 canonical schema — clean field names (`externalSource`, `filters`), no derived state persisted. The `join` field on data sources is `null` (placeholder for this task).

## Prerequisites

- DataWrapper rearchitecture task complete (Phases 1-5B + 6 documentation)
- `buildUdaConfig.js` accepts `join` parameter (currently ignored)
- `computeOutputSourceInfo` produces `asUdaConfig` when transforms are present
- Page-level `dataSources` map exists with DataSourceContext CRUD
- v2 schema has `join: null` placeholder on data source configs
- Server UDA handler (`uda.controller.js`) generates single-table SQL from options object

## Proposed Join Config Format

From the rearchitecture task's design section:

```javascript
// Page-level data source with join config
{
  id: "ds-3",
  name: "Events + Counties",
  externalSource: {                   // primary source
    source_id: 870,
    view_id: 1648,
    isDms: false,
    env: "dama",
  },
  columns: [
    { name: "county_fips", show: true, group: true, table: "events" },
    { name: "county_name", show: true, table: "counties" },
    { name: "property_damage", show: true, fn: "sum", table: "events" },
    { name: "population", show: true, table: "counties" },
  ],
  filters: {
    op: "AND",
    groups: [{ col: "property_damage", op: "gt", value: 0, table: "events" }]
  },
  join: {
    sources: {
      events: null,              // null = use this data source's externalSource
      counties: "ds-2",         // ref to another page-level data source by ID
    },
    on: [
      {
        type: "left",           // 'left' | 'inner' | 'right' | 'join'
        tables: ["events", "counties"],
        on: "events.county_fips = counties.geoid"
      }
    ]
  },
}
```

When a source in `join.sources` references another data source by ID, that source's `outputSourceInfo.asUdaConfig` can be used to compile a WITH (CTE) clause — the join operates on the output of another UDA query, not just a raw table.

## Implementation Phases

### Phase 1: Client-Side Join Config Building

**1.1 Extend buildUdaConfig to handle join configs**

When `join` is non-null:
- Resolve source references: `null` → this data source's externalSource, `"ds-2"` → look up from a `dataSources` map parameter
- Build column references with table prefixes: `events.county_fips` instead of `county_fips`
- Map filter conditions to table-prefixed column refs
- Produce a join-aware UDA options object that the server can parse

The output `options` object for a join query:
```javascript
{
  join: {
    sources: {
      events: { view_id: 1648, env: "dama" },
      counties: { view_id: 1370, env: "dama" },
      // OR for a subquery source:
      agg_data: { udaConfig: { options: {...}, attributes: [...] } }
    },
    on: [
      { type: "left", tables: ["events", "counties"],
        on: "events.county_fips = counties.geoid" }
    ]
  },
  // Standard options apply to the joined result
  groupBy: ["events.county_fips"],
  orderBy: { "events.county_fips": "asc" },
  filter: {},
  attributes: ["events.county_fips", "counties.county_name", "sum(events.property_damage) as property_damage_sum"],
}
```

**1.2 Update computeOutputSourceInfo for joins**

When a join is present, the output columns come from multiple sources. The `outputSourceInfo.columns` should indicate which source table each column came from.

**1.3 Unit tests**

Extend `buildUdaConfig.test.js` with join-specific tests:
- Two-source join: column resolution, filter mapping, attribute generation
- Join with subquery source (udaConfig reference)
- Join with groupBy across sources
- outputSourceInfo for join queries

### Phase 2: Server-Side SQL Generation

**2.1 Extend UDA controller to handle join configs**

When `options.join` is present in the request:
- Parse `join.sources` to resolve table names (DAMA views → `{schema}.{table}`)
- For `udaConfig` sources: generate WITH (CTE) clause from the nested UDA options
- Generate JOIN clauses from `join.on` specs
- Prefix column references in WHERE/GROUP BY/ORDER BY with table aliases
- Execute the composed SQL

**2.2 WITH clause generation for subquery sources**

When a join source has `udaConfig` instead of `view_id`, generate:
```sql
WITH agg_data AS (
  SELECT col1, sum(col2) as col2_sum
  FROM source_table
  WHERE ...
  GROUP BY col1
)
SELECT events.county_fips, agg_data.col1
FROM events_table AS events
LEFT JOIN agg_data ON events.key = agg_data.key
```

The existing UDA SQL generation logic (buildCombinedWhere, handleGroupBy, etc.) should be reusable for the inner query.

**2.3 Cross-database joins**

If sources are in different databases/environments, the server needs to handle this. Options:
- Require all join sources to be in the same database
- Use dblink or foreign data wrappers (PostgreSQL)
- Fetch one source as a temp table, then join

Start with same-database joins only. Cross-database is a later extension.

**2.4 Server tests**

Add UDA route tests for join queries:
- Two-table LEFT JOIN
- Three-table join chain
- Join with CTE (subquery source)
- Join with filters on multiple tables
- Join with GROUP BY across tables
- Error handling: invalid source refs, circular CTE refs

### Phase 3: Join UI

**3.1 Join editor in Data Sources pane**

Add a "Join" section to the DataSourceEditor:
- Source picker for each table alias (from page-level dataSources)
- Join condition editor (ON clause)
- Column table assignment (which table each column belongs to)

**3.2 Column disambiguation**

When columns from different sources share the same name, the UI needs to show which table they come from. The `columns[].table` field handles this in the config.

**3.3 outputSourceInfo for source selection**

The join UI uses `outputSourceInfo.columns` from each source to show available columns for:
- The ON condition builder (which columns can be joined on)
- The column selection (which columns to include in the output)
- Type checking (warn when joining on incompatible types)

**3.4 Formula columns can't join**

`outputSourceInfo` marks formula columns as `source: 'formula'`. The join UI should filter these out for server-side join conditions (they only exist client-side).

### Phase 4: Integration Testing

- [ ] Two-source join: configure in UI, data loads correctly
- [ ] Join with filter on secondary source
- [ ] Join with GROUP BY across sources
- [ ] Join with CTE source (another data source's udaConfig)
- [ ] Multiple sections sharing a join data source (independent display)
- [ ] Edit join config in data sources pane, sections reflect changes
- [ ] Publish page with join data sources
- [ ] Error cases: missing source ref, circular CTE, cross-database

## Key Design Decisions

1. **Join config lives on the data source, not the section.** A join defines "what data to query" — it's config, not display. Multiple sections can share a join data source with different display settings.

2. **Table aliases, not table names.** The join config uses human-readable aliases (`events`, `counties`) that map to source references. This keeps the config readable and decouples it from server-side table resolution.

3. **Start with same-database joins.** Cross-database joins are significantly more complex (require server coordination) and are deferred.

4. **CTE for subquery sources.** When a join references another data source that has transforms (groupBy, filters), the server compiles it into a WITH clause. This reuses the existing UDA SQL generation rather than requiring a new query model.

5. **Column table prefix.** Join-mode columns have a `table` field indicating which source they belong to. This is only present in join mode — single-source configs don't need it.

## Server Changes Scope

The UDA controller currently generates single-table SQL:
```sql
SELECT col1, col2 FROM table WHERE ... GROUP BY ... ORDER BY ...
```

For joins, it needs to generate:
```sql
WITH cte_name AS (
  SELECT ... FROM ... WHERE ... GROUP BY ...
)
SELECT t1.col1, t2.col2
FROM table1 AS t1
LEFT JOIN table2 AS t2 ON t1.key = t2.key
LEFT JOIN cte_name ON t1.key = cte_name.key
WHERE ... GROUP BY ... ORDER BY ...
```

Key server-side additions:
- Parse `options.join` → resolve source tables
- Generate WITH clauses for udaConfig sources
- Generate FROM + JOIN clauses
- Prefix column refs with table aliases in WHERE/GROUP BY/ORDER BY
- Handle the combined SQL execution
- SQLite compatibility (SQLite supports CTEs and JOINs with the same syntax)

## Reference

- DataWrapper rearchitecture task: `planning/tasks/current/datawrapper-rearchitecture.md`
- buildUdaConfig: `dataWrapper/buildUdaConfig.js` — already accepts `join` param (ignored)
- outputSourceInfo: `computeOutputSourceInfo` in buildUdaConfig.js — produces `asUdaConfig`
- Page-level dataSources: DataSourceContext in `context.js`, DataSourcesPane in `editPane/`
- v2 schema: `dataWrapper/schema.js`
- UDA server controller: `dms-server/src/uda/uda.controller.js`
- UDA route tests: `dms-server/tests/uda.test.js`
