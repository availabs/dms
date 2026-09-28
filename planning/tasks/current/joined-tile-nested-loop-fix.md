# Joined map tiles — nested-loop blowup in the MVT join query

**Initiatives:** [dms_map_stack](../../../../../planning/initiatives/dms_map_stack.md) · **Status:** next (was: "DIAGNOSED + fix verified, then REVERTED — NOT APPLIED.") · **Created by:** rdubowsky@albany.edu · **Edited by:** —

**Status: DIAGNOSED + fix verified, then REVERTED — NOT APPLIED.** The code change was backed out
on 2026-09-18 once macroview stopped using a tile join at all (it resolves its columns on hover
instead), leaving the fix with no consumer. This document is kept because **the bug is real, still
present, and generic to every joined map layer** — the next person to put a Postgres-side join on a
map tile will hit it, and the diagnosis below is the expensive part.

To apply it, the change is two lines in `packages/dms-server/src/dama/tiles/tiles.rest.js` (see
**Fix**). · **Found by:** the MacroView roadname/direction work
(`planning/transportny/tasks/current/macroview-hover-roadname-direction.md` in the parent repo).

## Symptom

Any symbology layer with `join.enabled` served tiles an order of magnitude slower than the same
layer without the join. Worst measured case on the macroview PM3 layer (geometry view 3740 ⋈ network
view 984), tile `10/302/377`, 1299 features: **8.5s against the deployed server, 13.7s locally**,
versus ~0.27s for the same tile with no join. Not a cache artifact — plain tiles measured the same
cache-busted, and the joined timing reproduced identically across three consecutive runs.

## Root cause

PostgreSQL 12+ **inlines a CTE that is referenced exactly once**. In the tile query both
`joined_cte` and `tile_keys` are single-reference, so both were inlined into the final LEFT JOIN.
A CTE's cardinality is opaque to the planner — it estimated `rows=1` for each — so it chose a
**nested loop** and re-executed the entire join subquery once per outer row:

```
Nested Loop Left Join  (actual time=32.767..8565.841 rows=1299 loops=1)
  Join Filter: (tile_geo.join_value = (...tmc)::text)
  Rows Removed by Join Filter: 1686102
  Buffers: shared hit=6754750
    ->  CTE Scan on tile_geo   (rows=1299 loops=1)
    ->  Nested Loop            (rows=1299 loops=1299)   ← inner side re-run 1299 times
```

1.69M rows discarded by the join filter, 6.75M buffers touched, to produce 1299 features.

## Fix

Force the CTEs to materialize so the join plans as a hash join — **PG branch only**:

```js
const tileKeysCte = joinCtx.dbType === 'pg' ? 'tile_keys AS MATERIALIZED' : 'tile_keys AS';
const joinedCte   = joinCtx.dbType === 'pg' ? 'joined_cte AS MATERIALIZED' : 'joined_cte AS';
```

**Scoped to PG deliberately.** Every consumer of this feature that existed before macroview
(the NPMRDS report route maps — `composeMapConfig.js` and `convert_old_reports_lib/route_map.py`)
uses the **ClickHouse** branch, where the joined rows are already a materialized in-memory array by
the time Postgres sees them (`chResultToRecordset` → jsonb). Measured on a 1299-row payload:
**50.4 / 49.0ms inlined vs 48.9 / 48.3ms materialized** — a wash. So CH keeps the original SQL text
byte-for-byte and takes zero risk, while PG gets the 21x win. Widen it later only if a CH
`joined_cte` ever becomes expensive on its own.

- `tile_geo` needs no keyword — it is referenced twice (`tile_keys` + `mvtgeom`) and is therefore
  already materialized by the same PG12 rule. That is why its own timing was always small.
- `tile_keys` is materialized **only on the PG branch**. On the CH branch it is deliberately
  unreferenced (keys are resolved in a separate pass) and must stay inlineable so Postgres keeps
  pruning it rather than computing a DISTINCT nothing reads.
- `joined_cte` is materialized on **both** branches — on CH it wraps a `jsonb_to_recordset` call
  that would otherwise be re-parsed per outer row.

Requires PG12+; the server is 16.3.

## Measured result (same tiles, same server)

| tile | before | after | speedup |
|---|---|---|---|
| 10/302/377 | 13.75s | **0.476s** | 29× |
| 12/1208/1510 | 2.13s | **0.110s** | 19× |

EXPLAIN on the isolated query: **8566ms → 403ms** (21×). Tiles are **byte-identical** before and
after (91,298b and 29,530b) and decode to the same properties, so this changes the plan only, never
the output.

Residual join overhead is now +13ms to +318ms per tile depending on density — down from +13.5s.

## Regression checks

- **Plain (non-joined) tiles** — untouched code path (`getTileData` is a separate function);
  re-verified live at 200 / 26,475b / 0.135s.
- **CH branch** — the ClickHouse query executes *before* the PG tile statement and is unaffected.
  The only CH-branch change is the PG statement wrapping `jsonb_to_recordset`; that exact shape was
  run directly against Postgres with `MATERIALIZED` and behaves correctly (504 features, `tile_keys`
  still pruned as unreferenced, no error).

