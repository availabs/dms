# CLI `dms page publish`: copy draft section rows instead of aliasing the refs

## Objective

Make the CLI publish semantically identical to the UI publish so a later draft
rebuild can never blank a published page.

## Root cause (incident 2026-07-21, sitemgmt/tickets 2185867)

`cli/src/commands/page.js publish()` set `sections: d.draft_sections` — the REF
ARRAY, verbatim. Published and draft then point at the SAME component rows. The
owning build scripts rebuild pages by wiping draft section rows and recreating
them; with aliased refs that wipe deletes the published page's rows and the view
route renders blank (13 dead refs on sitemgmt/tickets).

The UI publish (`patterns/page/pages/edit/editFunctions.jsx publish()`) strips
`id` from each draft section object so the save materializes NEW rows — published
copies are independent of the draft. It also sets `published: ''` (every real
published page in dms3 carries `''`, not `'published'`) and mirrors
`section_groups`/`dataSources` from their draft counterparts.

Exact history of who aliased 2185867 is not recoverable, but the CLI aliasing is
real by inspection and is the only aliasing publish path in the codebase.

## Fix

In CLI `publish()`:
1. For each `draft_sections` ref: fetch the component row, `dms.data.create` a
   fresh row with the same data/type, and build the published ref from the NEW id
   (preserving any extra ref keys). Abort loudly if any draft row is missing —
   never publish a partial page.
2. `published: ''` (match the UI), `has_changes: false`,
   `section_groups: draft_section_groups`, `dataSources: draft_dataSources`
   (only when present).
3. Fix `list --published`: `d.published || 'draft'` misreads UI-published pages
   (`''`) as drafts. Classify `'draft'` (or absent) as draft, anything else as
   published.

## Files

- `packages/dms/cli/src/commands/page.js`

## Testing checklist

- [x] scratch page: create → 2 sections → publish → published refs 2195717/2195718, disjoint from draft 2195715/2195716
- [x] wipe draft sections (the rebuild hazard) → published rows still exist
- [x] `published` field is `''`, `has_changes` false, groups mirrored (dataSources absent → key omitted)
- [x] `page list --published` includes the scratch page (the `''`-classification fix)
- [x] cleanup: scratch page + all 4 section rows deleted (0 remaining)

(CLI integration suite not runnable in this environment — better-sqlite3 SQLITE_IOERR;
verified live against the local dev server / dms3 instead.)

## Status

- [x] Implemented (publish copy semantics + published:'' + list classification)
- [x] Verified against local dev server (2026-07-21)
