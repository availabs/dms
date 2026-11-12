# Page preload reads its per-type load config from the component registry

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** built · **Release:** deploy — client build (owner) · **Created by:** amuro@albany.edu · **Edited by:** —

**Topic:** api · **Found:** 2026-11-10 (while fixing [pattern-filter-sync-full-data-load.md](./pattern-filter-sync-full-data-load.md))

## Objective

The page loader's data preload (`api/preloadSectionData.js`) decides which sections to preload, and how,
from what each section's COMPONENT declares in the registry, not from a list of type names in the core.

## Problem

`preloadSectionData.js` carries type knowledge the library rules forbid (CLAUDE.md, "DMS interprets data,
it never knows types"):

- `COMPONENT_PRELOAD_CONFIG` hardcodes `Spreadsheet`, `Card` and `Graph` with their `fullDataLoad` /
  `keepOriginalValues`, copies of flags the components already declare in their configs.
- `compType = (elementType === 'Graph' || elementType === 'AVL Graph') ? 'avlGraph' : undefined` hardcodes
  the Graph component's `type`, which the dataWrapper itself reads off the component (`component?.type`).

Consequences:
- **`AVL Graph` sections are never preloaded.** That legacy element-type resolves to the same component as
  `Graph` (ComponentRegistry `"AVL Graph": { ...GraphNew }`) but isn't in the table, so those pages fetch
  after first render instead.
- A theme component can't take part without a library edit, and the flags can drift from the component.

## Design

- **A capability flag on the component config: `preloadData: true`.** Set on Card, Spreadsheet and
  graph_new (so `AVL Graph`, a spread of graph_new, inherits it). Opt-in on purpose: many components declare
  `useDataWrapper: true` (Filter, Upload, Validate, mnyHeader, a dozen theme components), and preloading all of
  them would add page-load queries nobody asked for. (`preload` is taken: it's the registry's code-split chunk
  loader.)
- **The preload reads the entry:** preloadable = `component.preloadData`; getData gets the component's
  `fullDataLoad` / `keepOriginalValues`; `migrateToV2` gets `component.name` / `component.type`, the same
  arguments the dataWrapper passes (`dataWrapper/index.jsx`).
- **The registry is passed in, not imported:** `api/` stays below the patterns. The page pattern's loader
  (`siteConfig.jsx`, the one caller) passes `getRegisteredComponents()`, which includes theme registrations
  (made at app boot, before any loader runs).

**BC:** Card / Spreadsheet / Graph preload exactly as before (same flags, same compType for Graph). New: AVL
Graph sections preload (the fix), and any theme component that sets `preloadData: true`.

## Plan

- [x] `preloadData: true` on Card.config.jsx, spreadsheet/config.jsx, graph_new/config.jsx.
- [x] `preloadSectionData.js`: drop `COMPONENT_PRELOAD_CONFIG` and the compType special case; take the
      registry; read the entry's flags.
- [x] `siteConfig.jsx`: pass `getRegisteredComponents()`.
- [x] Test (vitest): preload of a 40-row Graph / AVL Graph / Card section against a stub falcor: what each
      type fetches (all rows vs one page), and that a component without `preloadData` isn't touched.
- [x] Document the flag (`documentation/` component config reference, or the section-component skill).
- [ ] Deploy (owner); TransportNY's vendored copy follows by sync.

## Files

- `packages/dms/src/api/preloadSectionData.js`
- `packages/dms/src/patterns/page/siteConfig.jsx`
- `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/{Card.config.jsx,spreadsheet/config.jsx,graph_new/config.jsx}`

## Progress log

- 2026-11-10 · Created. · amuro@albany.edu
- 2026-11-10 · **Built.** `preloadData: true` on Card / Spreadsheet / graph_new (AVL Graph inherits);
  `preloadSectionData.js` has no type names left: `COMPONENT_PRELOAD_CONFIG`, `isPreloadableType` and the
  Graph/AVL Graph compType mapping are gone; `preloadPageSections(…, components)` reads `preloadData`,
  `fullDataLoad`, `keepOriginalValues` and `type` off the entry. Only `component.type` reaches
  `migrateToV2` (not the name: preload never ran the name-gated Card migration, and still doesn't, so
  Card/Spreadsheet/Graph preload is unchanged). `siteConfig.jsx` passes `getRegisteredComponents()`.
  Test `tests/preloadSectionDataRegistry.test.js` (5 passing): Graph full / Card one page with their flags,
  AVL Graph now preloads, non-opted-in and unknown types skipped, a theme component that opts in preloads,
  no registry → nothing preloaded, and the three configs carry the flag. Flag documented in
  `skills/creating-page-section-components.md`. Not committed or deployed. · amuro@albany.edu
