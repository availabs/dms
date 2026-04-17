# MapEditor: Migrate from DAMA to UDA + Port Symbologies into DMS

## Status: IN PROGRESS — Eric's MapEditor UDA commit landed; DATA MIGRATION and page-pattern cleanup still outstanding

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

### Phase 0: Shape decisions — NOT STARTED

These are the design choices that constrain the rest of the work. Resolve these before writing code/scripts.

#### 0.1 Where will migrated symbologies live?

**Decision point**: In `dms_mitigat_ny_prod`, create a mapeditor pattern to hold all migrated + future-created symbologies. Options:

- **Option A** *(recommended)*: Replace/rename the existing `prod|map_editor_test:pattern` to `prod|symbologies:pattern` (or `prod|maps:pattern`). Pattern instance `symbologies`. Migrated rows get type `symbologies|symbology`.
- **Option B**: Leave `map_editor_test` alone (as a test/demo), create a new parallel pattern `prod|symbologies:pattern`. Same outcome for the migrated rows but leaves clutter.
- **Option C**: Keep the existing test pattern name. Migrated rows get type `map_editor_test|symbology`. Functionally fine but the name is misleading.

Open question: does the MapEditor pattern need to be *per-site* (one pattern per DMS site in dms-mercury-3) or is one *per-app* (`mitigat-ny-prod`) enough? The site row has 39 patterns; the MapEditor pattern only needs to exist inside this one app. Recommended: one pattern per app.

#### 0.2 Migrate all 247 or only the 89 referenced?

**Decision**: migrate all 247. Reasons:
- The unreferenced ones are cheap to copy (~247 rows, small JSON).
- Users may later discover they want one; easier than re-running migration.
- The script needs to scan all 247 anyway to build the ID-map.

#### 0.3 How to handle the 2 dangling refs (183, 200)?

**Decision**: leave the dangling symbology entry in place in the map component's `element-data.symbologies` (it'll stay broken), but log it in the migration report so someone can follow up. Alternatively, strip those entries entirely so the map just renders with no symbology picked (probably better UX — pickable from SymbologySelector again). Pick the strip approach — simpler downstream.

#### 0.4 What collision-resistant slug do we give each migrated symbology?

Options:
- `nameToSlug(sym.name)` — readable, but 247 rows with duplicate names will collide; need suffixing
- `s{symbology_id}` — unique, unreadable, but stable across re-runs
- `{nameToSlug(name)}_{symbology_id}` — readable AND unique

**Decision**: symbology rows don't use an instance name in the type column — the type is just `{patternInstance}|symbology` (like pages and components). The row's identity is its numeric DMS id. The `symbology_id` from DAMA goes into a `data.legacy_dama_symbology_id` field for traceability.

#### 0.5 Do we need to preserve `collection_id`?

Only 17 rows have one. Drop it into `data.legacy_collection_id` for reference but don't give it meaning in the new scheme.

### Phase 1: Fix `mapeditor.format.js` + `siteConfig.jsx` type construction — NOT STARTED

**File**: `patterns/mapeditor/siteConfig.jsx`

- [ ] Replace the ad-hoc `format.type = type;` with the same `initializePatternFormat(format, app, instanceName)` flow used by other patterns. Compute `instanceName = getInstance(type) || type` using `utils/type-utils.js`. After initialization, `format.type` should be `{instance}|symbology`.
- [ ] Make sure `falcor.call(["dms","data","create"], [app, format.type, newSymbology])` downstream picks up the new `format.type`.
- [ ] Verify with a unit-style check: create a symbology via the MapEditor in dev, confirm the resulting `data_items` row has type `{pattern_instance}|symbology` (e.g., `symbologies|symbology`), not `prod|symbologies:pattern`.

**File**: `patterns/mapeditor/mapeditor.format.js`

- [ ] No change to the definition — `type: "symbology"` is the leaf `rowKind` the format initializer prepends the instance to.

