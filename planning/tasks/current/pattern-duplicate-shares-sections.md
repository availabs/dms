# Pattern Duplicate copies shared sections as shared

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Release:** commit · **Created by:** ssangdod@albany.edu · **Edited by:** —

Split out of [safe-delete-removes-rows.md](../completed/safe-delete-removes-rows.md) (2026-11-17).

## Problem

Two pages listing one section row means editing the section on one page changes the other, and a
delete has to check every page before removing it (the sweep's listed-elsewhere check). Pattern
Duplicate (`dms-server/src/dama/upload/dms-duplicate.js`) makes more of these:

1. **Sharing inside the pattern is copied as sharing.** `secIdMap` maps each old section id to one new
   id, so two pages that share a section in the source share its copy in the duplicate.
   `remapSectionRefs` rewrites both pages to the same new id.
2. **References into another pattern stay as they are.** An entry whose id isn't in `secIdMap` keeps
   its id, so the duplicate's page and the source's page both list the same foreign row.

Measured on the prod copy (`prod_check_1111`, 2026-11-11 data): MitigateNY_County_Template_V3
(`mitigateny_county_template`, 1300890) has Lightning, Wind and Tornado sharing 6 draft sections
(left by page Duplicate before 2025-01-13, `bf48b968`). Every county pattern duplicated from it
has the same 6, under new ids: 60 live patterns, 327 shared section ids. The 25 cross-pattern
shares in `mitigateny_county_template_suffolk_copy_copy` are case 2.

## Fix (BUILT 2026-11-17)

- [x] One copy per (page, section): `duplicatePatternContent` builds the list of (page, section id)
      pairs from every page's `sections` / `draft_sections` and copies each pair's row once. One page
      listing a row in both its lists keeps one copy for both.
- [x] Case 2, **decided (owner, 2026-11-17): copy it.** A section of another pattern is read by id
      (`getDataById`) and copied into the new pattern, with a ref to the new pattern. An entry naming
      no row, or a row that isn't a component, keeps its id and ref.
- [x] The copies drop the source's `data.parent` / `data.parent_id`; the page patch stamps each copy to
      the page that lists it (when the new pattern's childRefs are known, as on a site with registered
      formats).
- [x] `tests/test-pattern-duplicate.js` (8, SQLite + Postgres, in `npm test`): Lightning/Wind sharing,
      one page's two lists, another pattern's section, an entry naming no row, a section no page lists,
      the stamp, the source untouched. The old duplicate fails 5 of them. `test-duplicate-refs` (4) green.
      The result gains `foreignCopied`.

## Not this task

Copying the sections that are already shared on prod, and keeping the sweep's listed-elsewhere check.
Both stay in [safe-delete-removes-rows.md](../completed/safe-delete-removes-rows.md).

## Files

- `packages/dms-server/src/dama/upload/dms-duplicate.js`
- `packages/dms-server/tests/` (duplicate test)
