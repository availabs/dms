# Clean dms-mercury2 Database

## Status: NOT STARTED

## Objective

Clean `dms-mercury2` (PostgreSQL `dms2` on mercury.availabs.org:5435) from 63 GB to under 200 MB (target: 150 MB). This is a clone of production `dms-mercury`. Prepare it for split-app mode. Document all operations in `src/scripts/data-cleaning.md`.

## Current State

- **Database**: `dms2` on mercury.availabs.org:5435 (config: `dms-mercury-2`)
- **Total size**: 63 GB, 1,127,225 rows in `dms.data_items`
- **Schema**: `dms` (not `public`) — 4 tables: `data_items`, `data_items__undefined_1938854`, `change_log`, `yjs_states`
- **Active production site**: `mitigat-ny-prod+prod` (site ID 566430, 64 patterns)

### Size Breakdown by App

| App | Rows | Size (uncompressed) | Status |
|-----|------|---------------------|--------|
| dms-site | 405,493 | 18 GB (106 GB text) | Obsolete — old dev site |
| mitigat-ny-prod | 455,472 | 11 GB | **KEEP** (production) |
| mitigate-ny | 25,038 | 1.3 GB | Obsolete — old dev version |
| dms-docs | 11,966 | 788 MB | Obsolete — docs site copy |
| undefined | 111,022 | 292 MB | Junk — undefined app |
| avail-sqlite4 | 81,631 | 221 MB | Test data |
| admin-new | 26,723 | 61 MB | Test data |
| npmrdsv5 | 1,156 | 56 MB | Different project |
| transportny | 88 | 48 MB | Different project |
| npmrds | 88 | 32 MB | Different project |
| (26 others) | ~8,500 | <20 MB combined | Test/junk apps |

### Biggest Data Consumers (uncompressed text size)

1. `dms-site` cms-section: 363K rows, **106 GB** (base64 images)
2. `mitigat-ny-prod` shmp|cms-section: 94K rows, **26 GB** (base64 images)
3. Countytemplate rows: ~41K rows, **~7 GB** across 15 types
4. Various cms-section types: 1-1.4 GB each (design, devmny, shmp-test, etc.)

### Base64 Images

~10,000+ sections contain `data:image` base64-encoded images. The biggest offenders:
- `dms-site` cms-section: 6,000 rows with images
- `mitigat-ny-prod` design|cms-section: 505 rows
- Various countytemplate|cms-section types: ~340 each

### Countytemplate Data (to delete)

5 deprecated countytemplate patterns (IDs: 1266142, 1297621, 1376019, 1393430, 1411304) with doc_types:
- `e34eb6ae-f184-4ab7-95b3-a665a2b36a64`
- `07a227f6-e4a9-4c13-a89f-065d919bc5cd`
- `1ba7782b-b9b8-4369-8caf-6e13561413bd`
- `a2333ef8-b5dd-4715-a215-1ee562acbe4b`
- `0fd38049-fd07-4b56-aeae-1fbc3d745e41`

Plus 3 named countytemplate patterns with their own children:
- `county_template` (pattern 572462 doc_type: `county_template2`)
- `countytemplate|countytemplate` subtypes
- `county_template2|countytemplate` subtypes

Total countytemplate rows: ~41K rows, ~7+ GB

### Templated Pages (to delete)

4,391 `shmp` pages with `template_id` (templated county copies), plus ~1,000+ in other types (county_template2, countytemplate, design, etc.). Each templated page has child sections and page-edits.

### Page-Edit History

12,766 `page-edit` rows for `dms-site` alone, plus ~2,000+ across other types. May or may not be consolidated already — needs checking.

### Patterns in mitigat-ny-prod+prod (64 patterns)

Many are obsolete copies, old versions, or test patterns. Active patterns need to be identified by the user. Likely candidates for deletion include patterns with names like `*_copy*`, `*_old*`, `*playground*`, `*test*`, `*backup*`.

## Cleaning Plan

### Phase 1: Delete Obsolete Apps — SKIPPED

All apps are used in production for other purposes. No app-level deletion.

### Phase 2: Delete Countytemplate Patterns — DONE

Delete all countytemplate-related rows. The existing `delete-countytemplate-patterns.js` is SQLite-only, so we'll use direct SQL.

**Rows to delete:**
- 5 UUID-named countytemplate patterns (IDs: 1266142, 1297621, 1376019, 1393430, 1411304)
- All rows with type containing `countytemplate` (pages, sections, page-edits, countytemplate data)
- Pattern 572462 (`county_template2`) and its children
- Remove pattern refs from site 566430's patterns array

**Types to match:**
```
%countytemplate%
county_template2%
```

### Phase 3: Delete Templated Pages — DONE

Delete pages with `template_id` (not `-99` or `undefined`) and their child sections/page-edits. The existing `delete-templated-pages.js` is SQLite-only — adapt the logic for PostgreSQL.

```sql
-- Find templated pages
SELECT type, COUNT(*) FROM dms.data_items
WHERE app = 'mitigat-ny-prod'
  AND data->>'template_id' IS NOT NULL
  AND data->>'template_id' NOT IN ('-99', 'undefined')
GROUP BY type;
```