**File**: `patterns/mapeditor/MapEditor/components/LayerManager/SymbologyControl/components/CreateSymbologyMenu.jsx` and `SaveChangesMenu.jsx`

- [ ] Confirm that `type` consumed from `MapEditorContext` is now the correct child type (`{patternInstance}|symbology`), not the parent pattern type. Eric's refactor relied on this being correct; our fix in `siteConfig.jsx` closes the loop.

### Phase 2: Finish page-pattern cleanup — NOT STARTED

**File**: `patterns/page/components/sections/components/ComponentRegistry/map/SymbologySelector.jsx`

- [ ] Drop the `dama[pgEnv].symbologies.length/byIndex` fetch (the `useEffect` at line 11 + the `damaSymbologies` `useMemo`).
- [ ] Keep the `doApiLoad()` DMS path and consume only that.
- [ ] The merged `symbologies` variable collapses to just `dmsSymbologies`.
- [ ] `SymbologySelector` uses `FilterableSearch` from `./tmp-cache-files/FilterableSearch.jsx` — acknowledged in the prior cleanup; leave as-is.

**File**: `patterns/page/components/sections/components/ComponentRegistry/map/SymbologyViewLayer.jsx`

- [ ] Replace active `dama[pgEnv].sources.byId.attributes.metadata` calls with `uda[pgEnv].sources.byId.metadata` (UDA doesn't nest under `.attributes`).
- [ ] Replace active `dama[pgEnv].viewsbyId.databyId` calls with `uda[pgEnv].viewsById.dataById` (case change: `viewsbyId`→`viewsById`, `databyId`→`dataById`).
- [ ] Delete commented DAMA blocks while you're in there.

**File**: `patterns/mapeditor/attributes.jsx`

- [ ] Delete `DamaSymbologyAttributes` export. Nothing imports it after Eric's commit.

### Phase 3: Cleanup of commented DAMA code in MapEditor — NOT STARTED

Delete the commented-out DAMA blocks Eric left in place. Affected files from his commit:

- `MapEditor/MapViewer.jsx` (lines ~41-83)
- `MapEditor/index.jsx` (lines ~145-180, 683-686)
- `MapEditor/components/SymbologyViewLayer.jsx` (lines ~505-663)
- `MapEditor/components/LayerManager/SymbologyControl/components/CreateSymbologyMenu.jsx` (lines 37-68, 46-62)
- `MapEditor/components/LayerManager/SymbologyControl/components/SaveChangesMenu.jsx` (lines 67-76, etc.)

This is low-risk mechanical cleanup; do it after Phase 2 so the codebase is clean for review.

### Phase 4: Build the migration script — NOT STARTED

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

### Phase 6: Rollback plan

Keep the DAMA `data_manager.symbologies` table intact during and after migration — DO NOT drop or alter it. The ID map in `scratchpad/` plus the `legacy_dama_symbology_id` field lets us invert the mapping if we need to reverse changes in mapcomponents. To roll back:

1. Delete the migrated DMS rows: `DELETE FROM dms_mitigat_ny_prod.data_items WHERE type LIKE '%|symbology' AND (data->>'_migrated_at') IS NOT NULL`.
2. Re-run a reverse ref-rewriter that maps new DMS ids back to old DAMA symbology_ids using the saved ID map.

### Phase 7: Remove the DAMA symbology-serving infrastructure

Out of scope for the implementation task, but noted for follow-up:

- Once mitigat-ny-prod (and any other active sites) are migrated, the `dama[pgEnv].symbologies.*` routes in the legacy DAMA server can be removed.
- The `data_manager.symbologies` table on `hazmit_dms` can be dropped after a retention period (e.g., 90 days post-cutover).

## Files to change

### Client
- `patterns/page/components/sections/components/ComponentRegistry/map/SymbologySelector.jsx` — drop DAMA loader
- `patterns/page/components/sections/components/ComponentRegistry/map/SymbologyViewLayer.jsx` — DAMA → UDA source/view/data paths
- `patterns/mapeditor/siteConfig.jsx` — use `initializePatternFormat` so `format.type = {instance}|symbology`
- `patterns/mapeditor/attributes.jsx` — delete `DamaSymbologyAttributes`
- `patterns/mapeditor/MapEditor/MapViewer.jsx` — delete commented DAMA blocks
- `patterns/mapeditor/MapEditor/index.jsx` — delete commented DAMA blocks
- `patterns/mapeditor/MapEditor/components/SymbologyViewLayer.jsx` — delete commented DAMA blocks
- `patterns/mapeditor/MapEditor/components/LayerManager/SymbologyControl/components/CreateSymbologyMenu.jsx` — delete commented DAMA block
- `patterns/mapeditor/MapEditor/components/LayerManager/SymbologyControl/components/SaveChangesMenu.jsx` — delete commented DAMA blocks

### Server / scripts
- `packages/dms-server/src/scripts/migrate-dama-symbologies.js` — NEW migration script

### Data artifacts (gitignored scratchpad)
- `scratchpad/mitigat-ny-prod/symbology-id-map.json` — generated during apply, needed for rollback
- `scratchpad/mitigat-ny-prod/migration-report-YYYYMMDD.txt` — audit log

## Testing Checklist

- [ ] Dry-run migration on dms-mercury-3 prints a sensible plan (247 symbologies → new pattern, 2193 components to rewrite, 2 dangling refs flagged)
- [ ] After `--apply`: `dms_mitigat_ny_prod.data_items WHERE type LIKE '%|symbology'` has 247 rows; each has `data.legacy_dama_symbology_id`
- [ ] After apply: `dms_mitigat_ny_prod.data_items WHERE type LIKE '%|component'` still has 5036 map components (no count change), but `data::text LIKE '%symbology_id%' AND NOT LIKE '%"id"%'` drops to near-zero (only dangling/stripped)
- [ ] Map components in 5 patterns load correctly in the browser, symbology renders, filters/popovers work
- [ ] MapEditor creates new symbologies with type `{patternInstance}|symbology`, visible in the source table
- [ ] No network calls to `dama[pgEnv].symbologies.*` from the running app (verified in browser devtools)
- [ ] Re-running the migration script is a no-op (idempotent)
- [ ] Rollback plan works: re-apply creates no new rows; deleting migrated rows + re-running reverse-rewriter restores old refs

## Open Questions

1. **Which pattern owns the migrated symbologies?** (Phase 0.1) — Recommended: rename `map_editor_test` to `symbologies`, or create a new `symbologies` pattern and drop the test one later. Needs user input.
2. **Sibling MapDama element-type** — There are 171 `Map: Dama Map` components. Are they structurally identical to regular `Map` components (just a different name), or do they use a different data shape? Migration script should handle both; quick code-level check needed to confirm.
3. **Are there maps in OTHER sites (`dms_asm`, `dms_wcdb`, etc.) that also reference DAMA symbologies?** — Not in scope for this task, but if yes, the script needs to be run per-app or extended. Cheap to check at Phase 4 kickoff.
4. **What happens to new symbologies someone creates in the MapEditor today, before this task ships?** — They'll be created under `type = 'prod|map_editor_test:pattern'` (wrong child type, because of the bug in `siteConfig.jsx`). Phase 1 is the first thing to ship to stop creating more broken rows. Consider landing Phase 1 as a hotfix before the rest of the work.

## Related tasks

- **`dama-server-port.md`** — the broader DAMA → dms-server migration. This task assumes that effort stays on track; we consume UDA routes it already delivers (sources, views, view data).
- **`dama-csv-analyzer.md`** — independent; no interaction with symbology migration.
- **`type-system-refactor.md`** (completed) — defines the `{parent}:{instance}|{rowKind}` scheme we must conform to. Our symbology rows use `{patternInstance}|symbology` (no instance name — like pages/components; identity = row ID).
