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
(`patterns/page/.../context`). Nothing more exotic. But there are **three** parts
that must all line up — and the one beginners miss is the first:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 0. PAGE REGISTRY  page.filters: [{ searchKey:'year_record',               │
│    (the whitelist)                values:'2025', useSearchParams:true }]   │
│    Declares which keys are allowed to be page variables. Seeds            │
│    pageState.filters on load (view.jsx: mergeFilters(item.filters,…)).    │
└───────────────┬────────────────────────────────────────────┬─────────────┘
                │ only registered keys round-trip              │ seeds
                ▼                                              ▼
┌─────────────────┐  writes ?year_record=2025   ┌──────────────────────────┐
│ 1. Filter section│ ──────────────────────────▶ │  PageContext.pageState    │
│    (a control)   │      (page variable)        │  .filters  ⇄  URL params  │
│  isExternal:true │                             └────────────┬─────────────┘
│  usePageFilters  │                                          │ usePageFilterSync
└─────────────────┘                                           ▼
                                          ┌───────────────────────────────────┐
                                          │ 2. every dataWrapper section whose  │
                                          │ filter leaf has usePageFilters:true │
                                          │ + searchParamKey:'year_record'      │
                                          └───────────────────────────────────┘
```

Three parts, all required:

0. **Registered** on the **page itself** — `page.filters` is an array of
   `{ searchKey, values, useSearchParams: true }` entries. This is the **whitelist
   of page variables**. On load, `view.jsx` (line ~27) seeds
   `pageState.filters = mergeFilters(item.filters, patternFilters)` from it. **A
   key that isn't registered here can never become a page variable** — see the
   "why nothing happens" box below.
1. **Set** by a `Filter` section (the `FilterComponent`) — or any control wired to
   write a search param. The control's leaf is `isExternal: true` (so it renders)
   with `usePageFilters: true` + a `searchParamKey`.
2. **Read** by data sections (`Card`/`Spreadsheet`/`Graph` — all dataWrapper-backed)
   whose filter tree contains a leaf flagged `usePageFilters: true` with a matching
   `searchParamKey` (no `isExternal` — they consume silently). At query time,
   `applyPageFilters` (in `patterns/page/.../dataWrapper/buildUdaConfig.js`) swaps
   that leaf's `value` with the live page-variable value before building the UDA
   query.

**Sync** is handled by `usePageFilterSync.js` (URL ⇄ PageContext ⇄ section state)
and `view.jsx` / `_utils` (`updatePageStateFilters`,
`updatePageStateFiltersOnSearchParamChange`).

> ### ⚠️ Why "the control and the cards are both set, but nothing happens"
> This is the single most common failure, and it's **always part 0**. Every link
> in the chain is gated on the page registry:
> - `updatePageStateFilters` (view.jsx:~90) builds the URL by **mapping over
>   `pageState.filters` filtered to `useSearchParams` entries** — a key not in the
>   registry is silently dropped, so the control's change never reaches the URL.
> - `updatePageStateFiltersOnSearchParamChange` (`_utils`:~466) reads the URL back
>   **only for registered `useSearchParams` keys** — unregistered URL params are
>   ignored.
> - `usePageFilterSync` bails on its **very first line** if `pageState.filters` is
>   empty: `if (!Object.keys(pageFilters).length) return;`. With no registry,
>   `pageState.filters` is `[]`, so no section is ever updated and no re-fetch fires.
>
> So you can have a perfectly-wired Filter control **and** perfectly-wired card
> leaves and still see zero reaction — because the page never declared the variable.
> **If a page is inert, check `page.filters` first.** (This is exactly what broke
> page 2173915: the cards and the Year selector were both correct; `page.filters`
> was `undefined`.)

So: **one control → N reacting sections**, but only once the variable is
registered on the page. That registration is the load-bearing glue.

---

## Step 0 — register the page variable on the PAGE

Before any control or card matters, the page must declare the variable in its
top-level `filters` array. This is a field on the page row's `data`, **not** on any
section:

```jsonc
// page.data.filters  — the page-variable whitelist
[
  { "id": "map21-year-record", "values": "2025",
    "searchKey": "year_record", "useSearchParams": true }
]
```

- `searchKey` is the page-variable name — it must match the `searchParamKey` on the
  control leaf (Step 1) and every consuming leaf (Step 2).
- `useSearchParams: true` routes it through the URL (shareable, back/forward-able).
  `false` keeps it in memory only (rare; used for `action`-type params).
- `values` is the page default until a control or the URL overrides it.
- Register **one entry per variable**. The original 2173049 registers four
  (`year_record`, `county_name`, `mpo_name`, `ua_name`); the single-page report
  2173915 registers just `year_record` because that's its only interactive control.

Set it via the CLI with a read-modify-write on the page `data` (there's no
dedicated flag; `filters` is a top-level `data` key):

```bash
dms raw get <pageId>            # grab data, add the filters array in your editor/script
dms raw update <pageId> --data "$(cat newdata.json)"   # full data replacement
dms raw get <pageId>            # verify data.filters is present
```

(Live: page **2173915** now registers `year_record`; the working original **2173049**
registers all four.)

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

### Cascading / dependent controls (RenderFilters keys off `state.columns`, not `filters.groups`)

The simple shape above renders, but for **dependent** pickers (a Corridor list narrowed
by County; a Direction list narrowed by Corridor) you must know: **RenderFilters derives
rendering, option-narrowing AND reactivity entirely from `state.columns[].filters`** — leaves
placed only in `filters.groups` are ignored for the option list. So author the control as columns:

```jsonc
{ "externalSource": { /* source */ },
  "columns": [
    // the rendered dropdown — external filter; label = customName
    { "name": "road", "customName": "Corridor", "show": true,
      "optionOrderBy": { "sum(aadt)": "desc" },           // ← order options by an aggregate (busiest first), not A-Z
      "filters": [{ "type": "external", "operation": "filter", "values": ["I-495"],
                    "usePageFilters": true, "searchParamKey": "road" }] },
    // narrowing/scoping columns — INTERNAL filters: they scope the option list + drive reactivity
    // (reload when their value changes) but render NO dropdown. searchParamKey ones sync from page vars.
    { "name": "county",   "show": false, "filters": [{ "type": "internal", "operation": "filter", "values": [], "usePageFilters": true, "searchParamKey": "county" }] },
    { "name": "f_system", "show": false, "filters": [{ "type": "internal", "operation": "filter", "values": ["1","2","3"] }] }
  ],
  "filters": { "op": "AND", "groups": [] },
  "display": { "filterStyle": "chip", "placement": "inline", "autoSelectFirstWhenInvalid": true } }
