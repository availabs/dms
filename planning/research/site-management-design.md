# Site Management Design

## Status: CLI data collected 2026-06-09 — design updated with real data

### Real data from `mitigat-ny-prod` (collected 2026-06-09)

```bash
export DMS_HOST=http://localhost:3001
export DMS_APP=mitigat-ny-prod
export DMS_TYPE=prod
dms page list --format json   # batched across 189 pages
```

| Stat | Value |
|------|-------|
| Total pages | **189** |
| Published | **0** (every page is `"draft"`) |
| Hierarchy depth | **3 levels** (28 at depth-1, 63 at depth-2, 97 at depth-3, 1 at depth-4) |
| Estimated sections | **~1,100** (sampled 20 pages, avg 9.3 sections/page) |

**Real top-level sections** (depth-2, no parent):
- `hazards_of_concern` — 16 children (Drought, Earthquake, Flood, Hail, Hurricane, Ice Storm, Landslide, Lightning, Snowstorm, Tornado, Wildfire, Coastal Hazards, Extreme Cold, Extreme Heat, Avalanche, Wind)
- `nys_risk_environment` — 5 children
- `state_mitigation` — 5 children
- `climate_change` — 5 children
- `resource_library` — 4 children
- `local_mitigation` — 4 children

**Section type breakdown** (20-page sample, 186 sections):
- `lexical`: 127 (68%)
- `Table: Forms`: 17
- `Map: Fusion Events Map`: 9
- `Table: Disasters`: 8
- Card / Graph types: ~25

**Notes:**
- `dms site tree` OOMs on this dataset (Node heap exhaustion — too large for recursive JSON load)
- Exact section count not available via `dms raw list` without iterating all 189 pages

### Answers to design questions

- **Pages total**: 189. The mockup used 47 — real site is 4× larger.
- **Hierarchy depth**: 3 levels with one 4th-level outlier (`nys_profile/infrastructure/transportation_infrastructure/new_page`).
- **Sections per page**: avg 9.3, so pagination at 50 pages/page is appropriate.
- **All pages are draft**: interesting for the publish queue design — in real use, the queue is the entire site.
- **No table-of-contents patterns found** in the 20-page sample; sections are mostly content (lexical/maps/tables).
- Are there sections that list other sections? (table-of-contents patterns?)
- What are the most common section types (Spreadsheet? Card? Map? Lexical?)
- How many sections per page on average?

---

## The Core Use Case

An author with admin access wants to manage the site from WITHIN a DMS page — without writing code. Specifically:

1. **Page inventory** — see all pages, their status (published/draft), depth, parent, URL slug. Sort by depth or parent. Edit inline.
2. **Section inventory** — see all sections across the site or within a pattern, their type, page parent, visibility. Edit inline.
3. **Publish dashboard** — filter to `is_draft = true` pages, bulk publish.
4. **Navigation audit** — see the page tree, identify gaps (missing parents, slug conflicts).
5. **Section search** — find "which pages have a Map section?" or "which sections tag as 'hero'?"

DMS already provides pages and sections as data sources in Spreadsheet/Card sections. The job of this design is: what Spreadsheet/Card configurations does an author actually need, and what gaps in the primitive prevent them from building it today?

---

## Current State (from `site-management-tools.md` research)

### What works today

| Feature | Works | Notes |
|---------|-------|-------|
| Pages as spreadsheet rows | ✅ | `{app}+{type}\|page` source |
| Sections as spreadsheet rows | ✅ | `{app}+{type}\|component` source |
| Filter by title, published, is_draft | ✅ | direct JSONB columns |
| Group by any direct column | ✅ | |
| Sort, paginate | ✅ | |
| `parent` column resolves to title | ✅ | `applyServerFn` (this session) |
| Inline edit (update field) | ✅ | `isDms && !groupBy` |
| Add / delete rows | ✅ | `addItem` / `removeItem` |

