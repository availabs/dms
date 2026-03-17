# DMS Dead Row Cleanup Script

## Objective

Create a CLI script in `dms-server` that analyzes a DMS database for orphaned rows — content items whose parent no longer exists — and optionally deletes them. The DMS schema has no foreign key constraints, so deleting a parent (site, pattern, page, source) silently orphans all its children. Over time this accumulates dead data.

## Motivation

- **Storage**: Orphaned sections, views, and dataset rows consume space with no way to access them
- **Performance**: Dead rows inflate table scans and index sizes
- **Clarity**: `--dry-run` analysis gives operators visibility into data health per app
- **Safety**: Grouping results by app+type before deletion prevents accidental data loss

## DMS Data Hierarchy

All content lives in `data_items` with `app`, `type`, and `data` (JSON) columns. Parent-child references are stored as JSON arrays in the parent's `data` column — no foreign keys.

```
Site  (type: {app}+{siteType})
 └─ Pattern  (type: {app}+{siteType}|pattern)
     ├─ Page  (type: {app}+{docType})           [pattern_type=page]
     │   └─ Section  (type: {app}+{docType}|cms-section)
     └─ Source  (type: {app}+{docType}|source)   [pattern_type=datasets/forms]
         └─ View  (type: {app}+{docType}|source|view)
```

### How references work

| Parent | Child | Reference location |
|--------|-------|--------------------|
| Site | Pattern | `site.data.patterns[].id` |
| Pattern | Pages | Implicit: pattern's `doc_type` determines page type string |
| Page | Sections | `page.data.sections[].id` and `page.data.draft_sections[].id` |
| Source | Views | `source.data.views[].id` |

### Orphan types (in detection order)

1. **Orphaned patterns** — type ends in `|pattern`, but no site row references this pattern's ID in its `data.patterns[]`
2. **Orphaned pages** — type matches a `doc_type` from a page-pattern, but no such pattern exists anymore
3. **Orphaned sections** — type ends in `|cms-section`, but no page references this section's ID in `data.sections[]` or `data.draft_sections[]`
4. **Orphaned views** — type ends in `|source|view`, but no source references this view's ID in `data.views[]`
5. **Orphaned sources** — type ends in `|source` (but not `|source|view`), but no datasets/forms pattern exists with matching `doc_type`

### What NOT to flag

- **Dataset data rows** — rows with UUID-viewId type patterns (`{uuid}-{viewId}`) are managed by the datasets system and should not be analyzed here (they live in split tables)
- **Format rows** — the `formats` table is separate and not part of this analysis
- **Sites** — top-level, cannot be orphaned

## Usage

```bash
node src/scripts/cleanup-db.js --source <config> [options]

# or via npm
npm run db:cleanup -- --source <config> [options]
```

### Arguments

| Flag | Required | Description |
|------|----------|-------------|
| `--source <config>` | Yes | Database config name (from `src/db/configs/`) |
| `--app <name>` | No | Analyze only a specific app |
| `--delete` | No | Actually delete orphaned rows (default: analyze only) |
| `--type <type>` | No | Only check specific orphan type: `patterns`, `pages`, `sections`, `views`, `sources` |
| `--dry-run` | No | Synonym for default analyze-only mode (explicit) |

### Output

**Analyze mode** (default):

```
DMS Dead Row Analysis — dms-sqlite

App: my-site (my-site+pattern-admin)
  Orphaned sections:    47  (type: my-site+docs-page|cms-section)
  Orphaned patterns:     2  (type: my-site+pattern-admin|pattern)

App: other-app (other-app+main)
  Orphaned sections:   123  (type: other-app+main|cms-section)
  Orphaned views:        5  (type: other-app+datasets|source|view)

Summary:
  Total orphaned rows: 177
  Breakdown: 47+123 sections, 2 patterns, 5 views
```

**Delete mode** (`--delete`):

```
DMS Dead Row Cleanup — dms-sqlite

App: my-site
  Deleting 47 orphaned sections... done
  Deleting 2 orphaned patterns... done

Deleted 49 rows total.
```

## Algorithm

### Phase 1: Discovery

1. Connect to database
2. Find all distinct `app` values (or filter to `--app`)
3. For each app, find all sites (rows where type has no `|` suffix and `data.patterns` exists)
4. Build a map of known-good parent IDs per type

### Phase 2: Orphan detection

For each app:

**Patterns**: Find all rows where `type LIKE '%|pattern'`. For each, check if any site's `data.patterns[]` array contains its ID. If not → orphaned.

