# Section "active selection" interaction — load-publish a derived value → page state → filter

## Status — load_publish DONE 2026-06-23; useActionParam NOT needed
Addition **1 (the `load_publish` provider)** is implemented in the Spreadsheet
(`spreadsheet/config.jsx` provider registry + `spreadsheet/index.jsx` `useEffect` on `state.data`).
Args support a single `{ column, paramKey }` or a `publishes: [{ column, paramKey }]` array (publish
several params from one derived row), with `{ derivation: 'first'|'max'|'min', metric }`; a `useRef`
de-dupes so it publishes only on a real value change.
Addition **2 (`useActionParam` leaf resolution) turned out unnecessary**: `usePageFilterSync`'s reduce
keys **every** `pageState.filters` entry by `searchKey` — including `type:'action'` entries — so a
normal leaf with `usePageFilters`+`searchParamKey` already resolves from an action param. Subscribers
just use the existing search-param leaf form; no schema change.
**Load-bearing gotcha:** a `useSearchParams:true` registry default with the **same `searchKey`** as a
published action param can win in that reduce and pin the leaf — don't register both; let the
publisher be the sole source (give consuming leaves a saved default for the pre-publish paint).
**Publish gotcha (cost a debug cycle 2026-06-23):** the driver only runs in **view mode** after the
page is **published**. View renders the page's `sections` (published snapshot); edit renders
`draft_sections`. CLI/edit changes land in draft, so the publisher section + the live grid live in
draft until `dms page publish <pageId>` promotes draft→sections. Symptom of forgetting: edit mode
follows the event but view mode shows the last-published grid for every event. After publish the
driver works in view, but note the **pre-publish paint flash**: the grid paints its default-leaf
corridor first (one heavy ClickHouse query), then the corridor table loads → republishes →the grid
re-queries the event's corridor (second heavy query) and flips. The default leaf is protective (an
absent leaf would query *all* tmclinears), so don't just drop it to kill the flash.
First live consumer: TSMO incident_view (Delay-by-corridor → `activeTmcLinear`/`activeDate`/`metaYear`;
grid + delay-by-TMC follow per event). Remaining (optional): expose the provider/leaf in the section
menu UI (today wired programmatically); a `graph_new` equivalent if a graph ever needs to publish.

## Flash gating — `requireResolved` leaf flag (DONE 2026-06-23)
A section that resolves its scope from a published action param paints its **saved default
first**, then re-queries when the param lands — a visible "flash" (wrong corridor) plus a wasted
heavy query. Fix: a filter leaf opts into **`requireResolved: true`** with an **empty saved
value**. New shared helper `hasUnresolvedRequiredLeaf(filters)` in `buildUdaConfig.js` returns true
while any such leaf is still empty; two consumers use it:
- `useDataLoader.js` — holds the section in its **loading** state (`setLoading(true); return`)
  instead of fetching, so it shows the normal spinner (not a stale paint) until the param resolves.
- `buildUdaConfig.js` — OR'd into `skipFetch` as defense-in-depth (an empty `requireResolved` leaf
  must never reach the empty-IN strip → whole-table scan, same trap the custom-bucket guard covers).
Resolution flow unchanged: `usePageFilterSync` writes the published value into the leaf → fetchKey
changes → the section fetches **once** with the resolved scope. Fully opt-in/BC (no existing leaf
sets the flag). Live config: incident_view grid (2182908) gates `activeTmcLinear`+`activeDate`+
`metaYear`; delay-by-TMC (2182902) gates `activeTmcLinear` — all driven by the corridor table's
`load_publish`. Verified view-mode timeline goes loading→correct corridor, never the default 119
(127 event: `0 0 1…1 46081`, never 78913). **Edge:** viewing the page with no `event_id` (driver
never fires) leaves the grid in perpetual loading — acceptable (page is meaningless without an
event); incident-search always links with `event_id`.

## Objective
Let one section **publish a derived value on data load** to a persistent page state var
(an "action param"), and let **other sections FILTER their data** on that value — a reusable
master-detail / "active selection drives the page" pattern. Motivating case (TSMO
incident-view): the **"Delay by corridor"** Spreadsheet (grouped by `tmclinear`, sorted by
delay desc) should, on load, publish its top row's `tmclinear` as **`activeTmcLinear`**, and
every TMC-level section (delay-by-TMC table, the congestion grid graph) should filter to that
`tmclinear`. Today this only works by baking the selection into a seed script.

## Current behavior (verified — file:line)
The action-param substrate already exists; two pieces are missing.
- **Action-param store (exists):** `patterns/page/pages/view.jsx` — `setActionParam(key,value)` /
  `clearActionParam(key)` on `PageContext`; values live in `pageState.filters` as
  `{ searchKey, values:[…], useSearchParams:false, type:'action' }` (persistent, not URL-synced).