### Phase 4: Delete Obsolete Patterns — SKIPPED

Deferred to a future session. User will identify which patterns to keep/delete.

### Phase 5: Extract/Remove Base64 Images — IN PROGRESS

Run `extract-images.js` against the remaining sections to replace base64 data URIs with file paths. This is the single biggest size reducer for the remaining `mitigat-ny-prod` data.

The script already supports PostgreSQL. Key sections with images:
- `shmp|cms-section` (290 rows with images, ~26 GB total for the type)
- `design|cms-section` (505 rows)
- `redesign|cms-section` (367 rows)
- Various UUID-based cms-section types

```bash
cd src/dms/packages/dms-server
node src/scripts/extract-images.js --source dms-mercury-2 --output-dir /path/to/images --url-prefix /img
```

**Note**: After image extraction, the `data` column values shrink dramatically (base64 is ~33% larger than binary, and each image can be 100KB-10MB).

### Phase 6: Consolidate Page-Edit History — DONE (no changes needed)

Check if history is already consolidated. If not, run `consolidate-page-history.js`.

```bash
# Check: if any page has data.history as an array of refs (old format), it needs consolidation
node src/scripts/consolidate-page-history.js --source dms-mercury-2
```

### Phase 7: Run Orphan Cleanup — DONE (15,090 rows deleted)

Run `cleanup-db.js` to find and delete orphaned rows (sections without pages, patterns without sites, etc.).

```bash
node src/scripts/cleanup-db.js --source dms-mercury-2
node src/scripts/cleanup-db.js --source dms-mercury-2 --delete
```

### Phase 8: VACUUM and Size Check — DONE

```sql
VACUUM FULL dms.data_items;
SELECT pg_size_pretty(pg_database_size('dms2'));
```

Verify size is under 200 MB target. If not, investigate remaining large types.

### Phase 9: Convert to Per-App Schema Configuration — DONE

Convert the database to per-app mode using `dms_{appname}` PostgreSQL schemas (implemented in per-app-pg-schemas task). For each app:

1. Create schema `dms_{appname}` (e.g., `dms_mitigat_ny_prod`)
2. Create `data_items` table + `data_items_id_seq` sequence in the per-app schema
3. Copy rows from `dms.data_items` WHERE `app = appname` into `dms_{appname}.data_items`
4. For any existing split tables, move them into the per-app schema

Update `migrate-to-per-app.js` to use the new per-app schema approach (currently creates `dms.data_items__appname` tables, needs to create `dms_{appname}.data_items` instead).

```bash
node src/scripts/migrate-to-per-app.js --source dms-mercury-2
node src/scripts/migrate-to-per-app.js --source dms-mercury-2 --apply
```

5. Verify the site works with `DMS_SPLIT_MODE=per-app` in `.env`
6. Drop the original `dms.data_items` table and its sequence
7. VACUUM FULL to reclaim space

```sql
DROP TABLE dms.data_items;
DROP SEQUENCE IF EXISTS dms.data_items_id_seq;
VACUUM FULL;
```

Note: `dms-mercury-2` has been backed up prior to this phase. Shared tables (`dms.change_log`, `dms.yjs_states`) remain in the `dms` schema.

### Phase 10: Final Verification — NOT STARTED

- Verify database size is under target
- Verify `mitigat-ny-prod+prod` site loads correctly
- Verify all kept patterns have their pages/sections intact
- Document final state in `data-cleaning.md`

## Files

| File | Purpose |
|------|---------|
| `src/scripts/data-cleaning.md` | Running notes on what was done, row counts, sizes |
| `src/scripts/cleanup-db.js` | Orphan detection and deletion |
| `src/scripts/extract-images.js` | Base64 image extraction |
| `src/scripts/consolidate-page-history.js` | Page-edit history consolidation |
| `src/scripts/migrate-to-per-app.js` | Per-app table migration |
| `src/scripts/delete-countytemplate-patterns.js` | Countytemplate deletion (SQLite-only, reference) |
| `src/scripts/delete-templated-pages.js` | Templated page deletion (SQLite-only, reference) |
| `src/db/configs/dms-mercury-2.config.json` | Database config |

## Testing Checklist

- [ ] Phase 1: All non-mitigat-ny-prod apps deleted
- [ ] Phase 2: All countytemplate rows deleted, site patterns array updated
- [ ] Phase 3: All templated pages + children deleted
- [ ] Phase 4: Obsolete patterns deleted (user-confirmed list)
- [ ] Phase 5: Base64 images extracted, sections updated with URL paths
- [ ] Phase 6: Page-edit history consolidated (or confirmed already done)
- [ ] Phase 7: Orphan cleanup complete
- [x] Phase 8: VACUUM complete, size 1,789 MB (not under 200 MB target — remaining data is legitimate)
- [x] Phase 9: Per-app migration complete (49 schemas, 69 tables, all verified)
- [ ] Phase 10: Site loads and functions correctly
