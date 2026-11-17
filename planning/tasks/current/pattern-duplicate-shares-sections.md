# Pattern Duplicate copies shared sections as shared

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** —

Split out of [safe-delete-removes-rows.md](./safe-delete-removes-rows.md) (2026-11-17).

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

## Fix

- [ ] Give every (page, section) occurrence its own copy: clone a section once per page that lists it,
      not once per section. The duplicate's pages then share nothing, whatever the source looks like.
- [ ] Case 2, **decision needed (owner):** copy a foreign section into the new pattern for each page
      that lists it, or leave the reference. There is no cross-pattern rendering relationship in DMS
      (owner, 2026-10-28), which argues for copying.
- [ ] The duplicate stamps `parent_id` on each copy (the page that lists it), so the sweep can act on
      them from the start.
- [ ] Tests: a source with two pages sharing a section, and a page listing another pattern's section;
      the duplicate has no id listed by two pages, renders the same content, and leaves the source as
      it was.

## Not this task

Copying the sections that are already shared on prod, and keeping the sweep's listed-elsewhere check.
Both stay in [safe-delete-removes-rows.md](./safe-delete-removes-rows.md).

## Files

- `packages/dms-server/src/dama/upload/dms-duplicate.js`
- `packages/dms-server/tests/` (duplicate test)
