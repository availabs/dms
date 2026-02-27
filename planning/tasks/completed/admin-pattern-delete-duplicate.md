# Add Delete & Duplicate Buttons to Admin Pattern Overview

## Objective

Add delete and duplicate actions to the admin pattern editor. Currently the pattern editor (`patternEditor/index.jsx`) has an Overview tab (`settings.jsx`) that only shows name/subdomain/base_url fields — there's no way to delete or duplicate a pattern from this page. The user must go back to the site list (`editSite.jsx`) and there are no delete/duplicate buttons there either (the old `PatternEdit` component in `patternList.jsx` had these in an edit modal, but `editSite.jsx` replaced it with a simpler `PatternList` that only has an "Edit" link).

## Current State

### Where patterns are managed

1. **`editSite.jsx`** — Main admin page, renders `PatternList` (local component). Shows a table of patterns with Name, Base URL, Subdomain, and an "Edit" link column. The "Edit" link navigates to the pattern editor page.

2. **`patternEditor/index.jsx`** — Per-pattern editor with tabbed nav: Overview, Theme, Filters, Permissions. The Overview tab (`settings.jsx`) shows editable name/subdomain/base_url fields with Save/Reset buttons. No delete or duplicate actions.

3. **`patternList.jsx` (deprecated `PatternEdit`)** — The old component had an edit modal with save, cancel, duplicate, and remove buttons. This is the reference implementation.

### Old code reference (`patternList.jsx` PatternEdit, lines 129-345)

- **Edit (save)** (line 280-292): Updates pattern in the `value` array by matching `id`, calls `onChange` + `onSubmit`
- **Duplicate** (line 305-327): Generates new `doc_type` via `uuidv4()`, copies pattern fields (`app`, `base_url_copy`, `subdomain`, `config`, `name_copy`, `pattern_type`, `auth_level`, `filters`, `theme`), calls server endpoint `POST /dama-admin/dms/${app}+${oldType}/duplicate` to copy pages/sections, then calls `addNewValue` with the copied pattern
- **Delete (remove)** (line 328-339): Filters pattern out of `value` array by `id`, calls `onChange` + `onSubmit`

### Data flow for pattern CRUD

- Patterns are stored as an array in the site's `patterns` attribute (`type: 'dms-format'`, `format: 'admin+pattern'`)
- `editSite.jsx` passes `onChange` and `onSubmit` props to `PatternList`
- `onChange(newData)` updates the local attribute state
- `onSubmit(newData)` calls `updateData(data, 'patterns')` → `apiUpdate({data: {...item, patterns: newData}, config: {format}})`
- The `apiUpdate` → `dmsDataEditor` → `updateDMSAttrs` processes each pattern: creates new records (no `id`) or updates existing ones (has `id`), stores `{ref: "app+pattern", id}` references in the site record
- The duplicate endpoint (`/dama-admin/dms/${app}+${type}/duplicate`) copies pages and sections server-side

## Implementation

### Phase 1: Add delete and duplicate to pattern editor Overview tab — DONE

**File**: `patterns/admin/pages/patternEditor/default/settings.jsx`

