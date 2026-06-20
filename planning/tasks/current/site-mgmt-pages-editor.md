# Site Management: Pages Editor Tab

## Objective

A **Pages** tab inside the pattern editor (`/admin/manage/pattern/:id/pages`) that gives admins a full tree view of all pages in a pattern — publish state, nav visibility, section breakdown — with functional controls for adding pages, reordering, toggling nav visibility, and page-level actions.

## Status

**Infrastructure + data loading: DONE**
**Tree rendering, drag-to-reorder, lenses, search: DONE**
**Sections panel (openOut): DONE**
**Page actions (Publish / Discard / Duplicate / Edit): DONE**
**In-nav toggle: DONE (wired, needs live verification)**
**Add Page (with url_slug + navigate): DONE**
**Sections panel page row duplication fix: DONE (ThemeContext.Provider wrapping Table)**
**Preview modal: pending (section metadata panel only; iframe upgrade deferred)**
**Site health lenses (Dupe Slugs + Stale Drafts): DONE**

---

## Files Changed

| File | Change |
|---|---|
| `src/dms/packages/dms/src/patterns/admin/pages/patternEditor/pages/pagesEditor.jsx` | Main component |
| `src/dms/packages/dms/src/patterns/admin/pages/patternEditor/pages/pagesEditor.theme.js` | Theme keys |
| `src/dms/packages/dms/src/patterns/admin/pages/patternEditor/index.jsx` | Added Pages tab |
| `src/dms/packages/dms/src/ui/components/table/index.jsx` | Added 4 drag props threaded through TableStructureContext |
| `src/dms/packages/dms/src/ui/components/table/components/TableRow.jsx` | Wires drag props to row div; `openOutTrigger` column support |
| `src/dms/packages/dms/src/ui/columnTypes/treeNode.jsx` | Tree-indented page title cell |
| `src/dms/packages/dms/src/ui/columnTypes/publishState.jsx` | Published/draft pill |
| `src/dms/packages/dms/src/ui/columnTypes/sectionsChip.jsx` | Section-count chip (openOut trigger) |

---

## What Was Built

### Data loading (`loadAll`)

- Loads pages via `apiLoad` with `app: value.app`, `type: patternInstance|page`, `attributes: []`
- Loads sections (components) via the same pattern
- `resolveCompRef(ref, compById)` is a module-level helper for resolving component refs (id, JSON string, or object) to full component data
- `stripCompIdentity(comp)` strips id/ref/created_at etc. so updateDMSAttrs creates new rows
- `computeUrlSlug(title, pages, index, parent)` computes collision-free url_slug from title + existing pages

### Tree rendering

- `buildFlatTree` flattens the page hierarchy depth-first, respecting `expandedIds` set
- Each row gets computed fields: `_depth`, `_hasChildren`, `_isExpanded`, `_isGhost`, `_childCount`, `_slug`, `_pendingBelow`, `_sectionCount`, `_sections`, `_publishState`, `_onToggleExpand`
- Lens filters: All / To Publish / Empty / Orphans / Off Nav / Dupe Slugs / Stale Drafts
- Search filters on title; scope toggle: Pages / Sections

### Functional controls (done)

- **Add Page**: creates root page via `apiUpdate` with url_slug computed; navigates to `/edit/${url_slug}`
- **Drag to reorder**: HTML5 DnD, same-parent only, midpoint index math (single `apiUpdate`)
- **Add Section** (in SectionsPanel): navigates to `${baseUrl}/edit/${pageSlug}`
- **In-nav toggle**: switch column with `allowEditInView: true`; `allowEdit={false}` on Table is overridden by `allowEditComp || attribute.allowEditInView` in TableCell:168

### Page-level actions (in `_actions` column, each row)

- **Edit**: navigate to `/edit/${url_slug}`
- **Publish**: resolves `page.draft_sections` refs → strips identity fields → calls `apiUpdate` with `dms-format` for `sections`; uses `appendHistoryEntry`
- **Discard**: resolves `page.sections` (published) → strips identity → sets as `draft_sections`; uses `appendHistoryEntry`. Only shown when `needsPublish(page)`.
- **Duplicate**: resolves draft (or published) sections → clones → new title+slug, `published: 'draft'`; calls `apiUpdate` with `dms-format` for `draft_sections`

### Sections panel

- Opens as an openOut below the row (sections chip as `openOutTrigger: true`)
- Shows section title, element type badge, source, view chip, level pill, Preview button
- Publish/Discard moved to the page row; panel is now sections-only
- Page row duplication in openOut header was fixed by wrapping Table in `ThemeContext.Provider` with the default `tableTheme` (which has `openOutHideTitle: true` for `below-row` style)

---

## Pending Work

### 1. Live verification of in-nav toggle

The switch mechanism should work (TableCell:168 `allowEdit = allowEditComp || attribute.allowEditInView`), but hasn't been verified on a real site. Test: toggle a page's nav visibility and confirm `apiUpdate` fires and the change persists on reload.

### 2. Section preview — render actual component

The Preview button currently shows a metadata panel (source, view, lexical text excerpt, columns). The intended behavior is to render the actual section component using `ComponentRegistry[elementType].ViewComp` mounted inside a `ComponentContext.Provider` with `state` = parsed element-data.

**Decision needed**: `ComponentRegistry` lives in `patterns/page/`. Two options:
- **Option A** — Dynamic import (`import('../../../page/.../ComponentRegistry')`) — lazy, no static coupling
- **Option B** — Pass `componentRegistry` as a prop to `PatternPagesEditor` from `patternEditor/index.jsx` (explicit coupling at config boundary)

Option B is architecturally cleaner. The preview for data-driven sections (Spreadsheet, Card) will render layout/structure but no live data rows since the source isn't loaded — still more informative than metadata.

---

## Key Data Facts

From live DB inspection:
- Page type: `{app}+{patternInstance}|page` (e.g. `shaun-test-app+page_pattern_copy|page`)
- Section type: `{app}+{patternInstance}|component`
- Section `parent` in data column: JSON string `'{"id":"<pageId>","ref":"<app>+<type>"}'`
- Page `parent` for root pages: `null` (not `""`)
- Pages have both `sections` (published) and `draft_sections` arrays; all components are loaded together and grouped by parent

---

## Testing Checklist

- [ ] In-nav toggle fires `apiUpdate` with correct `hide_in_nav` value; local state updates optimistically
- [ ] Switch visual state matches actual `hide_in_nav` value (inverted logic: trueValue=false means switch ON = hide_in_nav false = visible in nav)
- [ ] Publish button in page row publishes correctly (draft sections → sections, has_changes false)
- [ ] Discard button reverts draft sections to published sections
- [ ] Duplicate creates new page + " Copy" title, fresh url_slug, same sections as draft
- [ ] Edit button navigates to /edit/${url_slug}
- [ ] Add Page computes url_slug, navigates to new page edit view
- [ ] Sections panel no longer shows page title at top (openOutHideTitle fixed)
- [ ] Preview button in sections panel opens metadata modal; "View page ↗" link works
