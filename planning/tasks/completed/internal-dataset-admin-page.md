# Custom Admin Page for Internal Dataset Types

## Objective

Create a custom admin page for `internal_dataset` (and `internal_table`) that properly handles version creation using the DMS data item (`item`), following the forms pattern approach. The current default admin page was designed for external DAMA sources and doesn't work for internal datasets because:

1. **Wrong data shape**: SourcePage loads from UDA → returns `source_id` (not `id`), but `dmsDataEditor` needs `data.id`
2. **Fixed page priority**: `fixedPages` array forces default admin, preventing datatype overrides
3. **Missing `item` prop**: SourcePage passes `source` (UDA object) to child pages, not `item` (DMS data item from EditWrapper)

## Reference: Forms Pattern (Working)

The forms pattern admin (`patterns/forms/pages/admin.jsx`) works because:
- Receives `item` directly from EditWrapper — a DMS `data_items` row with `.id`
- `AddViewBtn` clones `item`, appends to `data.views`, calls `apiUpdate({data, config})`
- `dmsDataEditor` finds the item by `data.id`, sees `views` is `dms-format`, creates new view row via `updateDMSAttrs`

## Files

| File | Change |
|------|--------|
| `pages/dataTypes/internal/pages/admin.jsx` | **NEW** — custom admin for internal datasets, uses `item` for version creation |
| `pages/dataTypes/internal/index.js` | Register admin page |
| `pages/dataTypes/internal_table/index.js` | Register admin page (shares same admin) |
| `pages/SourcePage.jsx` | Allow datatype admin overrides; load DMS item via `loadDmsItem`; version selector + nav for DMS views; auto-navigate to latest view |
| `utils/dmsItems.js` | **NEW** — reusable `loadDmsItem(apiLoad, format, id)` utility |
| `pages/dataTypes/default/overview.jsx` | Adapted versions table for DMS views (uses `item.views`, DMS-appropriate columns) |
| `pages/dataTypes/default/admin.jsx` | Reverted earlier `source_id` workaround (no longer needed) |

All paths relative to `src/dms/packages/dms/src/patterns/datasets/`.

## Implementation

### Phase 1: SourcePage changes — DONE

- [x] Allow datatypes to override admin page: changed page resolution from `fixedPages.includes(page) ? defaultPages[page]` to `sourcePages[page]?.component || defaultPages[page] || Overview`
  - `fixedPages` kept for nav filtering (line 95) so datatype admin entries don't create duplicate nav items
- [x] Created `utils/dmsItems.js` with `loadDmsItem(apiLoad, format, id)` — reusable utility that uses `apiLoad` with the correct source format to load DMS data items by ID
- [x] Added `dmsItem` state in SourcePage, loaded via `loadDmsItem` when `isDms && id`
- [x] Pass `dmsItem` to child pages: `item={isDms && dmsItem ? dmsItem : item}`
  - EditWrapper's `item` is always `{}` for datasets (type mismatch in `processNewData`), so `loadDmsItem` fetches the correct item using `sourceFormat`

### Phase 2: Custom admin page — DONE

- [x] Created `pages/dataTypes/internal/pages/admin.jsx`
- [x] AddViewBtn follows forms pattern:
  - Receives `item` prop (DMS data item with `.id`)
  - `addView()`: clone `item`, append to `data.views`, call `apiUpdate({data, config: {format}})`
  - `disabled={!item.id}` — uses DMS id directly
- [x] Kept relevant parts from current default admin:
  - User/group access controls (use `source` for display, `isDms: true` hardcoded)
  - Advanced Metadata link
  - DeleteSourceBtn
- [x] Registered in `dataTypes/internal/index.js` with `cdn: () => false`
- [x] Registered in `dataTypes/internal_table/index.js` (imports from `../internal/pages/admin`)

### Phase 3: Cleanup — DONE

- [x] Reverted default admin.jsx AddViewBtn to original code (removed `source_id` workaround, no longer needed since internal datasets use custom admin)
- [x] Default admin unchanged for external datasets (csv/gis — isDms=false path)
- [x] Build passes (`npm run build`)

### Phase 4: Version selector + nav fixes — DONE

- [x] Version selector uses `dmsItem?.views` for DMS, `source.views` for external — extracted `views` variable used by both selector and overview
- [x] Extracted `viewDependentPages` constant (`['table', 'upload', 'validate', 'map']`) — replaces inline array in `showVersionSelector`
- [x] SourceNav preserves `view_id` in links: datatype-registered nav items now get `viewDependentPage: true` when their href is in `viewDependentPages`
- [x] Auto-navigate to latest view: when on a view-dependent page without `view_id`, navigates (with `replace: true`) to the last view in the array
- [x] Build passes (`npm run build`)

### Phase 5: Overview versions table — DONE

- [x] Added `item` prop to Overview signature (SourcePage already passes it)
- [x] Computed `views` from `item?.views` for DMS, `source?.views` for external
- [x] Version count badge uses `views.length`
- [x] Table columns adapt: DMS shows `name` only; external keeps `name`, `created_at`, `updated_at`, `download`
- [x] Table data source uses `views` variable
- [x] Sort column: DMS sorts by `name`; external sorts by `created_at`
- [x] Build passes (`npm run build`)

## Testing

- [x] Internal dataset admin page loads correctly
- [x] "Add Version" button is NOT disabled
- [x] Clicking "Add Version" opens modal
- [x] Submitting modal creates a new view
- [ ] Version selector shows DMS views on view-dependent pages (table/upload/validate)
- [ ] Auto-navigate to latest view works when visiting a view-dependent page without view_id
- [ ] SourceNav tabs preserve view_id when switching between view-dependent pages
- [ ] Overview page shows versions list for internal datasets
- [ ] Delete source still works
- [ ] External dataset admin page still works (csv/gis sources)
- [ ] External dataset overview versions table unchanged
- [ ] `internal_table` admin works the same as `internal_dataset`
- [x] Build passes (`npm run build`)

## Notes

- The `sourceFormat` fix in SourcePage.jsx (registered sub-format lookup) is already applied and needed for `dmsDataEditor` to find the `views` attribute
- The `source_id` workaround in default admin was reverted — internal datasets now use the custom admin instead
- Page resolution change also benefits overview: if a datatype registers a custom overview, it will now be used instead of the default
- `loadDmsItem` uses `apiLoad` with a `/:id` parameterized path so that `configMatcher` (via `matchRoutes`) correctly extracts the ID — manually setting `params.id` doesn't work because `d.params = match.params` in `_utils-core.js` overwrites it
- The `dmsItem` state is centralized in SourcePage and shared with all child pages — any datatype page that needs the DMS item can use the `item` prop
- DMS views only have `name` and `id` fields (from `datasets.format.js` view definition) — no `created_at`, `updated_at`, or `metadata` like UDA views
- Overview adapted in-place rather than creating a datatype override — the differences were simple conditionals on `isDms`
