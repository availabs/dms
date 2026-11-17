# Give every page its own copy of the sections it shares

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** —

Split out of [safe-delete-removes-rows.md](./safe-delete-removes-rows.md) (2026-11-17). A data change on
prod; the code fix that stops new sharing is [pattern-duplicate-shares-sections.md](./pattern-duplicate-shares-sections.md).

## Why

When two pages list one section row, editing the section on one page changes the other. Authors
don't expect that. The sweep's listed-elsewhere check keeps deletes safe either way (it stays), so
this is about editing, not deleting.

## Scope (owner, 2026-11-17: only patterns the site lists)

From the local prod copy (`prod_check_1111`, 2026-11-11 data, read-only):

- **mitigat-ny-prod:** 60 patterns in `prod:site`'s `patterns`, 327 shared section ids. The County Template
  (`mitigateny_county_template`, 1300890) and 51 county patterns copied from it share the same 6 draft
  sections: 5 between Lightning and Wind, 1 between Tornado and Wind. The others: `mitigateny_sullivan` (3),
  `mitigateny_county_template_v1_copy` (Schenectady Draft V2, 3), `…_v3_copy_2` (Westchester, 2),
  `…_v2_copy` (Delaware Draft, 2), `…_suffolk_copy` (2), `mitigateny_chemung2025` (1), `mitigateny_admin` (1),
  `mitigateny_playground` (1). Full list: the query in the safe-delete task's audit entry.
- **npmrdsv5:** `npmrds_docs` (`/docs_legacy`), 1 id.
- **Page `history` rows:** 4 on mitigat-ny-prod are each named by 2–3 pages as a single `{id, ref}`. Check
  which patterns they're in before including them.
- Out of scope: the 15 instances with pages but no pattern row (not in the site).
- **Other apps on prod are not audited yet.** The local copies hold only these two apps (`prod_check_1111`,
  and `hub_work`'s `mny` / `tny`). Run the same read-only listing for each before this task's plan is final.

## How

- [ ] A server script, dry run unless `--apply`, per app: list every row named by two or more pages of
      patterns in the site; for each, the lowest-id page keeps the row, every other page gets a copy
      (same `data`, new id, a fresh `trackingId`, `parent_id` = that page) and its list entry is repointed.
      The repair to reuse: `scripts/migrate-row-auth.js` pass 3 (contested children).
- [ ] A section of another pattern listed by a page: copy it into the page's own pattern, or leave it.
      **Decision needed (owner)**, the same one as the Pattern Duplicate task.
- [ ] Backup first (every page and row it touches), one transaction per app, one change_log entry per
      write, room sync for each page whose `draft_sections` changed (`afterDraftSectionsWrite`).
- [ ] Verify on a local copy first: rerun the listing (0 shared in live patterns) and compare a few pages
      before and after (same content renders, in published and draft).
- [ ] Prod: plan output to the owner, then apply on the owner's word.

## Files

- `packages/dms-server/src/scripts/` (new script), reusing `migrate-row-auth.js`'s pass 3
