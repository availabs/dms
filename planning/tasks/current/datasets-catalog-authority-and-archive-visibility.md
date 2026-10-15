# Datasets catalog — show authority on the sources list; keep archived sources out of search and pickers

**Initiatives:** [mny_dama_hygiene](../../../../../planning/initiatives/mny_dama_hygiene.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

**Project:** DMS library · **Topic:** patterns/datasets + page/dataWrapper · **Started:** — (created 2026-10-14)

> Split out of the MitigateNY close-out task
> [`hazmit-dama-closeout.md`](../../../../../planning/mitigateny/tasks/current/hazmit-dama-closeout.md)
> (Phases 4 and 6), which drives it to done. Builds on two built tasks it must not duplicate:
> [`datasets-authoritative-views.md`](./datasets-authoritative-views.md) (the `authority` record, the Versions
> card badges and the picker ★) and
> [`datasets-lifecycle-listing-and-sandbox-promotion.md`](./datasets-lifecycle-listing-and-sandbox-promotion.md)
> (the per-pattern hidden lifecycle set and the `some` rule).

## Objective

- **A. Authority on the list.** A reader scanning the catalog should see, per source:
  - whether it has an authoritative view;
  - which one, by label and date, or how many when keyed;
  - or that it is undecided;
  - and, when lineage says so, what superseded it.

  Today authority shows only on the source's own Versions card and in the version pickers.
- **B. Archived out of the main view.** A source in a hidden lifecycle (Archive, Data Processing, Sandbox,
  Uploaded File) shouldn't appear in:
  - the default list;
  - **search** and **"Show all"**;
  - the page editor's **source pickers**.

  It stays reachable on purpose, through the signed-in lifecycle buckets or an explicit toggle.

## Current state (library code, 2026-10-14)

- **The list** (`patterns/datasets/pages/DatasetsList/index.jsx`):
  - `visibleSources` hides a source when any of its top-levels is in the pattern's resolved hidden set
    (`utils/lifecycle.js` `resolveHiddenForPattern` / `isSourceHidden`).
  - But `if (isListAll || isSearching) return sources || []`, so **search (more than 2 characters) and
    "Show all" return every source**, archived included.
  - Signed-in users get the hidden lifecycles as sidebar buckets (`hiddenBuckets`).
- **Authority** (built in `datasets-authoritative-views.md`):
  - the derived `authority` attribute is in the source attribute lists (`default/consts.js`);
  - helpers: `authoritativeViews`, `isAuthoritative`, `authorityState` (undecided | single | keyed),
    `keyLabel`;
  - the list cards don't read any of them.
- **Lineage on the source:** `metadata.superseded_by` / `supersedes` (written by the MNY retag on 14
  sources).
- **Pickers:**
  - the dataWrapper source select (`page/components/sections/components/dataWrapper/useDataSource.js`
    `getSources`) lists every source in the env with no lifecycle filter;
  - the map's source selector lives in the app now (`dms-template/src/patterns/mapeditor/.../SourceSelector`),
    so its change is tracked in the MNY close-out task, not here.
- **Design:** the catalog design page is
  `dms-template/src/themes/transportny/TransportNY Design System/dms_design_system_v2/pages/datasets-catalog.html`
  (authored in dms-template; the transportNY copy follows via the theme sync). The live catalog
  (`datasets-design-updates.md` Phase 1) has grid, full-width-card and table views with a type badge and a
  category pill.

## Proposed changes

### Part A — authority indicators (design first)
- [ ] **Mockup** in `datasets-catalog.html`, for all three views. Converge with the owner, then port.
      Options to show:
  - a chip on the card's meta row: `★ 01/29/2026` (single) · `★ 3 keyed` (keyed, tooltip lists
    `keyLabel`s) · `undecided` (muted; admins only?);
  - a "Superseded by <name>" line or link when `metadata.superseded_by` is set;
  - a table-view column "Authoritative view";
  - a sidebar/filter facet: Authoritative · Undecided · Keyed.
- [ ] Read `authority` from the list's existing source attributes (no extra request) and use the shared
      helpers. Theme keys for the chip in `datasetsList.theme.js`, following the named-style convention.
      No `className` passthroughs.
- [ ] Unmarked sources render as today apart from the chosen undecided treatment (BC).

### Part B — lifecycle-aware search, "Show all" and pickers
- [ ] **Search** respects the resolved hidden set by default. Add an explicit "include hidden lifecycles"
      toggle (signed-in), or show hidden matches in a separate, labelled group under the results:
      design choice, same mockup.
- [ ] **"Show all"** means "all production" plus uncategorized; hidden lifecycles stay behind the buckets
      and the toggle.
- [ ] **dataWrapper source select** (`useDataSource.js`): exclude sources in the env's hidden lifecycles
      by default.
  - A section that already binds a hidden source still shows it as its current value, so nothing
    breaks.
  - An "include archived" switch exists for the rare deliberate case.
  - The pattern-level hidden set isn't available in the page editor, so this uses the library default
    set (`LIFECYCLE_DEFAULTS`) plus the env floor.
- [ ] Tests: unit tests for the filtering helpers (hidden set × search × toggle), and a regression test
      that a section bound to an archived source still renders and still shows its source in the picker.

## Testing checklist
- [ ] Mockup approved (Part A + the search treatment).
- [ ] Live on devmny.org `/cenrep`:
  - single, keyed and undecided indicators match the 54 marked sources (spot-check 1649 → 01/29/2026,
    1567 keyed, an undecided one);
  - an Archive-tagged source (e.g. 1480 after its archive) is absent from the default list, from search
    and from "Show all", and present in the signed-in Archive bucket;
  - the section source picker omits it unless toggled;
  - a page still bound to an archived source renders.
- [ ] TransportNY catalog unchanged apart from the new indicators (its envs carry no authority yet, so
      they show undecided or nothing, per the design choice).

## Progress log

- 2026-10-14 — Created from the MNY close-out task (owner: authority "on the sources list view visually",
  and "datasets which are archived are no longer listed in the main datasources view"). The code read
  shows the default list already hides lifecycles. The gaps are search, "Show all" and the editor
  pickers, plus authority not shown on the list at all.
