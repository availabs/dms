# MapEditor: Migrate from DAMA to UDA + Port Symbologies into DMS

## Status: DONE (2026-04-18) — all phases complete, Phase 5 manually verified in mitigat-ny-prod. Follow-up tasks filed separately (see bottom).

## Objective

Finish migrating the MapEditor and page-pattern map components off the legacy DAMA server:

1. **Complete the client-side DAMA → UDA migration** for source/view paths in the MapEditor AND in the page-pattern Map component — the MapEditor is mostly done (Eric's commit `9559d4e8`, 2026-04-17) but the page-pattern Map component is untouched.
2. **Port DAMA symbologies into DMS.** The 247 rows in `hazmit_dms.data_manager.symbologies` are currently a hard dependency for every map saved in `dms-mercury-3`'s `mitigat-ny-prod` site. We will not continue supporting the standalone symbologies table — migrate the data into `data_items` rows under a proper mapeditor pattern, then rewrite saved map components to reference the new DMS row IDs.
3. **Fix the MapEditor's symbology creation to comply with the new type system** (`{parent}:{instance}|{rowKind}`). The mapeditor pattern currently sets `format.type = type` (the pattern's own type), so newly-created symbology rows inherit the pattern's type instead of using a proper `{patternInstance}|symbology` child type. This has to be fixed before we migrate data, so migrated symbologies and newly-created ones share the same schema.
4. **Remove all `dama[pgEnv]` fallbacks** in the page-pattern map components (SymbologySelector, SymbologyViewLayer) so the app stops reading the old symbology and source/view routes entirely.

## Context (as of 2026-04-17)

### Database reality

**DAMA source (`hazmit_dms.data_manager.symbologies` on mercury:5435):**
- 247 rows total
- Schema: `symbology_id int PK, name text, collection_id int, description text, metadata jsonb, symbology jsonb, source_dependencies jsonb[] (array), categories jsonb, _created_timestamp, _modified_timestamp`
- `symbology` JSON has `{layers, activeLayer}` — layers keyed by random string IDs, each layer has source/view refs, style config, filter definitions, popover definitions
- `collection_id` — 230/247 are NULL; 17 are in collections 2-5 (small "Footprints" groupings). Not a strong hierarchy signal.
- `categories` — mostly NULL or empty `[]`; a handful of `[["BILD"]]` style nested arrays
- `source_dependencies` — usually NULL

