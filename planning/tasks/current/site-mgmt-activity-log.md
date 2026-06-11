# Site Management: Activity Log / Recent Changes

## Objective

A reverse-chronological feed of content changes across the site — page edits, section edits, publishes, and new page creation. Gives admins visibility into who changed what and when, without needing direct database access.

## Scope

- New "Activity" tab on the site management page
- Shows recent changes to pages and sections (merged, sorted by `updated_at` DESC)
- Each entry: actor, action type, item name, timestamp, link to the page
- Filter by user, date range, action type (edit / publish / create)
- Pattern-scoped (shows changes within the current pattern only)

Out of scope:
- Undo/revert from this view (read-only in v1)
- Per-field diff (shows that a change happened, not what changed)
- Cross-pattern activity

## Current State

- Pages and sections have `updated_at` and `updated_by` columns in `data_items`
- Page history exists as `data.history.entries[]` (consolidated history per page, added in "Consolidate page-edit history" task)
- No merged pages+sections activity view exists
- `updated_at` / `updated_by` are not in `cmsPage.attributes` or `cmsSection.attributes` as queryable columns yet

## Proposed Changes

### 1. Add `updated_at`, `updated_by`, `created_at` to `cmsPage.attributes` and `cmsSection.attributes`

These columns exist in `data_items` but aren't exposed as queryable attributes. Adding them:
```js
{ name: 'updated_at', display_name: 'Last modified', type: 'timestamp', readOnly: true },
{ name: 'updated_by', display_name: 'Modified by', type: 'text', readOnly: true },
{ name: 'created_at', display_name: 'Created', type: 'timestamp', readOnly: true },
{ name: 'created_by', display_name: 'Created by', type: 'text', readOnly: true },
```

This alone enables authors to sort the pages/sections Spreadsheet by `updated_at` DESC — a basic activity view.

### 2. `activity_action_badge` column type

Determines action type from row data:
- `created_at === updated_at` → "Created"
- `published === true && has_changes === false` → "Published"
- default → "Edited"

Renders a color-coded pill.

### 3. Merged activity source (optional, higher effort)

A new `{pattern} (activity)` source type that:
- UNIONs pages and sections ordered by `updated_at` DESC
- Adds a `row_kind` column ('page' or 'section')
- Adds `parent_page_title` for section rows (via JOIN or serverFn)
- Paginated, default page size 50

This gives a true merged feed. Without it, Activity tab = two separate Spreadsheets (pages changes + section changes), which is less elegant but works today once `updated_at`/`updated_by` are exposed.

### Recommended v1 approach

Ship in two steps:
1. Add `updated_at`/`updated_by`/`created_at`/`created_by` to page and section attributes — enables basic "recently changed pages" view immediately
2. Add `activity_action_badge` column type
3. Build merged `{pattern} (activity)` source as v2 once the attribute changes are verified

### 4. Activity tab layout

- Filter bar: user dropdown, date range picker, action type (All / Created / Edited / Published)
- Reverse-chronological list: avatar/initials | "sgangdod edited Flooding & Stormwater" | "2 hours ago"
- Click row → opens that page

## Files Requiring Changes

- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/data/page.format.js` — add `updated_at`, `updated_by`, `created_at`, `created_by` to `cmsPage.attributes` and `cmsSection.attributes`
- New file: `src/dms/packages/dms/src/patterns/page/columnTypes/activity_action_badge.jsx`
- `src/dms/packages/dms/src/patterns/page/columnTypes/index.jsx` — register new type
- `src/dms/packages/dms/src/patterns/page/api/useDataSource.js` — register `{pattern} (activity)` merged source (v2)

## Testing Checklist

- [ ] `updated_at` column appears and sorts correctly in pages Spreadsheet
- [ ] `updated_by` column shows correct username
- [ ] `created_at` is distinct from `updated_at` for freshly-created pages
- [ ] `activity_action_badge` correctly identifies Created vs. Edited vs. Published rows
- [ ] Activity tab shows changes sorted reverse-chronologically
- [ ] Filter by user narrows the list correctly
- [ ] Filter by date range narrows the list correctly
- [ ] Clicking a row navigates to the correct page (uses `page_link` / `url_slug`)