### What is broken / missing (updated 2026-06-09)

| Feature | Status | Notes |
|---------|--------|-------|
| Filter dropdown for `parent` column | ⚠️ partial — **unverified** | Fix is in `RenderFilters.jsx` + `utils.js` + `uda.controller.js` but never confirmed in browser. Task: `site-mgmt-filter-parent-blank.md` |
| Filter BY resolved parent title (SQL match) | ❌ not coded | Task file exists `site-mgmt-filter-by-parent-name.md` but zero implementation |
| `url_slug` hidden by default | ❌ one-line fix | `page.format.js:208` has `hidden: true` — remove it. Unblocks `page_link` formatFn |
| "Open page" link (`page_link` formatFn) | ✅ **ready** | Implemented at `utils/utils.jsx:289`, registered in Card + Spreadsheet config. Just needs `url_slug` unhidden |
| `component_type` column for sections | ✅ **ready** | Virtual SQL column already in `cmsSection.attributes` (`page.format.js:91–95`). Design doc was out of date |
| `source_id` / `view_id` columns for sections | ✅ **ready** | Virtual SQL columns in `cmsSection.attributes:97–105` |
| `element_preview` column type | ✅ **ready** | Implemented, registered in `columnTypes/index.jsx`. Preview button works |
| `page_publish` column type | ✅ **ready** | Implemented, registered. Publish/Discard buttons work inline |
| Friendly source labels ("All Pages") | ❌ two-string fix | `useDataSource.js:408–409` still shows `"{type} (pages)"`. Change to `"All Pages"` / `"All Sections"` |
| `allowEditInView` not discoverable | ⚠️ partial | Toggle exists in Spreadsheet Data tab as "Allow Edit" — labelled poorly but present |
| `page_is_root` + `page_children` column types | ❌ not coded | Task file `page-hierarchy-columns.md` has full implementation spec. ~30 min |
| Bulk publish (batch rows) | ❌ no primitive | No row-selection infrastructure. No task file yet |
| Nested / tree-view tab | ❌ needs custom section | Requires new section component. `page_is_root`/`page_children` are prereqs |

### Newly discovered gaps (2026-06-09)

| Gap | Impact |
|-----|--------|
| `component_type` filter hits same blank-dropdown bug as `parent` | Filtering sections by type breaks silently — needs filter fix first |
| `page_link` silently breaks if `url_slug` not in fetched row columns | Author applies `page_link` to title but hasn't added `url_slug` column → no link, no error |
| `page_publish` silently fails if `allowEditInView` is off | `apiUpdate` is `undefined` when not in edit mode — Publish button fires but nothing happens |
| `source_id`/`view_id` are raw integers, not human-readable names | Sections tab shows `"22"` not `"flood_claims"` — no `serverFn` resolves these |
| Grouping by `component_type` disables inline editing | `allowEdit` is false when `groupByColumnsLength > 0` — publish controls stop working silently |

---

## Design: Pages Inventory View

**Goal**: A Spreadsheet section on a site management page showing all pages in the pattern. Author can filter, sort, inline-edit, and navigate.

### Column layout (recommended)

| Column | Source attribute | Notes |
|--------|-----------------|-------|
| Title | `title` | editable text |
| Status | `published` | boolean → pill |
| Has changes | `has_changes` | boolean |
| Is draft | `is_draft` | boolean |
| Parent | `parent` | resolves to title via `applyServerFn` |
| URL Slug | `url_slug` | currently hidden — needs unhiding |
| Open | `url_slug` | `pageLink` formatFn → React Router Link |
| Auth | `authPermissions` | who can see |

### Section config

```json
{
  "externalSource": {
    "isDms": true,
    "name": "{pattern} (pages)",
    "columns": ["...from page.format.js attributes..."]
  },
  "display": {
    "allowEditInView": true,
    "pageSize": 50
  }
}
```

### Filters to pre-configure

