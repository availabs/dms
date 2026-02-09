# Fix Internal Source Blank Page

## Objective

Fix blank page at `/datasets/internal_source/1626200` (and any other internal source with similar data characteristics) while other internal_source pages work correctly.

## Root Cause

The blank page is caused by the guard at `sourcePageSelector.jsx:75`:

```jsx
if(!source.id && !source.source_id) return loading ? 'loading' : <></>;
```

When `source` has neither `id` nor `source_id`, the component returns an empty fragment.

### Why `source` has no ID

Two things combine to create this bug:

**1. DmsManager `item` is empty**

The `internal_source` route has `filter: { stopFullDataLoad: true }` and `action: 'edit'`. DmsManager fetches the record by ID via `['dms', 'data', 'byId', 1626200, attrs]`. The response goes through `processNewData` which filters records by `d.type === type`. If the config's `type` (pattern doc_type without `|source`) doesn't match the record's `type` (with `|source` suffix), the record is filtered out and `item = {}`.

**2. `getSourceData` doesn't include the source's own ID**

When `item` is empty, `sourcePageSelector` calls `getSourceData()` which queries UDA:
```
['uda', pgEnv, 'sources', 'byId', source_id, ExternalSourceAttributes]
```

`ExternalSourceAttributes` is:
```js
["source_id", "name", "display_name", "type", "update_interval",
 "category", "categories", "description", "statistics", "metadata"]
```

Note: `id` is NOT in this list. The `source_id` attribute is a UDA/DAMA field stored in the record's data — NOT the record's own ID. For source 1626200, `data.source_id` is undefined (it was never set during creation). For working sources like 1550996, `data.source_id` is `1505452` (set during the clone/publish workflow).

Result: `setSource({...res, views, ...})` produces an object where `source.id` is undefined (not requested) and `source.source_id` is undefined (not in record data). The guard returns `<></>`.

### Why other sources work

Working sources (e.g., 1550996) have `source_id: 1505452` stored in their record data (set during creation via the clone workflow). When `getSourceData` fetches UDA attributes, `res.source_id = 1505452`, so the line 75 guard passes.

Source 1626200 appears to have been created without the clone step, so its `data.source_id` was never populated.

## Fix

`getSourceData` should always include the source's own ID (from the URL param) in the result, as a fallback when UDA's `source_id` attribute is not set.

## Files

| File | Action |
|------|--------|
| `pages/dataTypes/default/utils.jsx` | Include `source_id` param in `getSourceData` result |

## Implementation

### Step 1: Fix `getSourceData` in `utils.jsx`

In `setSource()`, include the `source_id` parameter as a fallback:

```jsx
setSource({
    ...res,
    source_id: res.source_id ?? +source_id,
    views,
    created_at: firstView?.created_at,
    updated_at: lastView?.updated_at
});
```

This ensures `source.source_id` is always the record's own ID when UDA doesn't provide one.

- [x] Update `setSource` call in `getSourceData`
- [x] Build + verify (27.48s)

## Verification

- [ ] `/datasets/internal_source/1626200` renders (shows title, config columns, views)
- [ ] Other internal_source pages still work (e.g., 1550996)
- [ ] External source pages (`/datasets/source/:id`) still work
- [ ] `npm run build` passes
