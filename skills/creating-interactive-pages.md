# Creating interactive DMS pages (page variables + dataWrapper filters)

How to make a DMS page **interactive** — a control (a year picker, a region
selector) that drives multiple data sections at once — using **page variables**
and the **dataWrapper filter system**. This is the mechanism behind "change the
year and every card/chart/table updates."

> **Audience:** an engineer or AI wiring a multi-section page where one or more
> controls drive the data. Read [`using-a-datawrapper-card.md`](./using-a-datawrapper-card.md)
> and [`card-layout.md`](./card-layout.md) first (how a single data section is
> built), and [`creating-pages-from-a-design-pattern.md`](./creating-pages-from-a-design-pattern.md)
> (page/section CLI surface, the `element` wrapper, draft-only discipline).
>
> **Worked references (live):**
> - **2173049** (`npmrdsv5+npmrds_sub`) — the original: a `year_record` page
>   variable + `ua_name`/`mpo_name`/`county_name` Filter controls driving KPI
>   cards and a spreadsheet.
> - **2173915** (`map_21_system_performance`) — the single-page MAP-21 report:
>   ONE `year_record` Year selector driving §01 KPI cards (and, as later phases
>   land, §04/§05/§06), while the trend charts deliberately ignore it.

---

## The one idea: a page variable is a URL search param

DMS "page variables" are just **URL search params** held in `PageContext`
(`patterns/page/.../context`). Nothing more exotic. Two roles:

```
┌─────────────────┐  writes ?year_record=2025   ┌──────────────────────────┐
│  Filter section │ ──────────────────────────▶ │  PageContext search params│
│ (a control)     │      (page variable)        └────────────┬─────────────┘
└─────────────────┘                                          │ reads
                                                              ▼
                                          ┌───────────────────────────────────┐
                                          │ every dataWrapper section whose     │
                                          │ filter leaf has usePageFilters:true │
                                          │ + searchParamKey:'year_record'      │
                                          └───────────────────────────────────┘
```

- **Set** by a `Filter` section (the `FilterComponent`) — or any control wired to
  write a search param. The control is bound to a `searchParamKey`.
- **Read** by data sections (`Card`/`Spreadsheet`/`Graph` — all dataWrapper-backed)
  whose filter tree contains a leaf flagged `usePageFilters: true` with a matching
  `searchParamKey`. At query time, `applyPageFilters` (in
  `patterns/page/.../dataWrapper/buildUdaConfig.js`) swaps that leaf's `value` with
  the live page-variable value before building the UDA query.
- **Sync** is handled by `usePageFilterSync.js` (URL ⇄ PageContext ⇄ section state).

So: **one control → N reacting sections**, with no per-section glue beyond the
matching leaf. That's the whole model.

---

## Step 1 — add the control (a Filter section)

A `Filter` section sets a page variable. Its `element-data` is the standard
dataWrapper shape; the **filter leaf** declares which column it controls and which
search param it writes:

```jsonc
{
  "externalSource": { /* the source whose distinct values populate the picker, e.g. Map 21 Extended 2001/3394 */ },
  "columns": [],
  "filters": { "op": "AND", "groups": [
    { "col": "year_record", "op": "filter", "value": ["2025"],
      "isExternal": true, "usePageFilters": true, "searchParamKey": "year_record" }
  ]},
  "display": { "totalLength": 1 },
  "data": [], "join": { "sources": {} }
}
```

- `searchParamKey` is the **page variable name** (`year_record`). Keep it bare —
  this is the key other sections match on and the URL param.
- `value` is the default selection until the user changes it.
- The picker's options come from the source's distinct values for `col`.

(Live: section **2173917** on page 2173915 is exactly this — the Year selector.)

## Step 2 — make sections react (consume the variable)

On each data section that should respond, add a filter leaf for the same column
with `usePageFilters: true` + the same `searchParamKey`:

```jsonc
{ "col": "ds.year_record", "op": "filter", "value": ["2025"],
  "usePageFilters": true, "searchParamKey": "year_record" }
```

- The saved `value` is just the default for when no page variable is set yet.
- Under a **join**, qualify the column (`ds.year_record`) so it's unambiguous, but
  keep `searchParamKey` bare (`year_record`) so the page-filter lookup still
  matches. (See `using-a-datawrapper-card.md` — the join section.)