**DMS target (`dms3` on mercury:5435, per-app split mode, schema `dms_mitigat_ny_prod`):**
- Site row: `id=566430, type=prod:site` — 39 patterns
- Only 1 mapeditor pattern currently: `prod|map_editor_test:pattern` (id 1920082, "Map Editor Test") — looks like a test/placeholder
- 0 `|symbology` rows exist yet (the new-format child type isn't in use)
- One `:symbology`-suffixed row exists (id 328, a one-off)

### Map-component inventory in mitigat-ny-prod

Scanned all `%|component` rows in `dms_mitigat_ny_prod.data_items` where `data.element.element-type` is Map-ish (`Map`, `MapDama`, `Map: NRI`, `Map: Fusion Events Map`, `Map: FEMA Disaster Loss`, `Map: Buildings`, `Map: Dama Map`):

- **5,036 map components total**
- **2,194 have `symbologies` populated** (the rest are empty/unconfigured maps)
- **2,193 of those reference DAMA symbologies** (only **1** references a DMS-native symbology)
- **91 distinct DAMA `symbology_id` values** are referenced across the site
- **89 of 91 exist in the DAMA table** — 2 are dangling refs (IDs 183, 200) that we'll treat as orphans
- **158 DAMA symbologies are unreferenced** by any map in mitigat-ny-prod (but may be used elsewhere; safest to migrate all 247 and filter later)

Top patterns by affected map count: `sullivantest2_recreate` (233), `putnamcsc` (233), `mitigateny_sullivan` (198), `mitigateny_2025` (163), `redesign2` (163), `redesign_backup` (162), `sullivan_entry_test_domain` (144), plus 11 more county-level patterns with ~99 each.

### Data shape inside map components

Each map component's state lives in `data_items.data.element["element-data"]` as a JSON-encoded **string** (double-encoded: `data.element` is jsonb, `element-data` is a string inside it that parses to JSON). The parsed shape:

```js
{
  tabs: [...],
  height: "full",
  symbologies: {
    "235": {  // key = the symbology identity in use
      symbology_id: 235,      // DAMA only — set if loaded from DAMA
      id: undefined,          // DMS only — set if loaded from DMS
      name: "Census Tract NRI Building EAL by Hazard",
      symbology: {
        layers: { ... },
        activeLayer: "...",
        isDamaSymbology: true  // inconsistently set; our scan found 0 with this flag
                               // because the flag is applied at load time in
                               // SymbologySelector, not baked into persisted state
      }
    }
  },
  initialBounds, setInitialBounds, zoomPan, hideControls, blankBaseMap, isEdit
}
```

**The `isDamaSymbology` flag is unreliable** — use "has `symbology_id` and no `id`" as the heuristic for detecting DAMA refs.

### Eric's commit (`9559d4e8`, 2026-04-17) — what's DONE

21 files changed across `patterns/mapeditor/`. Specifically:

- **Source/view loading** now uses `uda[pgEnv]` in `MapViewer.jsx`, `MapEditor/index.jsx`, `SourceSelector/*`, `ViewGroupControl`, `ColumnSelectControl`, `DynamicFilterBuilder`, `FilterControls`, `PopoverControls`
- **Symbology CRUD** (read/edit/create/delete) now uses `dms.data.*` in `SaveChangesMenu.jsx`, `CreateSymbologyMenu.jsx`, `SymbologyControlMenu.jsx`
- **Symbology listing** in the MapEditor (`MapViewer.jsx`, `MapEditor/index.jsx`) now reads `props.dataItems` instead of pulling from `dama[pgEnv].symbologies.*`. Route `action: "list"` delivers them via the DMS loader.
- **`MapViewerLegend.jsx`, `ZoomToFit/*`** reworked — some paths moved to `uda[pgEnv]`, new `useZoomToFit.js` hook added
- **Dead DAMA code** is commented (not deleted) in `MapViewer.jsx`, `index.jsx`, `SaveChangesMenu.jsx`, `CreateSymbologyMenu.jsx`, `SymbologyViewLayer.jsx` — follow-up cleanup work

### What Eric DID NOT touch (still outstanding in code)

1. **Page pattern's `SymbologySelector.jsx`** (`patterns/page/components/sections/components/ComponentRegistry/map/SymbologySelector.jsx`) — still loads DAMA symbologies via `dama[pgEnv].symbologies.length/byIndex`, merges with DMS list. This is the reason maps in mitigat-ny-prod are broken today: `VITE_DAMA_HOST` now points at dms-server, which has no `dama.symbologies.*` route, so the fetch returns nothing and existing components that stored `symbology_id: 235` can't find their symbology.
2. **Page pattern's `SymbologyViewLayer.jsx`** — still uses `dama[pgEnv].sources.byId`, `dama[pgEnv].viewsbyId.databyId`. Active calls (not commented).
3. **`mapeditor.format.js` + `siteConfig.jsx`**:
   - `mapeditorFormat.type = 'symbology'` in the format definition is correct in isolation
   - But `siteConfig.jsx` does `format.type = type;` — overriding the format type with the *pattern* type (e.g., `prod|map_editor_test:pattern`). Newly-created symbology rows get created with that type as their parent, producing wrong types.
   - **Should adopt the same `initializePatternFormat(format, app, instanceName)` flow the other patterns use**, which builds `format.type = `${instanceName}|symbology`` correctly. Phase 14 of the type-system-refactor marked this as "done" but only inspected at a high level; closer look shows the bug.
4. **`attributes.jsx`** still exports `DamaSymbologyAttributes` (dead — nothing imports it after Eric's refactor).

## Scope

### In scope

- **Client code**: finish the DAMA → UDA migration in the page-pattern Map component; fix `mapeditor.format.js`/`siteConfig.jsx` to produce proper `{patternInstance}|symbology` types; clean up commented DAMA code and dead `DamaSymbologyAttributes`.
- **Data migration**: port `hazmit_dms.data_manager.symbologies` rows into `dms_mitigat_ny_prod.data_items` as `{patternInstance}|symbology` rows under a mapeditor pattern.
- **Ref rewriting**: update the 2,193 affected map components in mitigat-ny-prod so their `element-data.symbologies` entries point at the new DMS row IDs (not the old DAMA `symbology_id` values).
- **Migration script**: reusable one-shot script (likely a standalone node script in `dms-server/src/scripts/`) that can be run against other sites later if needed.
- **Cleanup of commented DAMA code** across the MapEditor files Eric touched.

### Out of scope

- Backfilling old symbologies into sites other than `mitigat-ny-prod` (script should be parametrizable, but only `mitigat-ny-prod` is the acceptance target for this task).
- DAMA sources/views themselves — they continue to live in the DAMA database and are accessed via `uda[pgEnv]`. We are only migrating the `symbologies` table.
- Collapsing the `MapDama` legacy element type — out of scope here (171 components). Address in a follow-up; for now, migrate their symbology refs the same way as `Map` components.
- Deprecating the standalone `map_editor_test` pattern — we'll replace/rename it as part of this task, but cleanup of other `mapeditor`-type patterns across dms-mercury-3 is separate.
- SSR/hydration considerations for the map component — it doesn't run in SSR today.

## Plan

### Phase 0: Shape decisions — DONE (2026-04-17)

| # | Decision |
|---|---|
| 0.1 | **Keep the `map_editor_test` pattern name in mitigat-ny-prod.** Pattern names are user-assigned and sites can legitimately have multiple mapeditor patterns (auth/style reasons). Migration scripts take `--pattern-instance <slug>` as a required argument; for mitigat-ny-prod we pass `--pattern-instance map_editor_test` since it's the only mapeditor pattern and the intended target. |
| 0.2 | **Migrate all 247** DAMA symbologies. Unreferenced ones are cheap and might be used by other apps later. |
| 0.3 | **Strip dangling refs (183, 200)** from map-component `element-data.symbologies` during rewrite. Gated by `--prune-dangling`, default ON. Better UX than leaving broken entries. |
| 0.4 | **No instance in symbology type.** Type = `{patternInstance}\|symbology` (e.g., `map_editor_test\|symbology`). Identity is the numeric DMS id. DAMA `symbology_id` stashed as `data.legacy_dama_symbology_id` for traceability + rollback. |
| 0.5 | **Preserve** `collection_id`, `categories`, `source_dependencies` as `data.legacy_*` fields. No new semantics — just auditability. |

### Phase 1: Hotfix — type construction + `Map: Dama Map` registration — PARTIAL (1b done, 1a pending)

Two independent small fixes. Landing both stops new broken rows from being created and restores rendering for the 171 `Map: Dama Map` components.

#### 1a. Fix `mapeditor/siteConfig.jsx` type construction — DONE (2026-04-17)

**Implementation note**: two changes were needed, not one. The bare `format.type = type;` swap wasn't enough because the `MapEditorContext` also passed `type` (the pattern type) to downstream consumers (`CreateSymbologyMenu`, `SaveChangesMenu`, `SymbologyControlMenu`, `SymbologySelector`) that use it for `dms.data.*` CRUD — they need the CHILD type. Fixed both in one edit: rename outer-arg `type` → `patternType`, compute `patternInstance = getInstance(patternType) || patternType`, build `format = initializePatternFormat(MapEditorFormat, app, patternInstance)`, then in the context expose `type: childType` (the `|symbology` form) and also `patternType` for anything that wants the parent. Verified `npm run build` passes.

**Problem**: `format.type = type;` in the mapeditor's siteConfig overwrites the format's child kind (`symbology`) with the *pattern's* own type (e.g., `prod|map_editor_test:pattern`). Newly-created symbology rows inherit the pattern type instead of `{patternInstance}|symbology`. Phase 14 of `type-system-refactor` marked this as reviewed-OK but the closer look during this task showed it's broken.

**File**: `src/dms/packages/dms/src/patterns/mapeditor/siteConfig.jsx`

- [ ] Replace the ad-hoc `format.type = type;` with `initializePatternFormat(format, app, instanceName)`, same flow used by page/admin/etc. Compute `instanceName = getInstance(type) || type` via `utils/type-utils.js`. Result: `format.type === `${instanceName}|symbology``.
- [ ] Imports to add: `initializePatternFormat` from `../../dms-manager/_utils`, `getInstance` from `../../utils/type-utils`.
- [ ] No change to `mapeditor.format.js` itself — `type: "symbology"` is the leaf kind the initializer prepends the instance to.
- [ ] No change needed to `CreateSymbologyMenu.jsx`, `SaveChangesMenu.jsx`, or `MapEditor/index.jsx`'s list route — they all consume `type` from `MapEditorContext`, which will now carry the correct child type.

**Verification**:
- [ ] Create a symbology in the MapEditor (dev build). Query: `SELECT type FROM dms_mitigat_ny_prod.data_items WHERE id = <new_id>`. Expect `map_editor_test|symbology`, not `prod|map_editor_test:pattern` or `symbology`.
- [ ] Route `action: "list"` in MapEditor `index.jsx` still delivers symbologies via `props.dataItems`.
- [ ] No regressions in the mapeditor pattern UI.

#### 1b. Fix `Map: Dama Map` registration — DONE (2026-04-17)

**Problem**: saved components store `element-type: "Map: Dama Map"` (display name with colon), but the page-pattern `ComponentRegistry/index.jsx` had the key as the bare `MapDama`. Lookup missed → "Component Map: Dama Map Not Registered" error for all 171 affected components.

**Fix applied**: renamed the key in `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/index.jsx` from `MapDama` to `"Map: Dama Map": MapDama //MapDama`. Matches the existing convention used by `"Header: Default Header"`, `"Header: MNY Data"`, `"Footer: MNY Footer"`. Verified: nothing in the codebase (outside planning docs + server request logs) references the bare `MapDama` key, so rename was safe vs adding an alias.

**Follow-up (out of scope)**: same kind of bug almost certainly affects the other `Map: X` display names with no registry entries. Counts across mitigat-ny-prod:
- `Map: NRI` — 1,751 components
- `Map: Fusion Events Map` — 493
- `Map: FEMA Disaster Loss` — 312
- `Map: Buildings` — 286

Total **~2,842 components likely silently rendering as "Not Registered"**. Either those registrations lived in a build-time `registerComponents(...)` call that got lost, or they were never wired up. Triage as a separate task (track under `patterns/page` in `todo.md`).

### Phase 2: Finish page-pattern cleanup — PARTIAL (map/ dir done; map_dama/ deferred)

**File**: `patterns/page/components/sections/components/ComponentRegistry/map/SymbologySelector.jsx` — DONE

- [x] Dropped the `dama[pgEnv].symbologies.length/byIndex` fetch, `damaSymbologies` useMemo, unused `useEffect`/`useMemo`/`useState` imports, and the `falcorCache` state. `symbologies` is now just `dmsSymbologies`.
- [x] Also removed unused `getAttributes`/`SymbologyAttributes`/`get` imports.

**File**: `patterns/page/components/sections/components/ComponentRegistry/map/SymbologyViewLayer.jsx` — DONE

- [x] Source metadata calls: `dama[pgEnv].sources.byId[id].attributes.metadata[...]` → `uda[pgEnv].sources.byId[id].metadata[...]` (UDA doesn't nest under `.attributes`).
- [x] View data calls: `dama[pgEnv].viewsbyId[id].databyId[id]` → `uda[pgEnv].viewsById[id].dataById[id]` (case changes).
- [x] Deleted the commented DAMA useEffect blocks in the same file.

**File**: `patterns/mapeditor/attributes.jsx` — DEFERRED

- [ ] `DamaSymbologyAttributes` export is still actively used by **`patterns/page/components/sections/components/ComponentRegistry/map_dama/`** (a parallel unmigrated map implementation consumed by the 171 `Map: Dama Map` components). Removing it now would break map_dama's MapManager + SymbologySelector. Defer until Phase 2c below.

### Phase 2c: Migrate `map_dama/` component tree off DAMA — DONE (2026-04-17, Option C path)

**Approach taken**: Option C — port the 16 DAMA calls now to restore editor behavior for the 171 `Map: Dama Map` components, then schedule map/map_dama unification as a separate task (because they have distinct features worth merging carefully — map_dama supports multi-symbology + filter-control UI, map supports datawrapper page-state filter binding).

**Completed edits**:
- [x] `map_dama/MapManager/SymbologySelector/index.jsx` — replaced DAMA symbology loader with `doApiLoad()`-based DMS loader; removed `DamaSymbologyAttributes`/`getAttributes` imports; trimmed unused state (`falcorCache`, `useEffect` for legacy loader).
- [x] `map_dama/MapManager/MapManager.jsx` — same DMS swap in the symbology-fetch block within `SymbologyRow`; source views path moved to `uda[pgEnv].sources.byId[id].views.*` (flattened out `.attributes` nesting to match UDA shape); removed `DamaSymbologyAttributes` import.
- [x] `map_dama/SymbologyViewLayer.jsx` — HoverComp: source metadata `dama[pgEnv].sources.byId[id].attributes.metadata.*` → `uda[pgEnv].sources.byId[id].metadata.*`; view data `dama[pgEnv].viewsbyId.databyId` → `uda[pgEnv].viewsById.dataById` (case change); deleted adjacent commented DAMA blocks.
- [x] `patterns/mapeditor/attributes.jsx` — deleted `DamaSymbologyAttributes` export (no remaining consumers).
- [x] `npm run build` clean.

**Follow-up queued**: `map-component-unification.md` (new task file in `planning/tasks/current/`) — plan to merge `map/` and `map_dama/` into a single component covering the union of their features. Required because the duplication will rot otherwise.

### Phase 2b: Port `colorDomain` to `uda[pgEnv]` — DONE (2026-04-17)

**Implementation summary:**

- New route `uda[pgEnv].viewsById[viewId].colorDomain[JSON(options)]`
- Four methods: `equalInterval`, `quantile`, `standardDeviation`, `ckmeans`
- All four use SQL-native aggregation (no row-level data transfer to Node).
- ckmeans branches on row count: full scan for counts ≤ `ckmeansFullScanThreshold` (default 50K), otherwise `width_bucket` histogram → ~10K weighted representatives → in-JS ckmeans.
- Per-method timings measured against `hazmit_dama` source 1480 / view 1960 / 5.3M non-null rows (column `yr_blt`, numbins=6): equalInterval 4.4s, quantile 14.7s, standardDeviation 8.1s, ckmeans 8.4s (histogram path).

**Break-array convention chosen:** first element = min, length = numbins. Matches the client's `choroplethPaint()` expectation (Mapbox `step` expression input) and matches the legacy DAMA response shape, so no downstream changes needed.

**Filter passthrough:** options.filter is forwarded to `buildCombinedWhere` alongside the default null-exclusion on the target column (opt-in `excludeZero` available). MapEditor passes the active layer filter into `domainOptions.filter`, so the color range follows user filters.

**PostgreSQL only** — `percentile_cont`, `stddev_samp`, `width_bucket`. SQLite support explicitly out of scope (spatial data doesn't run on SQLite).

**Files created:**
- `packages/dms-server/src/routes/uda/colorDomain/ckmeans.js` — CJS port of simple-statistics' ckmeans (ISC license, from `references/avail-falcor/.../ckmeans.js`)
- `packages/dms-server/src/routes/uda/uda.colorDomain.controller.js` — method dispatcher + SQL
- `packages/dms-server/src/routes/uda/uda.colorDomain.route.js` — Falcor route (auto-discovered by `routes/index.js`)
- `packages/dms-server/tests/test-colorDomain.js` — 21 tests (12 unit + 9 integration, integration gated on env vars)
- `packages/dms-server/package.json` — added `test:colorDomain` npm script

**Files changed (client):**
- `patterns/mapeditor/MapEditor/index.jsx` — removed the Phase-2b TODO block, added the UDA call with filter passthrough and `is-loading-colorbreaks` state toggling
- `patterns/mapeditor/MapEditor/components/LayerEditor/Controls.jsx` — added `Quantile` and `Standard Deviation` options to the binning-method dropdown (previously `ck-means`, `equalInterval`, `custom` only)

**Test coverage:**
- ckmeans math: empty input, single value, all-identical, nClusters guard, standard docs example, ascending output, truncation to unique count, non-mutation, mixed-sign values
- Dispatcher: rejects missing column, rejects column-name injection
- Integration (7M-row view): all 4 methods return sensible shape, filters reduce count, numbins=2 returns 2 breaks, first break equals min, ckmeans threshold dispatches correctly to full/histogram paths

**Known limitations:**
- quantile on 5M+ rows is PG-sort bound (~15s). Users typically do this only on filter change, not on every render. Can be indexed per-column if a specific view needs faster.
- equalInterval on dirty columns (zeros as padding) produces skewed breaks. Document that `excludeZero: true` is the user-accessible fix.

**Manual verification still pending**:
- [ ] Open a choropleth map in the MapEditor against mitigat-ny-prod, switch binning method, confirm legend + paint update
- [ ] Switch between filtered/unfiltered modes (`filterGroupEnabled`) and verify breaks update
- [ ] Confirm `is-loading-colorbreaks` state shows a spinner in the UI (assumes the legend component reads that flag — worth a look)
- [ ] Regression: saved symbologies with cached `choroplethdata` still short-circuit the fetch (Node devtools: no `/graph` call with `colorDomain` when `viewGroupId === prevViewGroupId`)

### Phase 3: Cleanup of commented DAMA code in MapEditor — DONE (2026-04-17)

All touched:
- [x] `MapEditor/MapViewer.jsx` — removed commented DAMA blocks + unused `DamaSymbologyAttributes` / `get` imports. Also fixed typo `dataIems` → `dataItems` in dep array.
- [x] `MapEditor/index.jsx` — removed commented DAMA blocks at lines ~145-193, removed `DamaSymbologyAttributes` import, replaced the colorDomain `NEEDS NEW DMS ROUTES...MAYBE???` block with a concise `// TODO: Phase 2b` note pointing at the task.
- [x] `MapEditor/components/SymbologyViewLayer.jsx` — removed two commented DAMA useEffect blocks (~45 lines each).
- [x] `MapEditor/components/LayerManager/SymbologyControl/components/CreateSymbologyMenu.jsx` — removed the commented legacy `createSymbologyMap` (DAMA version).
- [x] `MapEditor/components/LayerManager/SymbologyControl/components/SaveChangesMenu.jsx` — removed commented `updateData`/`updateName`/`createSymbologyMap` (legacy DAMA versions), `updateDamaSymbology`/`updateDamaName`/`isDamaSymbology` remnants, the stale `onSubmit` copy, and the console.log trail.
- [x] `npm run build` — clean.

### Phase 4: Build the migration script — DONE (2026-04-18)

**Implementation**: `packages/dms-server/src/scripts/migrate-dama-symbologies.js` (CJS, ~330 lines).

**Final apply against mitigat-ny-prod / dms-mercury-3** (2026-04-18 12:13 UTC):
- 247 DAMA symbologies inserted as `map_editor_test|symbology` rows in `dms_mitigat_ny_prod.data_items`
- 2,217 map components rewritten — every `element-data.symbologies[<dama_id>]` entry rekeyed under the new DMS id, with `id` set, `symbology_id` cleared, `isDamaSymbology` set false
- 2 dangling DAMA refs (ids `183`, `200`) stripped (`--prune-dangling` default ON)
- ID map persisted to `scratchpad/mitigat-ny-prod/symbology-id-map.json`
- Total wall-clock: ~5 min (warm cache; cold-cache dry-run was ~8 min)

**Verification queries (post-apply)**:
- `SELECT COUNT(*) FROM dms_mitigat_ny_prod.data_items WHERE type='map_editor_test|symbology'` → 247 ✓
- Component 1022249 (was `symbology_id=172`) now references `id=2141990`, no symbology_id ✓
- `SELECT id FROM dms_mitigat_ny_prod.data_items WHERE type='map_editor_test|symbology' AND data->>'legacy_dama_symbology_id'='172'` → `id=2141990, name='County LHMP Status'` ✓
- `SELECT COUNT(*) FROM ... WHERE type LIKE '%|component' AND data->'element'->>'element-data' LIKE '%"symbology_id"%'` → 0 (was 2217) ✓

**Tests**:
- 12/12 unit tests pass for `planRewrite` (`tests/test-migrate-dama-symbologies.js`, npm script `test:migrate-dama-symbologies`)

**Implementation notes worth remembering**:
- Used keyset pagination (`WHERE id > $lastId ORDER BY id LIMIT N`) instead of `WHERE id = ANY($1::bigint[])` — the latter doesn't use the primary-key index efficiently and added ~70-100s/batch on cold cache.
- Project just `data->'element'->>'element-data'` as text, not the full `data` JSONB. Maps' full envelopes are 100KB+ each.
- Filter in SQL with `(data->'element'->>'element-data') LIKE '%symbology_id%'` to skip empty-symbology maps and DMS-native ones — drops scan size from 5,059 to 2,217.
- Batched output via `process.stderr.write()` not `console.log` — stdout is block-buffered when redirected, masking progress for long runs.
- In dry-run, populate a synthetic `newIdMap` (damaId → -damaId) so dangling detection only flags TRUE dangling refs, not "would-be-migrated" refs.
- `jsonb_set(data, '{element,element-data}', to_jsonb($::text), false)` to write the rewritten JSON-string-in-JSONB cleanly.

**Location**: `src/dms/packages/dms-server/src/scripts/migrate-dama-symbologies.js`

**Arguments**:
- `--dama-config <name>` — DAMA DB config (default `hazmit_dama`)
- `--dms-config <name>` — DMS DB config (default `dms-mercury-3`)
- `--app <name>` — DMS app to migrate into (default `mitigat-ny-prod`)
- `--pattern-instance <slug>` — pattern instance to own the symbologies (default `symbologies`; pattern must already exist)
- `--create-pattern` — if set, create the pattern row if not present
- `--apply` — without this, dry-run only
- `--prune-dangling` — if set, strip references to non-existent DAMA symbology_ids from map component data

**Algorithm**:

1. **Preflight**
   - Connect to both DBs (use existing `db/config.js` + adapters so `--dama-config`/`--dms-config` work uniformly).
   - Ensure target pattern exists (`SELECT * FROM {schema}.data_items WHERE app = $1 AND type LIKE '%|' || $2 || ':pattern'`). If missing and `--create-pattern` not set, abort with a helpful message. If `--create-pattern` set, create a mapeditor pattern row — include `{ name: 'Symbologies', pattern_type: 'mapeditor' }` and add its ref to the site row's `data.patterns` array.

2. **Fetch DAMA symbologies**
   - `SELECT * FROM data_manager.symbologies` — all 247 rows.
   - Build an index: `damaById: Map<symbology_id, { name, description, symbology, metadata, categories, collection_id, source_dependencies, created, modified }>`.

3. **Plan migration**
   - For each DAMA row, build a DMS `data_items` insert:
     ```js
     {
       app: 'mitigat-ny-prod',
       type: `${patternInstance}|symbology`,  // e.g., 'symbologies|symbology'
       data: {
         name: d.name,
         description: d.description || 'map',
         symbology: d.symbology,                // preserve verbatim
         metadata: d.metadata,
         categories: d.categories,              // preserve jsonb shape even if oddly-nested
         legacy_dama_symbology_id: d.symbology_id,
         legacy_collection_id: d.collection_id,
         legacy_source_dependencies: d.source_dependencies,
         _migrated_at: new Date().toISOString(),
       }
     }
     ```
   - Don't preserve DAMA timestamps — new rows get new DMS timestamps (created_at/updated_at defaults). Keep the old ones in `data._migrated_from_created` if traceability matters.

4. **Write symbology rows**
   - Use the controller's `createData` path *or* direct INSERT into the per-app schema. Simpler: direct INSERT. Batch 50-100 rows per transaction. Capture returned IDs.
   - Build the ID map: `damaToDmsId: Map<dama_symbology_id, new_dms_row_id>`.
   - Dry-run: print the plan (247 rows to insert) and a sample of 3 planned INSERTs, then exit.

5. **Rewrite map components**
   - Query all map components:
     ```sql
     SELECT id, data
     FROM dms_mitigat_ny_prod.data_items
     WHERE type LIKE '%|component'
       AND data->'element'->>'element-type' IN (
         'Map','MapDama','Map: NRI','Map: Fusion Events Map',
         'Map: FEMA Disaster Loss','Map: Buildings','Map: Dama Map'
       )
     ```
   - For each component:
     a. Extract `data.element["element-data"]` (it's a JSON-encoded string).
     b. Parse; access `ed.symbologies`.
     c. For each `[key, value]` in `ed.symbologies`:
        - If `value.symbology_id` is set and `!value.id`, this is a DAMA ref.
        - Look up `damaToDmsId[value.symbology_id]`:
          - **Hit**: replace the entry:
            ```js
            newSym = {
              ...value,
              id: newDmsId,                  // use new DMS id
              symbology_id: undefined,        // clear
              symbology: {
                ...value.symbology,
                id: newDmsId,                 // nested id update
                isDamaSymbology: false        // clear flag
              }
            }
            ed.symbologies[newDmsId] = newSym;  // rekey under new id
            delete ed.symbologies[key];
            ```
          - **Miss** (dangling ref, e.g., 183/200): if `--prune-dangling`, delete the entry; otherwise leave in place and log.
     d. Serialize `ed` back to a JSON string, re-embed in `data.element["element-data"]`.
     e. UPDATE the row.

6. **Idempotency & safety**
   - The script should be safe to run twice: already-migrated DAMA rows (present as DMS rows with `legacy_dama_symbology_id` set) should be detected and skipped (rebuild the ID map from existing DMS rows).
   - Check-constraint before UPDATE: if `ed.symbologies[key].symbology_id` is already absent (already migrated), skip the component.
   - Wrap the map-component rewrite in a transaction per batch of, say, 500 rows.

7. **Report**
   - Print a summary at the end:
     ```
     === Migration Report ===
     DAMA symbologies: 247 migrated (0 skipped as already present)
     Pattern: mitigat-ny-prod / symbologies|symbology (id 1920082)
     Map components scanned: 5036
     Map components with DAMA refs: 2193
     Map components rewritten: 2193
     Map components with dangling refs (IDs 183, 200): N (stripped / left in place)
     ID map written to: scratchpad/mitigat-ny-prod-symbology-id-map.json
     ```
   - Persist the ID map to `scratchpad/mitigat-ny-prod/symbology-id-map.json` for audit + rollback.

### Phase 5: Test and verify against mitigat-ny-prod — NOT STARTED

- [ ] Dry-run the script against dms-mercury-3 + hazmit_dms. Eyeball the plan.
- [ ] `--apply` against a test or staging instance first if available.
- [ ] Smoke-test maps in mitigat-ny-prod after apply:
  - Pick 5 random rewritten map components from different patterns (e.g., one from `mitigateny_sullivan`, one from `putnamcsc`, one from `mitigateny_westchester`, one from `redesign2`, one from `sullivan_entry_test_domain`).
  - Load each in the browser, verify the symbology renders and layers/filters/popovers work.
  - Confirm SymbologySelector no longer hits DAMA routes (network tab: no `graph` requests with `dama[pgEnv].symbologies` paths).
- [ ] Create a NEW symbology in the MapEditor. Confirm its DB row has type `symbologies|symbology` (or whatever pattern instance we chose), not the pattern type.
- [ ] Run the script a second time. It should migrate 0 rows (idempotent check).

### Phase 6: Rollback plan — DOCUMENTED (2026-04-18)

**Two-step rollback** if the migration needs to be reversed in mitigat-ny-prod:

**Step 1 — Delete migrated symbology rows** (safe; the source DAMA table is untouched):

```sql
DELETE FROM dms_mitigat_ny_prod.data_items
WHERE app = 'mitigat-ny-prod'
  AND type = 'map_editor_test|symbology'
  AND data ? 'legacy_dama_symbology_id';
```

This wipes only the rows the migration created (the `legacy_dama_symbology_id` predicate is the canary — non-migrated symbologies someone added later won't have it).

**Step 2 — Reverse-rewrite map components** using the persisted ID map at `packages/dms-server/scratchpad/mitigat-ny-prod/symbology-id-map.json`:

```bash
node src/scripts/migrate-dama-symbologies.js \
  --dama-config hazmit_dama \
  --dms-config dms-mercury-3 \
  --app mitigat-ny-prod \
  --pattern-instance map_editor_test \
  --reverse \
  --apply
```

The `--reverse` flag is **not yet implemented** — would need to be added if we ever need to roll back. The shape would be: load the ID map (it's `dama_id → dms_id`), invert it, run the same scan-and-rewrite logic but rewriting `id → symbology_id` and reverting the rekey. ~30 min of work to add.

**Manual fallback** (no `--reverse` flag needed):
- Pull each affected component's current `element-data`, parse, and for every `symbologies[<dms_id>]` entry, look up the original `dama_id` via `JSON.parse(fs.readFileSync('symbology-id-map.json'))` (inverted), rebuild the entry with `symbology_id: <dama_id>`, `id: undefined`, write back via the same `jsonb_set` path.
- For 2,217 components this is identical work to the forward script, just inverted.

**The source DAMA table** (`hazmit_dms.data_manager.symbologies`) was not modified by the migration, so its data is the canonical fallback for any symbology lookups during a rollback.

**Retention recommendation**: keep the ID map and the DAMA table intact for at least 90 days post-cutover before considering either deletable.

### Phase 7: Remove the DAMA symbology-serving infrastructure

Out of scope for the implementation task, but noted for follow-up:

- Once mitigat-ny-prod (and any other active sites) are migrated, the `dama[pgEnv].symbologies.*` routes in the legacy DAMA server can be removed.
- The `data_manager.symbologies` table on `hazmit_dms` can be dropped after a retention period (e.g., 90 days post-cutover).

## Files to change

### Client
- `patterns/page/components/sections/components/ComponentRegistry/index.jsx` — **DONE (Phase 1b)**: renamed `MapDama` key to `"Map: Dama Map"`
- `patterns/page/components/sections/components/ComponentRegistry/map/SymbologySelector.jsx` — drop DAMA loader
- `patterns/page/components/sections/components/ComponentRegistry/map/SymbologyViewLayer.jsx` — DAMA → UDA source/view/data paths
- `patterns/mapeditor/siteConfig.jsx` — use `initializePatternFormat` so `format.type = {instance}|symbology`
- `patterns/mapeditor/MapEditor/index.jsx` — re-wire `colorDomain` to `uda[pgEnv].viewsById[viewId].colorDomain[...]`; delete commented DAMA blocks
- `patterns/mapeditor/attributes.jsx` — delete `DamaSymbologyAttributes`
- `patterns/mapeditor/MapEditor/MapViewer.jsx` — delete commented DAMA blocks
- `patterns/mapeditor/MapEditor/components/SymbologyViewLayer.jsx` — delete commented DAMA blocks
- `patterns/mapeditor/MapEditor/components/LayerManager/SymbologyControl/components/CreateSymbologyMenu.jsx` — delete commented DAMA block
- `patterns/mapeditor/MapEditor/components/LayerManager/SymbologyControl/components/SaveChangesMenu.jsx` — delete commented DAMA blocks

### Server / scripts
- `packages/dms-server/src/routes/uda/uda.colorDomain.route.js` (+ controller) — NEW UDA route for server-side choropleth break calculation (Phase 2b)
- `packages/dms-server/src/scripts/migrate-dama-symbologies.js` — NEW migration script (Phase 4)
- `packages/dms-server/tests/test-colorDomain.js` — NEW tests for the colorDomain route

### Data artifacts (gitignored scratchpad)
- `scratchpad/mitigat-ny-prod/symbology-id-map.json` — generated during apply, needed for rollback
- `scratchpad/mitigat-ny-prod/migration-report-YYYYMMDD.txt` — audit log

## Testing Checklist

- [x] `Map: Dama Map` components render instead of showing "Component Map: Dama Map Not Registered" (Phase 1b done)
- [x] After `--apply`: `dms_mitigat_ny_prod.data_items WHERE type = 'map_editor_test|symbology'` has 247 rows; each has `data.legacy_dama_symbology_id` (verified)
- [x] After apply: components with `"symbology_id"` field drops from 2,217 to 0 (verified)
- [x] Component 1022249 (was symbology_id=172) now references the new DMS row id 2141990 (verified)

**Bug fixed during Phase 5 testing (2026-04-18):**
- UDA `dataById` controller hardcoded the PK column to `id`, but DAMA `gis_datasets` tables (and other older DAMA tables) use `ogc_fid` as PK. Hover popups in migrated maps returned `column "id" does not exist`. Fixed in `packages/dms-server/src/routes/uda/uda.controller.js`: added `resolvePrimaryKey(db, schema, table)` helper that queries `pg_index`/`pg_attribute` and caches per-table; the SQL aliases the result column as `id` so the response shape stays unchanged for downstream consumers. Verified end-to-end: `dataById('hazmit_dama', 1239, [702], ['bldg_scheme'])` now returns `[{id: 702, bldg_scheme: 'NY1'}]`.

**Manual browser smoke tests still needed (Phase 5):**
- [ ] New symbologies created in the MapEditor have type `map_editor_test|symbology` (Phase 1a)
- [ ] `colorDomain` fetch succeeds from a dev MapEditor for choropleth and circles layers; legend updates on method/numbins changes (Phase 2b)
- [ ] Page-pattern SymbologySelector no longer makes `dama[pgEnv].symbologies.*` calls; loads symbologies exclusively from DMS (Phase 2)
- [ ] Map components in 5 patterns load correctly in the browser, symbology renders, filters/popovers work, choropleth binning recalculates without stale-cache hacks. Suggested patterns to spot-check: `mitigateny_sullivan` (198 affected), `putnamcsc` (233), `mitigateny_westchester` (99), `redesign2` (163), `sullivan_entry_test_domain` (144).
- [ ] Open a `Map: Dama Map` component (any of the 171) — confirm map_dama renders with a populated symbology picker.
- [ ] No network calls to `dama[pgEnv].symbologies.*` from the running app (verified in browser devtools)
- [x] Re-running the migration script is a no-op (idempotent) — verified 2026-04-18: re-run reports "Already migrated (skipped): 247 / Would migrate: 0 / Components needing rewrite: 0" in ~15 seconds (SQL filter finds 0 components still containing `symbology_id`)

## Open Questions

1. ~~Which pattern owns the migrated symbologies?~~ **Resolved**: keep `map_editor_test`, script takes `--pattern-instance` arg.
2. **Sibling MapDama element-type** — There are 171 `Map: Dama Map` components. Are they structurally identical to regular `Map` components (just a different name + element-type), or do they have a different data shape? The registry fix in Phase 1b made them render; confirm during Phase 5 smoke tests that their symbology data is shaped the same as `Map` components so the migration script's ref-rewriter handles them uniformly.
3. **Are there maps in OTHER sites (`dms_asm`, `dms_wcdb`, etc.) that also reference DAMA symbologies?** — Not in scope for this task, but cheap to check at Phase 4 kickoff with a cross-schema query. If yes, run the script per-app with the appropriate `--pattern-instance`.
4. **What happens to new symbologies someone creates in the MapEditor today, before Phase 1a ships?** — They get created under `type = 'prod|map_editor_test:pattern'` (wrong child type). **Phase 1a is the hotfix to stop creating more broken rows.** Consider landing 1a ahead of 2-7.
5. **colorDomain binning methods**: confirm the exact set the legacy DAMA endpoint supported (probably equalInterval, quantile, jenks, standardDeviation, maybe logarithmic/geometric). Inspect `references/avail-falcor/dama/routes/symbology/colorDomain.js` or equivalent before Phase 2b coding.
6. **Where does the `ckmeans.js` helper live and is it server-usable?** — `packages/dms/src/patterns/mapeditor/ckmeans.js` exists on the client side. Check if it can be required from Node (server) as-is or needs porting to CJS/workspace-friendly form for the new UDA colorDomain route.

## Related tasks

- **`dama-server-port.md`** — the broader DAMA → dms-server migration. This task assumes that effort stays on track; we consume UDA routes it already delivers (sources, views, view data).
- **`dama-csv-analyzer.md`** — independent; no interaction with symbology migration.
- **`type-system-refactor.md`** (completed) — defines the `{parent}:{instance}|{rowKind}` scheme we must conform to. Our symbology rows use `{patternInstance}|symbology` (no instance name — like pages/components; identity = row ID).
