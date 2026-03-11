# Consolidate Page Edit History

## Objective

Replace the current page-edit history model — which creates a **new `data_items` row for every edit action** — with a single-row model where one `page-edit` row per page holds an **array of entries** in its `data` column. This eliminates thousands of low-value rows from the database while preserving the full edit timeline.

## Current State

### Data Model

Each page has `history` as a `dms-format` attribute (`isArray: true`) pointing to N `page-edit` rows:

```
Page (id=100, type=abc123)
  data.history = [
    { id: "501", ref: "avail+abc123|page-edit" },
    { id: "502", ref: "avail+abc123|page-edit" },
    { id: "503", ref: "avail+abc123|page-edit" },
    ...
  ]

Row 501: { data: { type: "created Page.", user: "alice@ex.com", time: "Mon Mar 10 2026..." } }
Row 502: { data: { type: "published changes.", user: "alice@ex.com", time: "Mon Mar 10 2026..." } }
Row 503: { data: { type: "commented: looks good", user: "bob@ex.com", time: "Tue Mar 11 2026..." } }
```

Each row has 4 fields: `type` (action description), `user` (email), `time` (JS Date string), `parent_type` (optional).

### Format Definition

**`page.format.js`** (lines 92-113, 266-271):
```js
const pageEdit = {
  app: "dms-site",
  type: "page-edit",
  attributes: [
    { key: "action", type: "text" },
    { key: "user", type: "text" },
    { key: "time", type: "text" },
    { key: "parent_type", type: "text" }
  ]
}

// In cmsPageFormat.attributes:
{ key: 'history', type: 'dms-format', isArray: true, format: 'dms-site+page-edit' }
```

### Where History Entries Are Created

**`editFunctions.jsx`** — 7 functions append entries by cloning the array and pushing:

| Function | Action text | Lines |
|----------|-------------|-------|
| `insertSubPage` | `" created Page."` | 22-25 |
| `duplicateItem` | `"Created Duplicate Page."` | 52-56 |
| `newPage` | `" created Page."` | 72-76 |
| `updateTitle` | `"changed page title to {value}"` | 87-91 |
| `updateHistory` | `value` (free text / comments) | 109-114 |
| `publish` | `"published changes."` | 151-155 |
| `discardChanges` | `"discarded changes."` | 197-201 |

All follow the same pattern:
```js
let history = item.history ? cloneDeep(item.history) : []
history.push({ type: actionText, user: user.email, time: new Date().toString() })
apiUpdate({ data: { id: item.id, ..., history } })
```

### Where History Is Displayed

**`historyPane.jsx`** (lines 9-111):
- Reads `item.history` (array of resolved refs → each has `type`, `user`, `time`)
- Sorts by `time` descending
- Detects comments via `type.startsWith('commented:')`
- Has input field for adding comments → calls `updateHistory()`

### Why This Is a Problem

- A page with 50 edits creates 50 rows in `data_items`
- `|page-edit` rows are excluded from sync bootstrap (`isSyncExcluded`), but they still bloat the main table
- The parent page's `data.history` array grows with N `{id, ref}` objects
- Each edit triggers `updateDMSAttrs` which creates a Falcor `create` call + a parent `edit` call
- Sync intercept also processes these, creating unnecessary pushes

## Proposed Changes

### New Data Model

One `page-edit` row per page. Its `data` column holds all entries:

```
Page (id=100, type=abc123)
  data.history = { id: "501", ref: "avail+abc123|page-edit" }

Row 501: {
  data: {
    entries: [
      { action: "created Page.", user: "alice@ex.com", time: "Mon Mar 10 2026..." },
      { action: "published changes.", user: "alice@ex.com", time: "Mon Mar 10 2026..." },
      { action: "commented: looks good", user: "bob@ex.com", time: "Tue Mar 11 2026..." }
    ]
  }
}
```

Key changes:
- `history` attribute: `isArray: false` (single ref, not array of refs)
- Entry field renamed from `type` to `action` (avoid confusion with DMS `type` column)
- All entries live in `data.entries[]` of one row
- The ref shape stays the same: `{ id, ref }` (just one instead of N)

---

## Phase 1: Client Changes — ✅ DONE

### Step 1.1: Update format definition

**File:** `patterns/page/page.format.js`

- [x] Change `pageEdit` format: replace `attributes` array with a single `entries` attribute of type `json` (array)
- [x] Change `history` attribute on `cmsPageFormat`: remove `isArray: true` (single ref)

```js
const pageEdit = {
  app: "dms-site",
  type: "page-edit",
  attributes: [
    { key: "entries", type: "json", default: [] }
  ]
}

// In cmsPageFormat.attributes:
{ key: 'history', type: 'dms-format', format: 'dms-site+page-edit' }
// Note: no isArray — single ref
```

### Step 1.2: Update editFunctions.jsx

**File:** `patterns/page/pages/edit/editFunctions.jsx`

All 7 functions need the same change: instead of pushing to an array of refs, they update the single history ref's `entries` array.

- [x] Update `insertSubPage`: set `history` as single object with `entries: [{ action, user, time }]`
- [x] Update `duplicateItem`: same pattern
- [x] Update `newPage`: same pattern
- [x] Update `updateTitle`: read existing `item.history.entries`, append new entry
- [x] Update `updateHistory`: same — append to `item.history.entries`
- [x] Update `publish`: same — append to `item.history.entries`
- [x] Update `discardChanges`: same — append to `item.history.entries`

New pattern for existing pages (e.g., `updateTitle`):
```js
const entries = Array.isArray(item.history?.entries) ? [...item.history.entries] : []
entries.push({ action: `changed page title to ${value}`, user: user.email, time: new Date().toString() })
const history = { ...(item.history || {}), entries }
apiUpdate({ data: { id: item.id, title: value, ..., history } })
```

