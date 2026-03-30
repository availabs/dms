# DMS Reference Resolution — How the API Handles `dms-format` References

## Overview

DMS stores parent-child relationships as **reference objects** inside the parent's `data` JSON column. A page's `sections` field contains `[{id: "1437255", ref: "avail+43e8f0e7|cms-section"}]` rather than the full section data. The API resolves these references at read time and decomposes them back to ref objects at write time.

The server never resolves references — it returns raw `data` as-is. All resolution happens client-side.

## Reference Storage

References live inside `data` as objects with `id` and `ref` fields:

```json
{
  "id": 1437240,
  "app": "avail",
  "type": "43e8f0e7-0765-4675-bfc9-9ab02a0e6033",
  "data": {
    "title": "DMS Format",
    "sections": [
      { "id": "1437255", "ref": "avail+43e8f0e7-0765-4675-bfc9-9ab02a0e6033|cms-section" }
    ],
    "draft_sections": [
      { "id": "1437255", "ref": "avail+43e8f0e7-0765-4675-bfc9-9ab02a0e6033|cms-section" }
    ],
    "history": [
      { "id": "1437256", "ref": "avail+43e8f0e7-0765-4675-bfc9-9ab02a0e6033|page-edit" }
    ]
  }
}
```

The `ref` string format is `{app}+{childType}` — it encodes where to find the referenced item.

## Which Attributes Have References

Determined by the format config — any attribute with `type: 'dms-format'` contains references:

```js
// page.format.js
{ key: 'sections',       type: 'dms-format', isArray: true, format: 'dms-site+cms-section' }
{ key: 'draft_sections', type: 'dms-format', isArray: true, format: 'dms-site+cms-section' }
{ key: 'history',        type: 'dms-format', isArray: true, format: 'dms-site+page-edit' }
```

The `format` field (`dms-site+cms-section`) specifies the `{app}+{type}` of the referenced items. Note: `dms-site` is a placeholder app — the actual app comes from the parent item's context. The type portion (`cms-section`) is the suffix after `doc_type|`.

## Reading: Reference Resolution

### Falcor Path (normal flow)

**File:** `api/proecessNewData.js` → `loadDmsFormats()`

1. `dmsDataLoader` fetches items via Falcor (`dms.data[app].byId[id]`)
2. `processNewData()` flattens the raw data (merges `data` column with metadata columns)
3. For each item, `loadDmsFormats()` walks all `dms-format` attributes:

```js
// For each dms-format attribute (e.g., sections):
for (let ref of item[key]) {
    if (ref.id) {
        // Fetch the referenced item via Falcor
        dmsFormatRequests.push([...byIdAddress, ref.id, ['data', 'created_at', 'updated_at', ...]])
    }
}
let newData = await falcor.get(...dmsFormatRequests)

// Replace ref objects with resolved data:
// {id: '1437255', ref: '...'} → {id: '1437255', ref: '...', title: '...', element: {...}, created_at: '...', ...}
item[key][index] = { ...ref, ...value, ...meta }
```

4. Resolution is **recursive** — if a child item also has `dms-format` attributes, those get resolved too.

### Local Sync Path (current implementation)

**File:** `api/index.js` → `loadFromLocalDB()`

Same logic but queries local SQLite instead of Falcor:

```js
const childIds = Array.from(item[key]).map(ref => ref.id || ref).filter(Boolean);
const children = await sync.exec(
    `SELECT * FROM data_items WHERE id IN (${placeholders})`, childIds
);
// Merge child data into ref objects (same shape as Falcor path)
```

### Output Shape

After resolution, the parent item looks like:

```js
{
  id: 1437240,
  title: "DMS Format",
  sections: [
    {
      id: "1437255",
      ref: "avail+43e8f0e7|cms-section",
      // ↓ these come from the referenced item's data + metadata
      element: { "element-type": "Lexical", "element-data": "{...}" },
      tags: "important",
      created_at: "2025-08-26T16:39:19.737Z",
      updated_at: "2026-01-12T18:07:25.511Z",
      created_by: null,
      updated_by: 175
    }
  ]
}
```

## Writing: Reference Decomposition

### Falcor Path (normal flow)

**File:** `api/updateDMSAttrs.js`

When saving, the editor passes the full expanded data back. The API must:

1. **Separate** dms-format attributes from the parent row:
   ```js
   const dmsAttrsToUpdate = attributeKeys.filter(d => Object.keys(dmsAttrsConfigs).includes(d))
   const dmsAttrsData = dmsAttrsToUpdate.reduce((out, curr) => {
       out[curr] = row[curr]
       delete row[curr]  // Remove full data from parent
       return out
   }, {})
   ```

2. **Update or create** each child item individually:
   ```js
   if (id) {
       // Existing child — compare with cached data, update if changed
       if (!isEqual(currentData, d)) {
           await falcor.call(["dms", "data", "edit"], [app, id, d])
       }
       updates[attr].push({ ref: `${app}+${type}`, id })
   } else {
       // New child — create and get new ID
       const res = await falcor.call(["dms", "data", "create"], [app, type, d])
       updates[attr].push({ ref: `${app}+${type}`, id: newId })
   }
   ```

3. **Update the parent** with only `{id, ref}` objects (not the full data):
   ```js
   row = { ...row, ...updates }
   // row.sections is now [{ref: 'avail+cms-section', id: '1437255'}]
   await falcor.call(["dms", "data", "edit"], [app, id, row])
   ```

### Local Sync Path (current implementation)

**File:** `api/index.js` → `dmsDataEditor` sync intercept

Same two-step pattern but using sync API:

```js
for (const dU of toUpdate) {
    if (childId) {
        await sync.localUpdate(childId, d);
        refs.push({ ref: `${childApp}+${childType}`, id: childId });
    } else {
        const newId = await sync.localCreate(childApp, childType, d);
        refs.push({ ref: `${childApp}+${childType}`, id: newId });
    }
}
row[attr] = refs;  // Parent stores only refs
// Then: await sync.localUpdate(parentId, row)
```

## Key Properties

1. **Two separate rows** — parent and child are independent `data_items` rows. The parent's `data.sections[]` holds only `{id, ref}` pointers.

2. **Children updated first, then parent** — ensures the parent's refs always point to valid items.

3. **Child type derived from format config** — `dmsAttrsConfigs[attr].format.split('+')` gives `[app, type]`.

4. **Metadata stripped before save** — `id`, `ref`, `created_at`, `updated_at`, `created_by`, `updated_by` are removed from the data before writing the child item (these are table columns, not part of `data`).

5. **Equality check skips unchanged children** — Falcor path uses `isEqual(currentData, d)` to avoid unnecessary writes. The sync path currently always writes.

## Implications for Sync

### Delta propagation problem

When a child item (section) is updated via sync delta, the parent (page) that references it won't know about the change. The parent's `data.sections[].id` hasn't changed — only the child's `data` column changed. This means:

- A delta that updates section ID 1437255 won't trigger a re-render of the page that contains it
- The `loadFromLocalDB` function re-resolves refs on every call, so the next navigation/revalidation will pick up the change
- But there's no mechanism to know that "section 1437255 changed, therefore page 1437240 needs revalidation"

### What needs to happen

For real-time updates: when a delta arrives for a child item, the sync layer needs to also invalidate/revalidate any parent that references that child. Options:

1. **Brute force revalidation** — on any delta, revalidate the entire route (current approach via `router.revalidate()`)
2. **Reverse index** — maintain a map of `childId → parentId[]` built during bootstrap, use it to target invalidations
3. **Type-based heuristic** — if a delta arrives for type `doc_type|cms-section`, revalidate all loaded items of type `doc_type`