- **Providers (exist):** `componentFunctions.providers` in each section's `config.jsx`.
  Triggers today: **`hover`** (ephemeral — clears on mouse-leave) and **`click`** (persistent —
  `spreadsheet/config.jsx` `click_publish`; sets via `setActionParam`, stays until replaced).
  **No `load` trigger.**
- **Subscribers (exist, visual-only):** `trigger:'action_param'` → `row_highlight` /
  `hover_highlight` read `pageState.filters` and *highlight*. **No subscriber that FILTERS data.**
- **Page-filter → UDA sync (exists, search-param only):**
  `dataWrapper/usePageFilterSync.js` walks a section's filter tree and resolves leaves with
  `usePageFilters:true, searchParamKey` from `pageState.filters`. It does **not** read
  `type:'action'` params or any `useActionParam` leaf.

## The two additions (both additive / backward-compatible)
1. **A `load`-trigger publisher.** Add a `load_publish` provider to `spreadsheet/config.jsx`
   (and optionally `graph_new/config.jsx`): args `{ column, derivation: 'first'|'max'|'min' }`.
   In `spreadsheet/index.jsx`, add a `useEffect` on `state.data` that, once rows arrive, derives
   the row (`first` = already-sorted top; `max`/`min` over a metric) and calls
   `setActionParam(provider.paramKey, row[column])`. Publish once per data change; guard races.
   (Delay-by-corridor is already sorted by delay desc → `derivation:'first'`, `column:'tmclinear'`.)
2. **Action-param-aware filter leaves.** Extend the filter-leaf schema with
   `{ useActionParam:true, actionParamKey:'activeTmcLinear' }` and teach
   `usePageFilterSync.js` (the `needsUpdate` + `update` walkers) — and the parallel path in
   `dataWrapper/components/filters/RenderFilters.jsx` — to resolve such leaves from the
   `type:'action'` entries in `pageState.filters` (same shape as the search-param path). A
   section then filters live whenever the published value changes.

## Author-facing result (what the page would then declare)
- Delay-by-corridor section: enable provider `load_publish` { column:`tmclinear`,
  derivation:`first`, paramKey:`activeTmcLinear` }.
- Delay-by-TMC table + grid graph: add a filter leaf
  `{ col:'tmclinear', op:'filter', useActionParam:true, actionParamKey:'activeTmcLinear' }`.
- No seed-baked selection; changing the event (or, later, clicking a different corridor via the
  existing `click_publish`) re-drives every TMC section.

## Files
- `patterns/page/components/sections/components/ComponentRegistry/spreadsheet/config.jsx`
  (+ `graph_new/config.jsx`) — the `load_publish` provider config.
- `…/ComponentRegistry/spreadsheet/index.jsx` (+ graph equivalent) — the load-publish `useEffect`.
- `…/dataWrapper/usePageFilterSync.js` + `…/dataWrapper/components/filters/RenderFilters.jsx` —
  `useActionParam` leaf resolution.
- Docs: `component-actions.md` (note: load/click publishers may feed reload consumers; **hover
  must stay visual-only** — it fires per mouseenter → reload storm).

## Caveats / scope
- **Re-query vs cache:** a subscriber filtering on the action param must be live (`smart`/`force`),
  not `cache`. The incident-view **delay-by-TMC table is live-filterable today**; the **grid
  GraphGraph is cache-seeded** (its TMC×epoch cells need a window→epoch expansion the UDA can't
  express) — so a *live* grid also needs server-side expansion (a view/SRF). Pair with
  `transcom-event-tmc-self-sufficient.md`.
- Keep all new fields opt-in (default off) — `usePageFilters`/`searchParamKey` behavior unchanged.

## Testing checklist
- [ ] `load_publish` fires once on data load, publishes the derived value, persists in
      `pageState.filters` (`type:'action'`).
- [ ] A `useActionParam` filter leaf resolves + triggers a reload when the value changes; empty
      until published (no spurious all-rows fetch).
- [ ] Existing `usePageFilters`/`searchParamKey` + hover/click providers unchanged (BC).
- [ ] Incident-view: delay-by-corridor publishes `activeTmcLinear`; delay-by-TMC filters live.

## Progress log
- 2026-06-21 — Created from the TSMO incident-view grid work. Substrate (action params,
  click/hover providers, page-filter-sync) confirmed present; the two missing pieces (load
  trigger + action-param filter leaves) scoped above. Not started. Cross-ref:
  `planning/transportny/tasks/current/tsmo-incident-view-page-build.md`.
