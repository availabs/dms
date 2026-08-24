# Full-text search over several columns (one search box → many columns)

How to give a DMS page a single **keyword search box** that matches a typed string
across **several columns at once** (e.g. "search actions" over name + description +
agency + hazard + …) — using only the built-in filter system, no custom component.

> **Audience:** an engineer or AI wiring a searchable table/list page. Read
> [`creating-interactive-pages.md`](./creating-interactive-pages.md) first (page
> variables + the `usePageFilters` / `searchParamKey` mechanism) and
> [`using-a-datawrapper-card.md`](./using-a-datawrapper-card.md) (how a data section is
> bound). This skill is the keyword-search special case of that machinery.

> **Worked, in-production example:** MNY `actions_index` page (`app=mitigat-ny-prod`,
> page `2239721`). Sections (readable live, tokenless on local dev — `dms raw get <id>`):
> Search control **`2239701`**, consumers Spreadsheet **`2239704`** + Card **`2239700`**.
> ~17.8k rows; the search box filters across **16 columns**.

## TL;DR

Two parts, both pure filter config:

1. **One Search control** — a `Filter` section whose column uses `operation: "like"` (this is
   what renders a **text box** instead of a value dropdown), writing a page variable
   `searchParamKey: "search"`.
2. **Each data section** that should respond carries **one `OR` group of `like` leaves — one leaf
   per searchable column**, all sharing `searchParamKey: "search"`. The single typed value fans
   out to every column; `OR` means "match in ANY of them".

That's it. No new component, no server change.

## Step 1 — the Search control

Give it its **own** `Filter` section (separate from any facet/select filter bar). Bind its one
column to any **real** column on the source (the column name barely matters — the `like` op is
what makes it a search box; the displayed label is `customName`).

```jsonc
{
  "externalSource": { "source_id": 1029065, "view_id": 1074456, "env": "<pgEnv>", "isDms": true,
                      "columns": [ /* real schema subset */ ] },
  "columns": [
    { "name": "action_status", "customName": "Search", "type": "select", "show": true,
      "filters": [{
        "type": "external",
        "operation": "like",            // ← renders a TEXT INPUT ("search..." placeholder)
        "values": [],
        "isMulti": false,
        "usePageFilters": true,
        "searchParamKey": "search",     // ← the page variable other sections match on + the URL key
        "display": ""
      }] }
  ],
  "filters": { "op": "AND", "groups": [] },
  "display": { "totalLength": 1, "readyToLoad": true, "hideExternalToggle": true }
}
```

- **`operation: "like"`** is the whole trick — `RenderFilterValueSelector` renders a text field
  (placeholder `search...`) for `like`, versus a value picker for `filter`/`exclude`.
- **`display.hideExternalToggle: true`** hides the internal/external toggle so it reads as a plain
  search box.
- Register `search` in the **page** `filters` registry (the part-0 gate from
  [`creating-interactive-pages.md`](./creating-interactive-pages.md)) or it never reaches the URL
  or any section.

## Step 2 — make each data section search those columns

On every section that should respond (Spreadsheet, Card, …), add **one `OR` group** to the
section-level filter tree, with a `like` leaf per searchable column — **all** carrying
`usePageFilters: true` and the **same** `searchParamKey: "search"`:

```jsonc
"filters": { "op": "AND", "groups": [
  /* …your facet leaves (region, status, …) live here as siblings… */
  { "op": "OR", "groups": [
    { "col": "action_name",  "op": "like", "value": "", "usePageFilters": true, "searchParamKey": "search" },
    { "col": "control",      "op": "like", "value": "", "usePageFilters": true, "searchParamKey": "search" },
    { "col": "county",       "op": "like", "value": "", "usePageFilters": true, "searchParamKey": "search" },
    { "col": "description_of_the_problem_problem_statement",  "op": "like", "value": "", "usePageFilters": true, "searchParamKey": "search" },
    { "col": "description_of_the_solution_action_description", "op": "like", "value": "", "usePageFilters": true, "searchParamKey": "search" },
    { "col": "lead_agency_department", "op": "like", "value": "", "usePageFilters": true, "searchParamKey": "search" }
    /* …one leaf per column you want searchable… */
  ]}
]}
```

The whole tree stays `op: "AND"` at the top — facets AND (match in any searched column). Replicate
the **same** OR group on every section that should react (the table, a result-count card, …).

> The identical mechanism gives you a **multi-value facet that spans several columns** (e.g. a
> single "Hazard" picker matching primary/secondary/tertiary hazard columns): an `OR` group of
> `op:"filter"` leaves sharing one `searchParamKey`. Same shape, `filter` instead of `like`.

### ⚠ Do NOT reach for a `notempty` + `usePageFilters` leaf as a default-OFF facet chip

