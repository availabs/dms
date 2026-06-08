# Site Management Design

## Status: STUB — needs CLI data from `mitigat-ny-prod+prod` before full design

### What this document needs before it can be completed

Run the following with the server running and fill in the sections below:

```bash
export DMS_HOST=http://localhost:3001
export DMS_APP=mitigat-ny-prod
export DMS_TYPE=prod

dms site tree                    # full site hierarchy
dms page list                    # all pages with depth, parent, published, slug
dms raw list mitigat-ny-prod prod:site  # raw site row
```

From that output, answer:
- How many pages total? How deep is the hierarchy? (2-level? 3-level?)
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

### What is broken / missing

| Feature | Status | Blocking |
|---------|--------|---------|
| Filter dropdown for `parent` column | ❌ blank | `site-mgmt-filter-parent-blank.md` |
| Filter BY resolved parent title (SQL match) | ❌ | `site-mgmt-filter-by-parent-name.md` |
| `url_slug` hidden by default | ❌ | `site-mgmt-page-column-ux.md` |
| "Open page" link in cell | ❌ | `site-mgmt-page-column-ux.md` |
| `component_type` column for sections | ❌ | `site-mgmt-page-column-ux.md` |
| Friendly source labels | ❌ | `site-mgmt-page-column-ux.md` |
| `allowEditInView` not discoverable | ❌ | `site-mgmt-page-column-ux.md` |
| Bulk publish (select rows → publish) | ❌ | no batch-action primitive |
| Nested / tree-view | ❌ | flat list only |

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
4. **Filter by resolved parent title** (`site-mgmt-filter-by-parent-name.md`) — medium effort, high value for deep hierarchies
5. **Friendly source labels** (`site-mgmt-page-column-ux.md`) — polish
6. **Bulk publish** — new primitive, higher effort

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

- [ ] Run `dms site tree` on `mitigat-ny-prod` and note actual page count + hierarchy depth
- [ ] Run `dms page list --format json` and inspect actual column values (what does `parent` look like? what is `published` set to?)
- [ ] Check if any existing pages on the site already use pages/sections as a source
- [ ] Decide: should there be a dedicated "Site Management" pattern/page or should it just be a set of author instructions?
