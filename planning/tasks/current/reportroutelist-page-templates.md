# ReportRouteList → Page Templates + native graph sections

## Status: DONE, live-verified (2026-07-06)

Report pages are built on the standard page-template + section model; there is no more bespoke graph
injection. Route storage, the route-catalog binding, graph self-binding (`$self`/`trackingId`), and
edit-mode gating have all been implemented and live-verified against the dev server. See
[Known gaps](#known-gaps-not-blocking) for the handful of items that are implemented but not yet
exercised live, and [Explicitly deferred](#explicitly-deferred) for out-of-scope follow-ups.

## Objective

Stop `ReportRouteList` from injecting graph sections into the live page outside the normal component
lifecycle. A report is now just a page (created from the **Report Page** template); graphs are ordinary
page sections added/edited/reordered through the normal Add Component flow, bound to the report's
routes via the standard Comparison Series subscriber mechanism.

## Why (background)

The old model stored a report as a data row (`routes` + `graph_comps`) and injected graph sections into
the live page via a `setItem` escape hatch added to `view.jsx`/`edit/index.jsx` — the only place in the
codebase that bypassed the normal add-component flow. This leaked: any generic section operation (e.g.
reorder) would snapshot the injected graphs and persist them as real, double-stored component rows
(confirmed live on page `2180280`, rows `2186882`/`2186883`). The rework replaces this with all-standard
mechanisms — nothing page-specific, no injection, no leak.

## Current architecture

```
A report  ===  a page (created from the "Report Page" template)
  ReportRouteList panel (a normal section) — manages routes, publishes assignments to graphs
  Graph sections (normal sections) — each self-binds to the routes assigned to it
```

**Routes storage.** One row per report in a dataset (the template pre-wires `reports_snap_2`), keyed
1:1 by `report_id = <page id>`. The dataset is picked via the section's own sectionMenu **Dataset**
picker (`state.externalSource`) — not a page attribute, not a hardcoded constant — so an author (or a
different template) can point a report page's storage at a different dataset without any code change.
`ReportRouteList` loads/persists this row itself via `apiLoad`/`apiUpdate` (the same generic mechanism
Card/Spreadsheet use for their own rows); `state.data` (the normal dataWrapper binding) is unused.

**Route catalog binding.** The pool of addable routes is read from the sectionMenu's **"Add Join
Source"** slot (`state.join.sources.*.sourceInfo`) instead of `externalSource`, deliberately left
*incomplete* (no join columns configured). `buildUdaConfig`'s `isJoinComplete()` requires join columns
before a join alias is ever sent to the query engine, so this binding is a real, author-configurable
source pointer that never actually fires a SQL join. This is what makes both the storage binding and the
catalog binding independently sectionMenu-configurable, without adding a second dataset slot to
`dataWrapper` (a real second slot was considered and rejected as unnecessary once this was found — see
`ReportRouteList/README.md`'s "Storage" section for the designs that were tried and rejected before
landing here, if the rationale ever needs re-litigating).

**Graph binding.** Each graph section carries a `comparison_series` subscriber with `paramKey: '$self'`
— a reserved sentinel that `usePageFilterSync` resolves to a key derived from the graph's own stable
identity (`selfParamKey(trackingId || sectionId)`), rather than an author-typed literal. This makes
every graph automatically, uniquely addressable the moment it's added from the template, with zero
configuration. `ReportRouteList` never writes into a graph's row — it only *reads* sibling sections
(`item.draft_sections`/`item.sections`, already fully resolved client-side) to discover which ones carry
an enabled `$self` subscriber, and publishes each graph's assigned route subset to that graph's own key
via `setActionParam`. Each route carries a hidden `graphIds: string[]` (section identities), toggled via
a chip in the route's row — a route feeds no graph until explicitly assigned.

**Why `trackingId`, not the section's row id.** `publish()` deletes and recreates every section's row on
every publish (a pre-existing, unrelated bug — see [Explicitly deferred](#explicitly-deferred)), so a
graph's *draft* row id and its *published* row id are different values. `trackingId` (a client-generated
UUID stamped once when a section is created, previously write-only/unused elsewhere in the codebase)
survives that churn, so it's used instead, with `|| sectionId` as a fallback for sections that predate
it. It's threaded as a prop parallel to (not replacing) `sectionId`, because `sectionId` is also consumed
by `richtext`'s Lexical collaboration wiring and must stay untouched. **Three call sites must all use the
identical `trackingId || id` fallback** (`findSelfBoundGraphs`, `knownSectionIds`, `usePageFilterSync`'s
`$self` resolution) — a mismatch between any of them silently breaks route-to-graph publishing.

**Edit-mode gating.** Every mutation (`persistRoutes`, the orphan-cleanup effect, the add-route fetch)
and every mutating UI control is gated on `PageContext`'s `editPageMode` — not the component's own
`props.isEdit`, which means "this section's own settings editor is open" (almost never true for this
panel in normal use), not "the page is open for editing." Before this gate existed, merely *viewing* a
published report could silently strip and persist away a route's graph assignments, because the
orphan-cleanup effect compared draft-captured ids against the published id set and concluded they were
stale. `ReportRouteList` is the only component in this pattern that needed this gate added explicitly —
every "traditional" read-only-until-edit-mode component gets it from a convention this panel didn't
originally follow.

## Gotchas for future maintainers

- **`dataWrapper`'s settings-editor save effect (`toSave`) rebuilds `element-data` from a hardcoded
  allowlist of known keys.** Any new per-section state key that needs to persist through that path must
  be added to the allowlist explicitly, or it silently gets stripped the next time the effect fires for
  an unrelated reason. (Bit `join` once before this task, and `routes` once during it, back when routes
  briefly lived in `element-data`.)
- **`props.isEdit` on a `dataWrapper` component ≠ "the page is in edit mode."** It's `Boolean(onChange)`
  — true only while *this specific section's* settings editor is open. Use `PageContext`'s
  `editPageMode` for page-level checks.
- **Draft and published sections are separately materialized row sets**, not the same rows at different
  lifecycle stages — patching a draft section's config has no effect on its published copy until the
  page is republished (see `trackingId` above).
- **`dms raw list`/`dataset query` return empty results against this per-app-Postgres site** even when
  rows exist (a pre-existing CLI bug, documented in `cli/docs/TYPES.md`'s "Raw Access" section) —
  resolve row ids via the browser network tab or `dms raw get` once you have an id from elsewhere.
- **The dev DB requires the VPN.** `dms raw get`/`update` hang (not error) if it's down — the
  dms-server's bare HTTP endpoint still responds fast without a DB round-trip, which makes this
  confusing at first.
- **`dms page update --data` writing section objects into `draft_sections` bypasses the real
  section-materialization pipeline** — it stores raw JSON without creating real component rows, and
  `dms page dump --sections` then fails trying to dereference them. Use `dms section create <page>`
  (one call per section) instead.
- **This component reads `falcor` directly** (`getSources`/`getViews`) rather than going through the
  `api/` layer — predates that convention; flag it if you touch this file, but it's out of scope here.

## Where the template lives

The **Report Page** template (`npmrds_sub|page_template` row `2187021`, "Report Page") is a **DB-backed
page template**, not code — built and wired via the DMS CLI rather than a `theme.js`/`themev2.js`
`page_templates` entry, since it's specific to the `npmrds_sub` pattern. It ships the `ReportRouteList`
panel plus one starter "AVL Graph" pre-wired with `paramKey: '$self'`, and pre-wires both of the panel's
dataset bindings (`externalSource` → `reports_snap_2`, the join-source slot → the routes catalog) so an
author creating a new report never has to configure either manually. Authors create a new report via
**+ Add Page → Your Templates → Report Page**.

## Files touched

| File | What it does now |
|---|---|
| `src/themes/transportny/components/ReportRouteList/ReportRouteList.jsx` | The component: route storage/CRUD, sibling-graph discovery, per-graph publish, edit-mode gating |
| `src/themes/transportny/components/ReportRouteList/README.md` | Full current-state writeup (storage, catalog binding, per-graph routing, gotchas) |
| `src/themes/CLAUDE.md` | Pointer entry under "Custom theme components worth knowing about" |
| `packages/dms/src/patterns/page/pages/view.jsx`, `pages/edit/index.jsx` | `editPageMode` on `PageContext`; removed the old `newItem`/`setItem` fork |
| `packages/dms/src/patterns/page/components/sections/section.jsx`, `.../components/index.jsx`, `.../dataWrapper/index.jsx` | Thread `sectionId` and `trackingId` into `ComponentContext` |
| `packages/dms/src/patterns/page/components/sections/components/dataWrapper/usePageFilterSync.js`, `buildUdaConfig.js` | `$self` sentinel resolution, `selfParamKey()` |
| `packages/dms/src/patterns/page/pages/edit/editFunctions.jsx` | `newPage()`/`duplicateItem()` mint a fresh `trackingId` per copied section; `sidebar` now copied from page templates |
| `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/{Card,spreadsheet}/config.jsx` | `usesItemMutationProps: true` (registry-driven replacement for the old hardcoded component-name allow-list in `dataWrapper/index.jsx`) |

## Known gaps (not blocking)

- Two graphs on one report page resolving to two independent, stable keys across a publish cycle —
  logic is symmetric per-graph and believed correct, but not click-tested with two real graphs.
- `newPage()`/`duplicateItem()` minting distinct `trackingId`s per section when two pages share a
  template/source — implemented, not independently re-verified.
- Card/Spreadsheet edit-mode add/update/remove-row behavior under the new `usesItemMutationProps`
  registry flag — unchanged code path, low risk, not independently re-verified (only
  `ReportRouteList`'s own flow was re-checked live).
- `richtext`/collab behavior after threading `sectionId`/`trackingId` through `dataWrapper` — should be
  unaffected (richtext doesn't go through `dataWrapper`), not independently re-confirmed.

## Explicitly deferred

- **Migrating existing `graph_comps`-based reports** (e.g. page `2180280`, "Report Demo") into report
  pages — not a mechanical conversion (the old model's multi-report picker has no equivalent under
  "report = page"); separate task.
- **Cleaning up leaked `createdBy:'reports'` component rows** on page `2180280` (ids `2186931`/
  `2186932`) — mechanical, low-risk, not done.
- **`publish()` minting a fresh row + id for every section on every publish** (root cause of the
  `trackingId` workaround above) — a real bug affecting every page/site, not just reports; bigger blast
  radius than this task, filed as its own follow-up rather than fixed here.
- **Author-settable graph titles** (shown instead of ordinal "Graph N" labels) — low priority.
- **Reattaching a route's `graphIds` after its graph is removed and a new one added** — needs a stable
  author-facing identity (probably the deferred title field) to make "this is the same graph" legible;
  v1 always cleans up `graphIds` on removal instead.
