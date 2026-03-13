# Fix Cleanup DB — Orphaned Pages Detection

## Objective

Fix the `findOrphanedPages` detector in `cleanup-db.js` so it correctly identifies truly orphaned pages instead of producing false positives that cause mass deletion.

## Current State

The pages detector is currently **disabled from `--delete` mode** (analysis-only) because it's too prone to false positives. It still runs for analysis but prints a skip message during delete.

### What went wrong

Running `cleanup-db.js --delete` on `mitigat-ny-prod` (SQLite, ~1M rows) deleted 532,771 rows, including **all pages for the `redesign` pattern** (160 rows) and massive numbers of their sections. The root cause:

1. The `findOrphanedPages` logic loads all `%|pattern` rows and collects `doc_type` values from those with `pattern_type === 'page'`
2. In this database, there were only 4 pattern rows — all `test-forms|pattern` with `pattern_type = 'form'` or `'undefined'`
3. **Zero patterns had `pattern_type === 'page'`**, so `validPageTypes` was an empty set
4. Every top-level row (pages with types like `redesign`, `shmp`, `design`, etc.) was flagged as orphaned

### Why the patterns were missing

The `mitigat-ny-prod` database (SQLite copy) had patterns under `prod|pattern` in the production PostgreSQL but the SQLite copy either didn't include them or they're stored differently. The page pattern data with `pattern_type` and `doc_type` was simply not present, so the detector treated **all pages** as orphans.

### Fundamental design problem

A page can't be "orphaned" the way a section can. Sections have explicit ID references from parent pages — if no page references section ID 12345, that section is provably orphaned. But a page just has a `type` string that happens to match a pattern's `doc_type`. The page's existence doesn't depend on the pattern metadata being correct. Pages are user-created content; pattern metadata is configuration that can be missing, misconfigured, or use unexpected `pattern_type` values.

## Proposed Fix

### Option A: Remove the pages detector entirely

Pages aren't truly orphan-able in the same way as sections/views. A page is created by a user and its `type` string links it to its pattern, but the link is structural (convention-based), not referential (ID-based). If the pattern config is wrong, the page is still valid content.

### Option B: Invert the logic — detect pages whose type has no content

Instead of checking if a pattern claims the page, check if the page's type string doesn't match ANY known type hierarchy. A page type like `redesign` is valid if rows exist with `redesign|cms-section` or `redesign|page-edit`. If a top-level row has no children of any kind AND no pattern claims it, it might be dead test data.

### Option C: Require explicit confirmation for pages

Keep the detection but require a separate `--delete-pages` flag and print a detailed warning showing exactly which types would be affected, so the user can verify before proceeding.

### Recommendation

**Option A** is safest. The pages detector has a high false-positive rate and deleting pages is catastrophic (all their sections and page-edits become orphaned too, cascading the damage). The existing detectors for sections, page-edits, views, and sources cover the actually-orphanable content types.

If a pages detector is wanted, **Option B** is more robust — it uses structural evidence (child rows exist) rather than pattern metadata (which may be missing).

## Context: DMS Type Hierarchy

```
Site:    app=myapp  type=my-site-type        (has data.patterns[])
  Pattern: app=myapp  type=my-site-type|pattern  (has data.pattern_type, data.doc_type)
    Page:     app=myapp  type={doc_type}              (has data.sections[], data.history[])
      Section:  app=myapp  type={doc_type}|cms-section
      PageEdit: app=myapp  type={doc_type}|page-edit
```

Key relationships:
- **Site → Pattern**: `data.patterns[]` contains `{id}` refs to pattern rows (ID-based, reliable)
- **Pattern → Page**: pattern's `data.doc_type` matches page's `type` (string convention, fragile)
- **Page → Section**: `data.sections[]` / `data.draft_sections[]` contains `{id}` refs (ID-based, reliable)
- **Page → PageEdit**: `data.history[]` contains `{id, ref}` refs (ID-based, reliable)

The pages detector is the only one that relies on the fragile string-convention link rather than ID-based references.

## Files

- `packages/dms-server/src/scripts/cleanup-db.js` — `findOrphanedPages`, `pgFindOrphanedPages`, main delete loop
- `packages/dms-server/src/scripts/README.md` — documentation
- `packages/dms-server/tests/test-db-cleanup.js` — test suite (pre-existing failure: "Dataset data rows not flagged as orphaned pages")

## Testing Checklist

- [ ] Pages detector still runs in analysis mode (no `--delete`)
- [ ] Pages are skipped in `--delete` mode with message
- [ ] All other detectors (patterns, sections, page_edits, views, sources) still delete correctly
- [ ] Pre-existing test suite passes (39/40, same as before)
- [ ] If Option B is implemented: test with a database that has known dead test types