**Approach**: The pattern editor runs under `patternConfig` (a different route/format from the site's `adminConfig`), so it doesn't have direct access to the site's patterns array or `onChange`/`onSubmit`. Instead of threading site data through context, we use `useFalcor` to load the site record directly and make Falcor calls to modify the patterns array.

**Changes**:
- [x] Import `useFalcor` from `@availabs/avl-falcor` and `useNavigate` from `react-router`
- [x] Extract `app`, `type`, `API_HOST`, `parentBaseUrl` from AdminContext (these identify the site env key: `${app}+${type}`)
- [x] `loadSiteData()` helper — loads site record via Falcor to get site ID and raw data (patterns stored as `[{ref, id}]`)
- [x] `handleDelete()` — loads site data, filters out pattern by ID, saves site via `falcor.call(['dms', 'data', 'edit'])`, navigates to parentBaseUrl
- [x] `handleDuplicate()` — generates UUID, calls server duplicate endpoint (copies pages/sections), creates new pattern record via `falcor.call(['dms', 'data', 'create'])`, adds `{ref, id}` to site's patterns array, saves site, navigates
- [x] "Danger Zone" section with Duplicate (loading state) and Delete (inline confirm: "Are you sure?" → Confirm Delete / Cancel)
- [x] Renamed header from "Page Settings" to "Pattern Settings"

### Phase 2: Add actions column to pattern list table — DONE

**File**: `patterns/admin/pages/editSite.jsx`

**Changes**:
- [x] Added `[deletingItem, setDeletingItem]` state
- [x] Merged edit/actions into single column: Edit link + Copy icon button (calls existing `duplicate` function) + TrashCan icon button (opens delete modal)
- [x] Added delete confirmation Modal: shows pattern name, Cancel and Delete buttons
- [x] Delete handler: `value.filter(v => v.id !== deletingItem.id)` → `onChange` + `onSubmit` (same as old PatternEdit approach)

**Design note**: Actions are in the same column as Edit to keep the table compact. Icon buttons use hover colors (blue for duplicate, red for delete) with subtle background highlights.

## Files Changed

| File | Change |
|---|---|
| `patterns/admin/pages/patternEditor/default/settings.jsx` | Rewrote: added `useFalcor`/`useNavigate`, `loadSiteData` helper, `handleDelete`/`handleDuplicate` handlers, "Danger Zone" section |
| `patterns/admin/pages/editSite.jsx` | Added `deletingItem` state, merged actions into edit column (Copy + TrashCan icons), added delete confirmation Modal |

**Not changed** (contrary to original plan):
- `patternEditor/index.jsx` — No changes needed; `settings.jsx` gets what it needs from AdminContext + useFalcor
- `context.js` — No changes needed; AdminContext already has `app`, `type`, `API_HOST`, `parentBaseUrl`

## Testing Checklist

- [ ] Navigate to pattern editor Overview → duplicate and delete buttons visible
- [ ] Click duplicate → new pattern appears in site list with `_copy` suffix
- [ ] Duplicated pattern has its own pages/sections (server-side copy worked)
- [ ] Click delete → confirmation prompt → pattern removed from list
- [ ] After delete → redirected to admin base URL
- [ ] Pattern list table has action buttons for duplicate/delete
- [ ] Duplicate from list → works same as from editor
- [ ] Delete from list → confirmation → pattern removed
- [x] Build passes (`npm run build`)

## Data Flow Reference

### Delete from pattern editor (Phase 1)
```
settings.jsx handleDelete()
  → loadSiteData(falcor, app, type)
    → falcor.get(['dms', 'data', '${app}+${type}', 'length'])
    → falcor.get(['dms', 'data', '${app}+${type}', 'byIndex', 0, ['id', 'data']])
    → returns { id: siteId, data: { patterns: [{ref, id}, ...] } }
  → filter patterns by ID
  → falcor.call(['dms', 'data', 'edit'], [siteId, { patterns: filtered }])
  → navigate(parentBaseUrl)
```

### Duplicate from pattern editor (Phase 1)
```
settings.jsx handleDuplicate()
  → generate newDocType (UUID)
  → POST /dama-admin/dms/${app}+${oldDocType}/duplicate (copies pages/sections)
  → falcor.call(['dms', 'data', 'create'], [app, 'pattern', dataToCopy])
  → get newId from response
  → loadSiteData()
  → falcor.call(['dms', 'data', 'edit'], [siteId, { patterns: [...existing, {ref, id: newId}] }])
  → navigate(parentBaseUrl)
```

### Delete from list (Phase 2)
```
editSite.jsx PatternList
  → setDeletingItem(row) → opens Modal
  → Confirm → value.filter(v => v.id !== deletingItem.id)
  → onChange(filtered) + onSubmit(filtered)
  → apiUpdate({data: {...siteItem, patterns: filtered}, config: {format}})
  → dmsDataEditor → updateDMSAttrs → updates remaining patterns → saves site with {ref, id} array
```