**Pages**: Find all page-type patterns (where `data.pattern_type = 'page'`). Collect their `doc_type` values → these are valid page types. Any page row whose type is not claimed by an existing pattern → orphaned. (Note: pages whose type IS claimed by a pattern are not orphaned even if they aren't linked from a specific page hierarchy.)

**Sections**: Find all rows where `type LIKE '%|cms-section'`. For each, check if any page (matching base type) references its ID in `data.sections[]` or `data.draft_sections[]`. If not → orphaned.

**Sources**: Find all rows where `type LIKE '%|source'` (but NOT `%|source|view`). Check if a datasets/forms pattern exists with matching `doc_type`. If not → orphaned.

**Views**: Find all rows where `type LIKE '%|source|view'`. For each, check if any source references its ID in `data.views[]`. If not → orphaned.

### Phase 3: Report or delete

- **Analyze**: Group orphans by app, then by orphan type. Print counts and type strings.
- **Delete**: For each group, delete rows by ID. Print progress.

## Implementation Phases

### Phase 1: Core script + section/pattern orphan detection — DONE

Create `src/scripts/cleanup-db.js`:

- [x] Parse CLI arguments (`--source`, `--app`, `--delete`, `--type`, `--dry-run`)
- [x] Connect to database via adapter (same pattern as copy-db.js)
- [x] Discover all apps (distinct `app` values from data_items)
- [x] Detect orphaned sections: load all section IDs, load all page `sections`/`draft_sections` references, find unreferenced section IDs
- [x] Detect orphaned patterns: load all pattern IDs, load all site `patterns` references, find unreferenced pattern IDs
- [x] Group results by app and orphan type
- [x] Print analysis report

### Phase 2: Page, source, view orphan detection — DONE

- [x] Detect orphaned pages: find page-type patterns, collect valid doc_types, find pages with no matching pattern
- [x] Detect orphaned sources: find datasets/forms patterns, collect valid doc_types, find sources with no matching pattern
- [x] Detect orphaned views: load all view IDs, load all source `views` references, find unreferenced view IDs

### Phase 3: Delete mode + testing — DONE

- [x] `--delete` flag: delete orphaned rows by ID (batch delete)
- [ ] Confirmation prompt before delete — **Design note**: Skipped interactive prompt; the `--delete` flag is explicit enough, and the analysis output is always printed before deletion so the user sees what will be removed
- [x] Integration tests: create parent+child data, delete parent, run analysis, verify orphans detected (40 tests)
- [x] Integration tests: run with --delete, verify orphans removed
- [x] Add `npm run db:cleanup` and `npm run test:db-cleanup` scripts to package.json

### Phase 4: PostgreSQL-optimized orphan detection — DONE

- [x] `pgRefId(elem)` helper: CASE expression extracting integer ID from jsonb array element (handles {id:N}, plain numbers, string numbers, Falcor refs)
- [x] `pgFindOrphanedPatterns`: NOT EXISTS + jsonb_array_elements on site.data->'patterns'
- [x] `pgFindOrphanedPages`: NOT EXISTS + pattern doc_type match, regex to skip split types
- [x] `pgFindOrphanedSections`: NOT EXISTS + jsonb_array_elements on page sections/draft_sections, regexp_replace for type suffix stripping
- [x] `pgFindOrphanedSources`: NOT EXISTS + pattern doc_type concatenation match
- [x] `pgFindOrphanedViews`: NOT EXISTS + jsonb_array_elements on source.data->'views'
- [x] Each `findOrphaned*` dispatches to PG function when `db.type === 'postgres'`
- [x] SQLite path unchanged — all 40 existing tests pass
- [ ] PG integration tests (deferred — requires Docker test infrastructure)

**Design note**: PG queries return only `{id, app, type}` — never load the `data` JSON column. This eliminates the memory/network bottleneck of transferring large JSON blobs to Node.js for in-JS reference extraction.

## Cross-Database Considerations

**SQLite**: JSON reference extraction done in JavaScript (load rows, parse data, extract IDs in `extractRefIds()`). Only `LIKE` and simple `SELECT`/`DELETE` queries used.

**PostgreSQL**: Orphan detection pushed entirely into SQL using `jsonb_array_elements` + `NOT EXISTS`. The `pgRefId()` helper generates a CASE expression matching all 4 reference formats (plain number, string number, `{id:N}`, Falcor ref). Only orphan IDs come back to Node — no `data` column loaded.

| Concern | SQLite | PostgreSQL |
|---------|--------|------------|
| JSON array reference extraction | JS via `extractRefIds()` | SQL via `jsonb_array_elements` + `pgRefId()` CASE |
| Type suffix stripping | JS `.replace()` | `regexp_replace()` with `$` anchor |
| Split type filtering | JS `isSplitType()` | `!~` regex on UUID pattern |
| Type pattern matching | `type LIKE '%|pattern'` | Same |
| Batch delete | `WHERE id IN ($1, $2, ...)` | `WHERE id = ANY($1)` |

## Files

| File | Change |
|------|--------|
| `src/scripts/cleanup-db.js` | NEW — analysis + cleanup script |
| `tests/test-db-cleanup.js` | NEW — integration tests |
| `package.json` | Add `db:cleanup` script |
| `src/scripts/README.md` | Add cleanup-db section |

## Testing Checklist

- [x] Analyze mode: detects orphaned sections (page deleted, sections remain)
- [x] Analyze mode: detects orphaned patterns (site's patterns array edited to remove ref)
- [x] Analyze mode: detects orphaned views (source deleted, views remain)
- [x] Analyze mode: detects orphaned sources (datasets pattern deleted)
- [x] Analyze mode: detects orphaned pages (page pattern deleted)
- [x] Analyze mode: `--app` filter works
- [x] Analyze mode: `--type` filter works (e.g., only check sections)
- [x] Analyze mode: output grouped by app
- [x] Delete mode: removes orphaned rows
- [x] Delete mode: does not remove non-orphaned rows
- [ ] Delete mode: works on both SQLite and PostgreSQL — SQLite tested, PG deferred
- [x] No false positives: sections referenced in draft_sections are NOT flagged
- [x] No false positives: healthy hierarchy has zero orphans
- [x] Dataset data rows (UUID-viewId types) are never flagged
- [x] extractRefIds handles multiple reference formats ({id:N}, plain numbers, Falcor refs, nulls)