New pattern for new pages (e.g., `newPage`):
```js
const history = { entries: [{ action: 'created Page.', user: user?.email, time: new Date().toString() }] }
apiUpdate({ data: { title, ..., history } })
```

### Step 1.3: Update historyPane.jsx

**File:** `patterns/page/pages/edit/editPane/historyPane.jsx`

- [x] Change data source from `item.history` (array of resolved refs) to `item.history?.entries` (array inside single resolved ref)
- [x] Update field name: `historyItem.type` → `historyItem.action`
- [x] Comment detection: `historyItem.action.startsWith('commented:')` (was `.type.startsWith(...)`)
- [x] Handle backward compatibility: if `item.history` is an array (old format), convert on the fly

```jsx
// Backward-compat: handle both old (array of refs) and new (single ref with entries) formats
const historyEntries = React.useMemo(() => {
  if (Array.isArray(item?.history)) {
    // Old format: array of resolved refs, each with .type, .user, .time
    return item.history.map(h => ({ action: h.type, user: h.user, time: h.time }))
  }
  // New format: single ref with .entries array
  return item?.history?.entries || []
}, [item?.history])
```

### Step 1.4: Sync exclusions removed (page-edits now included in sync)

- [x] Removed `|page-edit` from `isSyncExcluded()` in `sync.js` — now only excludes split types
- [x] Removed `syncExcludedSuffixes` and skip logic from `api/index.js` loader
- [x] Removed `AND type NOT LIKE '%|page-edit'` from 4 SQL queries in `sync.js` (2 bootstrap, 2 delta)
- [x] Page-edit rows (1 per page after consolidation) are now synced normally via bootstrap/delta/WS

---

## Phase 2: Migration Script — ✅ DONE

### Step 2.1: Create migration script

**File:** `packages/dms-server/src/scripts/consolidate-page-history.js`

Script that:
1. Finds all pages with `history` refs (items whose `data->'history'` is a JSON array of `{id, ref}` objects)
2. For each page:
   a. Fetch all referenced page-edit rows by ID
   b. Build consolidated `entries` array from each row's data (map `type` → `action`)
   c. Sort entries by `time` ascending
   d. Pick one existing page-edit row to keep (e.g., the first/oldest), update its `data` to `{ entries: [...] }`
   e. Delete the other page-edit rows
   f. Update the parent page's `data.history` from `[{id, ref}, ...]` to `{id: keepId, ref}`
3. Report: pages processed, rows consolidated, rows deleted

- [ ] Support both PostgreSQL and SQLite (use `getDb` + adapter pattern from existing scripts)
- [ ] Dry-run by default (`--apply` flag to execute)
- [ ] Transaction-safe (per-page transaction)
- [ ] Handle edge cases: pages with no history, pages with empty history array, pages where referenced rows are already deleted

### Step 2.2: Add npm script

**File:** `packages/dms-server/package.json`

- [ ] Add `"consolidate-history": "node src/scripts/consolidate-page-history.js"` to scripts

---

## Files Requiring Changes

| File | Change | Status |
|------|--------|--------|
| `patterns/page/page.format.js` | Remove `isArray` from history attr, simplify pageEdit format | ✅ |
| `patterns/page/pages/edit/editFunctions.jsx` | Centralized `appendHistoryEntry()` function, all 7 callers updated | ✅ |
| `patterns/page/pages/edit/editPane/historyPane.jsx` | Read from `entries`, backward-compat for old format, fix `<div>` inside `<p>` | ✅ |
| `patterns/page/components/sections/sectionGroup.jsx` | Replaced old `history.push()` with `appendHistoryEntry` import | ✅ |
| `patterns/page/components/sections/components/componentsIndexTable.jsx` | Replaced old `history.push()` with `appendHistoryEntry` import | ✅ |
| `patterns/page/pages/manager/template/edit.jsx` | Updated `saveHeader`/`saveSection` to use `appendHistoryEntry` (deprecated, doesn't render) | ✅ |
| `packages/dms/src/dms-manager/wrapper.jsx` | Added try-catch around Immer merge for history objects | ✅ |
| `packages/dms/src/sync/sync-manager.js` | Fixed `localUpdate` to seed Yjs doc from SQLite before merging | ✅ |
| `packages/dms-server/src/routes/sync/sync.js` | Removed `|page-edit` sync exclusions (4 SQL queries) | ✅ |
| `packages/dms/src/api/index.js` | Removed `syncExcludedSuffixes`, fixed create invalidation scope | ✅ |
| `packages/dms-server/src/scripts/consolidate-page-history.js` | New: migration script | ✅ |
| `packages/dms-server/package.json` | Add npm script | ✅ |

## Testing Checklist

### Phase 1
- [ ] New page: history row created with `{ entries: [{ action: "created Page.", ... }] }`
- [ ] Edit title: entry appended to existing history row's `entries` array
- [ ] Publish: entry appended
- [ ] Discard changes: entry appended
- [ ] Add comment via history panel: entry appended
- [ ] History panel displays entries in correct order (newest first)
- [ ] Comments styled correctly (border, extracted text)
- [ ] Old-format pages (migrated DB) display correctly via backward-compat code
- [ ] Parent page's `data.history` is `{id, ref}` (not array)

### Phase 2
- [ ] Dry-run shows correct counts (pages, rows to consolidate, rows to delete)
- [ ] `--apply` consolidates correctly: one page-edit row per page
- [ ] Parent page `data.history` updated from array to single ref
- [ ] Consolidated row has all entries in correct chronological order
- [ ] Deleted rows are gone
- [ ] Pages with no history unchanged
- [ ] Works with PostgreSQL
- [ ] Works with SQLite
