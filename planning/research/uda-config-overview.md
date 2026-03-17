# UDA Config Overview

This document describes the internal state of a dataWrapper component, how that state maps to a UDA query config, and the UDA query config format itself. Examples are drawn from the mitigateny-prod redesign pattern (Flooding Risk Profile page).

## Table of Contents

1. [Internal State Schema](#internal-state-schema)
2. [Column Configuration](#column-configuration)
3. [dataRequest Object](#datarequest-object)
4. [UDA Options Object](#uda-options-object)
5. [Column Name Transformations](#column-name-transformations)
6. [Meta Lookups](#meta-lookups)
7. [Filter Configuration](#filter-configuration)
8. [Display Configuration](#display-configuration)
9. [Real Examples](#real-examples)

---

## Internal State Schema

The complete state persisted as `element-data` JSON:

```javascript
{
    sourceInfo: { ... },    // data source identification
    columns: [ ... ],       // column definitions + user settings
    dataRequest: { ... },   // declarative query (intermediate repr)
    display: { ... },       // presentation settings
    data: [ ... ]           // cached data rows
}
```

### sourceInfo

Identifies the data source (a DAMA view or DMS dataset):

```javascript
{
    app: "mitigat-ny-prod",              // application name
    type: "prod",                        // type identifier
    isDms: false,                        // true for DMS datasets, false for DAMA views
    env: "hazmit_dama",                  // database environment
    srcEnv: "mitigat-ny-prod+prod",      // (DMS only) source environment
    source_id: 870,                      // data source ID
    view_id: 1648,                       // view ID within the source
    view_name: "AVAIL - Fusion Events V2 (12/10/2024)",
    name: "AVAIL - Fusion Events V2",    // human-readable name
    columns: [                           // available columns from source metadata
        { name: "disaster_number", type: "text", display: "data-variable" },
        { name: "geoid", type: "text", display: "data-variable" },
        ...
    ],
    doc_type: "..."                      // (DMS only) document type UUID
}
```

For **DMS datasets**, `isDms: true` and column accessors use `data->>'columnName'`.
For **DAMA views**, `isDms: false` and column accessors are plain SQL column names.

---

## Column Configuration

Each column in `state.columns[]` combines source metadata with user settings:

```javascript
{
    // === Identity ===
    name: "disaster_number",             // column name (may be a SQL expression with AS)
    display_name: "Disaster Number",     // original display name from source
    customName: "FEMA Disaster #",       // user override for display name
    type: "text",                        // data type: text, number, integer, select, multiselect, calculated, formula
    origin: "calculated-column",         // set for computed columns
    display: "data-variable",            // role: 'data-variable' | 'meta-variable' | 'geoid-variable' | 'calculated'

    // === Visibility & Layout ===
    show: true,                          // visible in output
    size: 199.5,                         // column width in pixels (spreadsheet)
    openOut: false,                      // render in expanded/detail view
    wrapText: true,                      // allow text wrapping

    // === Grouping & Aggregation ===
    group: false,                        // GROUP BY this column
    fn: "sum",                           // aggregate function: 'sum' | 'avg' | 'count' | 'max' | 'list' | ''
    sort: "desc",                        // sort direction: 'asc' | 'desc' | undefined

    // === Filtering ===
    filters: [                           // server-side filter definitions (see Filter Configuration)
        { type, operation, values, ... }
    ],
    localFilter: ["search text"],        // client-side filter values
    excludeNA: false,                    // exclude null values (adds 'null' to exclude filter)

    // === Formatting ===
    formatFn: "abbreviate",             // format function: 'abbreviate' | 'comma' | 'comma_dollar' | 'abbreviate_dollar' | 'date' | 'zero_to_na' | ' '
    isDollar: true,                      // prepend $ to formatted value
    justify: "right",                    // text alignment

    // === Card-specific ===
    headerFontStyle: "textMD",           // header text size class
    valueFontStyle: "text4XL",           // value text size class
    bgColor: "#F3F8F9",                  // card background color

    // === Graph-specific ===
    xAxis: true,                         // use as x-axis
    yAxis: true,                         // use as y-axis
    categorize: true,                    // use for color categorization

    // === Meta ===
    meta_lookup: "{ JSON config }",      // meta lookup configuration (string or object)

    // === Editing ===
    editable: true,                      // can be edited in view mode
    allowEditInView: false,              // allow edit in view mode specifically

    // === Duplicate/Normalized columns ===
    isDuplicate: false,                  // this is a duplicated column
    normalName: "custom_alias",          // alias for normalized column
    copyNum: 1,                          // copy number for duplicates
    valueColumn: false,                  // this column provides values for CASE WHEN

    // === Formula columns ===
    formula: { type, operation, left, right },  // AST for formula evaluation
    variables: [{ name, ... }],          // columns referenced by the formula

    // === Server functions ===
    serverFn: {
        keepOriginal: true,
        joinKey: "id",
        valueKey: "name",
        joinWithChar: ", ",
        serverFn: "join"
    },

    // === Mapped options (for editable select columns) ===
    mapped_options: "{ JSON config }",   // config for fetching select options from another source
    options: [{ label, value }]          // loaded select options
}
```

---

## dataRequest Object

The `dataRequest` is an intermediate representation built from column settings. It's the bridge between the UI state and the UDA query. It lives at `state.dataRequest` and is rebuilt by an effect whenever columns change.

```javascript
{
    // === Inclusion filters (WHERE col IN (...)) ===
    filter: {
        "columnName": [value1, value2, ...]
    },

    // === Exclusion filters (WHERE col NOT IN (...)) ===
    exclude: {
        "columnName": [value1, value2, ...]
    },

    // === Numeric comparison filters ===
    gt:  { "columnName": [value] },      // >
    gte: { "columnName": [value] },      // >=
    lt:  { "columnName": [value] },      // <
    lte: { "columnName": [value] },      // <=

    // === Text search ===
    like: { "columnName": [searchTerm] },

    // === Filter combination ===
    filterRelation: "AND",               // 'AND' | 'OR' — how to combine filter clauses

    // === Grouping ===
    groupBy: ["columnName1", "columnName2"],

    // === Sorting ===
    orderBy: {
        "columnName": "asc"              // 'asc' | 'desc' | 'asc nulls last' | 'desc nulls last'
    },

    // === Aggregate functions ===
    fn: {
        "columnName": "sum"              // 'sum' | 'avg' | 'count' | 'max' | 'list'
    },

    // === Server-side functions ===
    serverFn: {
        "columnName": { keepOriginal, joinKey, valueKey, joinWithChar, serverFn }
    },

    // === Meta lookups ===
    meta: {
        "columnName": "{ JSON lookup config }"
    },

    // === Normalized filter columns (for duplicate columns) ===
    normalFilter: [
        { column: "name", values: [...], operation: "filter", fn: "sum" }
    ]
}
```

**Key difference from UDA options**: `dataRequest` uses the original column names (as stored in the column config). The `getData()` function transforms these into `refName` (with `data->>` for DMS) and `reqName` (with fn and AS) before building the UDA options.

---

## UDA Options Object

This is the final query config sent to the UDA API endpoint. Built by `getData()` in `utils/utils.jsx`.

```javascript
{
    // === Row filtering ===
    filter: {                            // WHERE col IN (values)
        "data->>'colName'": [v1, v2],    // DMS column accessor
        "colName": [v1, v2]              // DAMA column accessor
    },
    exclude: {                           // WHERE col NOT IN (values)
        "data->>'colName'": ["null", v1]
    },

    // === Numeric/text filtering ===
    // Non-aggregated columns go to `where`:
    gt:  { "refName": value },           // WHERE refName > value
    gte: { "refName": value },
    lt:  { "refName": value },
    lte: { "refName": value },
    like: { "refName": "%term%" },       // WHERE refName LIKE '%term%'

    // Aggregated columns go to `having`:
    having: [                            // HAVING clause conditions
        "sum(data->>'col') >= 1000"      // string SQL expressions
    ],

    // === Grouping ===
    groupBy: [                           // GROUP BY
        "data->>'category'",             // DMS: data accessor
        "state_fips"                     // DAMA: plain column
    ],

    // === Sorting ===
    orderBy: {                           // ORDER BY
        "sum(data->>'amount')": "desc",  // aggregated expression
        "data->>'name'": "asc nulls last"
    },

    // === Meta lookups (value transformations) ===
    meta: {
        "stcofips": "{\"view_id\": 750, \"filter\": ...}",  // cross-reference lookup
        "nri_category": "{ \"riverine\": \"Flooding\", ... }" // static mapping
    },

    // === Server-side functions ===
    serverFn: {
        "colName": {
            keepOriginal: true,
            joinKey: "id",
            valueKey: "name",
            joinWithChar: ", ",
            serverFn: "join"
        }
    },

    // === Normalized columns ===
    normalFilter: [
        { column: "hazard_type", values: ["flood"], operation: "filter", fn: "sum" }
    ],

    // === Control flags ===
    keepOriginalValues: true,            // return {value, originalValue} pairs for meta columns
    filterRelation: "AND"                // 'AND' | 'OR'
}
```

### API Call Structure

The options and column list are sent to UDA via the Falcor API:

```javascript
apiLoad({
    format: sourceInfo,                  // source_id, view_id, env, isDms, app, type
    children: [{
        type: () => {},
        action: "uda",                   // or "udaLength" for count-only
        path: "/",
        filter: {
            fromIndex: 0,               // pagination start
            toIndex: 9,                 // pagination end
            options: JSON.stringify(options),
            attributes: [               // SELECT clause — array of SQL expressions
                "sum(data->>'amount') as amount",
                "data->>'category' as category",
                "count(distinct disaster_number) as num_disasters"
            ],
            stopFullDataLoad: true
        }
    }]
})
```

---

## Column Name Transformations

The dataWrapper transforms column names at several stages. Understanding this is critical:

### Original name (stored in config)

The `column.name` as configured by the user. May be a plain column name or a full SQL expression:

```
"stcofips"
"CASE WHEN disaster_number = 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_non_declared"
"EXTRACT(YEAR from swd_begin_date) as year_of_event"
"substring(geoid, 1, 2) as state"
```

### refName (reference accessor)

Used in WHERE/GROUP BY clauses. Built by `attributeAccessorStr()`:

- **DAMA plain column**: `"stcofips"` → `"stcofips"`
- **DMS plain column**: `"category"` → `"data->>'category'"`
- **Calculated/expression column**: `"CASE WHEN ... as alias"` → `"CASE WHEN ..."` (part before AS)

### reqName (request name)

Used in SELECT clause. Built by `applyFn()` → `getColAccessor()`:

- **No fn**: `"data->>'col' as col"` (DMS) or `"col"` (DAMA)
- **With fn**: `"sum(data->>'col') as col"` (DMS) or `"sum(col) as col"` (DAMA)
- **list fn**: `"array_to_string(array_agg(distinct data->>'col'), ', ') as col"`
- **Calculated**: uses the expression directly, no `data->>` wrapper

### totalName

Used for total/summary rows:
```sql
SUM(CASE WHEN (refName)::text ~ '^-?\d+(\.\d+)?$' THEN (refName)::numeric ELSE NULL END) as col_total
```

---

## Meta Lookups

Meta lookups transform raw values into human-readable labels. Two forms:

### Static mapping (inline JSON object)

Maps values directly:

```json
{
    "nri_category": "{ \"riverine\": \"Flooding\", \"coastal\": \"Coastal Hazards\", \"hail\": \"Hail\" }"
}
```

The server replaces each value with its mapped label. With `keepOriginalValues: true`, the response contains `{ value: "Flooding", originalValue: "riverine" }`.

### Cross-reference lookup (view reference)

Joins against another view to resolve values:

```json
{
    "stcofips": "{\"view_id\": 750, \"filter\": {\"year\": [2020], \"length(geoid)\": [5]}, \"geoAttribute\": \"geoid\", \"filterAttribute\": \"geoid\", \"keyAttribute\": \"geoid\", \"valueAttribute\": \"formatted_name\", \"attributes\": [\"geoid\", \"formatted_name\"]}"
}
```

Fields:
- `view_id`: The view to look up values in
- `filter`: Filter to apply to the lookup view
- `keyAttribute`: Column in lookup view to match against
- `valueAttribute`: Column in lookup view to use as the display value
- `geoAttribute`, `filterAttribute`: For geo-based lookups
- `attributes`: Columns to fetch from the lookup view

This effectively does: given a `stcofips` value like `"36061"`, look up `formatted_name` from view 750 where `geoid = '36061'` → returns `"New York (County)"`.

---

## Filter Configuration

Each column can have multiple filters in `column.filters[]`:

```javascript
{
    type: "external",           // 'internal' (edit-only) | 'external' (visible in view)
    operation: "filter",        // 'filter' | 'exclude' | 'gt' | 'gte' | 'lt' | 'lte' | 'like'
    values: ["riverine"],       // filter values (array)
    isMulti: true,              // allow multiple selections
    fn: "max",                  // aggregate fn for this filter (used with grouping)
    usePageFilters: false,      // sync with page-level URL params
    searchParamKey: "hazard",   // URL param key
    display: ""                 // '' (compact) | 'expanded' | 'tabular'
}
```

### Filter operations mapped to SQL

| operation | SQL equivalent | values format |
|-----------|----------------|---------------|
| `filter` | `WHERE col IN (v1, v2, ...)` | `[v1, v2, ...]` |
| `exclude` | `WHERE col NOT IN (v1, v2, ...)` | `[v1, v2, ...]` |
| `gt` | `WHERE col > v` | `[v]` (single) |
| `gte` | `WHERE col >= v` | `[v]` (single) |
| `lt` | `WHERE col < v` | `[v]` (single) |
| `lte` | `WHERE col <= v` | `[v]` (single) |
| `like` | `WHERE col LIKE '%v%'` | `[v]` (single) |

### Aggregated filters

When a filter has a `fn` set (e.g., `fn: "max"`), or when the column itself has an aggregate function, numeric comparison filters go to the `HAVING` clause instead of `WHERE`:

```javascript
// Column with fn: "sum" and filter operation: "gte", value: [1000]
// → HAVING sum(col) >= 1000
```

### Multiselect column handling

For columns of type `multiselect`, filter values are stored as JSON arrays in the database. The dataWrapper fetches all distinct stored values, parses them, and matches against selected filter values to find which stored combinations contain the selected items.

---

## Display Configuration

The `state.display` object controls presentation:

```javascript
{
    // === Pagination ===
    pageSize: 10,                        // rows per page
    totalLength: 62,                     // total row count (from server)
    filteredLength: 30,                  // after local filters
    usePagination: true,                 // true: paginate, false: infinite scroll

    // === UI flags ===
    showGutters: false,                  // show row numbers
    striped: true,                       // alternating row colors
    showTotal: false,                    // show totals row
    showAttribution: true,               // show data source attribution
    allowDownload: true,                 // show Excel download button
    autoResize: true,                    // auto-resize column widths

    // === Editing ===
    allowEditInView: false,              // allow editing in view mode
    allowAdddNew: false,                 // allow adding new rows
    addNewBehaviour: "append",           // 'append' | 'navigate'
    navigateUrlOnAdd: "/path/",          // URL for navigate behavior

    // === Visibility ===
    hideSection: false,                  // hide entire section
    hideIfNull: false,                   // hide if all data is null
    readyToLoad: true,                   // ready to fetch data

    // === Caching ===
    preventDuplicateFetch: true,         // skip fetch if dataRequest unchanged

    // === Filter layout ===
    gridSize: 2,                         // filter grid columns (1-5)
    placement: "stacked",                // 'inline' | 'stacked'
    filterRelation: "AND",               // 'AND' | 'OR'

    // === Graph-specific ===
    graphType: "BarGraph",               // 'BarGraph' | 'LineGraph' | etc.
    groupMode: "stacked",                // 'stacked' | 'grouped'
    orientation: "vertical",             // 'vertical' | 'horizontal'
    height: 325,                         // chart height in pixels
    colors: { type: "palette", value: ["#D72638", ...] },
    margins: { marginTop: 20, marginRight: 20, marginBottom: 50, marginLeft: 100 },
    xAxis: { label, rotateLabels, showGridLines, tickSpacing },
    yAxis: { label, showGridLines, tickFormat },
    legend: { show: true, label: "" },
    tooltip: { show: true, fontSize: 12 },
    title: { title: "", position: "start", fontSize: 32, fontWeight: "bold" },
    bgColor: "#ffffff",
    textColor: "#000000",

    // === Card-specific ===
    headerValueLayout: "col",            // 'col' | 'row'
    reverse: true,                       // reverse card order
    padding: 30,                         // card padding
    compactView: false,                  // compact card layout
    removeBorder: false,                 // remove card borders
    bgColor: "#F3F8F9",                  // card background
    gridGap: 10,                         // gap between cards

    // === Spreadsheet-specific ===
    transform: "",                       // data transformation
    loadMoreId: "id...",                 // infinite scroll anchor ID
}
```

---

## Real Examples

These configs are extracted from the mitigateny-prod redesign pattern, "Risk Profile (Flooding)" page (ID 1009948), using the DMS CLI.

### Example 1: Card — Fusion Events Summary

A card showing 4 KPI values: declared/non-declared disaster counts and dollar amounts.

**Source**: Fusion Events V2 (view 1648)

```javascript
dataRequest: {
    filter: {
        "coalesce(fema_incident_type, nri_category) as fusion_category": ["riverine"],
        "substring(geoid, 1, 2) as state": [36]
    },
    groupBy: [
        "coalesce(fema_incident_type, nri_category) as fusion_category",
        "substring(geoid, 1, 2) as state"
    ],
    fn: {
        "distinct CASE WHEN fusion_total_damage > 0 AND disaster_number != 'Non-Declared' THEN disaster_number ELSE null END as num_declared_disasters": "count",
        "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters": "sum",
        "distinct CASE WHEN disaster_number = 'Non-Declared' THEN event_id ELSE null END as num_non_declared_disasters": "count",
        "CASE WHEN disaster_number = 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_non_declared_disasters": "sum"
    }
}
```

**What this does**: Filters to riverine hazards in NY state (FIPS 36), groups by category+state (producing one row), and computes 4 aggregates — declared disaster count, declared damage sum, non-declared event count, and non-declared damage sum. The CASE WHEN expressions split data by declared status.

**Returned data** (1 row):
```json
{
    "num_declared_disasters": 10,
    "amt_declared_disasters": 699969572.70,
    "num_non_declared_disasters": 4629,
    "amt_non_declared_disasters": 639397900
}
```

### Example 2: Graph — Bar Chart (Declared vs Non-Declared)

A stacked bar chart comparing declared vs non-declared disaster costs.

**Source**: Fusion Events V2 (view 1648)

```javascript
dataRequest: {
    filter: {
        "substring(geoid, 1, 2) as state": [36],
        "coalesce(fema_incident_type, nri_category) as fusion_category": ["riverine"]
    },
    groupBy: [
        "case when disaster_number = 'Non-Declared' then 'Non-Declared' else 'Declared' end as fusion_disaster_category",
        "nri_category"
    ],
    fn: {
        "CASE WHEN disaster_number != 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_declared_disasters": "sum",
        "CASE WHEN disaster_number = 'Non-Declared' THEN fusion_total_damage ELSE null END as amt_non_declared_disasters": "sum"
    },
    meta: {
        "nri_category": "{ \"riverine\":\"Flooding\", \"coastal\":\"Coastal Hazards\", ... }"
    }
}
```

**Column roles** (how columns map to the graph):
- `fusion_disaster_category`: `xAxis: true, categorize: true, group: true` — bar categories + color
- `amt_declared_disasters`: `yAxis: true, fn: "sum"` — bar height
- `amt_non_declared_disasters`: `yAxis: true, fn: "sum"` — bar height (stacked)
- `nri_category`: `categorize: true, group: true` — secondary grouping with meta lookup

### Example 3: Graph — Time Series (By Year)

A stacked bar showing damage by year with a `gte` filter on year.

```javascript
dataRequest: {
    filter: {
        "substring(geoid, 1, 2) as state": [36],
        "coalesce(fema_incident_type, nri_category) as fusion_category": ["riverine"]
    },
    gte: {
        "EXTRACT(YEAR from swd_begin_date) as year_of_event": ["1996"]
    },
    groupBy: [
        "case when disaster_number = 'Non-Declared' then 'Non-Declared' else 'Declared' end as fusion_disaster_category",
        "EXTRACT(YEAR from swd_begin_date) as year_of_event"
    ],
    fn: {
        "COALESCE(fusion_property_damage, 0) + COALESCE(fusion_crop_damage, 0) + COALESCE(swd_population_damage_value, 0) as fusion_total_damage_with_pop": "sum"
    }
}
```

Note the `gte` filter: `EXTRACT(YEAR from swd_begin_date) >= 1996`. This filter has `fn: "max"` in the column config, meaning it becomes a `HAVING max(EXTRACT(YEAR ...)) >= 1996` clause since it's an aggregated context.

### Example 4: Spreadsheet — EAL by County

A paginated table of county-level flood risk with a meta lookup for county names.

**Source**: NRI Counties (view 1370)

```javascript
dataRequest: {
    filter: {
        "substring(stcofips, 1, 2) as state_fips": [36]
    },
    gte: {
        "rfld_ealt": [1]
    },
    groupBy: ["stcofips"],
    orderBy: {
        "rfld_ealt": "desc nulls last"
    },
    fn: {
        "rfld_ealt": "sum"
    },
    meta: {
        "stcofips": "{\"view_id\": 750, \"filter\": {\"year\": [2020], \"length(geoid)\": [5]}, \"geoAttribute\": \"geoid\", \"filterAttribute\":\"geoid\", \"keyAttribute\":\"geoid\", \"valueAttribute\":\"formatted_name\", \"attributes\": [\"geoid\",\"formatted_name\"]}"
    }
}
```

**What this does**: Filters to NY (state FIPS 36), excludes counties with 0 EAL, groups by county FIPS, sums flood EAL, orders descending, and uses a cross-reference lookup to view 750 to convert FIPS codes to county names like "Nassau (County)".

### Example 5: Spreadsheet — DMS Dataset Source

A table sourced from a DMS dataset (not a DAMA view). Note `isDms: true`.

**Source**: R_and_V_Matrix (DMS dataset, view 1160864)

```javascript
sourceInfo: {
    isDms: true,
    app: "mitigat-ny-prod",
    env: "mitigat-ny-prod+faf62ea4-91a5-4b3d-a303-cf2d87513896",
    doc_type: "faf62ea4-91a5-4b3d-a303-cf2d87513896"
}

dataRequest: {
    filter: {
        "domain": [],
        "to_jsonb(array_remove(array[case when data->>'avalanche' is not null ...], null))::text as hazards_json": ["flooding"]
    },
    groupBy: ["control"],
    fn: {
        "potential_impact_name": "list",
        "domain": "list",
        "sub_domain": "list",
        "sub_domain_category": "list",
        "impact_description": "list"
    }
}
```

This shows the DMS pattern: columns are accessed via `data->>'column_name'`. The complex `to_jsonb(array_remove(...))` expression builds a computed "hazards" column from multiple boolean-like fields, then filters to rows where flooding is present. All non-grouped columns use `fn: "list"` which aggregates via `array_to_string(array_agg(distinct ...), ', ')`.

### Example 6: Card — Single Aggregate (Buildings in Flood Plain)

A minimal card showing a single KPI.

**Source**: AVAIL BILD (view 1960)

```javascript
dataRequest: {
    groupBy: [],
    fn: {
        "CASE WHEN flood_zone IN ('100','500') THEN 1 else 0 END AS num_flood_500_100": "sum"
    }
}
```

No grouping, no filters — just sums a CASE WHEN across the entire dataset. Returns one row with `num_flood_500_100: 484042`.

---

## Aggregate Functions Reference

| fn value | SQL output | Description |
|----------|------------|-------------|
| `"sum"` | `sum(col) as col` (DAMA) / `sum((data->>'col')::integer) as col` (DMS) | Sum |
| `"avg"` | `avg(col) as col` / `avg((data->>'col')::integer) as col` | Average |
| `"count"` | `count(col) as col` | Count |
| `"max"` | `max(col) as col` | Maximum |
| `"list"` | `array_to_string(array_agg(distinct col), ', ') as col` | Concatenate distinct values |

## Format Functions Reference

| formatFn value | Description | Example |
|----------------|-------------|---------|
| `"abbreviate"` | Abbreviate with K/M/B suffix | `1234567` → `1.2 M` |
| `"abbreviate_dollar"` | Abbreviate with $ prefix | `1234567` → `$ 1.2 M` |
| `"comma"` | Integer with commas | `1234567` → `1,234,567` |
| `"comma_dollar"` | Integer with commas + $ | `1234567` → `$ 1,234,567` |
| `"date"` | Format as date | `2024-01-15T...` → `01/15/2024` |
| `"zero_to_na"` | Show "N/A" for zero/null | `0` → `N/A` |
| `" "` (space) | No formatting (identity) | `1996` → `1996` |
