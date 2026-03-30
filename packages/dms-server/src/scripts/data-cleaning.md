# Data Cleaning Notes: dms-mercury2

Database: `dms2` on mercury.availabs.org:5435 (config: `dms-mercury-2`)
Clone of production: `dms-mercury` (`dms` database)

## Initial State (2026-03-14)

- **Total size**: 63 GB
- **Total rows**: 1,127,225 in `dms.data_items`
- **Tables**: `data_items`, `data_items__undefined_1938854`, `change_log`, `yjs_states`
- **Apps**: 50 distinct app values
- **Active site**: `mitigat-ny-prod+prod` (site ID 566430, 64 patterns)

### Size by App (top 10)

| App | Rows | Size |
|-----|------|------|
| dms-site | 405,493 | 18 GB |
| mitigat-ny-prod | 455,472 | 11 GB |
| mitigate-ny | 25,038 | 1.3 GB |
| dms-docs | 11,966 | 788 MB |
| undefined | 111,022 | 292 MB |
| avail-sqlite4 | 81,631 | 221 MB |
| admin-new | 26,723 | 61 MB |
| npmrdsv5 | 1,156 | 56 MB |
| transportny | 88 | 48 MB |
| npmrds | 88 | 32 MB |

### Biggest Types (uncompressed text)

| App | Type | Rows | Data Size |
|-----|------|------|-----------|
| dms-site | cms-section | 363,450 | 106 GB |
| mitigat-ny-prod | shmp\|cms-section | 93,864 | 26 GB |
| dms-docs | shmpcopy\|shmp\|cms-section | 3,444 | 1.4 GB |
| mitigat-ny-prod | design\|cms-section | 7,663 | 1.4 GB |
| mitigat-ny-prod | county_template\|countytemplate\|cms-section | 6,645 | 1.3 GB |

### Base64 Image Sections

~10,000+ sections contain embedded `data:image` base64 data URIs:
- dms-site cms-section: 6,000 rows
- mitigat-ny-prod design|cms-section: 505 rows
- Various countytemplate sections: ~340 each

---

## Cleaning Log

### Phase 1: Delete Obsolete Apps — SKIPPED
All apps are used in production. No app-level deletion.

### Phase 2: Delete Countytemplate Patterns — DONE (2026-03-15)
- Deleted all rows with type LIKE `%countytemplate%` (except `docs-countytemplate`): **44,829 rows**
- Deleted 6 pattern rows (IDs: 1266142, 1297621, 1376019, 1393430, 1411304, 572462): **6 rows**
- Removed 6 pattern refs from site 566430's patterns array
- **Total: 44,835 rows deleted**

### Phase 3: Delete Templated Pages — DONE (2026-03-15)
- Found 5,755 templated pages (template_id not in -99/undefined) across all apps
- Deleted 97,477 child sections belonging to templated pages
- Deleted 0 page-edit children (none linked)
- Deleted 5,755 templated pages
- **Total: 103,232 rows deleted**

### Phase 4: Delete Obsolete Patterns — SKIPPED
Deferred to future session.

### Phase 5: Extract Base64 Images — IN PROGRESS

**Run 1**: `--type '%|cms-section' --per-app` (types with `|` separator)
- Scanned 122,544 `%|cms-section` rows via PG cursor
- Extracted 6,913 + 1,211 = **8,124 images** (2.8 GB decoded files)
- Map sections had `data.element['element-data'].img` (not in Lexical tree) — updated `extract-images.js` to handle
- ~134 MB base64 text removed from 6,206 rows (first run: 4,995, second run: 1,211)
- 10 rows had `data:image` but script couldn't match format (likely in captions or nested structures)

**Run 2**: `--type 'cms-section' --app 'dms-site' --per-app` (exact `cms-section` type without `|` prefix)
- 6,000 rows in `dms-site` app with 3.3 GB of base64 images
- First attempt crashed at 3,850 rows (OOM on large rows, cursor was scanning all 363K rows)
- Fixed script: added `data::TEXT LIKE '%data:image%'` to cursor SQL so PG filters server-side
- Second attempt completed in 24 min: 1,908 rows scanned, 1,903 with images, 2,830 images extracted (1.1 GB decoded, ~1.4 GB base64 removed)
- Also fixed script to handle `inner.img` property (map/component sections with direct image, not in Lexical tree)

**Total Phase 5 images**: ~16,095 images extracted to `public/img/mercury2/{app}/` (2.8 GB files)

### Orphaned dms-site cms-section — DELETED (2026-03-16)
- 363,450 rows of type `cms-section` (bare, no `doc_type|` prefix) in `dms-site` app
- No parent refs, no matching page type — completely abandoned data
- Was the largest data consumer: 106 GB uncompressed text
- **Deleted: 363,450 rows**

### Phase 6: Consolidate Page-Edit History — DONE (2026-03-15)
- Found 62 pages with old-format history arrays
- All had empty history (no entries to consolidate)
- **No changes needed**

### Phase 7: Orphan Cleanup — DONE (2026-03-15)
- Found 15,091 orphaned rows across all apps
- Breakdown: 1 page (skipped), 10,509 sections, 4,470 page-edits, 111 views
- Biggest contributors: mitigat-ny-prod (3,626 page-edits, 90 views, 66 sections), mitigate-ny (6,590 sections, 300 page-edits), dms-docs (3,853 sections, 314 page-edits)
- **Total: 15,090 rows deleted** (1 page skipped as analysis-only)

### Phase 8: VACUUM FULL — DONE (2026-03-16)
- `VACUUM FULL dms.data_items;`
- Table size: 63 GB → **3,125 MB**
- Database size: **3,134 MB**
- Rows: 410,406

### Useful Queries

**Disk usage by app + pattern (doc_type):**
```sql
SELECT
  app,
  split_part(type, '|', 1) AS doc_type,
  COUNT(*) AS rows,
  pg_size_pretty(SUM(pg_column_size(data))) AS data_size,
  SUM(pg_column_size(data)) AS data_bytes
FROM dms.data_items
GROUP BY app, split_part(type, '|', 1)
ORDER BY SUM(pg_column_size(data)) DESC
LIMIT 40
```

### Phase 9: Per-App Schema Migration — DONE (2026-03-17)
- Ran `migrate-to-per-app.js --source dms-mercury-2 --apply`
- Created 49 per-app schemas (`dms_{appname}`) with 69 tables total
- All 50 apps migrated, 199,251 rows copied (remainder were already migrated from previous interrupted run)
- Verification: all 50 apps match source row counts ✓
- Split tables (name-based types like `form1-968266`) routed to per-app split tables (e.g., `dms_mitigat_ny_prod.data_items__form1_968266`)
- Dropped original `dms.data_items` (CASCADE dropped `dms._dbadmin_data_items_view`), `dms.data_items_id_seq`, `dms.data_items__undefined_1938854`
- `VACUUM FULL` → database size: **1,789 MB**
- Shared tables (`dms.change_log`, `dms.yjs_states`) remain in `dms` schema

### Running Totals
- Rows deleted so far: ~717K (44,835 + 103,232 + 15,090 + 363,450 + misc from image extraction)
- Rows remaining: 384,381 (across 49 per-app schemas)
- Database size: **1,789 MB** (down from 63 GB → 3,134 MB → 1,789 MB)
- Per-app schemas: 49 schemas, 69 tables
- Base64 images extracted: ~16,095 images to `public/img/mercury2/{app}/` (2.8 GB files)