- `is_draft` = true → "Show drafts only"
- `published` = false → "Show unpublished"
- `parent` → filter by parent page (needs filter dropdown fix)

---

## Design: Sections Inventory View

**Goal**: A Spreadsheet section listing all sections in a pattern. Useful for auditing section types, finding stale/empty sections, bulk editing.

### Column layout (recommended)

| Column | Source attribute | Notes |
|--------|-----------------|-------|
| Title | `title` | |
| Type | `component_type` | MISSING — needs `site-mgmt-page-column-ux.md` |
| Parent page | `parent` | resolves to page title |
| URL slug | `url_slug` | resolves to parent page slug |
| Tags | `tags` | for filtering |
| Is draft | `is_draft` | |
| Level | `level` | |
| Requirements | `requirements` | auth requirements |

### Key gap: `component_type`

Sections store their element type inside `data->'element'->>'type'` (e.g., `"Spreadsheet"`, `"Map"`, `"RichText"`). This field isn't in `cmsSection.attributes`. Without it, authors can't filter "show me all Map sections" or group by type.

**Fix**: Add `component_type` to `cmsSection.attributes`:
```js
{ name: 'component_type', display_name: 'Type', type: 'text', readOnly: true, 
  sqlExpression: `data->'element'->>'type'` }
```

---

## Design: Publish Dashboard View

**Goal**: A Card section showing a summary stat ("12 draft pages") with a drill-down Spreadsheet filtered to unpublished pages.

### Card config

- Source: `{pattern} (pages)`
- Filter: `is_draft = true`
- Group by: `published`
- Show count (fn: COUNT on title)

### Spreadsheet config

- Source: `{pattern} (pages)`
- Filter preset: `published = false`
- Columns: title, parent, url_slug, has_changes
- `allowEditInView: true` so authors can toggle `published` from the view

---

---

## Design: Data Sources Inventory

**Goal:** A tab showing all sources registered in the pattern's dmsEnv — name, type, view count, how many sections use it, last updated. Orphaned sources (0 sections) are flagged.

### Column layout

| Column | Notes |
|--------|-------|
| Name | `display_name` from source row |
| Type | `doc_type`: internal_table / external / gis / file_upload |
| Views | count of view rows under this source |
| Used by | `source_section_count` custom column type — count of sections whose `source_id` matches; "0" → amber Orphaned pill |
| Last updated | `updated_at` formatted |
| Updated by | `updated_by` username |
| Status | Derived: Active / Orphaned |

### New primitive needed

`{pattern} (sources)` — new source type in `useDataSource.js` that queries all sources in the pattern's dmsEnv. Analogous to `{pattern} (pages)` but for sources. Medium effort.

`source_section_count` — client-side column type reading `ComponentContext.state.data` for the sections source to count usage. Requires both sources and sections data to be loaded; may need a two-source join.

---

## Design: Site Health / Audit

**Goal:** A diagnostic tab surfacing structural problems: pages with no sections, pages whose parent doesn't exist, duplicate URL slugs, and long-stale drafts.

### Issue categories

| Category | Check | Severity |
|----------|-------|---------|
| No sections | `section_count === 0` | Warning |
| Orphaned page | `row.parent !== null && parent title not in data` | Error |
| Duplicate slug | `url_slug` appears >1 time | Error |
| Stale draft | `!published && days_since_updated > 90` | Warning |

### Summary cards

