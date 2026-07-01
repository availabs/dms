# ReportRouteList → Page Templates + native graph sections

## Status: MOSTLY DONE (implemented 2026-06-30, infinite-render bug found+fixed same day) — one cleanup step deferred, live UI verify pending

Code changes (ReportRouteList refactor, `routes`/`draft_routes` attribute, `newItem`/`setItem` fork
removal) are complete. The "Report Page template" deliverable shipped as a **DB-backed page template**
(a `npmrds_sub|page_template` row, built and verified via the DMS CLI against the real dev server) —
**not** a code-based `theme.js`/`themev2.js` `page_templates` entry as originally planned. See
[Implementation log](#implementation-log-2026-06-30) for what changed from the plan and why.

Related tasks: [page-templates.md](./page-templates.md) (the feature we build on),
[comparison-series-query-fanout.md](./comparison-series-query-fanout.md) (the dynamic binding we reuse).
Component README to rewrite: `src/themes/transportny/components/ReportRouteList/README.md`.

---

## Objective

Stop `ReportRouteList` from injecting graph sections into the live page outside the normal
component lifecycle. Replace the bespoke `graph_comps` + `setItem` machinery with the standard
flows: **a report becomes its own page** (created from a generic **Report Page** *page template*),
and **graphs become ordinary page sections** added/edited/reordered through the normal lifecycle.
`ReportRouteList` shrinks to a route editor that **publishes** the report's routes to a page action
param; graphs **bind** to that publication (live) or bake a static snapshot.

This eliminates: the `graph_comps` field, the `setItem` injection effect, the routes→`graph_comps`
sync effect, the `newItem`/`setItem` page-render fork, and the confirmed section-store **leak**.

## Why (background)

`ReportRouteList` (`src/themes/transportny/components/ReportRouteList/ReportRouteList.jsx`) manages a
**report** = a row with `routes` (NPMRDS TMC groups + date ranges) and `graph_comps` (graphs). Routes
are well-behaved (written via the dataWrapper's `updateItem`). Graphs are not: they're stored in the
report row's `graph_comps` and **injected** into the page via `setItem` (a local immer fork added to
`view.jsx` and `edit/index.jsx` only for this component). Problems (all documented in the component
README):

- **Leak (confirmed):** the page stores sections as refs to `npmrds_sub|component` rows; any generic
  section op (e.g. reorder) snapshots the rendered list — including the injected graphs — and
  `updateSections` persists it, materializing the injected graphs into real component rows referenced
  by `draft_sections`. Verified live on page `2180280` (rows `2186882`/`2186883`). Graphs end up
  double-stored and drift.
- **Self-fighting resync:** the `newItem` resync effect is a deliberate no-op, because a working
  resync would drop the injected graphs.
- **Far-reaching fork** of shared page rendering for one component.

## Key discovery — the dynamic binding already exists

DMS already ships a **dynamic Comparison Series binding** (from the comparison-series-query-fanout
task, Piece 3). Mechanism:

- `graph_new/config.jsx` registers a `comparison_series` **subscriber** in `componentFunctions`
  (args: `labelKey`, `valueKey`, `column`), stored on a graph as `display._functions.subscribers`.
- `usePageFilterSync.js` (~line 85) finds the enabled subscriber, reads the named page action param
  (`sub.paramKey`) from `pageState.filters`, and resolves it via `resolveComparisonVariants(sub.args,
  list)` into `state.comparisonSeries.config`.
- `buildUdaConfig.js:1054` uses `comparisonSeries.config` (dynamic) when present, else
  `comparisonSeries.variants` (static) — fanning out one query/series per variant; refetches on each
  publish.

`ReportRouteList` even has the **publish side commented out already** —
`setActionParam('routes', routeFilter)` (lines 492–494). We finish that and delete the injection.

Because graphs become normal sections, **both bindings stay first-class** (user requirement):
- **Dynamic:** graph has a `comparison_series` subscriber on the `report_routes` param → always
  reflects the report's current routes.
- **Static:** graph carries a baked `comparisonSeries.variants` snapshot (from `transformReportRoutes`)
  → frozen against later route edits. `buildUdaConfig` prefers `config`, falls back to `variants`, so
  both coexist with no special-casing.

## Design decisions (locked with user)

- **Graph binding:** dynamic subscriber is the default; static baked variants also supported.
- **Routes storage:** on the **page item** — drop the separate report data row, the report-row load,
  and the `report_id` selector.
- **Template ships:** the `ReportRouteList` panel + **one** starter graph pre-wired to the route
  subscriber.

## Scope

**In:** ReportRouteList refactor; a Report Page theme template in `transportny`; `routes`/`draft_routes`
page attribute + draft/publish promotion; removal of the `newItem`/`setItem` fork; cleanup of leaked
`createdBy:'reports'` rows.
**Out (separate tasks):** migrating any existing production reports (data rows w/ `graph_comps`) into
report pages; broader graph authoring UX.

---

## Target architecture

```
A report  ===  a page (created from the "Report Page" template)
  page.routes / page.draft_routes  ← the report's routes  (was: report-row `routes`)
  page.draft_sections[]            ← ReportRouteList panel + N Graph sections (normal component rows)

ReportRouteList (panel section):
  - reads/writes the page's routes attribute via apiUpdate on the page row (local working copy for UI)
  - publishes transformReportRoutes(routes) → page action param `report_routes` via setActionParam
  - keeps its data-source binding ONLY to fetch the route catalog (addable routes)
  - NO graph management, NO graph_comps, NO setItem

Graph sections (normal page sections, added via normal Add Component flow):
  - DYNAMIC: comparison_series subscriber bound to `report_routes`
      (labelKey:'label', valueKey:'filters') → usePageFilterSync → comparisonSeries.config
  - STATIC: baked comparisonSeries.variants (transformReportRoutes output)
```

`transformReportRoutes(routes)` already emits exactly `[{ label, filters:{op,groups} }]`, which is the
shape `resolveComparisonVariants` consumes with `labelKey:'label'`, `valueKey:'filters'`.

---

## Proposed changes

### 1. `ReportRouteList.jsx` (the bulk) — DONE

**Delete (graph management + injection):**
- `addGraph`, `removeGraph`, `updateGraph`, `reorderGraphs`, `updateGraphRouteAssociation`.
- `loadTemplates` / `graphTemplates` / `selectedGraphTemplateId` and the graph-template `useEffect`.
- The **Graphs** UI block (≈ lines 822–931) and the per-route "Graph Membership" buttons (≈ 770–790).
- The **setItem injection** effect (lines 539–573).
- The **routes→graph_comps sync** effect (lines 489–537).
- Remove `item`, `setItem` from the `PageContext` destructure (line 158).

**Change (routes on the page + publish):**
- Replace `currentReport = state?.data?.[0]` / `currentReport.routes` with the page's routes. Read
  working routes from `item.draft_routes` (edit) / `item.routes` (view) via `PageContext`; keep a
  local working copy for immediate UI feedback.
- Persist each route mutation (add/remove/rename/redate/reorder) with
  `apiUpdate({ data: { id: item.id, [routesKey]: nextRoutes }, config: { format } })` on the page row
  — replacing every `updateItem(updatedRoutes, { name:'routes' }, currentReport)`. Keep the handlers'
  logic (e.g. `route_comp_id` assignment, `roundToFiveMinutes`); only the persistence target changes.
- After routes change, `setActionParam('report_routes', transformReportRoutes(routes))`.
- **Keep `useDataSource`/`useDataWrapper`** in `index.jsx` for the **route catalog** binding only —
  `routeSourceInfo = join?.sources?.table1?.sourceInfo` and `fetchDynamicRoute` still need a
  configured source to list addable routes. `state.data[0]` is no longer "the report".
- Drop the `reportId == -1` "Select a report" empty state (lines ~654) — the page *is* the report;
  render the panel directly.
- Keep `transformReportRoutes` (lines 42–133) unchanged — shared by the dynamic publish and any
  static snapshot.

**Optional (preserve today's static workflow), defer unless needed:** an "Add snapshot graph" action
that creates a **normal** `{pattern}|component` graph row (via the normal add-component/`apiUpdate`
path, referenced from `draft_sections`) with `transformReportRoutes(routes)` baked into
`comparisonSeries.variants`. No `graph_comps`, no `setItem`.

### 2. Report Page theme template — SUPERSEDED, see [Implementation log](#implementation-log-2026-06-30)

Shipped as a DB-backed `npmrds_sub|page_template` row instead of the code-based template described
below. The shape described here (panel + one dynamically-bound graph) is exactly what shipped; only
*where it lives* changed. Left as-is for historical context.

Add a template object (mirror `src/dms/.../ui/pageTemplates.js` shape) and register it under the
`transportny` theme's `page_templates` (`src/themes/transportny/theme.js` and `themev2.js`).
`draft_sections`:
1. **ReportRouteList panel** — `element-type: 'ReportRouteList'`, in a sidebar/side group.
2. **One Graph** — `element-type: 'Graph'`, pre-wired for dynamic binding:
   - Comparison Series master switch ON; a `__series` group column present.
   - `display._functions.subscribers` includes a `comparison_series` entry with
     `paramKey: 'report_routes'`, `args: { labelKey: 'label', valueKey: 'filters' }`.
   - **Capture this `element-data` from a real UI-configured comparison_series graph** to guarantee
     the exact subscriber/state shape — do not hand-author blind.

Group `name` must not be `top`/`content`/`bottom` (reserved — see page-templates.md).

### 3. DMS-core: routes as a page attribute — DONE

- `src/dms/packages/dms/src/patterns/page/page.format.js` — add to `cmsPageFormat.attributes`,
  mirroring `sections`/`draft_sections`:
  ```js
  { key: 'routes',       type: 'json', hidden: true },
  { key: 'draft_routes', type: 'json', hidden: true },
  ```
- `src/dms/packages/dms/src/patterns/page/siteConfig.jsx` — add `routes`/`draft_routes` to the page
  load attribute lists (≈ lines 160 and 184).
- `src/dms/packages/dms/src/patterns/page/pages/edit/editFunctions.jsx` `publish()` (lines 124–159) —
  promote `newItem.routes = cloneDeep(item.draft_routes)`; in the revert/unpublish path (≈ 170–179)
  `newItem.draft_routes = item.routes` (mirrors `draft_sections`/`draft_section_groups`/`draft_dataSources`).
- **Design note / decision point:** draft/publish split vs. single live `routes`. Today routes are
  edited live (immediately persisted, even in view mode). A draft split is consistent with the rest of
  the page but changes UX (route edits gated behind publish). **Recommend** the split for consistency;
  the simpler live-only option preserves current behavior. Confirm during implementation.

### 4. Remove the `newItem`/`setItem` fork (README cleanup #1) — DONE

- `src/dms/packages/dms/src/patterns/page/pages/view.jsx` (≈ lines 31, 175–178) and
  `pages/edit/index.jsx` (≈ line 26): revert `getSectionGroups` reads to canonical `item`; drop
  `setItem` from `PageContext`. Verify no other consumer reads `setItem` (ReportRouteList is the only
  one).

### 5. Cleanup leaked data — DEFERRED (user declined this session, see Open considerations)

Leaked `createdBy:'reports'` graph rows exist on edited report pages (e.g. `2180280`). After injection
is gone, sweep affected pages with the DMS CLI: drop `createdBy:'reports'` entries from
`draft_sections`/`sections` and delete the orphaned `npmrds_sub|component` rows. Inspect with
`dms page show <id>` / `dms raw get <id>`; fix with `dms page update`.

---

## Files requiring changes

| File | Change |
|---|---|
| `src/themes/transportny/components/ReportRouteList/ReportRouteList.jsx` | Delete graph mgmt + setItem/sync effects; routes → page `apiUpdate`; publish `report_routes`; drop report-row/`report_id` model + empty state |
| `src/themes/transportny/components/ReportRouteList/index.jsx` | Prune any graph-only controls; keep data-source flags for route catalog |
| `src/themes/transportny/components/ReportRouteList/README.md` | Rewrite "two flows"/"Open problem" to the new model |
| `src/themes/transportny/theme.js`, `themev2.js` | Register the **Report Page** template under `page_templates` |
| `src/dms/packages/dms/src/patterns/page/page.format.js` | Add `routes` + `draft_routes` attributes |
| `src/dms/packages/dms/src/patterns/page/siteConfig.jsx` | Add routes attrs to load lists (~160, ~184) |
| `src/dms/packages/dms/src/patterns/page/pages/edit/editFunctions.jsx` | Promote `draft_routes`↔`routes` in `publish()`/revert |
| `src/dms/packages/dms/src/patterns/page/pages/view.jsx`, `pages/edit/index.jsx` | Remove `newItem`/`setItem` fork |

**Reused as-is:** `transformReportRoutes`; `resolveComparisonVariants` (`buildUdaConfig.js`);
`usePageFilterSync` comparison-series resolution; `buildUdaConfig` variants/config fan-out; the
page-templates picker / `newPage` flow.

**Conventions:** Fast-Refresh boundaries (theme/config in `.theme.js`/`.config.js`), no Tailwind in
markup (theme keys), UI via `ThemeContext`. Note: ReportRouteList already reads falcor directly
(`getSources`/`getViews`) — out of scope to fix, but don't add more.

---

## Testing checklist

- [x] `npm run lint` on touched files: no new errors vs. the pre-edit baseline (checked file-by-file;
      `ReportRouteList.jsx` went from 12 errors/4 warnings to 7/3 — net improvement, same
      pre-existing `react/prop-types`-everywhere baseline as the rest of the codebase). Repo-wide
      `npm run lint` has ~11k pre-existing problems unrelated to this task.
- [ ] No Fast Refresh full-reload after removing the fork — not exercised live this session (no
      browser click-through; the dev Vite server was running but only used for the dms-server API).
- [x] Create a report: Add Page → **Your Templates → Report Page** → renders with panel + starter
      graph — verified structurally (CLI-created throwaway test page, both sections materialized
      correctly via `dms section create` + `dms page dump --sections`, then deleted). **Not** verified
      via an actual browser render of the picker/page.
- [ ] Dynamic: edit routes (add/rename/re-date) → starter graph redraws one series per route live —
      not exercised live (would need a browser + the route catalog source to have addable rows).
- [x] Page row carries `routes`/`draft_routes`; **no** `graph_comps` anywhere in the new code path.
- [ ] Add a normal Graph via Add Component, wire a `comparison_series` subscriber to `report_routes`
      → it tracks routes too — not exercised live.
- [ ] Static: a graph with baked `comparisonSeries.variants` keeps its series when routes later change
      — not exercised live (engine-level behavior is unchanged/untouched by this task).
- [ ] No leak: reorder/edit sections repeatedly → no new `createdBy:'reports'` component rows — not
      exercised live; structurally true by construction (the injection effect no longer exists in
      `ReportRouteList.jsx`, so there's nothing left to leak).
- [ ] Publish promotes routes + graph sections; published view matches edit — not exercised live;
      `publish()`/`discardChanges()` changes mirror the existing `section_groups`/`dataSources`
      promotion pattern exactly, so this is low-risk but unverified.
- [ ] Clean up leaked rows on `2180280` — **deferred**, user declined this session (see Open
      considerations).

## Open considerations

- Routes draft-split vs single live attribute — **resolved: split implemented** (`routes`/`draft_routes`,
  promoted in `publish()`/`discardChanges()`).
- Starter-graph `element-data` must be captured from a real UI-configured comparison_series graph —
  **done**: captured from the live leaked graph row `2186931` on page `2180280` (real
  `comparisonSeries`/`_functions.subscribers` shape), not hand-authored.
- Existing-reports migration (data rows w/ `graph_comps` → report pages) — still out of scope, separate
  task. Page `2180280` ("Report Demo") is the one known instance; its old `reports_snap_2`-row,
  multi-report-picker model has no equivalent under "report = page," so migrating it means rebuilding
  it as N report pages, not a mechanical conversion.
- **Still pending:** strip the 2 leaked `createdBy:'reports'` AVL Graph rows (`2186931`/`2186932`) out
  of page `2180280`'s `draft_sections`. User declined this cleanup for the current session (auto-mode
  flagged it as a write to a pre-existing shared page); it's safe and mechanical
  (`dms page update 2180280 --data '{"draft_sections":[{"id":"2186174",...},{"id":"2186175",...},{"id":"2186176",...}]}'`
  — i.e. the same 5-ref array minus the 2 leaked refs) whenever someone wants to do it.
- **Doc inaccuracy found in `page-templates.md`:** Phase 3/5 claim `pageTemplate_utils.js` and
  `pageTemplateManagerPane.jsx` are "DONE", but neither file exists. The actual working pieces are
  `PageTemplatePicker.jsx`/`.theme.js` and `settingsPane.jsx`'s `SaveAsTemplateSection`; the
  `buildPageTemplateType`/`buildPageTemplatePayload`/`sanitizeSectionsForTemplate` helpers live in
  `src/dms/packages/dms/src/patterns/utils.js` (not a `pageTemplate_utils.js` sibling file). The
  picker + save-as-template flow work end to end (verified live against `npmrds_sub` in this task);
  the template-manager-pane / dedicated "delete a saved template" UI does not exist yet. Not fixed
  here — flagging so `page-templates.md` doesn't mislead the next session.
- **CLI gotcha found, not yet documented in a skill:** `dms page update --data` writing nested section
  objects into `draft_sections` does **not** run the dms-format section-materialization pipeline the
  real app's `apiUpdate`/`dmsDataEditor` runs — it just stores the raw objects in the page row's JSON,
  and `dms page dump --sections` then 500s trying to dereference them as `{id,ref}` stubs. Section rows
  must be created via `dms section create <page> --data '<single section>'` (one call per section, as
  `creating-pages-from-a-design-pattern.md` already documents) — only that path actually creates
  separate component rows. Worth a one-line addition to that skill's gotcha list.

## Implementation log (2026-06-30)

**What shipped, file by file:**

| File | Change |
|---|---|
| `src/themes/transportny/components/ReportRouteList/ReportRouteList.jsx` | Full rewrite: deleted `addGraph`/`removeGraph`/`updateGraph`/`reorderGraphs`/`updateGraphRouteAssociation`, `loadTemplates`/`graphTemplates`/`selectedGraphTemplateId`, the setItem-injection effect, the routes→`graph_comps` sync effect, the Graphs UI block, the per-route "Graph Membership" buttons, the `reportId == -1` empty state. `routes` now reads `item[isEdit ? 'draft_routes' : 'routes']` via `PageContext`; every mutation persists via a new `persistRoutes()` → `apiUpdate({data:{id:item.id,[routesKey]:nextRoutes}, config:{format}})`; a `useEffect` on `routes` publishes `transformReportRoutes(routes)` to the `report_routes` action param via `setActionParam`. `transformReportRoutes`/`roundToFiveMinutes`/`getSources`/`getViews`/the route-catalog `join` binding/`fetchDynamicRoute` are unchanged. |
| `src/themes/transportny/components/ReportRouteList/README.md` | Rewritten for the new model; old "two flows"/"open problem" sections replaced with a `History` section. |
| `src/themes/CLAUDE.md` | Updated the ReportRouteList bullet to describe the new model instead of the `setItem` injection. |
| `src/dms/packages/dms/src/patterns/page/page.format.js` | Added `routes`/`draft_routes` (`type:'json', hidden:true`) attributes. |
| `src/dms/packages/dms/src/patterns/page/siteConfig.jsx` | Added `'routes'` to the **view**-route `filter.attributes` list only (not the outer page-list route — see deviation below). |
| `src/dms/packages/dms/src/patterns/page/pages/edit/editFunctions.jsx` | `publish()`: `newItem.routes = cloneDeep(item.draft_routes)`. `discardChanges()`: `newItem.draft_routes = item.routes`. |
| `src/dms/packages/dms/src/patterns/page/pages/view.jsx` | Removed the `newItem`/`setNewItem` immer fork; `getSectionGroups` reads `item.section_groups` directly; `PageContext.Provider` no longer exposes `setItem`. |
| `src/dms/packages/dms/src/patterns/page/pages/edit/index.jsx` | Same removal for edit mode (`item.draft_section_groups` directly; dropped the now-dead `console.log({item,newItem})`). |

**Design deviations from the original plan (all locked-in choices, not still-open):**

1. **Report Page template = DB row, not theme code.** The original plan (written in plan mode before
   this session) called for hand-authoring a template object in `theme.js`/`themev2.js`, including the
   starter graph's `element-data` JSON. Mid-implementation the user pointed out templates can be
   authored as data (`{pattern}|page_template` rows, the same mechanism `page-templates.md`'s "Save as
   Page Template" / picker "Your Templates" tab already use) rather than code, and asked for that
   route via the CLI instead. This is **strictly better** for this specific template: it's scoped to
   exactly the one pattern that needs it (`npmrds_sub`), and it let the starter graph's
   `comparisonSeries`/`_functions.subscribers` shape be **captured from real data** (the live leaked
   graph row, id `2186931`) instead of hand-built from reading code — exactly what the original plan
   flagged as the risk to avoid ("do not hand-author blind").
   - **Where it lives:** `app=npmrdsv5, type=npmrds_sub|page_template`, row id **`2187021`**, name
     `"Report Page"`, slug `report_page`. Two `draft_sections`: a `ReportRouteList` panel (element-data
     carries only the route-catalog `join.sources.table1` binding — no `externalSource`/`columns`,
     since `state.data[0]` is dead under the new model) and an `AVL Graph` (real NPMRDS Production V6
     externalSource + TMC-identification join, a `(miles*3600)/travel_time as speed` calc column on
     `yAxis`, `epoch` on `xAxis`, the `__series` comparison-series column on `categorize`, and
     `display._functions.subscribers = [{functionId:'comparison_series', enabled:true,
     paramKey:'report_routes', args:{labelKey:'label', valueKey:'filters'}}]`). `comparisonSeries.variants`
     is `[]` — the dynamic subscriber supplies `config` at runtime, so no baked routes ship with the
     template.
   - **Verified how:** built the payload from the captured graph (stripped the route-specific
     `comparisonSeries.variants`/`route_comp_ids` and the disabled/`paramKey:'routes'` subscriber,
     flipped it to `enabled:true, paramKey:'report_routes'`), created the `page_template` row via
     `dms raw create`, then proved it materializes correctly by creating a **throwaway** test page
     (`npmrds_sub`, id `2187039`, deleted after) and attaching both sections via `dms section create`
     (NOT `dms page update --data` — see the CLI gotcha above). `dms page dump --sections` on the test
     page came back clean (both sections resolved, right `element-type`s, right element-data keys).
     Test page deleted afterward; no live UI click-through was done (CLI-only, per the user's direction).
2. **No `page_templates` code changes in `theme.js`/`themev2.js`.** Follows directly from #1 — there is
   nothing to register in code. `defaultPageTemplates` (the 8 generic theme templates) is untouched.
3. **`routes` added only to the view-mode `filter.attributes` list, not the outer page-list route.**
   The plan's file table said "≈ lines 160 and 184" for both. The outer route (`action:'list'`) feeds
   `dataItems` — the cross-page nav list — which `ReportRouteList` never reads (it only reads its own
   page's `item`). Adding `routes` there would fetch every report page's full route array on every
   page-load's nav query, for no consumer. Skipped as unnecessary overhead.
4. **Template sections ship with no `size` override (full-width, stacked).** `theme.js`'s
   `sectionArray.sizes` uses fractional keys (`'1/3'`,`'2/3'`,…) while `themev2.js` `_replace`s that
   with a 12-col numeric scheme (`'4'`,`'8'`,…) — a single template can't pick a size value that's
   valid in both. Rather than ship two template variants, the panel and the graph both render
   full-width, stacked. An author can resize either section after creation (every section has size
   controls already).
5. **`ComponentRegistry` element-type confirmed as `"AVL Graph"`, not `"Graph"`.** The legacy `graph`
   component (element-type `Graph`) has no `comparisonSeries`/`componentFunctions` support; only
   `graph_new` (registered as `"AVL Graph"`) does. Matches `authoring-graphs.md`'s note that new work
   targets `avlGraph`.

**Not done (deferred, see Open considerations above):** the page-2180280 leak cleanup, fixing the
`page-templates.md` Phase 3/5 doc inaccuracy, documenting the `page update`-vs-`section create` CLI
gotcha in a skill, and any live browser click-through verification (a dev Vite server + the real
dev2/npmrds_sub DB were both available this session, so this is doable in a follow-up without new
setup — just open `/edit/report_demo`-style and add a page from the picker's "Your Templates" tab).

### Bug found post-implementation: infinite re-render in the routes-publish effect

The user hit an infinite re-render after this landed. Root cause, in
`ReportRouteList.jsx`'s new "publish routes to `report_routes`" effect (added per the plan's "finish
the commented-out `setActionParam` call"):

1. `const routes = item?.[routesKey] || []` built a **brand-new array literal every render** whenever
   the page had no routes set yet (`item[routesKey]` is `null`/`undefined` — the common case for a
   freshly created Report Page, and also true of the pre-existing `2180280` demo page, which we'd
   confirmed earlier has `routes: null, draft_routes: null`).
2. The publish `useEffect` depended on `[routes, setActionParam]`. A new `routes` reference every
   render meant the effect fired every render.
3. The effect called `setActionParam` **unconditionally** — `setActionParam` always writes
   `pageState` via immer (an immer `produce` write is a "change" regardless of whether the assigned
   value is deeply equal to what's already there), which re-renders the page, which re-renders
   `ReportRouteList`, which rebuilds a new `[]` for `routes`, which re-fires the effect → infinite
   loop, immediately on mount for any page with no routes.

**Fix, round 1 (insufficient on its own):**
- `const EMPTY_ROUTES = []` at module scope; `routes = item?.[routesKey] || EMPTY_ROUTES` — stable
  reference when there's no data.
- Added an `isEqual`-guarded read of the currently-published value before calling `setActionParam`
  — but the guard read `pageState.filters.find(...)?.values?.[0]` (the single-scalar convention most
  providers use: "wrap the value in an array, read back index 0").

**This did not fix it** — the user reported the loop persisted on *both* `page_10` (the new
templatized page) and `report_demo` (the pre-existing one), which pointed at something in
`ReportRouteList.jsx` common to every instance (the component is shared code, not page-specific),
not at either page's individual data.

**Real root cause (round 2):** `setActionParam`'s helper (`view.jsx`/`edit/index.jsx`) does
`arrayValue = Array.isArray(value) ? value : [value]`. Our published value (`next`, the variants
list) **is already an array**, so `Array.isArray` is true and `arrayValue = value` — `values` ends up
being the variants list *directly*, not a 1-element array wrapping it. This matches how the
consumer reads it (`usePageFilterSync.js`: `pageFilters[sub.paramKey]` = `curr.values` directly, no
`[0]`) — so the wire format was always correct. The bug was **only in my own guard**: reading
`.values?.[0]` returned the *first variant object* instead of the whole list, so `isEqual(current,
next)` was comparing a single `{label,filters}` object against a full array — almost never equal —
so the guard never actually stopped a write, and the loop continued exactly as before round 1.

**Fix, round 2:** changed the guard to read `.values` (no `[0]`), matching the actual wire shape.
Re-derived the settle sequence: render 1 → `current` is `undefined` (nothing published yet), `next`
is `[]` or the real variants list → not equal → write. Render 2 (triggered by that write) → `current`
now equals what was just written, `next` is freshly recomputed from the same `routes` → deep-equal →
guard bails. Two-render settle for both the empty-routes case (`page_10`, `report_demo` — both have
`routes: null`/no routes yet under the new model) and the populated case.

**Verified live (2026-07-01)** — round 1's fix was hand-traced only and turned out insufficient (the
user caught it); round 2 was checked with Playwright against the running dev server
(`http://npmrds.localhost:5173`, `dms-mercury-3` DB) instead of trusting another hand-trace:
- `/edit/report_demo` and `/edit/page_10` both load, render the panel (+ `report_demo`'s pre-existing
  graphs, `page_10`'s starter graph), and settle — no console `Maximum update depth exceeded`, no
  request storm (checked request counts over two 3s windows post-load, both flat/zero after initial
  load), `page_10` has zero console errors at all.
- Screenshots confirm both pages actually paint content (not stuck on a spinner) — `report_demo`'s
  panel correctly shows "No routes added." (matches its `routes: null` under the new model), `page_10`
  shows the panel + the AVL Graph frame with its real NPMRDS/TMC-identification attribution.
- Lesson for next time: when a fix touches a `useEffect`/state-write feedback loop, verify with an
  actual render (Playwright + a request/error count over a time window, or React DevTools profiler) —
  hand-tracing the dependency/guard logic missed the `values` vs `values?.[0]` mismatch on the first
  pass because it looks correct in isolation; only tracing the *actual* `setActionParam` write shape
  against the *actual* read shape caught it.

### Follow-up: rebuilding the pre-refactor graph templates (2026-07-01)

The user's pre-refactor "line graph"/"grid graph" component templates were built for the old
static-variant model and stopped working under the dynamic `comparison_series` subscriber model. The
user had already rebuilt one (`tmc_speed_line_graph`, id `2187296`, app `npmrdsv5`, type
`npmrds_sub|avl_graph_template`) by hand in the live UI. Two more were built this session via
`dms raw create`, cloned from `tmc_speed_line_graph`'s `stateJson` with only the metric/graphType
swapped (same dynamic subscriber: `paramKey: 'report_routes'`, `comparisonSeries.variants: []`):

- **`tmc_travel_time_line_graph`** (id `2187310`) — LineGraph, yAxis = raw `travel_time_all_vehicles`
  column (avg) instead of the calculated speed expression.
- **`tmc_speed_grid_graph`** (id `2187311`) — GridGraph, same speed calc
  (`(miles*3600)/travel_time_all_vehicles`) as the line graph but targeting `color` instead of
  `yAxis` (matches the `GridGraph` shape already on `report_demo`'s existing grid section, id
  `2186932`), `xAxis.sort: 'asc'`. Per the user, `GridGraph` can't usefully display multiple
  comparison-series routes at once (a chart-type limitation, not something the template controls).

**Bug found while locating the existing template row:** `dms raw list` returns `{items:[],total:0}`
against this per-app-Postgres site for types with confirmed rows (`npmrds_sub|page`,
`|component`, `|avl_graph_template` all reproduce it) — `raw get`/`raw create`/`page list` are
unaffected. Documented in `packages/dms/cli/docs/TYPES.md` ("Raw Access" section) with a workaround;
root cause not fully isolated. The component-template type format
(`{pattern}|{componentType}_template`) and `data` shape were undocumented before this session — also
added to `TYPES.md` ("Component Templates" section) so a future session doesn't have to re-derive it
from `template_utils.js`/`TemplateManager.jsx`.

**Still open:** item 2 from the user's request — giving each graph section on a report page its own
set of routes (currently every graph on a page shares the single `report_routes` page action param
published by `ReportRouteList`). Design scoped 2026-07-01, not yet implemented — see
[Per-graph routes (design)](#per-graph-routes-design-2026-07-01) below.

## Per-graph routes (design, 2026-07-01)

**Status: DONE — user-confirmed 2026-07-01.** Scoped, implemented, then a real bug was found
post-implementation (empty graphs, missing UI on a new page) and fixed same session — see
[Implementation log](#implementation-log-2026-07-01-per-graph-routes) for what shipped, and
[Bug found post-implementation: `isEdit` means the wrong thing](#bug-found-post-implementation-2026-07-01-isedit-means-the-wrong-thing)
for the root cause and fix. User verified a simple case live in edit mode and confirmed it resolved.
Remaining gaps (two-graph-on-one-page click-through, publish-cycle behavior, the section-id-churn
question) are documented in the testing checklist and bug section below as open/deferred, not blocking.

### Objective

Today every graph on a report page that binds a `comparison_series` subscriber to `report_routes`
sees the *same* route list. The user wants to bring back the pre-refactor UX — a plain list of
routes where each route can be added to a graph individually, one at a time — **without**
reintroducing the old `graph_comps`/`setItem` model (which corrupted data; see
[History](#history-what-this-replaced)) and **without** any manual key-typing/copying step for the
author building the report.

**Hard constraints from the user:**
- No visible "groups" concept. The routes list stays exactly what it is today — a plain list. Any
  grouping/membership bookkeeping is an invisible implementation detail.
- Fully hands-off: an author adds a graph (from the template), then assigns routes to it by
  **clicking** the route in `ReportRouteList`. No typed/copied param keys, ever.
- `ReportRouteList` may be as heavy as needed to make this work — the complexity should live there,
  not spread across graph configuration.
- No backward compatibility required. Nothing on `fan_out` is deployed/in use; existing
  `report_routes`-bound graphs (`report_demo`, the shipped Report Page template's starter graph, the
  three `avl_graph_template` rows) can simply be migrated to the new mechanism in place. Intermediate
  rough states are fine as long as the branch isn't merged/deployed mid-way.

### Why not the two simpler options

- **Named route-groups the author manages** (my first pass): rejected — surfaces a "group" concept
  the user explicitly doesn't want visible.
- **`ReportRouteList` writes directly into each graph's own component row** to set its `paramKey`
  (auto-wiring via cross-section `apiUpdate`): investigated and rejected. Two independent research
  passes confirmed (a) there is **zero precedent** anywhere in the codebase for one section writing
  another section's row from outside its own render instance — every existing flow (reorder,
  duplicate, template materialization) only ever mutates the *page's* `draft_sections` stub array,
  never a sibling's content; and (b) **this codebase already tried the equivalent of this once** —
  the old `graph_comps`/`setItem` mechanism this whole task replaced was exactly "one component
  reaches into the page's component/section wiring," and it caused the confirmed leak/corruption bug
  in [Why (background)](#why-background). Rebuilding a cross-section write path to solve this would
  be reintroducing the same class of risk this task exists to remove. `ReportRouteList` may freely
  **read** sibling sections (see below) — only writing into a sibling's own row is off the table.

### The mechanism: a self-resolving param key

Instead of a param key some author has to type/copy, each graph resolves **its own** key from **its
own** section id, at read time. `ReportRouteList` never touches a graph's row; it only *reads*
sibling sections (free — see Piece 3) and publishes into whichever keys the graphs have
self-derived.

**Piece 1 — thread `sectionId` into `dataWrapper`'s `ComponentContext` (currently absent).**
Confirmed by direct code read: `dataWrapper`-based components (`graph_new`, `ReportRouteList`, Card,
Spreadsheet, …) have **no access to their own row id today** — `dataWrapper/index.jsx`'s `Edit`
provider hardcodes `sectionId: undefined` (~line 413) and `View`'s provider omits the key entirely
(~line 661), because neither `Edit`'s nor `View`'s function signature receives an `id`/`sectionId`
prop in the first place (~lines 196, 440). This is *not* a local bug to patch in one file — the id
never reaches `dataWrapper` from anywhere upstream. `richtext` (a non-`dataWrapper` component)
already reads a populated `sectionId` via the same `ComponentContext` (`richtext/index.jsx:27`,
`const { state, setState, sectionId } = useContext(ComponentContext)`), so the *pattern* to mirror
already exists — `dataWrapper` just never got wired into it. Three files, in order:

1. **`patterns/page/components/sections/section.jsx`** (~lines 281–290, ~379–393) — add
   `id={value?.id}` to both the `<Component.EditComp>` and `<Component.ViewComp>` invocations
   (currently plain prop pass-through JSX, no context/registry indirection at this layer).
2. **`patterns/page/components/sections/components/index.jsx`** — the actual `useDataWrapper`
   dispatcher (`EditComp`/`ViewComp`, ~lines 126–146 and ~161–211): destructure the new prop and
   forward it into `<DataWrapper.EditComp>`/`<DataWrapper.ViewComp>`. Verify during implementation
   whether the non-data branch's own `ComponentContext.Provider` (~line 109) already gets a working
   `sectionId` some other way (richtext works today, but the exact wiring for the non-`dataWrapper`
   path wasn't nailed down with full certainty) — if not, add it there too for consistency, using
   `value?.id`.
3. **`patterns/page/components/sections/components/dataWrapper/index.jsx`** — destructure
   `id`/`sectionId` in `Edit` (~line 196) and `View` (~line 440); replace the `undefined` stub
   (~line 413) and add the missing key (~line 661) in both `ComponentContext.Provider` values.

This is the one genuinely new engine-level (submodule) change. It's small and generic — closing a
real gap (no `dataWrapper` component can address itself today) — not a one-off hack for this
feature. Per the user's ask, hold it to a high bar: match the existing `richtext` convention exactly
rather than inventing a parallel mechanism.

**Piece 2 — a `"$self"` sentinel in the `comparison_series` subscriber resolver.**
In `usePageFilterSync.js`'s existing subscriber-resolution effect (the one that reads
`sub.paramKey` out of `pageState.filters`), add: if `sub.paramKey === "$self"`, resolve the
*effective* lookup key to a value derived from the section's own `sectionId` (now available via
Piece 1) instead of using the literal string. Export a tiny pure helper next to
`resolveComparisonVariants` in `buildUdaConfig.js` (e.g. `selfParamKey(sectionId)` →
`` `__self__${sectionId}` `` or similar) so both `usePageFilterSync` (resolving) and
`ReportRouteList` (publishing, see Piece 3) compute the identical key from the same id — no
coordination needed since it's a pure function, not negotiated state. Literal hand-typed param keys
keep working unchanged; `"$self"` is additive, not a replacement of the general mechanism.

**Piece 3 — graph templates ship with `paramKey: "$self"`.**
Update the shipped Report Page template's starter graph and the three `avl_graph_template` rows
(`tmc_speed_line_graph`, `tmc_travel_time_line_graph`, `tmc_speed_grid_graph`) to use `"$self"`
instead of the literal `"report_routes"`. The moment an author adds one of these to a report page
(normal Add Component / template flow), that graph is uniquely, automatically addressable — nothing
to configure, ever. (No migration path needed for existing rows using the old literal key — nothing
is deployed.)

**Piece 4 — `ReportRouteList`: read-only sibling discovery.**
Confirmed free (no cross-section-write risk): `item.draft_sections`/`item.sections` arrive via
`PageContext` already dereferenced into real row data (per `page.format.js`'s `dms-format`
resolution), so `ReportRouteList` can enumerate sibling sections and read each one's
`element['element-type']` + `display._functions.subscribers` without new writes. What's genuinely
new: `ReportRouteList` doesn't currently *do* this at all (nothing today reads sibling section
content from within a section instance) — build a small loader/effect for it. Filter to siblings
with an **enabled `comparison_series` subscriber** (regardless of literal component type — stays
generic, not hardcoded to `"AVL Graph"`). For each match, compute its `selfParamKey(sectionId)` (same
shared helper as Piece 2) — that's the key `ReportRouteList` will publish into for that graph.
Label each discovered graph for display only — v1 uses an ordinal label ("Graph 1", "Graph 2", by
position in `draft_sections`); an explicit author-settable title field is a deferred nice-to-have
(see below), not required for v1.

**Piece 5 — `ReportRouteList`: per-route "add to graph" UI + generalized publish.**
- Each route gains one new **hidden** field, `graphIds: string[]` (section ids from Piece 4) — never
  rendered as an abstract group; the UI is "this route is on Graph 1 / Graph 2," toggled by clicking,
  mirroring the pre-refactor one-at-a-time add-to-graph motion. No route defaults to any graph — a
  route feeds nothing until explicitly clicked onto a discovered graph (matches "old page, add one at
  a time," no implicit sharing).
- Per-route control: a small chip/toggle list (one chip per discovered graph) in the route row,
  replacing the deleted "Graph Membership" buttons' slot.
- The existing single `setActionParam('report_routes', ...)` effect (`ReportRouteList.jsx:384-396`)
  generalizes to a loop: for each discovered graph, `setActionParam(selfParamKey(sectionId),
  transformReportRoutes(routes.filter(r => r.graphIds?.includes(sectionId))))`. Keep the existing
  `isEqual` guard per key (same infinite-loop hazard as today, just repeated per key instead of once).
- **Orphan cleanup (v1 scope, per user):** when a graph section is removed from the page, strip its
  id from every route's `graphIds` and `clearActionParam` its stale key. **Deferred (v2):** letting a
  "dangling" `graphIds` entry survive a graph's removal so that *re-adding* a graph resolves its old
  associations correctly — not built now; v1 always cleans up on removal.

### Explicitly deferred (not v1)

- **Author-settable graph title** (shown in the per-route picker instead of "Graph N"). Low priority
  per user — defer.
- **Re-add reattachment** of dangling `graphIds` after a graph is removed and a new one added — see
  Piece 5. Depends on the title-field work (or some other stable identity) to make "this is the same
  graph" legible to an author; deferred alongside it.

### Files requiring changes

| File | Change |
|---|---|
| `src/dms/packages/dms/src/patterns/page/components/sections/section.jsx` | Pass `id={value?.id}` into `Component.EditComp`/`ViewComp` |
| `src/dms/packages/dms/src/patterns/page/components/sections/components/index.jsx` | Forward the new id prop into `DataWrapper.EditComp`/`ViewComp` (and non-data path if needed) |
| `.../components/dataWrapper/index.jsx` | Destructure `id`/`sectionId`; populate `ComponentContext.Provider`'s `sectionId` in both `Edit` and `View` |
| `.../components/dataWrapper/usePageFilterSync.js` | `"$self"` sentinel resolution using `sectionId` from context |
| `.../components/dataWrapper/buildUdaConfig.js` | Export `selfParamKey(sectionId)` helper near `resolveComparisonVariants` |
| `src/themes/transportny/components/ReportRouteList/ReportRouteList.jsx` | Sibling discovery loader; per-route `graphIds` + toggle UI; generalized per-graph publish loop; orphan cleanup on sibling removal |
| Graph template rows (`npmrdsv5` app, `avl_graph_template`/`page_template` types) | `paramKey: "report_routes"` → `"$self"` on the starter graph + the three `avl_graph_template` rows |

### Testing checklist

First pass (below, struck through) was done in **view mode only, no dev-login credentials** — it
passed but gave false confidence: the real bug (see the bug section below) only manifests in **edit**
mode, which is the mode a report author actually uses. Re-verified with real credentials after the
fix; results follow.

- [x] `sectionId` reaches `dataWrapper`'s `ComponentContext` in both View and **Edit** — confirmed live
      with real credentials on `/edit/page_10`: the graph's `usePageFilterSync` resolved `sectionId`
      to the section's real *draft* row id (`2187386`), matching `draft_sections`.
- [x] A graph with `paramKey: "$self"` resolves to a stable key derived from its own section id —
      confirmed in both view and edit mode.
- [x] `ReportRouteList` discovers a self-bound graph and shows its "On: Graph N" chip on a
      **brand-new, never-published page** (`page_11`, created fresh from the Report Page template,
      `sections: []`) — this was the exact failure the user reported (no button at all); confirmed
      fixed live in edit mode.
- [x] Clicking a route onto a graph makes that graph render real series data — confirmed live on
      `/edit/page_10`: added a route with a real date range, clicked "Graph 1," the graph rendered an
      actual line (screenshot captured). This was the other failure the user reported (graphs render
      but show no lines); confirmed fixed.
- [ ] Two graphs on one page resolve to two different keys, and toggling a route onto Graph 1 only
      (not Graph 2) updates only Graph 1's chart — **still not exercised live**. `page_10` currently
      has one self-bound graph per lifecycle state (draft `2187386`, published varies by publish
      cycle — see the id-churn note below); a genuine two-graph page wasn't click-tested this session.
      Logic is symmetric per-graph (a `.forEach` over `graphs`), so believed correct but unverified.
- [ ] Removing a graph section clears its id from every route's `graphIds` and clears its stale action
      param — implemented, **not live-verified** (would need deleting a section mid-session).
- [x] No infinite render loop in the generalized per-key publish effect — live-verified in both view
      and edit mode, multiple toggle cycles, zero console errors, flat request counts.
- [x] Regression check: `report_demo` still loads cleanly (pre-existing unrelated console warnings
      only, no new ones).
- [x] `npm run build` succeeds.
- [ ] Publish → the graph's *published* copy also resolves and renders correctly. Not exercised this
      session (would need clicking Publish on a page with an active graph assignment and re-checking
      the published view — the id-churn behavior below means this needs its own dedicated check, not
      an assumption from the draft-side result).

### Implementation log (2026-07-01, per-graph routes)

**Shipped exactly per the design above**, five pieces, all in `src/dms` (submodule) except the last:

1. `sectionId` threaded `section.jsx` → `components/index.jsx` (both the `useDataWrapper` and
   non-data dispatch branches, plus the non-data `ComponentContext.Provider`s at lines ~83/~110 which
   also lacked it) → `dataWrapper/index.jsx`'s `Edit`/`View` providers. `usePageFilterSync` calls in
   both modes updated to pass it through.
2. `SELF_PARAM_KEY_SENTINEL` (`'$self'`) + `selfParamKey(sectionId)` (→ `` `__self__${sectionId}` ``)
   added to `buildUdaConfig.js` next to `resolveComparisonVariants`; `usePageFilterSync`'s subscriber
   effect resolves the sentinel via `sectionId` before doing its `pageFilters` lookup.
3. Four DB rows migrated from literal `paramKey: "report_routes"` to `"$self"` via the DMS CLI
   (`dms raw get`/`dms raw update`, scripted with small Node patch helpers — direct `--data` string
   edits weren't practical given the deeply-nested JSON-in-JSON-string shape): the Report Page
   template's starter graph (id `2187021`), and the three `avl_graph_template` rows
   (`tmc_speed_line_graph` 2187296, `tmc_travel_time_line_graph` 2187310, `tmc_speed_grid_graph`
   2187311). Also migrated `page_10`'s two **draft** AVL Graph rows (`2187163`, `2187312`) and its
   one **published** AVL Graph row (`2187292`, see deviation below) since the user confirmed no
   backward compatibility is needed on this unreleased branch.
4. `findSelfBoundGraphs(sectionList)` added to `ReportRouteList.jsx`: maps `item.draft_sections`/
   `item.sections` (confirmed live to arrive **already fully resolved** — each entry has `id`,
   `element['element-type']`, `element['element-data']` as a JSON string — not `{id,ref}` stubs;
   see deviation below), filters to an enabled `comparison_series` subscriber with
   `paramKey === '$self'`, and labels matches ordinally ("Graph 1", "Graph 2", ...) among matches only.
5. Hidden `route.graphIds` field + `toggleRouteGraph(index, sectionId)` handler; the single
   `setActionParam('report_routes', ...)` effect generalized to a `.forEach` over discovered graphs
   (each publishing to its own `selfParamKey`), plus a stale-`__self__*`-key cleanup pass; a second
   effect strips dangling `graphIds` entries when a section id disappears from `sectionList` entirely
   (guarded on `sectionList.length` to avoid a false-positive wipe during an empty/loading transient).
   UI: a small chip row ("On: Graph 1 Graph 2 ...") in each route's expanded block, reusing/replacing
   the theme's orphaned `graphAssociationContainer`/`routesInGraph`/`routeInGraph` keys (dead since
   the original `graph_comps` UI deletion) with `graphChipsWrapper`/`graphChip`/`graphChipActive`.

**Design deviations found during implementation:**

1. **`item.sections`/`item.draft_sections` are already fully resolved on the client — confirmed, not
   assumed.** The design doc flagged this as needing verification; direct inspection (temporary debug
   `console.log` against the live dev server, then removed) confirmed each entry already carries
   `element['element-data']` as a parseable JSON string, so `findSelfBoundGraphs` needed no new
   `apiLoad`/fetch — it's synchronous filtering over data already in `PageContext`. This matches (and
   confirms) the design's Piece 4 assumption.
2. **Draft and published sections are genuinely different row sets, materialized separately — this
   surprised the live-verify pass.** `page_10`'s `draft_sections` (edited via the CLI earlier in this
   task) point at rows `2187163`/`2187289`/`2187291`/`2187312`; its **published** `sections` point at
   a *different*, separately-materialized set (`2187292`/`2187293`/`2187294`) created whenever the
   page was published. Migrating the draft AVL Graph rows to `$self` did **not** touch the published
   graph — it had to be patched separately. This is presumably intentional/standard DMS draft-publish
   behavior (mirrors `draft_sections`↔`sections` promotion elsewhere), not a bug, but it means
   **anyone migrating existing report pages off the literal `report_routes` key needs to patch both
   the draft and published copies of each graph section**, not just one.
3. **View-mode-only live verification.** No dev-login credentials were available this session, so the
   click-to-toggle flow was verified against `page_10` in **view mode** (routes are editable in view
   mode too — this is documented existing behavior, not new). Edit mode runs through the identical
   `sectionId`-in-context and publish-loop code, so this is low-risk, but not independently confirmed.
4. **Only a single self-bound graph was live-tested** (`page_10`'s published section has one AVL
   Graph). The two-graph draft case exists in the DB (`2187163`/`2187312` both `$self`) but wasn't
   click-tested live — see the testing checklist above.

**Verified live (2026-07-01, Playwright against the running dev server,
`http://npmrds.localhost:5173`):** `page_10` loads cleanly with the "On: Graph 1" chip visible on an
expanded route; clicking it toggles the route's membership, persists across a reload (confirmed via
the chip's active/inactive class), and produces zero console errors and no request-count growth in
3-second settle windows before/after each click (the exact failure mode the single-key version hit
once already, see the earlier infinite-render bug section). `report_demo` (unrelated older page,
same modified rendering code paths) still loads cleanly — zero new console errors. Full production
build (`npm run build`) succeeds.

**Not done / deferred, consistent with the design doc:** author-settable graph titles (still ordinal
"Graph N" labels), re-add reattachment of dangling `graphIds`, two-graph-on-one-page click
verification, and confirming a graph's *published* copy behaves correctly across a Publish cycle.

### Bug found post-implementation (2026-07-01): `isEdit` means the wrong thing

The user tried to verify the feature and reported it didn't work: (1) a brand-new page created from
the Report Page template (`page_11`) showed no "On: Graph N" chips at all, and (2) an existing page
(`page_10`) showed the chips and they visually toggled, but the graphs never rendered any lines —
confirmed via the Network tab, the UDA request had `filterGroups: {op:'AND', groups:[]}` and no
`seriesVariants` at all, i.e. the comparison-series fan-out never engaged. The "view mode only, no
credentials" verification pass above had missed this entirely because view mode happened to route
around the bug by coincidence (see root cause).

**Root cause.** `ReportRouteList.jsx`'s own `isEdit` prop (`props.isEdit`, used for
`routesKey`/`sectionsKey`) does **not** mean "is the page currently on the `/edit/...` route." It's
`dataWrapper`'s per-*component-instance* flag for "is this specific section's own settings editor
open right now" (`Boolean(onChange)` in `dataWrapper/index.jsx`'s `Edit`, hardcoded `false` in
`View`). `sectionArray.jsx` only renders a section through the `Edit` path when the author has
specifically clicked into *that section's* settings (`edit.index === i`) — every other section on the
page, **even while the whole page is open on `/edit/...`**, renders through `SectionView`
(confirmed by reading `sectionArray.jsx:311-325`). `ReportRouteList` is essentially never the
actively-edited section during normal interactive use (an author clicks routes/chips in its own
panel, never opens its settings editor to do that) — so `props.isEdit` was `false` in practice
100% of the time, in **both** view mode and edit mode.

Meanwhile, a section's own **identity** (`sectionId`, used by `selfParamKey`) does correctly track
the *page-level* edit state: `SectionView`'s `value` prop comes from `sectionSource`
(`sectionGroup.jsx:33`, `edit ? item.draft_sections : item.sections`) where `edit` is the page-level
flag — so on `/edit/page_10`, the graph (rendered via `SectionView`, but sourced from
`draft_sections`) gets a *draft* section id, while `ReportRouteList` (also `SectionView`, but its own
`sectionsKey` computed from the always-`false` `props.isEdit`) was discovering siblings from
`sections` (*published*) and publishing to a key derived from a **published** id. The graph resolves
its `$self` key from its **draft** id. Two different ids → two different `__self__*` keys → the
publish never reaches the key the graph is actually listening on → empty graph. On a brand-new,
unpublished page (`page_11`), `item.sections` is simply `[]` (nothing published yet), so
`ReportRouteList` discovered zero graphs at all → no chips.

**Why the earlier view-mode-only verification pass missed it:** in plain view mode (no `/edit/`),
page-level `edit` is `false`, so the graph's `SectionView` sources from `sections` too — coincidentally
landing on the *same* array `ReportRouteList`'s always-`false` `isEdit` was already using. Both sides
agreed by accident. The mismatch only appears once the page is actually opened for editing, which is
the realistic authoring workflow and exactly what the user tested.

**Fix.** Added an explicit `editPageMode: true` field to `edit/index.jsx`'s `PageContext.Provider`
value (absent/falsy on `view.jsx`'s — see `page.format.js`'s attribute list is unaffected, this is
page-render-tree-only). `ReportRouteList` now reads `editPageMode` from `PageContext` instead of its
own `props.isEdit` for **both** `routesKey` and `sectionsKey` — they must move together, since a
route's `graphIds` only mean anything if they reference the ids of whichever sections array is
actually on screen.

**Side effect (intentional, flagged for the user):** because `routesKey` now genuinely resolves to
`draft_routes` while on `/edit/...` (previously it silently always resolved to `routes`, live, since
`props.isEdit` was never true), **route edits made while a report is open for editing now require
Publish to appear on the live page** — this activates the `draft_routes`/`publish()`/
`discardChanges()` promotion machinery that was built during the original refactor but, per this bug,
had never actually been exercised. This is a genuine behavior change from "routes are edited live,
even outside edit mode" (the README's prior claim, which described the bug's accidental symptom, not
a verified design). Flagging this explicitly rather than silently changing it — if live (unpublished-
gate-free) route editing is wanted instead, that's a product decision to confirm, not something to
revert blindly.

**Verified live (2026-07-01, with real dev-login credentials, Playwright against
`http://npmrds.localhost:5173`):**
- `page_11` (fresh, never-published, `sections: []`): added a route via the "Add a Route to Your
  Report" flow, expanded it, confirmed the "On: Graph 1" chip now appears (previously absent).
- `page_10`: added a route with a real `startDate`/`endDate`, clicked "Graph 1," confirmed via
  screenshot that the graph renders an actual line series (previously blank) — `draft_routes` on the
  page row correctly shows `graphIds: ["2187386"]`, matching the *draft* section id the graph's own
  `usePageFilterSync` resolves at runtime (confirmed via a temporary debug log, since removed).
- Zero console errors, zero infinite-loop symptoms across all of the above.

**New open item, not yet resolved:** while investigating, section row ids were observed to change
across `apiUpdate` calls in ways not yet fully understood (e.g. `page_10`'s published graph section
was `2187292` in one check, `2187388` shortly after, with no explicit publish action taken in
between). This is a pre-existing characteristic of the page/section persistence layer, not something
introduced by this task, but it means `graphIds` written during one session could go stale if a
page's sections get re-materialized before the author revisits it. The v1 orphan-cleanup effect
(Piece 5) handles a section actually disappearing from the *current* `sectionList`, but does **not**
protect against a section's id silently changing while remaining conceptually "the same section" —
that's the same gap already flagged as deferred ("re-add reattachment... needing some stable
identity"). Worth a focused investigation in its own right if per-graph routing sees real use;
out of scope to chase further this session.