A `like` leaf with an empty value is dropped by a **value-based** guard in `mapFilterGroupCols`, so
an untouched search box adds no constraint (above). A unary `empty`/`notempty` leaf **carries no
value**, so it has no such guard: the only thing that turns it off is `applyPageFilters` setting
`disabled: true`, and that pass **early-returns when the page-variable map is empty**
(`buildUdaConfig.js:475`: `if (!filterTree || !pageFilters || !Object.keys(pageFilters).length)`).

Consequence: a "rebuilt"/"described"-style gap-filter chip that nobody has switched on is emitted
**ENABLED**, and it narrows the section silently. Measured on the NPMRDS Reports finder
(2026-08-19): two off chips cut a 1,574-row library to **19 rows** — the section looked like it was
working, the count was simply wrong. It is not the search's `OR` group that fails, it is every
sibling leaf in the same tree.

- **A STATIC `notempty` leaf is fine** — no `usePageFilters`, so it is meant to be always-on. Use it
  for the "don't show rows that can't be found" predicates (`{ col: "name", op: "notempty" }`).
- **A viewer-toggled one needs the fix**, not a workaround: move the unary default-disable into
  `mapFilterGroupCols` (a `usePageFilters` `empty`/`notempty` leaf with no resolved page value is
  dropped) so correctness stops depending on the page map being non-empty.
- Separately, `operation: "notempty"` on a **`Filter` control column** renders a **number input**
  ("Please enter a number…"), not the needs-value toggle the chip wants —
  `RenderFilterValueSelector` has no unary branch.
- Verify by reading the emitted `filterGroups` off the wire, not by eyeballing the list: a leaf that
  `applyPageFilters` processed carries a `disabled` key. **No `disabled` key at all means the pass
  never ran.**

## Why it works (verified in source)

`buildUdaConfig.js` (`patterns/page/components/sections/components/dataWrapper/`):
- A `like` leaf compiles to `col LIKE '%<value>%'` — the value is wrapped in `%…%` automatically
  (`buildUdaConfig.js:209`). **Do not** add your own `%`.
- A `like` leaf whose value is empty (empty string / empty array) is **dropped entirely**
  (`buildUdaConfig.js:181-184`). So an empty search box adds **no** constraint — the list shows
  everything until the user types. Each character then re-applies the OR group live.
- `applyPageFilters` swaps the live `search` page-variable value into every leaf with that
  `searchParamKey` at query time, so all the OR leaves get the same typed value.

## Gotchas & caveats

- **The control column must be a real column, not an expression** (its `name` is used as a SQL
  alias). The OR-group leaves on the data sections, by contrast, are filter predicates — list the
  real columns you want searched.
- **Replicate the OR group on every responding section.** There is no "search all sections" switch;
  a section without the OR group simply won't react to `search`.
- **Case-sensitivity:** Postgres `LIKE` is case-*sensitive*. Confirm whether your server maps the
  `like` op to `ILIKE`; if not, the box will feel broken on capitalization. Fix server-side, or
  search `lower(col)` columns.
- **Performance at scale:** `… LIKE '%term%'` across many text columns OR'd together is a
  sequential scan. Fine for tens of thousands of rows (the MNY page). For large tables (millions):
  keep the searchable column list **tight**, add `pg_trgm` GIN indexes on the searched columns,
  rely on facet filters narrowing first, and **debounce** the control. For very large corpora,
  prefer a generated `tsvector` column + GIN index (a data-layer change).
- **Seeding:** like any `fetchMode:'smart'` section, seed `element-data.data` at the default
  (empty-search) state so the page paints on cold load.

## Alternative — client-side text search (small, already-loaded datasets)

The dataWrapper also has a **client-side** local text search: set `localFilter` (a string) on one
or more columns and `useDataLoader.js` filters the already-loaded rows with a case-insensitive
`includes()` over any non-`select`/`multiselect`/`radio` column (`useDataLoader.js:110-142`). This
needs no server round-trip but only searches rows already fetched (so it's for small/paged-in sets)
and **AND**s multiple `localFilter` columns rather than OR-ing them. Prefer the server-side
`like`/OR-group pattern above for a true "search the whole dataset" box.

## Checklist

- [ ] `search` registered in the page `filters` registry.
- [ ] A `Filter` control section with `operation:"like"`, `searchParamKey:"search"`, `hideExternalToggle`.
- [ ] On each responding section: one `OR` group of `like` leaves, one per searchable column, all
      `usePageFilters:true` + `searchParamKey:"search"`.
- [ ] Empty box returns everything; typing narrows across all columns.
- [ ] Case-insensitivity confirmed; column list tight / indexed for large tables.
- [ ] Sections seeded for cold-load paint. Draft-only — humans publish.