## Step 3 — make a section IGNORE the variable

Just omit the leaf. A section with no `year_record` leaf never reacts — it shows
whatever its own filters/grouping produce. On the MAP-21 page the **trend charts**
do this: they `GROUP BY year_record` and show all years regardless of the Year
selector.

---

## "vs prior period" — the `includePriorPeriod` enrichment

A single-select control emits one value (`year_record = [2025]`), so a reacting
section normally only sees that year. To compute a **year-over-year delta** from
one control, set `includePriorPeriod: true` on the reacting leaf:

```jsonc
{ "col": "ds.year_record", "op": "filter", "value": ["2025"],
  "usePageFilters": true, "searchParamKey": "year_record",
  "includePriorPeriod": true, "priorPeriodStep": 1 }
```

`applyPriorPeriodExpansion` (a standalone pass after `applyPageFilters` in
`buildUdaConfig.js`) expands the value to `IN(2025, 2024)`, so both years land in
scope. The section then computes the delta with:

- `GROUP BY year_record`, and
- a hidden **`lag(<metric>) over (order by ds.year_record)`** calc column (the
  prior year), and
- a **formula column** `metric − prior` (or `percent(metric − prior, prior)`),
- `pageSize 1` + `ORDER BY ds.year_record DESC` so only the selected year's row
  shows, carrying its prior via the window.

This is the KPI-card recipe (live: sections 2173919–21 on page 2173915, cloned
from the original cards on 2173049). The leaf option + expansion pass are the
*only* code support needed; everything else is author-level config.

> **Note:** `includePriorPeriod` goes on the **reacting** leaf, not on the Filter
> control — the control just emits the selected year; the consumer expands it.

---

## Gotchas (each cost real debugging on 2173049)

1. **Qualify the WHERE column under a join, keep `searchParamKey` bare.** A leaf
   `col` that exists in both joined tables (e.g. `year_record`) is ambiguous —
   set `col: "ds.year_record"`. But `applyPageFilters` matches by
   `searchParamKey`, so leave that `year_record`. (`applyTableAliasToJoin` only
   auto-qualifies leaves it can attribute via `source_id`; an unattributed leaf
   needs the explicit `ds.`.)
2. **`ORDER BY` under a join must qualify too.** The server's `handleOrderBy`
   preserves a `ds.col` alias; a bare `year_record` is ambiguous. (Fixed in
   `dms-server/.../uda/utils.js`.)
3. **Stale cached `data`.** A section renders its cached `data` array before the
   first fetch. After re-wiring a section, clear `data: []` so it re-queries.
4. **Non-component module edits need a full reload.** `buildUdaConfig.js` is not a
   component — Vite HMR won't hot-swap it; hard-refresh after editing.
5. **`comma` formatFn truncates decimals** (`parseInt`). Use `formatFn: ' '` for
   ratios/indices; reserve `comma` for integers.

---

## Putting it together (the MAP-21 page)

| Section | Reacts to `year_record`? | How |
|---|---|---|
| Year selector (Filter) | sets it | `searchParamKey: 'year_record'` |
| §01 KPI cards | yes, + prior | `usePageFilters` + `includePriorPeriod` → value + YoY Δ |
| §02 trend charts | **no** | no `year_record` leaf; GROUP BY year, all years |
| §04 regional matrix | yes | `usePageFilters` (no prior needed) |
| §05 urban tables | yes | `usePageFilters` (+ UZA-target join) |
| §06 download | yes | `usePageFilters` → year-filtered export |

One Year selector, one page variable, the whole report moves — except the trends,
on purpose.

## Source-of-truth files

- `patterns/page/.../dataWrapper/buildUdaConfig.js` — `applyPageFilters`,
  `applyPriorPeriodExpansion`, `applyTableAliasToJoin`.
- `patterns/page/.../dataWrapper/usePageFilterSync.js` — URL ⇄ PageContext sync.
- `patterns/page/.../components/ComponentRegistry/FilterComponent.{jsx,config.js}` — the control.
- `patterns/page/.../components/sections/ComplexFilters.jsx` — the leaf editor
  (the `usePageFilters` / `searchParamKey` / `includePriorPeriod` toggles).