```

Two **opt-in** knobs added for cascading controls (both default-off → BC-safe):
- **`display.autoSelectFirstWhenInvalid`** — when a parent changes and this control's reloaded
  options no longer contain its selected value (e.g. switch to a N/S road while `direction=WESTBOUND`
  → empty viz), it auto-corrects the page var to the **first valid option** (via `updatePageStateFilters`).
- **`column.optionOrderBy`** (e.g. `{ "sum(aadt)": "desc" }`) — order the option list by an aggregate
  instead of the default alphabetical sort.

Implemented in `…/dataWrapper/components/filters/RenderFilters.jsx` + `filters/utils.js`. Worked
example: the TSMO Corridor View picker (County · Corridor · Direction) —
`scratchpad/npmrdsv5-tsmo2/build_tsmo_corridor_view.mjs` (`filterControl()`).

**Gotcha:** a Filter column's `name` is used as its own SQL **alias**, so a filter column must be a
**real column**, never an expression (`road || direction`, `concat(...)`) → "Syntax error". Split
composite keys into separate real-column controls.

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

## Step 2b — filter on a value the source has NO column for ("option A")

Sometimes the page variable doesn't map to any real column on the bound view. The
reliability page needs a **Region** filter, but view 3394 only has `county_code`
(no region); and a **System** filter over `f_system`. The instinct — add a
`show:false` *calculated* "filter-only" column (`CASE … as region`) and point the
leaf at its alias — **does not work: a `show:false` calc column poisons the UDA
data fetch** (see Gotcha 8). Use **option A instead: put the raw SQL expression
directly in the leaf's `col`, and add NO column to the section.**

```jsonc
// data section leaf — col IS a CASE expression (NOT a column name / alias)
{ "col": "case when \"county_code\" in ('36001','36083',…) then 'Region 1 - Capital District' when … end",
  "op": "filter", "value": [], "usePageFilters": true, "searchParamKey": "region" }
