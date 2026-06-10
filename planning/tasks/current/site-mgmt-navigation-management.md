# Site Management: Navigation / Menu Management Page

## Objective

A site management tab that shows which pages appear in the site navigation, in what order, and lets authors toggle visibility and reorder nav items without opening each page individually.

## Scope

- New "Navigation" tab on the site management page
- Shows pages grouped by their nav position (top-level / children)
- Inline toggle: show/hide from nav (edits `nav_hidden` attribute)
- Reorder: drag-to-reorder within a parent group (edits `weight`/`order` attribute)
- Scoped to one level at a time (top-level nav, then drill into a section's children)

Out of scope:
- Mega-nav or multi-column nav editing (v1: simple ordered list)
- Adding new nav items from this view (use the Pages tab for that)

## Current State

- Pages have a `nav_hidden` attribute (check if this exists in `cmsPage.attributes` — may need to be added)
- Pages have a `weight` or `order` attribute for ordering (check `cmsPage.attributes` — may not exist yet)
- Nav order is currently managed page-by-page in the page editor
- No bulk nav management exists
- `getNavItems()` in the page pattern builds nav from pages ordered by `weight`

## Proposed Changes

### 1. Verify / add `nav_hidden` and `weight` to `cmsPage.attributes`

Check `page.format.js`. If missing, add:
```js
{ name: 'nav_hidden', display_name: 'Hidden from nav', type: 'boolean', default: false },
{ name: 'weight', display_name: 'Nav order', type: 'integer', default: 0 },
```

### 2. Navigation tab layout

Two-panel or accordion layout:
- Left: top-level nav items (draggable list, visibility toggle)
- Right (or expandable): children of selected top-level item

Each row shows:
- Drag handle (reorder)
- Page title + url_slug
- Published status pill
- "Visible in nav" toggle switch (`nav_hidden` inverted)
- Section (if top-level) OR parent page (if child)

### 3. `nav_visibility_toggle` column type

Renders a live toggle switch bound to `nav_hidden`. On toggle:
- Calls `apiUpdate` with `{ nav_hidden: !row.nav_hidden }`
- Requires `allowEditInView: true` on the Spreadsheet

### 4. Drag-to-reorder

This is the most complex part. Options:
- **Option A (simpler):** Up/Down arrow buttons per row. On click, swap `weight` values with the adjacent row. Two `apiUpdate` calls.
- **Option B (full DnD):** `@dnd-kit/sortable` on the nav list. On drop, recompute `weight` for all affected rows and batch-update.

Recommend Option A for v1 — Option B requires the bulk-update primitive that doesn't exist yet.

### 5. Filtered Spreadsheet configuration

Until the custom section is built, authors CAN configure a Spreadsheet with:
- Source: `{pattern} (pages)`
- Columns: title, url_slug, published, `nav_hidden` (toggle), `weight` (editable number)
- Sort: `weight` ASC
- `allowEditInView: true`

This gives 80% of the value without new code. The reorder UX is the missing piece.

## Files Requiring Changes

- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/data/page.format.js` — add `nav_hidden`, `weight` if missing
- New file: `src/dms/packages/dms/src/patterns/page/columnTypes/nav_visibility_toggle.jsx`
- `src/dms/packages/dms/src/patterns/page/columnTypes/index.jsx` — register `nav_visibility_toggle`
- `src/dms/packages/dms/src/patterns/page/components/sections/index.jsx` — register `NavManagementSection` (Option B only)

## Testing Checklist

- [ ] `nav_hidden` attribute exists on pages and is editable
- [ ] `weight` attribute exists on pages and affects nav order
- [ ] `nav_visibility_toggle` column type renders a toggle, updates `nav_hidden` on click
- [ ] Pages with `nav_hidden: true` show as hidden in the toggle state
- [ ] Up/Down reorder buttons (Option A) correctly swap `weight` values
- [ ] Nav reflects changes after reorder (page reload)