Four stat cards at the top (like the main page's stat strip):
- `N pages missing sections`
- `N orphaned pages`
- `N duplicate slugs`
- `N stale drafts (>90 days)`

### Implementation

Not expressible as a configured Spreadsheet — needs a custom `SiteHealthSection` component that runs all four checks client-side and renders grouped issue lists. Each issue row links back to the Pages tab with that page highlighted.

---

## Design: Navigation / Menu Management

**Goal:** A tab for bulk nav management — see all pages in nav order, toggle visibility, and reorder without opening each page individually.

### Column layout

| Column | Notes |
|--------|-------|
| (drag handle) | visual indicator; up/down buttons for v1 reorder |
| Title | page title |
| URL Slug | `url_slug` |
| Published | status pill |
| Visible in nav | `nav_visibility_toggle` — toggle bound to `nav_hidden` attribute |
| Children | count of child pages |

### Grouping

Top-level pages as primary rows, children collapsed/expandable. The view is flat by default; authors click a root to see its children reorderable within that parent group.

### Key dependencies

- `nav_hidden` attribute must exist on pages (`page.format.js`) — verify or add
- `weight` attribute must exist on pages — verify or add; `getNavItems()` in the page pattern should use it
- Inline editing requires `allowEditInView: true`

---

## Design: Activity Log / Recent Changes

**Goal:** A reverse-chronological feed of who changed what and when across all pages and sections in the pattern.

### Feed entry format

`[avatar] [user] [action] [item name] · [relative time]`

Examples:
- `SG  sgangdod edited Flooding & Stormwater · 2 hours ago`
- `SG  sgangdod published Extreme Heat · 1 day ago`
- `AD  admin created People & Communities · 3 days ago`

### Column layout (Spreadsheet version)

| Column | Source |
|--------|--------|
| User | `updated_by` |
| Action | `activity_action_badge` — Created / Edited / Published derived from data |
| Item | title + link to page |
| Type | page / section pill |
| When | `updated_at` formatted as relative time |

### v1 approach (quick win)

Add `updated_at`, `updated_by`, `created_at`, `created_by` to `cmsPage.attributes` and `cmsSection.attributes`. An author can then create a pages Spreadsheet sorted by `updated_at` DESC to get a basic "recently changed pages" view immediately.

### v2

`{pattern} (activity)` merged source that UNIONs pages + sections ordered by `updated_at` DESC, adding `row_kind` and `parent_page_title`. True combined activity feed.

---

## Design: Last Published Column

**Goal:** Show when a page was last published and by whom — distinct from `updated_at` which changes on any edit.

### Implementation

SQL expression column reading `data->'history'->'entries'`:

```sql
(
  SELECT (entry->>'timestamp')::timestamptz
  FROM jsonb_array_elements(data->'history'->'entries') AS entry
  WHERE entry->>'action' = 'publish'
  ORDER BY (entry->>'timestamp')::timestamptz DESC
  LIMIT 1
)
```

NULL for pages never published — filterable ("show pages never published" = stale drafts that have never been public).

### Display

`last_published` column type: renders relative time with full date + "by [user]" on hover. "Never" in muted italic for null values.

---

## Design: Page Duplication

**Goal:** Clone a page + all its sections as a new draft. The most common "start from existing" CMS workflow.

### UX

"Duplicate" button in the row actions column of the pages management Spreadsheet (shows on row hover, alongside the edit pencil). After duplication: navigates to the new page in edit mode.

### Server side

New `duplicatePage(id)` API call:
1. Fetch source page
2. Create new page: same data, title + " (copy)", new slug, `published: false`
3. Fetch all sections where `parent === sourcePageTitle`
4. Create new sections under the new page title
5. Return new page ID + slug for navigation

---

## How Others Solve This

### Notion

- Sidebar tree is the primary page management UI
- "Database" pages show content as a table with properties (status, parent, date, tags)
- Filtered views — "All drafts", "Published this week" — are just different filter presets on the same database
- **Key insight**: Notion pages ARE database rows. The table view isn't a separate tool.

### Ghost / WordPress

- Admin interface is a separate app, not built in content
- Ghost has a tag/author filter on the posts list
- Neither allows embedding the admin list inside a content page

### Sanity (headless CMS)

- "Structure tool" shows a tree of document types
- "Desk" is a configurable pane builder — you write code to say "show me all posts as a list, filter by status"
- This is analogous to DMS's author-configurable Spreadsheet, but requires code

### Contentful

- Content model = spreadsheet with columns
- Views = saved filter presets on the content list
- Search by any field

### Takeaway for DMS

DMS is already closer to Notion/Contentful than Ghost/WordPress. The data model (pages = data_items rows) is the right foundation. The gaps are:
1. **Filter by resolved parent name** — Notion's tree view works because it's hierarchical; DMS needs a parent-title filter for the flat list to be navigable at scale
2. **`pageLink` formatFn** — Notion and Contentful always let you click a row to open it; DMS doesn't have this yet
3. **`component_type` column** — content CMSes have document types; DMS sections have element types but it's not exposed
4. **Bulk publish** — Ghost/WordPress both have this; DMS has no batch-action primitive

---

## Recommended Priority Order

Based on what enables the most author workflows:

1. **Fix filter dropdown for `parent`** (`site-mgmt-filter-parent-blank.md`) — needed for any filtering by parent to work
2. **Un-hide `url_slug` + add `pageLink` formatFn** (`site-mgmt-page-column-ux.md`) — lets authors navigate from the management view
3. **Add `component_type` to sections** (`site-mgmt-page-column-ux.md`) — unlocks section-type filtering
4. **Last published column** (`site-mgmt-last-published-column.md`) — high value for 189-page all-draft site; SQL expression column from history entries
5. **Activity log** (`site-mgmt-activity-log.md`) — step 1 (add `updated_at`/`updated_by` to attributes) is quick win; merged source is v2
6. **Page hierarchy columns** (`page-hierarchy-columns.md`) — prereq for Site Tree tab; task file has ready-to-use code
7. **Page duplication** (`site-mgmt-page-duplication.md`) — needs server route + column type; most-used CMS shortcut
8. **Data sources inventory** (`site-mgmt-data-sources-inventory.md`) — new source type + column type; high value for large sites with many sources
9. **Navigation management** (`site-mgmt-navigation-management.md`) — needs `nav_hidden`/`weight` attributes verified first
10. **Site health audit** (`site-mgmt-site-health-audit.md`) — needs custom section component; `page_section_count` column prereq
11. **Filter by resolved parent title** (`site-mgmt-filter-by-parent-name.md`) — medium effort, high value for deep hierarchies
12. **Friendly source labels** (`site-mgmt-page-column-ux.md`) — polish
13. **Bulk publish** — new primitive, higher effort

---

## Concrete author setup instructions (once gaps are fixed)

### "Create a Pages Management section"

1. Add a new section → Spreadsheet
2. Data Sources → pick `All Pages` (or `{pattern} (pages)`)
3. Columns: add Title, Status, Is Draft, Has Changes, Parent, URL Slug, Open
4. Set URL Slug column format to `pageLink`
5. Filters: add a `published` filter (external), add a `parent` filter (external)
6. Display: enable `Allow Edit in View`
7. Publish the page

### "Create a Sections Inventory section"

1. Add a new section → Spreadsheet
2. Data Sources → pick `All Sections`
3. Columns: add Title, Type (component_type), Parent Page, URL Slug, Tags, Is Draft
4. Group by: Type (to see how many of each section type)
5. Publish

---

## TODO before completing this design

- [x] Run `dms site tree` / `dms page list` on `mitigat-ny-prod` — done 2026-06-09 (site tree OOMs; page list batched)
- [x] Inspect actual column values — done: `parent` is page title string, `published` is `"draft"` or `true`
- [ ] Check if any existing pages on the site already use pages/sections as a source
- [ ] Decide: dedicated "Site Management" page vs. author setup instructions
- [ ] Document the `page_publish` + `allowEditInView` dependency (helpText or UI warning)
- [ ] Fix `page_link` implicit `url_slug` dependency — either always include `url_slug` in payload when `isDms` source has any `page_link` formatFn, or document it clearly
