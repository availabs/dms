# Site Management: Site Health / Audit Page

## Objective

A diagnostic tab on the site management page showing site health issues: pages with no sections, orphaned pages (broken parent reference), duplicate URL slugs, and stale draft pages. Gives authors a single view to spot and fix content problems.

## Scope

- New "Site Health" tab on the site management page
- Four issue categories, each a filtered sub-view
- Summary stat cards at top (N issues by type)
- Authors can click through to the problem row and fix inline

Out of scope:
- Auto-fixing issues (this is read + navigate, not auto-repair)
- Deep content validation (broken links inside lexical, etc.) — v1 focuses on structural issues

## Current State

No diagnostic view exists. Identifying these problems requires direct database access or CLI inspection.

The data is all available client-side:
- `ComponentContext.state.data` has all pages loaded for the current Spreadsheet
- `parent` column is a title string — orphan check is `row.parent && !allTitles.has(row.parent)`
- `url_slug` is a column — duplicate check is a count map over slugs
- Section count per page requires cross-referencing the sections source

## Proposed Changes

### Issue categories

**1. Pages with no sections**
- Source: `{pattern} (pages)`
- Check: `section_count === 0` (requires `page_section_count` column type — see `page-hierarchy-columns.md`)
- Show: title, url_slug, created_at, days since created

**2. Orphaned pages (broken parent reference)**
- Source: `{pattern} (pages)`
- Check: `row.parent` is non-empty but no other page has that title
- Client-side: build `Set<string>` of all page titles, flag rows where parent ∉ set
- New column type: `orphan_badge` — renders "Broken parent" pill if parent not found in data

**3. Duplicate URL slugs**
- Source: `{pattern} (pages)`
- Check: `url_slug` appears more than once
- Client-side: build frequency map, flag rows where frequency > 1
- New column type: `slug_duplicate_badge` — "Duplicate" pill if slug appears >1 time

**4. Stale draft pages (>90 days without publish)**
- Source: `{pattern} (pages)`
- Check: `published !== true && days_since_updated > 90`
- New virtual column: `days_stale` — computed from `updated_at`

### Implementation approach

The health tab is NOT a single configured Spreadsheet — it's a custom section component (or a set of 4 mini-Spreadsheets each filtered to a different issue). Recommended: custom `SiteHealthSection` registered in `ComponentRegistry`, which:
1. Loads pages + sections data
2. Runs client-side checks to categorize issues
3. Renders a summary + expandable issue groups

### Column types needed

- `orphan_badge` — reads full data set, checks if `row.parent` exists as any other row's title
- `slug_duplicate_badge` — reads full data set, checks slug frequency
- `days_stale` — `Math.floor((Date.now() - new Date(row.updated_at)) / 86400000)` formatted as "N days"

These three are client-only, zero server changes.

## Files Requiring Changes

- New file: `src/dms/packages/dms/src/patterns/page/components/sections/SiteHealth/index.jsx` — health section component
- `src/dms/packages/dms/src/patterns/page/components/sections/index.jsx` — register SiteHealth in ComponentRegistry
- New file: `src/dms/packages/dms/src/patterns/page/columnTypes/orphan_badge.jsx`
- New file: `src/dms/packages/dms/src/patterns/page/columnTypes/slug_duplicate_badge.jsx`
- `src/dms/packages/dms/src/patterns/page/columnTypes/index.jsx` — register new types

## Testing Checklist

- [ ] Health tab loads without error on a real pattern
- [ ] Pages with 0 sections appear in "No sections" list
- [ ] Page with parent = non-existent title appears in "Orphaned" list
- [ ] Two pages with same slug both appear in "Duplicate slugs" list
- [ ] Pages draft for >90 days appear in "Stale drafts" list
- [ ] Summary counts at top match the list counts
- [ ] Clicking a row navigates to the Pages tab with that page highlighted