## Not done

The pm3 view `s2135_v3740_pm3_v6_2025` carries **no indexes at all**, not even a GIST on
`wkb_geometry`, so the base tile query seq-scans its geometries. That is a DAMA-side data question
(and a write to a shared DB), deliberately left alone here.

## Incident 2026-09-18 — why this fix is urgent, not cosmetic

While testing the macroview join **before** this fix was deployed, the statewide view degraded the
shared `npmrds2` database badly enough that `dmsserver.availabs.org`'s tile route stopped responding
entirely (root still answered in 0.17s; every tile request timed out at 60s).

**Mechanism, in order:**

1. At statewide zoom MapLibre requests many tiles at once. With the nested-loop plan each joined
   tile ran for **minutes**.
2. The browser gave up on each request — but **an HTTP timeout does not cancel the Postgres query**.
   The backend kept executing.
3. MapLibre re-requests tiles on every pan/zoom, so the pile grew instead of draining. Peak observed:
   **19 concurrent multi-minute queries, 100% of the DB's active queries**, oldest 17m26s.
4. Connections were never exhausted (39/100) — this was CPU/IO saturation, which is why a plain
   `GET /` still answered instantly while anything touching the DB starved.

**Compounding factor worth remembering:** a **stale browser tab** kept the incident alive after the
feature was toggled off. That tab still held the pre-change JS, so it kept aiming joined requests at
the *deployed* (unfixed) server. Reloading is not enough — a background tab keeps fetching; the tabs
have to be closed. Queries were identifiable as unfixed by the absence of `AS MATERIALIZED` in
`pg_stat_activity.query`, which is what proved they were not coming from the patched local server.

**Recovery:** `pg_cancel_backend()` over `state='active' AND query ILIKE '%joined_cte%'` (read-only
SELECTs, so nothing to roll back), then closing the stale tabs. DB went to 0 active queries and the
deployed tile route returned to 0.21s/0.26s — its pre-incident baseline.

**Nothing was written to any database at any point**, and no commit or push occurred; the damage was
entirely runaway *read* queries.

**Therefore:** the deployed server stays exposed to this until this fix ships. Any joined map layer
at low zoom can reproduce it — this is not macroview-specific.

## Companion change — `didJoinChange` (ALSO REVERTED, not applied)

Kept for the same reason: the gap is real, it just has no consumer today.



The runtime never watched a layer's `join` for changes:

```js
const shouldApplyFilters = didFilterGroupColumnsChange || didDataColumnChange
                         || didFilterChange || didDynamicFilterChange;   // no join
```

`shouldApplyFilters` is what re-runs `getLayerTileUrl`, and the join is what supplies that url's
`join=` param. So a layer could ask for a different join — or none — and keep serving tiles built
from the previous one, silently. Added:

```js
const didJoinChange =
  !isEqual(layerProps?.join, prevLayerProps?.join) ||
  !isEqual(layerProps?.["linked-data"], prevLayerProps?.["linked-data"]);
```

This was never needed before because nothing changed a join at runtime — the feature was written
with one consumer, which sets `join` as the layer is built.

**Inertness verified by grep, not argument.** Repo-wide, the only code that `set()`s a layer's
`join` on an existing layer is `macroview/dataUpdate.jsx:172` and `:199`. `composeMapConfig.js:312`
and `route_map.py:352` write `join:` inside a **freshly-built layer literal** — and re-picking a Map
measure mints a new layer id (`route_${measureKey}_${year}`), so that path remounts rather than
diffing. The `join: { sources: {} }` occurrences in `qa_skills/tools/builds/*.mjs` and
`ScheduleGrid.config.jsx` are the **dataWrapper/UDA** join for Card/Spreadsheet sections, a
different field that never reaches this component. So `isEqual` returns true forever for every
pre-existing layer and this adds no rebuild they were not already getting.

## Why both changes were reverted

Macroview no longer joins in the tile. Its `road`/`direction` are resolved by the interaction
path's existing on-demand join fetch, which the popup pays for anyway — that layer's popup was
ALREADY doing an attribute round trip for its base columns (`tmc`/`county`/`region_code`) on every
hover, so baking joined columns into every tile bought no responsiveness and made every tile more
expensive. With no tile join there is nothing for `MATERIALIZED` to speed up and nothing toggling a
join at runtime for `didJoinChange` to notice.

The one change that DID ship is a 3-line guard in `SymbologyViewLayer.jsx`'s `buildJoinParam`:
`if (joinConfig.hoverOnly) return ""`. `layer.join` feeds both the tile-url builder and the
interaction path, and a layer that wants only the second had no way to say so. Measured: an
empty `tileColumns` costs exactly as much as a full one (tile 6/18/23: 1.41s with no join param,
30s server timeout with a join carrying `tileColumns: []`), because Postgres cannot plan away an
unused LEFT JOIN over a CTE.
