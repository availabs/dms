# UDA `getEssentials` source-id lookup is ambiguous when multiple sources share an instance

## Objective

Fix `getEssentials()` in `packages/dms-server/src/routes/uda/utils.js` so it deterministically resolves the correct source for a `{source_instance}|{view_id}:data` query, even when more than one source row shares the same instance segment under different owner rows. Today it picks `ORDER BY id DESC LIMIT 1`, which silently misroutes queries to whichever source happens to have the larger id.

## Reproducer (the "Songs" incident — 2026-04-24)

- Existing songs source: id `1066383`, type `alex_data_env|songs:source`, owned by dmsEnv `2060502`. View `1066384` is its only view; data lives in `dms_asm.data_items__s1066383_v1066384_songs` (24 rows).
- `upload-songs.mjs` (the test script for `/dms-admin/:app/file_upload`) created a second source with `source_name: "Songs"` → `nameToSlug("Songs") = "songs"` → type `alex_data_env|songs:source`. New id `2060573`.
- Both rows match `type LIKE '%|songs:source'`. `getEssentials` picks id `2060573` via `ORDER BY id DESC LIMIT 1`, builds split table name `data_items__s2060573_v1066384_songs`, `ensureTable` auto-creates it empty, every query returns 0 rows.
- Downstream: song detail page `/song?title=…` shows baked filter data briefly, then the URL-param refetch lands in the wrong empty table and the UI flickers to empty. Live site homepage list disappears for the same reason.

Band-aid applied in the incident: renamed source 2060573 to `alex_data_env|practice_recordings:source` and its 10 views to `practice_recordings|v{N}:view`. The 409 collision guard in `/dms-admin/:app/file_upload` prevents a recurrence from that entry point. This task is the proper server-side fix.

## Current State

`packages/dms-server/src/routes/uda/utils.js:162-184`:

```js
let sourceId = null;
if (isSplitType(type)) {
  // New format: {source}|{view}:data — look up source by instance name in type column
  const newParsed = parseSplitDataType(type);
  if (newParsed) {
    const srcRows = await db.query(
      `SELECT id FROM ${mainTbl} WHERE app = $1 AND type LIKE '%|' || $2 || ':source' ORDER BY id DESC LIMIT 1`,
      [app, newParsed.source]
    );
    sourceId = srcRows?.rows?.[0]?.id || null;
  } else {
    // Legacy format: {docType}-{viewId} — look up source by data.doc_type
    const parsed = parseType(type);
    if (parsed && parsed.docType) {
      const srcRows = await db.query(
        `SELECT id FROM ${mainTbl} WHERE app = $1 AND lower(${db.type === 'postgres' ? "data->>'doc_type'" : "json_extract(data, '$.doc_type')"}) = lower($2) AND (type LIKE '%|source' OR type LIKE '%:source') ORDER BY id DESC LIMIT 1`,
        [app, parsed.docType]
      );
      sourceId = srcRows?.rows?.[0]?.id || null;
    }
  }
}
```

Both branches assume "exactly one source row per instance" and fall back to "most recent id wins". That assumption is wrong — DMS allows duplicates and the `/dms-admin/:app/file_upload` flow was constructing them until today.

## Proposed Fix

The view row's own `type` column is not enough (it only encodes `{source_instance}|v{n}:view`, same ambiguity). But **the view row's owning source is reachable through the `data.views` back-reference on the source row**, or through the dmsEnv→sources→views chain. Either makes the lookup deterministic.

### Option A (preferred) — look up source by view membership

When `view_id` is available in the request (it always is for data queries — it's in the URL path `viewsById/{view_id}`), find the source whose `data.views[]` contains `view_id`. That's unambiguous:

```js
const srcRows = await db.query(
  dbType === 'postgres'
    ? `SELECT id FROM ${mainTbl}
         WHERE app = $1
           AND type LIKE '%|' || $2 || ':source'
           AND EXISTS (
             SELECT 1 FROM jsonb_array_elements(data->'views') v
              WHERE (v->>'id')::bigint = $3
           )
         LIMIT 1`
    : `SELECT id FROM ${mainTbl}
         WHERE app = $1
           AND type LIKE '%|' || $2 || ':source'
           AND EXISTS (
             SELECT 1 FROM json_each(json_extract(data, '$.views')) v
              WHERE CAST(json_extract(v.value, '$.id') AS INTEGER) = $3
           )
         LIMIT 1`,
  [app, newParsed.source, Number(view_id)]
);
```

- Correct when one source has the view — resolves to exactly that source.
- Correct when two sources share a slug but each owns different views — resolves to the one that actually owns `view_id`.
- Falls through to `null` when no source claims the view — current code path already handles that.

Same shape for the legacy-format branch (swap `type LIKE '%|' || $2 || ':source'` for the doc_type predicate).

### Option B (fallback / belt-and-suspenders) — tie-break by owner

When multiple sources match, the dmsEnv that owns the view's source is the disambiguator:

```
view 1066384 → data_items row with type like '{source_instance}|v{n}:view'
             → owning source has data.views containing {id: 1066384}
             → owning source id is in some dmsEnv's data.sources array
             → env in request has a matching dmsEnv somewhere
```

Too many hops for the hot path. Only worth adding if option A can't cover some edge case (it should).

### Option C — cache

Cache `(app, view_id) → source_id` on the controller. Invalidate on source/view create and delete. Nice to have for perf once correctness is fixed.

## Files Requiring Changes

**Modified**
- `packages/dms-server/src/routes/uda/utils.js:162-184` — swap the `ORDER BY id DESC LIMIT 1` lookup for the view-membership SQL in both the new-format and legacy-format branches. Thread `view_id` through from the caller (already in the `getEssentials` signature).

**Test**
- Add a regression test: create two `{app, type}`-equal sources under the same dmsEnv (both `alex_data_env|songs:source`), give each its own view + data rows, query each view via UDA, assert that the rows returned match the intended source — not the higher-id source.

## Testing Checklist

- [ ] Reproduce the bug by creating a second source with the same type on a test DB. Confirm UDA queries return rows from the wrong source under current code.
- [ ] Apply the fix. Re-run the same scenario. Confirm queries return the correct source's rows.
- [ ] Existing UDA tests still pass (`npm run test:uda` or the relevant suite in `packages/dms-server/tests/`).
- [ ] Spot-check the legacy-format branch: a source using old `{docType}-{viewId}` typing still resolves correctly when its doc_type is unique.

## Related

- Incident source: `2060573` / `practice_recordings` file-upload source (was `songs`).
- `src/dms/packages/dms-server/src/dama/upload/file-upload-dms-route.js` — now returns 409 on `(app, type)` collision (see task `file-upload-dms-backed.md`). Prevents *creating* the ambiguity from the file-upload path, but does not fix callers that already have duplicate rows from other code paths or imports.