```

`getColumn(leaf.col)` can't resolve an expression to a section column, so
`mapFilterGroupCols` passes the leaf through to the server **verbatim** →
`WHERE (case "county_code" … end) IN ('Region 1 - Capital District')`. An
empty/default `value` is a safe server-side no-op (statewide). Under a join,
qualify the base column inside the CASE (`ds."county_code"`).

The **control** still needs a real column to populate its picker, so bind the
tone-bar Filter to a *real* column on some source whose distinct values are the
same labels the CASE emits, sharing one `searchParamKey`:

- **Region** control → ED source 2039 `region_name` (real `Region N - …` labels);
  data sections filter the county→region CASE (same labels). `searchParamKey: region`.
- **System** control → the real `is_interstate` column (values `"1"`/`"0"`); data
  sections filter `is_interstate` directly. `searchParamKey: system`.

(Live: reliability_v2 / page 2180946. Region + System both work this way, incl.
combined. Region scopes every segment-level section; System scopes only sections
that show ONE system — a section showing BOTH Interstate and Non-Interstate as
separate series must take Region only, or System empties one series.)

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
6. **Two filter representations — edit the right one.** A section's
   page-variable leaves live in the **section-level filter tree**
   (`element-data.filters` = `{op:'AND', groups:[…]}`), which is what
   `ExternalFilters` (the viewer control), `applyPageFilters`, and the query
   builder read. There's a *separate*, older per-column representation
   (`element-data.columns[i].filters[]`) that the edit-mode `RenderFilters` UI
   reads. On the KPI cards these column-attached filters are empty/`null` — the
   year leaf exists **only in the tree**. Consequence: opening the column-filter
   editor can make a correctly-wired section *look* like it has no page filter.
   When verifying `usePageFilters`/`searchParamKey`, inspect
   `element-data.filters.groups`, not the columns. (This is why "the components
   aren't set to use page filters" can be a false alarm — the tree leaf was set
   the whole time.)
7. **The registry default vs the leaf default.** `page.filters[].values` (Step 0)
   is the page-wide default; a consuming leaf's saved `value` is only its
   fallback before any page variable resolves. Once registered, `usePageFilterSync`
   overwrites the leaf `value` from `pageState.filters` on every change — so don't
   rely on the leaf's saved value for the live selection.
8. **⚠ A `show:false` calculated column breaks the UDA *data* fetch.** It's
   tempting to add a filter-only derived column (`{ name: "CASE … as region",
   show: false }`) so a leaf can resolve `col: "region"`. Don't. `getColumnsToFetch`
   drops it from the SELECT, but its mere presence in `state.columns` poisons the
   row request: length/count succeed, then the data fetch throws Falcor
   `null is not allowed in branch key positions` and **every cell renders blank**
   (verified on a joined KPI AND a plain Spreadsheet — removing the column fixes
   it). Filter on a derived value via **option A** (Step 2b) instead — the leaf, no
   column.
9. **⚠ `GROUP BY` a calculated CASE column breaks the fetch the same way.** A
   Spreadsheet grouped by `{ name: "CASE … as bin", group: true }` hangs on
   "loading…" (same null-branch class), while grouping by a *real* column is fine.
   To bucket/bin, use conditional aggregates in a **single-row Card** —
   `round(sum("len") FILTER (WHERE worst < 1.25))…` per bin — no `GROUP BY <case>`.
   (Reliability §03 LOTTR bins do exactly this.)
10. **⚠ The filter control drops falsy option values.** `RenderFilters.jsx`
    (`…/dataWrapper/components/filters/RenderFilters.jsx`) filters its dropdown
    options with `.filter(option => option)`, so a real value of **`0` / `false` /
    `""`** never appears in the picker (e.g. `is_interstate` shows only `1`, never
    `0`). The *filter itself* works (`?system=0` filters correctly) — only the
    dropdown is missing the option. Until the platform guard is loosened to
    `option != null && option !== ""`, prefer a control column whose values are all
    truthy, or set the page-variable from the URL.

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

- `patterns/page/pages/view.jsx` — seeds `pageState.filters` from the page registry
  (`mergeFilters`), defines `updatePageStateFilters` (control → URL, registry-gated).
- `patterns/page/pages/_utils/index.js` — `mergeFilters` (registry + patternFilters),
  `updatePageStateFiltersOnSearchParamChange` (URL → pageState, registry-gated),
  `convertToUrlParams`, `initNavigateUsingSearchParams`.
- `patterns/page/.../dataWrapper/usePageFilterSync.js` — pageState ⇄ section tree
  sync; **bails if `pageState.filters` is empty** (the part-0 gate).
- `patterns/page/.../dataWrapper/buildUdaConfig.js` — `applyPageFilters`,
  `applyPriorPeriodExpansion`, `applyTableAliasToJoin`.
- `patterns/page/.../components/ComponentRegistry/FilterComponent.{jsx,config.js}` — the control.
- `patterns/page/.../components/sections/ComplexFilters.jsx` — the leaf editor
  (the `usePageFilters` / `searchParamKey` / `includePriorPeriod` toggles); edits
  the **section-level filter tree** (`element-data.filters`).
