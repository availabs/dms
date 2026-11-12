# pattern-filter-sync stores only the first page of a Graph's rows

**Initiatives:** [mny_county_template_r2](../../../../../planning/initiatives/mny_county_template_r2.md) (primary), [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Release:** deploy — dms-server + client build (owner) · **Created by:** amuro@albany.edu · **Edited by:** —

**Topic:** dms-server · **Found:** 2026-11-10 · **Siblings:** [pattern-filter-sync-full-coverage.md](./pattern-filter-sync-full-coverage.md), [pattern-filter-sync-history-clobber.md](./pattern-filter-sync-history-clobber.md)

## Objective

The sync's Tier-2 recompute stores each section's rows the way the section's own component loads
them. A Graph (any component whose config says `fullDataLoad: true`) gets ALL of its rows, not the
first page of 25.

## Root cause

`pattern-filter-sync.js` calls the server's getData mirror as `getData({ state, currentPage: 0,
sectionId })`. The mirror already supports `fullDataLoad` (and `keepOriginalValues`), but the sync never
passes them. Those flags are COMPONENT config, not section state: the client's `useDataLoader` passes
`component.fullDataLoad` from the registered component (`graph_new/config.jsx`: `fullDataLoad: true`).
Without it the mirror computes a 25-row window (`display.pageSize` or 25), so every Graph the sync
recomputes stores its first 25 rows, and a page that renders stored rows shows a truncated chart.

Found by the same bug in the MitigateNY release tooling (`compute_seeds.mjs`, which copied the call):
Yates' *Historic Loss By Year* stopped at 2001 (25 of 103 rows) and the monthly graph at June (25 of 56).
The template, saved from the editor with a full load, showed 1996–2025.

`keepOriginalValues` is set on the request options but no server route reads it today (the UDA layer
returns `{value, originalValue}` for meta-mapped columns either way), so omitting it changes nothing
now. It's carried anyway, so the sync stays a faithful mirror if the server starts honouring it.

## Design (library rule: the core never knows a type)

The server must not hardcode `Graph` (CLAUDE.md, "DMS interprets data — it never knows types"; theme
components such as Fusion's `TileMap` set `fullDataLoad: true` too, and the server can't see theme
registrations). So the per-type load flags travel as DATA from where they're declared:

- **Client** (`filterEditor.jsx`, the one caller): derive `sectionLoad` from the registered components,
  `{ [element-type]: { fullDataLoad, keepOriginalValues } }` for every component that sets either flag
  (`getRegisteredComponents()`, so theme registrations are included), and send it in the request body.
- **Server**: accept `body.sectionLoad`, validate it (plain object of `{fullDataLoad?, keepOriginalValues?}`
  booleans), carry it on the task descriptor, and pass the section's entry to getData. The Tier-2 cache
  key includes the flags. **No `sectionLoad` → today's behaviour** (BC for API / CLI callers), with
  a log line saying so.

## Plan

- [x] Task doc + todo entry.
- [x] Server: `sectionLoad` on the route + descriptor; per-section flags into getData; cache key; result
      reports `fullLoads`; header docs.
- [x] Client: `filterEditor.jsx` sends `sectionLoad` from the registry.
- [x] Test: `tests/test-pattern-filter-sync-load.js`, a real SQLite run of the sync worker over an internal
      dataset of 40 rows, with a Graph section: 40 stored with `sectionLoad`, 25 without (the BC path).
- [ ] Deploy (owner): dms-server + the client build.

## Related debt (not in scope)

`api/preloadSectionData.js` `COMPONENT_PRELOAD_CONFIG` hardcodes `Spreadsheet` / `Card` / `Graph` in the
client core (misses `AVL Graph` and theme components). It should read the same flags off the registry.

## Files

- `packages/dms-server/src/dms/tasks/pattern-filter-sync/pattern-filter-sync.js`
- `packages/dms/src/patterns/admin/pages/patternEditor/default/filterEditor.jsx`
- `packages/dms-server/tests/test-pattern-filter-sync-load.js` (new)

## Progress log

- 2026-11-10 · Created. · amuro@albany.edu
- 2026-11-10 · **Built.** Server: `body.sectionLoad` validated on the route (400 on a non-object; only
  boolean `fullDataLoad` / `keepOriginalValues` kept), carried on the descriptor, the section's entry passed
  to getData, flags in the Tier-2 cache key, `fullLoads` in the result, a log line when absent. Client:
  `filterEditor.jsx` derives `sectionLoad` from `getRegisteredComponents()` (Graph and AVL Graph today,
  plus any theme component setting the flags). Test `tests/test-pattern-filter-sync-load.js` (in `npm test`,
  `npm run test:pattern-filter-sync`): 4 passing on SQLite: 40 rows with the flag, 25 without (the old
  behaviour, i.e. the bug), other types' flags ignored, route validation. Not committed or deployed (owner).
  · amuro@albany.edu
